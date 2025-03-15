import asyncio
import time
from uuid import uuid4
from datetime import datetime
from typing import List, Dict, Any, Optional
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
from core.infrastructure.database.db_connection import DatabaseConnection
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
        config: PipelineConfig,
        db_connection: DatabaseConnection
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
        self.max_concurrent = self.config.max_concurrent_pages
        self.db_connection = db_connection

    async def initialize(self) -> None:
        """Initialize pipeline service resources."""
        self.logger.info("Initializing pipeline service")
        await super().initialize()
        
        # Register event handler for status updates
        self.pipeline.register_event_handler(self._handle_pipeline_event)
        
        # Start processing worker
        self.logger.info("Starting URL processing worker task")
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
        """Enqueue URLs for processing with better error handling."""
        try:
            # Check connection pool status first
            pool_status = await self.db_connection.check_connection_pool()
            self.logger.info(f"Connection pool status before enqueue: {pool_status}")
            # If transaction is provided, use it
            if tx is not None:
                return await self.execute_in_transaction(
                    tx,
                    "enqueue_urls_operation",
                    urls=urls
                )
            
            # Otherwise create a new transaction with shorter timeout
            try:
                # Create task ID outside transaction to use in error reporting
                task_id = str(uuid4())
                
                # Attempt with shorter timeout
                async with self.db_connection.transaction() as tx:
                    result = await self.execute_in_transaction(
                        tx,
                        "enqueue_urls_operation",
                        urls=urls
                    )
                    return result
                    
            except Exception as db_error:
                # Check if it's a timeout error by inspecting the error message
                if "timeout" in str(db_error).lower():
                    self.logger.warning(f"Database timeout during URL enqueue, falling back to memory-only mode")
                    
                    # Create fallback in-memory task for testing
                    memory_result = {
                        "task_id": task_id,
                        "urls_enqueued": len(urls),
                        "status": "enqueued",
                        "queue_size": 0,
                        "queued_at": datetime.now().isoformat()
                    }
                    
                    # Store URLs in memory tracking
                    for item in urls:
                        url = str(item.get("url"))
                        queued_at = datetime.now().isoformat()
                        
                        # Create status entry
                        status_entry = {
                            "url": url,
                            "status": "queued",
                            "task_id": task_id,
                            "progress": 0.0,
                            "queued_at": queued_at,
                            "browser_context": item.get("context"),
                            "tab_id": item.get("tab_id"),
                            "window_id": item.get("window_id"),
                            "bookmark_id": item.get("bookmark_id")
                        }
                        
                        # Store in memory
                        self.processed_urls[url] = status_entry
                        
                        # Queue for processing
                        await self.url_queue.put({
                            "url": url,
                            "metadata": item,
                            "task_id": task_id
                        })
                    
                    self.logger.info(f"Created memory-only task {task_id} with {len(urls)} URLs for testing")
                    return memory_result
                else:
                    # If it's not a timeout error, re-raise
                    raise
                    
        except Exception as e:
            self.logger.error(f"Error enqueuing URLs: {str(e)}")
            raise


    async def get_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of a task with detailed timing and error reporting."""
        try:
            self.logger.info(f"[get_status] Getting status for task: {task_id}")
            start_time = time.time()
            
            # Step 1: Check if task exists in memory first (fast path)
            task_urls = {
                url: status for url, status in self.processed_urls.items()
                if status.get("task_id") == task_id
            }
            
            if task_urls:
                # Calculate overall task status from URLs
                url_statuses = [info["status"] for info in task_urls.values()]
                
                # Determine overall status
                if "error" in url_statuses:
                    task_status = "error"
                    error_msg = next((info.get("error", "Unknown error") 
                                for info in task_urls.values() 
                                if info["status"] == "error"), 
                                "Task failed")
                    message = f"Task failed: {error_msg}"
                elif all(s == "completed" for s in url_statuses):
                    task_status = "completed"
                    message = "Task completed successfully"
                elif any(s == "processing" for s in url_statuses):
                    task_status = "processing"
                    message = "Task is being processed"
                else:
                    task_status = "queued"
                    message = "Task is queued for processing"
                
                # Calculate progress
                progress = sum(
                    info.get("progress", 0.0) for info in task_urls.values()
                ) / len(task_urls)
                
                status_data = {
                    "status": task_status,
                    "progress": progress,
                    "message": message,
                    "checked_at": datetime.now().isoformat()
                }
                
                # Include error if status is error
                if task_status == "error":
                    status_data["error"] = error_msg
                
                self.logger.info(f"[get_status] Found task {task_id} in memory, status: {task_status}")
                return status_data
            
            # Step 2: Task not in memory, try database with explicit timeout
            self.logger.info(f"[get_status] Task {task_id} not in memory, querying database")
            db_query_start = time.time()
            
            try:
                # Use wait_for for Python 3.9 compatibility
                task_result = await asyncio.wait_for(
                    self._query_task_status_db(task_id), 
                    timeout=10.0
                )
                
                db_query_time = time.time() - db_query_start
                self.logger.info(f"[get_status] Database query completed in {db_query_time:.2f}s")
                
                return task_result
                    
            except asyncio.TimeoutError:
                self.logger.error(f"[get_status] Timeout exceeded when querying database for task {task_id}")
                return {
                    "status": "error",
                    "task_id": task_id,
                    "progress": 0.0,
                    "message": "Status query timed out",
                    "error": "Database query timed out after 10s"
                }
                
        except Exception as e:
            elapsed = time.time() - start_time
            self.logger.error(f"[get_status] Error getting status for task {task_id} after {elapsed:.2f}s: {str(e)}", exc_info=True)
            return {
                "status": "error",
                "task_id": task_id, 
                "progress": 0.0,
                "message": "Failed to retrieve status",
                "error": str(e)
            }

    # Helper method for database query
    async def _query_task_status_db(self, task_id: str) -> Dict[str, Any]:
        """Query task status from database with proper transaction management."""
        async with self.db_connection.transaction() as tx:
            return await self._get_status_operation(tx, task_id)


    async def _enqueue_urls_operation(
        self,
        tx: Transaction,
        urls: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Transaction-aware URL enqueuing operation."""
        task_id = str(uuid4())
        try:
            self.logger.info(f"Enqueuing {len(urls)} URLs with task ID: {task_id}")
            
            # Get the underlying Neo4j transaction
            neo4j_tx = tx.db_transaction
            
            # Create task record
            await neo4j_tx.run(
                """
                CREATE (t:Task {
                    id: $task_id,
                    created_at: datetime(),
                    status: 'enqueued'
                })
                """,
                {"task_id": task_id}
            )
            
            self.logger.debug(f"Created Task node with ID: {task_id}")

            for item in urls:
                url = str(item.get("url"))
                queued_at = datetime.now().isoformat()
                # Create status entry for processed_urls tracking
                status_entry = {
                    "url": url,
                    "status": "queued",
                    "task_id": task_id,
                    "progress": 0.0,
                    "queued_at": queued_at,
                    "browser_context": item.get("context").value if item.get("context") else None,
                    "tab_id": item.get("tab_id"),
                    "window_id": item.get("window_id"),
                    "bookmark_id": item.get("bookmark_id")
                }

                # Create URL node in database
                await neo4j_tx.run(
                    """
                    MATCH (t:Task {id: $task_id})
                    CREATE (u:URL {
                        url: $url,
                        status: $status,
                        task_id: $task_id,
                        progress: $progress,
                        queued_at: $queued_at,
                        browser_context: $browser_context,
                        tab_id: $tab_id,
                        window_id: $window_id,
                        bookmark_id: $bookmark_id
                    })-[:PART_OF]->(t)
                    """,
                    {
                        "task_id": task_id,
                        "url": url,
                        "status": "queued",
                        "progress": 0.0,
                        "queued_at": datetime.now().isoformat(),
                        "browser_context": item.get("context").value if item.get("context") else None,
                        "tab_id": item.get("tab_id"),
                        "window_id": item.get("window_id"),
                        "bookmark_id": item.get("bookmark_id")
                    }
                )
                
                self.logger.debug(f"Created URL node for {url} in task {task_id}")
                            
                # Add to processing queue
                await self.url_queue.put({
                    "url": url,
                    "metadata": item,
                    "task_id": task_id
                })
                
                # Store in memory
                self.processed_urls[url] = status_entry
                
                # Add rollback handler
                tx.add_rollback_handler(
                    lambda u=url: self._handle_enqueue_rollback(u)
                )
                    
            self.logger.info(f"Enqueued {len(urls)} URLs for processing under task {task_id}")
            self.logger.debug(f"Current processed_urls has {len(self.processed_urls)} entries after enqueueing")
            
            # Make sure the transaction is committed if it's not part of a larger transaction
            if getattr(tx, 'auto_commit', False) and not tx.is_nested:
                self.logger.debug(f"Auto-committing transaction for task {task_id}")
                await tx.commit()
            
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
                "last_accessed": result.metadata.last_accessed.isoformat() if result.metadata.last_accessed else None,
                "title": result.title,
                "metrics": {
                    "quality_score": result.metadata.metrics.quality_score,
                    "relevance_score": result.metadata.metrics.relevance_score,
                    "visit_count": result.metadata.metrics.visit_count,
                    "processing_time": result.metadata.metrics.processing_time
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
            tx = Transaction()
            await self.execute_in_transaction(
                tx,
                "process_url_operation",
                url=url,                   
                metadata=metadata,
                task_id=task_id,
                start_time=start_time
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
        """Background worker that processes URLs from the queue with improved error handling."""
        self.logger.info("URL processing worker started")
        
        while True:
            try:
                # Clean up completed tasks
                await self._cleanup_tasks()
                
                # Check queue size and report
                queue_size = self.url_queue.qsize()
                if queue_size > 0:
                    self.logger.debug(f"Queue status: {queue_size} items pending, {len(self.active_tasks)} active tasks")
                
                # Check if we can process more URLs
                if len(self.active_tasks) >= self.max_concurrent:
                    self.logger.debug(f"Max concurrent tasks reached ({self.max_concurrent}), waiting...")
                    await asyncio.sleep(0.5)
                    continue
                
                # Try to get next URL with timeout to avoid blocking
                try:
                    item = await asyncio.wait_for(self.url_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # No items in queue, just continue the loop
                    await asyncio.sleep(0.1)
                    continue
                    
                url = item["url"]
                metadata = item["metadata"]
                task_id = item["task_id"]
                
                # Start processing
                self.logger.info(f"Processing URL: {url} (task: {task_id})")
                start_time = datetime.now()
                
                # Create task for URL processing
                try:
                    # Use a shielded task to prevent cancellation during critical operations
                    task = asyncio.create_task(
                        self._safe_process_url(url, metadata, task_id, start_time),
                        name=f"{task_id}_{url}_{start_time.isoformat()}"
                    )
                    self.active_tasks[url] = task
                    self.logger.info(f"Started processing task for {url}")
                except Exception as task_error:
                    self.logger.error(f"Failed to create task for {url}: {str(task_error)}")
                    # Mark as done even if we couldn't process it
                    self.url_queue.task_done()
                    
                    # Update status to error
                    self.processed_urls[url].update({
                        "status": "error",
                        "error": f"Failed to start processing: {str(task_error)}",
                        "completed_at": datetime.now().isoformat()
                    })
                
            except Exception as e:
                self.logger.error(f"Error in queue processor: {str(e)}", exc_info=True)
                await asyncio.sleep(1)

    async def _safe_process_url(self, url, metadata, task_id, start_time):
        """Process URL with additional error handling and safeguards."""
        try:
            self.logger.info(f"Safe processing of URL {url} started")
            
            # Update status to processing
            self.processed_urls[url].update({
                "status": "processing",
                "started_at": start_time.isoformat()
            })
            
            # Try processing with timeout
            try:
                await asyncio.wait_for(
                    self.process_url(url, metadata, task_id, start_time),
                    timeout=90.0  # 90 second timeout for processing
                )
            except asyncio.TimeoutError:
                self.logger.error(f"Processing timeout for URL {url}")
                self.processed_urls[url].update({
                    "status": "error",
                    "error": "Processing timed out after 90s",
                    "completed_at": datetime.now().isoformat()
                })
                
        except Exception as e:
            self.logger.error(f"Error in _safe_process_url for {url}: {str(e)}", exc_info=True)
            # Update status to error
            self.processed_urls[url].update({
                "status": "error",
                "error": str(e),
                "completed_at": datetime.now().isoformat()
            })
        finally:
            # Always mark as done to prevent queue from blocking
            try:
                self.url_queue.task_done()
            except Exception as e:
                self.logger.error(f"Error marking queue task done: {str(e)}")
            
            # Log completion
            self.logger.info(f"Processing of URL {url} completed with status: {self.processed_urls[url].get('status', 'unknown')}")

    async def _cleanup_tasks(self):
        """Remove completed tasks from active tasks dict with transaction support."""
        try:
            tx = Transaction()
            await self.execute_in_transaction(
                tx,
                "cleanup_tasks_operation"
                )
            
        except Exception as e:
            self.logger.error(f"Error in task cleanup: {str(e)}")

    async def _cleanup_tasks_operation(
        self,
        tx: Transaction,
    ) -> None:
        """Transaction-aware task cleanup operation."""
        completed = [url for url, task in self.active_tasks.items() if task.done()]
        for url in completed:
            task = self.active_tasks.pop(url)
            if task.exception():
                self.logger.error(f"Task for {url} failed: {task.exception()}")
                tx.add_rollback_handler(
                    lambda: self._handle_task_failure(url, task.exception())
                )


    async def _get_status_operation(
        self,
        tx: Transaction,
        task_id: str
    ) -> Dict[str, Any]:
        """Transaction-aware status retrieval operation."""
        try:
            # Register rollback handler
            tx.add_rollback_handler(lambda: self.logger.warning(f"Rolling back status check for task {task_id}"))
            
            # Add detailed logging
            self.logger.debug(f"Status check for task {task_id} - processed_urls has {len(self.processed_urls)} entries")
            if self.processed_urls:
                task_keys = [key for key, val in self.processed_urls.items() if val.get('task_id') == task_id]
                self.logger.debug(f"Found {len(task_keys)} entries for task {task_id} in processed_urls: {task_keys}")
            
            # First check in-memory status
            task_urls = {
                url: status for url, status in self.processed_urls.items()
                if status.get("task_id") == task_id
            }
            
            if not task_urls:
                # Check in database - use db_connection instead of tx directly
                task_exists_result = await self.db_connection.execute_query(
                    "MATCH (t:Task {id: $task_id}) RETURN t",
                    {"task_id": task_id},
                    transaction=tx
                )
                
                if not task_exists_result:
                    self.logger.warning(f"Task {task_id} not found in database")
                    return {
                        "status": "not_found",
                        "progress": 0.0,
                        "message": f"Task {task_id} not found"
                    }
                    
                url_result = await self.db_connection.execute_query(
                    """
                    MATCH (t:Task {id: $task_id})<-[:PART_OF]-(u:URL)
                    RETURN u.url as url, u.status as status, u.progress as progress
                    """,
                    {"task_id": task_id},
                    transaction=tx
                )
                
                if not url_result:
                    self.logger.warning(f"Task {task_id} exists in database but has no URLs")
                    
                    # Update task node with this check
                    await self.db_connection.execute_query(
                        """
                        MATCH (t:Task {id: $task_id})
                        SET t.last_checked = datetime(),
                            t.status_message = "Task exists but has no URLs"
                        """,
                        {"task_id": task_id},
                        transaction=tx
                    )

                    return {
                        "status": "processing",  # Assume it's in progress if the task exists
                        "progress": 0.0,
                        "message": "Task exists but processing has not started"
                    }
                    
                # Reconstruct the task status from URL statuses in database
                self.logger.info(f"Found task {task_id} in database with {len(url_result)} URLs")
                
                # Add these URLs to in-memory cache for future queries
                for url_data in url_result:
                    url = url_data["url"]
                    if url not in self.processed_urls:
                        self.processed_urls[url] = {
                            "url": url,
                            "status": url_data["status"],
                            "task_id": task_id,
                            "progress": float(url_data["progress"]) if url_data["progress"] is not None else 0.0,
                            "recovered_from_db": True  # Flag to indicate this was recovered from DB
                        }
                        self.logger.debug(f"Recovered URL {url} for task {task_id} from database")
                
                # Now retry the memory check with the recovered URLs
                task_urls = {
                    url: status for url, status in self.processed_urls.items()
                    if status.get("task_id") == task_id
                }
                
                if not task_urls:
                    self.logger.warning(f"Still no URLs found for task {task_id} after DB recovery")
                    return {
                        "status": "error",
                        "progress": 0.0,
                        "message": "Task found but URL processing failed"
                    }
            
            # Calculate overall task status (this part remains the same)
            url_statuses = [info["status"] for info in task_urls.values()]
            
            # Track this status check in the transaction
            await self.db_connection.execute_query(
                """
                MATCH (t:Task {id: $task_id})
                SET t.last_checked = datetime()
                """,
                {
                    "task_id": task_id,
                    "status": url_statuses
                    },
                transaction=tx
            )
            
            # Determine overall status (same as before)
            if "error" in url_statuses:
                task_status = "error"
                message = next((info.get("error", "Unknown error") 
                            for info in task_urls.values() 
                            if info["status"] == "error"), 
                            "Task failed")
            elif all(s == "completed" for s in url_statuses):
                task_status = "completed"
                message = "Task completed successfully"
            elif any(s == "processing" for s in url_statuses):
                task_status = "processing"
                message = "Task is being processed"
            else:
                task_status = "queued"
                message = "Task is queued for processing"
                
            # Calculate progress
            progress = sum(
                info.get("progress", 0.0) for info in task_urls.values()
            ) / len(task_urls)
            
            # Record the status check (same as before)
            status_data = {
                "status": task_status,
                "progress": progress,
                "message": message,
                "checked_at": datetime.now().isoformat()
            }
            
            await self.db_connection.execute_query(
                """
                MATCH (t:Task {id: $task_id})
                SET t.last_checked = datetime(),
                    t.status = $status,
                    t.progress = $progress,
                    t.message = $message
                """,
                {
                    "task_id": task_id,
                    "status": task_status,
                    "progress": progress,
                    "message": message
                },
                transaction=tx
            )
            
            return status_data
            
        except Exception as e:
            self.logger.error(f"Error in status operation: {str(e)}")
            # Transaction will be rolled back by caller
            raise

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