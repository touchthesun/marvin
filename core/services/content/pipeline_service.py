from typing import List, Dict, Any, Optional
import asyncio
from uuid import uuid4
from datetime import datetime
from core.domain.content.pipeline import (
    DefaultPipelineOrchestrator,
    PipelineContext,
    DefaultStateManager,
    DefaultComponentCoordinator,
    DefaultEventSystem,
    PipelineConfig,
    ProcessingEvent,
    ProcessingStage
)
from core.infrastructure.database.transactions import Transaction
from core.services.base import BaseService
from core.domain.content.models.page import Page, BrowserContext, PageStatus
from core.utils.logger import get_logger

logger = get_logger(__name__)

class PipelineService(BaseService):
    def __init__(
        self,
        state_manager: DefaultStateManager,
        component_coordinator: DefaultComponentCoordinator,
        event_system: DefaultEventSystem,
        config: PipelineConfig
    ):
        super().__init__()
        self.config = config
        self.context = PipelineContext(
            state_manager=state_manager,
            component_coordinator=component_coordinator,
            event_system=event_system,
            config=config
        )
        self.pipeline = DefaultPipelineOrchestrator(self.context)
        self.url_queue = asyncio.Queue()
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.processed_urls: Dict[str, Dict[str, Any]] = {}
        self.worker_task: Optional[asyncio.Task] = None

    async def initialize(self) -> None:
        """Initialize pipeline service resources."""
        await super().initialize()
        
        # Register event handler for status updates
        self.pipeline.register_event_handler(self._handle_pipeline_event)
        
        # Start processing worker
        self.worker_task = asyncio.create_task(self._process_queue())
        self.logger.info("Pipeline service initialized with worker task")

    def _handle_pipeline_event(self, event: ProcessingEvent):
        """Handle pipeline events to update task status."""
        metadata = event.metadata
        if not metadata or 'page_object' not in metadata:
            return
            
        page: Page = metadata['page_object']
        url = page.url
        
        if not url in self.processed_urls:
            return
            
        # Update status tracking with Page object state
        status_update = {
            "status": self._map_stage_to_status(event.stage),
            "progress": self._calculate_progress(event.stage),
            "message": event.message,
            "page_status": page.status.value,
            "browser_contexts": [ctx.value for ctx in page.browser_contexts],
            "last_active": page.last_active.isoformat() if page.last_active else None
        }
        
        if event.stage == ProcessingStage.ERROR:
            status_update["error"] = event.message
            if page.errors:
                status_update["page_errors"] = page.errors
            
        self.processed_urls[url].update(status_update)

    def _map_stage_to_status(self, stage: ProcessingStage) -> str:
        """Map pipeline stages to task statuses."""
        stage_to_status = {
            ProcessingStage.INITIALIZE: "processing",
            ProcessingStage.METADATA: "processing",
            ProcessingStage.CONTENT: "processing",
            ProcessingStage.ANALYSIS: "processing",
            ProcessingStage.STORAGE: "processing",
            ProcessingStage.COMPLETE: "completed",
            ProcessingStage.ERROR: "error"
        }
        return stage_to_status.get(stage, "unknown")

    def _calculate_progress(self, stage: ProcessingStage) -> float:
        """Calculate approximate progress based on pipeline stage."""
        stage_weights = {
            ProcessingStage.INITIALIZE: 0.0,
            ProcessingStage.METADATA: 0.2,
            ProcessingStage.CONTENT: 0.4,
            ProcessingStage.ANALYSIS: 0.6,
            ProcessingStage.STORAGE: 0.8,
            ProcessingStage.COMPLETE: 1.0,
            ProcessingStage.ERROR: 0.0
        }
        return stage_weights.get(stage, 0.0)


    async def enqueue_urls(
        self,
        urls: List[Dict[str, Any]],
        tx: Optional[Transaction] = None
    ) -> Dict[str, Any]:
        """Enqueue URLs for processing."""
        try:
            if tx is None:
                tx = Transaction()
                
            result = await self.execute_in_transaction(
                tx,
                "enqueue_urls_operation",  # Operation name
                urls=urls  # Pass URLs as argument
            )
            
            if tx is None:
                await tx.commit()
                
            return result
        except Exception as e:
            if tx is not None:
                await tx.rollback()
            self.logger.error(f"Error enqueuing URLs: {str(e)}")
            raise


    async def _enqueue_urls_operation(
        self,
        tx: Transaction,
        urls: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Transaction-aware URL enqueuing operation.
        
        Args:
            tx: Active transaction context
            urls: List of URL dictionaries containing url and context info
            
        Returns:
            Dict with enqueuing results including task_id and status
        """
        task_id = str(uuid4())
        try:
            for item in urls:
                url = str(item.get("url"))
                
                # Initialize status tracking
                status_entry = {
                    "url": url,
                    "status": "queued", 
                    "task_id": task_id,
                    "progress": 0.0,
                    "queued_at": datetime.now().isoformat(),
                    "browser_context": item.get("context"),
                    "tab_id": item.get("tab_id"),
                    "window_id": item.get("window_id"),
                    "bookmark_id": item.get("bookmark_id")
                }
                
                # Queue for processing
                await self.url_queue.put({
                    "url": url,
                    "metadata": item,
                    "task_id": task_id
                })
                
                self.processed_urls[url] = status_entry
                
                # Add rollback handler
                tx.add_rollback_handler(
                    lambda u=url: self._handle_enqueue_rollback(u)
                )
                
            self.logger.info(f"Enqueued {len(urls)} URLs for processing under task {task_id}")
            
            return {
                "task_id": task_id,
                "urls_enqueued": len(urls),
                "status": "enqueued",
                "queue_size": self.url_queue.qsize(),
                "queued_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Error in _enqueue_urls_operation: {str(e)}")
            raise



    async def _handle_enqueue_rollback(self, url: str):
        """Handle rollback for enqueued URL."""
        if url in self.processed_urls:
            del self.processed_urls[url]
        # Attempt to remove from queue if possible
        try:
            while not self.url_queue.empty():
                item = self.url_queue.get_nowait()
                if item["url"] != url:
                    await self.url_queue.put(item)
        except asyncio.QueueEmpty:
            pass

    async def _process_url_operation(
        self,
        tx: Transaction,
        url: str,
        metadata: Dict[str, Any],
        task_id: str,
        start_time: datetime
    ) -> None:
        """Internal transaction-aware URL processing."""
        try:
            self.logger.info(f"Starting processing of URL {url} for task {task_id}")
            self.logger.debug(f"Processing metadata: {metadata}")
            
            # Update status to processing within transaction
            self.processed_urls[url].update({
                "status": "processing",
                "started_at": start_time.isoformat()
            })
            
            # Set up browser context
            context = BrowserContext(metadata.get("context", "ACTIVE_TAB"))
            tab_id = metadata.get("tab_id")
            window_id = metadata.get("window_id")
            bookmark_id = metadata.get("bookmark_id")
            
            # Add rollback handler for status update
            tx.add_rollback_handler(
                lambda: self.processed_urls[url].update({
                    "status": "error",
                    "error": "Transaction rolled back"
                })
            )
            
            # Process through pipeline
            result: Page = await self.pipeline.process_page(url, None)
            
            # Update browser context on the resulting Page object
            result.update_browser_contexts(
                context=context,
                tab_id=tab_id,
                window_id=window_id,
                bookmark_id=bookmark_id
            )
            
            # Record visit if it's an active tab
            if context in [BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB]:
                result.record_visit(tab_id=tab_id, window_id=window_id)
            
            # Update final status within transaction
            status_update = {
                "status": "completed",
                "completed_at": datetime.now().isoformat(),
                "progress": 1.0,
                "page_status": result.status.value,
                "browser_contexts": [ctx.value for ctx in result.browser_contexts],
                "last_active": result.last_active.isoformat() if result.last_active else None,
                "title": result.title,
                "metrics": {
                    "quality_score": result.metrics.quality_score,
                    "relevance_score": result.metrics.relevance_score,
                    "visit_count": result.metrics.visit_count,
                    "processing_time": result.metrics.processing_time
                }
            }
            self.processed_urls[url].update(status_update)

        except Exception as e:
            self.logger.error(f"Error processing URL {url}: {str(e)}", exc_info=True)
            raise

    async def process_url(
        self,
        url: str,
        metadata: Dict[str, Any],
        task_id: str,
        start_time: datetime
    ) -> None:
        """Process a single URL through the pipeline."""
        try:
            await self.execute_in_transaction(
                "_process_url_operation",
                url,
                metadata,
                task_id,
                start_time
            )
        except Exception as e:
            # Handle error and update status outside transaction
            self.processed_urls[url].update({
                "status": "error",
                "error": str(e),
                "completed_at": datetime.now().isoformat(),
                "progress": 0.0,
                "page_status": PageStatus.ERROR.value
            })
            raise
        finally:
            self.url_queue.task_done()

    async def _process_queue(self):
        """Background worker that processes URLs from the queue."""
        while True:
            try:
                # Clean up completed tasks
                self._cleanup_tasks()
                
                # Check if we can process more URLs
                if len(self.active_tasks) >= self.max_concurrent:
                    await asyncio.sleep(0.1)
                    continue
                
                # Get next URL from queue
                item = await self.url_queue.get()
                url = item["url"]
                metadata = item["metadata"]
                task_id = item["task_id"]
                
                # Start processing
                self.logger.info(f"Processing URL: {url}")
                start_time = datetime.now()
                
                # Create task for URL processing
                task = asyncio.create_task(
                    self._process_url(url, metadata, task_id, start_time),
                    name=f"{task_id}_{start_time.isoformat()}"
                )
                self.active_tasks[url] = task
                
            except Exception as e:
                self.logger.error(f"Error in queue processor: {str(e)}")
                await asyncio.sleep(1)

    async def _cleanup_tasks(self):
        """Remove completed tasks from active tasks dict with transaction support."""
        try:
            await self.execute_in_transaction("_cleanup_tasks_operation")
        except Exception as e:
            self.logger.error(f"Error in task cleanup: {str(e)}")

    async def _cleanup_tasks_operation(self, tx: Transaction):
        """Transaction-aware task cleanup operation."""
        completed = [url for url, task in self.active_tasks.items() if task.done()]
        for url in completed:
            task = self.active_tasks.pop(url)
            if task.exception():
                self.logger.error(f"Task for {url} failed: {task.exception()}")
                # Add task failure information to transaction context
                tx.add_rollback_handler(
                    lambda: self._handle_task_failure(url, task.exception())
                )

    async def get_status(self, task_id: str) -> Dict[str, Any]:
        """Get processing status for a task with transaction support."""
        try:
            return await self.execute_in_transaction(
                "_get_status_operation",
                task_id
            )
        except Exception as e:
            self.logger.error(f"Failed to get status for task {task_id}: {str(e)}")
            raise

    async def _get_status_operation(
        self,
        tx: Transaction,
        task_id: str
    ) -> Dict[str, Any]:
        """Transaction-aware status retrieval operation."""
        task_urls = {
            url: status for url, status in self.processed_urls.items()
            if status.get("task_id") == task_id
        }
        
        if not task_urls:
            return {
                "task_id": task_id,
                "status": "not_found",
                "progress": 0.0,
                "message": "Task not found"
            }
            
        # Calculate overall task status
        statuses = [info["status"] for info in task_urls.values()]
        if "error" in statuses:
            task_status = "error"
        elif all(s == "completed" for s in statuses):
            task_status = "completed"
        elif any(s == "processing" for s in statuses):
            task_status = "processing"
        else:
            task_status = "queued"
            
        # Calculate progress
        progress = sum(
            info.get("progress", 0.0) for info in task_urls.values()
        ) / len(task_urls)
        
        return {
            "task_id": task_id,
            "status": task_status,
            "progress": progress,
            "urls": task_urls
        }

    async def cleanup(self) -> None:
        """Cleanup pipeline service resources."""
        try:
            # Cancel worker task if it exists
            if self.worker_task:
                self.worker_task.cancel()
                try:
                    await self.worker_task
                except asyncio.CancelledError:
                    pass

            # Cancel any active tasks
            for task in self.active_tasks.values():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            self.active_tasks.clear()
            self.processed_urls.clear()
            
            # Clear queue
            while not self.url_queue.empty():
                try:
                    self.url_queue.get_nowait()
                    self.url_queue.task_done()
                except asyncio.QueueEmpty:
                    break
                
            self.logger.info("Pipeline service cleanup completed")
            
        except Exception as e:
            self.logger.error(f"Error during pipeline service cleanup: {e}")
            raise
        finally:
            await super().cleanup()