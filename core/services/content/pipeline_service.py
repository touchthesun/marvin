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
from core.domain.content.models.page import Page, BrowserContext, PageStatus
from core.domain.content.models.relationships import RelationshipManager
from core.domain.content.keyword_identifier import KeywordNormalizer
from core.domain.content.validation import KeywordValidator, ValidationConfig
from core.domain.content.processor import ContentProcessor, ContentProcessorConfig
from core.domain.content.abbreviations import AbbreviationService
from core.infrastructure.database.transactions import Transaction
from core.infrastructure.database.db_connection import DatabaseConnection
from core.services.base import BaseService
from core.infrastructure.storage.storage_components import Neo4jStorageComponent
from core.utils.logger import get_logger
from core.utils.nlp import initialize_spacy_model

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
        """Initialize pipeline service resources with robust worker management."""
        try:
            self.logger.info("Initializing pipeline service")
            await super().initialize()
            
            # Initialize spaCy once
            self.nlp = initialize_spacy_model()
            if not self.nlp:
                self.logger.warning("Failed to initialize spaCy model, keyword extraction will be limited")
            else:
                self.logger.info("Successfully initialized spaCy model")

            # Register event handler for status updates
            self.pipeline.register_event_handler(self._handle_pipeline_event)

            # Create and register the storage component
            storage_component = Neo4jStorageComponent(self.db_connection)
            self.context.component_coordinator.register_component(
                storage_component, 
                ProcessingStage.STORAGE
            )
            
            # Create and register content processor for ANALYSIS stage if spaCy is available
            if self.nlp:
                try:
                    # Create necessary dependencies
                    normalizer = KeywordNormalizer()

                    validation_config = ValidationConfig()
                    abbreviation_service = AbbreviationService()

                    validator = KeywordValidator(
                        nlp=self.nlp,
                        config=validation_config,
                        abbreviation_service=abbreviation_service
                    )
                    relationship_manager = RelationshipManager(nlp=self.nlp)
                    
                    # Create content processor
                    content_processor = ContentProcessor(
                        config=ContentProcessorConfig(),
                        keyword_processor=None,  # Will be created internally
                        relationship_manager=relationship_manager,
                        normalizer=normalizer,
                        validator=validator,
                        nlp=self.nlp,
                        debug_mode=True
                    )
                    
                    # Register for ANALYSIS stage
                    self.context.component_coordinator.register_component(
                        content_processor,
                        ProcessingStage.ANALYSIS
                    )
                    self.logger.info("ContentProcessor registered for ANALYSIS stage")
                except Exception as e:
                    self.logger.error(f"Error creating content processor: {str(e)}", exc_info=True)
                    self.logger.warning("Keyword extraction will be disabled")
            
            # Start processing worker with monitoring
            self.logger.info("Starting URL processing worker task")
            self.worker_task = asyncio.create_task(self._process_queue())
            
            # Start worker monitor
            # self.logger.info("Starting worker monitor")
            # self.worker_monitor_task = asyncio.create_task(self._monitor_worker())
            
            self.logger.info("Pipeline service initialized with worker task and monitor")
        except Exception as e:
            self.logger.error(f"Error initializing pipeline service: {str(e)}", exc_info=True)
            raise

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
            "last_active": page.metadata.last_accessed.isoformat() if page.metadata.last_accessed else None
        }
        
        if event.stage == ProcessingStage.ERROR:
            status_update["error"] = event.message
            if page.errors:
                status_update["page_errors"] = page.errors

        self.processed_urls[url].update(status_update)

        if event.stage == ProcessingStage.COMPLETE:
            url = page.url
            if url in self.processed_urls:
                self.processed_urls[url].update({
                    "status": "completed",
                    "progress": 1.0,
                    "message": "Processing complete"
                })
            


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

    async def _update_task_status_operation(
        self,
        tx: Transaction,
        task_id: str
    ) -> None:
        """Update task status based on its URLs."""
        try:
            # Get all URLs for this task
            urls_result = await self.db_connection.execute_query(
                """
                MATCH (t:Task {id: $task_id})<-[:PART_OF]-(u:URL)
                RETURN u.url as url, u.status as status, u.progress as progress
                """,
                {"task_id": task_id},
                transaction=tx
            )
            
            if not urls_result:
                self.logger.warning(f"No URLs found for task {task_id}")
                return
            
            # Calculate task status based on URLs
            statuses = [record["status"] for record in urls_result]
            progresses = [float(record["progress"] or 0.0) for record in urls_result]
            
            overall_progress = sum(progresses) / len(progresses)
            
            if "error" in statuses:
                task_status = "error"
                message = "Error processing task"
            elif all(s == "completed" for s in statuses):
                task_status = "completed"
                message = "Task completed successfully"
            elif any(s == "processing" for s in statuses):
                task_status = "processing"
                message = "Task is being processed"
            else:
                task_status = "queued"
                message = "Task is queued for processing"
            
            # Update task in database
            await self.db_connection.execute_query(
                """
                MATCH (t:Task {id: $task_id})
                SET t.status = $status,
                    t.progress = $progress,
                    t.message = $message,
                    t.updated_at = datetime()
                """,
                {
                    "task_id": task_id,
                    "status": task_status,
                    "progress": overall_progress,
                    "message": message
                },
                transaction=tx
            )
            
            self.logger.info(f"Updated task {task_id} status to {task_status} with progress {overall_progress:.2f}")
            
        except Exception as e:
            self.logger.error(f"Error updating task status: {str(e)}")
            raise

    async def _process_url_operation(
        self,
        tx: Transaction,
        url: str,
        metadata: Dict[str, Any],
        task_id: str,
        start_time: datetime
    ) -> None:
        """Internal transaction-aware URL processing."""
        self.logger.warning(f"<<<< _process_url_operation CALLED for URL {url} >>>>")

        try:
            self.logger.info(f"Starting processing of URL {url} for task {task_id}")
            self.logger.debug(f"Processing metadata: {metadata}")
            
            # Check if URL exists in processed_urls
            if url not in self.processed_urls:
                self.logger.warning(f"URL {url} not found in processed_urls, adding it now")
                self.processed_urls[url] = {
                    "url": url,
                    "status": "processing",
                    "task_id": task_id,
                    "progress": 0.0,
                    "started_at": start_time.isoformat()
                }
            else:
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
                }) if url in self.processed_urls else None
            )
            
            # Process through pipeline
            result: Page = await self.pipeline.process_page(url, None)
            
            # Update browser context on the resulting Page object
            self.logger.debug(f"Updating browser contexts for page {result.id} with context {context}")
            result.update_browser_contexts(
                context=context,
                tab_id=tab_id,
                window_id=window_id,
                bookmark_id=bookmark_id
            )
            self.logger.debug(f"Browser contexts updated for page {result.id}")

            
            # Record visit if it's an active tab
            if context in [BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB]:
                result.record_visit(tab_id=tab_id, window_id=window_id)
            
            if url not in self.processed_urls:
                self.logger.warning(f"URL {url} not found in processed_urls, re-adding it")
                self.processed_urls[url] = {
                    "url": url,
                    "status": "processing",
                    "task_id": task_id,
                    "progress": 0.8,  # We're at storage stage
                }

            url_update_tx = Transaction()
            await url_update_tx.initialize_db_transaction(self.db_connection._driver.session())
            
            try:
                # Update the URL status in the database with a fresh transaction
                await self.db_connection.execute_query(
                    """
                    MATCH (u:URL {url: $url})
                    SET u.status = 'completed',
                        u.progress = 1.0,
                        u.completed_at = datetime()
                    """,
                    {"url": url},
                    transaction=url_update_tx
                )
                
                # Update task status
                await self._update_task_status_operation(url_update_tx, task_id)
                
                # Commit the transaction
                await url_update_tx.commit()
                
                # Update final status within memory
                status_update = {
                    "status": "completed",
                    "completed_at": datetime.now().isoformat(),
                    "progress": 1.0,
                    "page_status": result.status.value,
                    "browser_contexts": [ctx.value for ctx in result.browser_contexts],
                    "last_accessed": result.metadata.last_accessed.isoformat() if result.metadata.last_accessed else None,
                    "title": result.title if hasattr(result, 'title') else "",
                    "metrics": {
                        "quality_score": result.metadata.metrics.quality_score,
                        "relevance_score": result.metadata.metrics.relevance_score,
                        "visit_count": result.metadata.metrics.visit_count,
                        "processing_time": result.metadata.metrics.processing_time
                    }
                }
                
                if url in self.processed_urls:
                    self.processed_urls[url].update(status_update)
                
            except Exception as tx_error:
                # Rollback if something goes wrong
                self.logger.error(f"Error updating URL status: {str(tx_error)}")
                await url_update_tx.rollback()
                raise
                
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

    async def _process_queue(self):
        """Background worker that processes URLs from the queue with improved error handling and logging."""
        try:
            self.logger.info("URL processing worker started")
            last_queue_size = 0
            last_log_time = time.time()
            
            while True:
                try:
                    # Clean up completed tasks
                    try:
                        await self._cleanup_tasks()
                    except Exception as cleanup_error:
                        self.logger.error(f"Error cleaning up tasks: {str(cleanup_error)}", exc_info=True)
                    
                    # Get current queue status
                    queue_size = self.url_queue.qsize()
                    active_tasks_count = len(self.active_tasks)
                    current_time = time.time()
                    
                    # Only log when queue size changes or every 60 seconds
                    if queue_size != last_queue_size or (current_time - last_log_time > 60):
                        if queue_size > 0:
                            self.logger.info(f"Queue status: {queue_size} items pending, {active_tasks_count} active tasks")
                        else:
                            self.logger.debug(f"Queue empty, {active_tasks_count} active tasks")
                        last_queue_size = queue_size
                        last_log_time = current_time
                    
                    # Try to get next URL with timeout to avoid blocking
                    item = None
                    try:
                        # Only log if queue is not empty, to reduce noise
                        if queue_size > 0:
                            self.logger.debug(f"Attempting to get item from queue (size: {queue_size})")
                        item = await asyncio.wait_for(self.url_queue.get(), timeout=1.0)
                        self.logger.debug(f"Got item from queue: {item.get('url', 'unknown')}")
                    except asyncio.TimeoutError:
                        # No items in queue, just continue
                        await asyncio.sleep(0.1)
                        continue
                    except Exception as queue_error:
                        self.logger.error(f"Error getting item from queue: {str(queue_error)}", exc_info=True)
                        await asyncio.sleep(0.5)
                        continue
                    
                    # Process item if we got one
                    if item:
                        url = item.get("url", "unknown")
                        metadata = item.get("metadata", {})
                        task_id = item.get("task_id", "unknown")
                        is_recovered = item.get("recovered", False)
                        self.logger.info(f"Processing {url} (recovered: {is_recovered}) from queue")
                        
                        self.logger.info(f"Dequeued item for processing: {url} (task: {task_id})")
                        
                        # Process the URL
                        try:
                            # Update status to processing
                            if url in self.processed_urls:
                                self.processed_urls[url].update({
                                    "status": "processing",
                                    "started_at": datetime.now().isoformat()
                                })
                            
                            # Create task for URL processing
                            task = asyncio.create_task(
                                self._direct_process_url(url, metadata, task_id),  # New method that doesn't call task_done
                                name=f"process_url_{task_id}_{url}"
                            )
                            self.active_tasks[url] = task
                            self.logger.info(f"Created processing task for URL: {url}")
                            
                        except Exception as process_error:
                            self.logger.error(f"Failed to create task for URL {url}: {str(process_error)}", exc_info=True)
                            
                            # Update status to error
                            if url in self.processed_urls:
                                self.processed_urls[url].update({
                                    "status": "error",
                                    "error": f"Failed to start processing: {str(process_error)}",
                                    "completed_at": datetime.now().isoformat()
                                })
                        
                        # CRITICAL: Always mark the task as done exactly once
                        self.logger.debug(f"Marking URL {url} as done in queue")
                        self.url_queue.task_done()
                    
                except Exception as worker_error:
                    self.logger.error(f"Error in worker loop: {str(worker_error)}", exc_info=True)
                    await asyncio.sleep(1)  # Shorter delay to recover faster
                    # Continue the outer loop to keep the worker running
        
        except Exception as fatal_error:
            # This should catch any unhandled exceptions in the outer loop
            self.logger.critical(f"Fatal error in URL processor worker: {str(fatal_error)}", exc_info=True)
            # Exit the method, allowing the monitor to restart it

    async def _direct_process_url(self, url, metadata, task_id):
        """Direct URL processing without queue management."""
        start_time = datetime.now()
        try:
            is_recovered = metadata.get("recovered", False)
            self.logger.info(f"Processing URL {url} for task {task_id} (recovered: {is_recovered})")
            
            # Debug current status
            if url in self.processed_urls:
                current_status = self.processed_urls[url].get("status", "unknown")
                self.logger.info(f"Current status before processing: {current_status}")
            else:
                self.logger.warning(f"URL {url} not in processed_urls at start of _direct_process_url")
            
            # Create a transaction and process
            tx = Transaction()
            
            try:
                # Let the operation method handle all the details
                await self.execute_in_transaction(
                    tx,
                    "process_url_operation",
                    url=url,                   
                    metadata=metadata,
                    task_id=task_id,
                    start_time=start_time
                )
                
                self.logger.info(f"Successfully processed URL {url}")
            except Exception as tx_error:
                self.logger.error(f"Transaction failed for URL {url}: {str(tx_error)}", exc_info=True)
                raise
                    
        except Exception as e:
            self.logger.error(f"Error processing URL {url}: {str(e)}", exc_info=True)
            
            # Ensure status is updated to error if we have the URL
            if url in self.processed_urls:
                self.processed_urls[url].update({
                    "status": "error",
                    "error": str(e),
                    "completed_at": datetime.now().isoformat()
                })

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
        """Transaction-aware status retrieval operation with read-only queries."""
        try:
            # Register rollback handler
            tx.add_rollback_handler(lambda: self.logger.warning(f"Rolling back status check for task {task_id}"))
            
            # Add detailed logging
            self.logger.debug(f"Status check for task {task_id} - processed_urls has {len(self.processed_urls)} entries")
            
            # First check in-memory status
            task_urls = {
                url: status for url, status in self.processed_urls.items()
                if status.get("task_id") == task_id
            }
            
            if not task_urls:
                # Check in database using read-only queries
                task_exists_result = await self.db_connection.execute_read_query(
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
                    
                url_result = await self.db_connection.execute_read_query(
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
                    status = url_data["status"]
                    if url not in self.processed_urls:
                        self.processed_urls[url] = {
                            "url": url,
                            "status": status,
                            "task_id": task_id,
                            "progress": float(url_data["progress"]) if url_data["progress"] is not None else 0.0,
                            "recovered_from_db": True  # Flag to indicate this was recovered from DB
                        }
                        self.logger.debug(f"Recovered URL {url} for task {task_id} from database")

                        # If status is "queued", add to queue as well
                    if status == "queued":
                        self.logger.info(f"Requeueing recovered URL {url} for task {task_id}")
                        await self.url_queue.put({
                            "url": url,
                            "metadata": {
                                # Use proper BrowserContext enum
                                "context": BrowserContext.RECOVERED,
                                "task_id": task_id
                            },
                            "task_id": task_id,
                            "recovered": True
                        })

                self.logger.info(f"Queue status after recovery: size={self.url_queue.qsize()}")
                await self.debug_queue_state()
                                
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

            # Record the status check
            status_data = {
                "status": task_status,
                "progress": progress,
                "message": message,
                "checked_at": datetime.now().isoformat()
            }

            all_progress_complete = all(info.get("progress", 0.0) >= 0.99 for info in task_urls.values())
            if all_progress_complete and task_status != "error":
                task_status = "completed"  
                message = "Task completed successfully"
                
                # Update the status in processed_urls to match
                for url, info in task_urls.items():
                    if info.get("status") != "completed":
                        self.logger.info(f"Updating status for URL {url} from {info.get('status')} to completed based on 100% progress")
                        self.processed_urls[url]["status"] = "completed"
            
            # Record the status check (same as before)
            status_data = {
                "status": task_status,
                "progress": progress,
                "message": message,
                "checked_at": datetime.now().isoformat()
            }
            
            return status_data
            
        except Exception as e:
            self.logger.error(f"Error in status operation: {str(e)}")
            # Transaction will be rolled back by caller
            raise

    async def cleanup(self) -> None:
        """Cleanup pipeline service resources."""
        try:
            # Cancel worker monitor task if it exists
            if hasattr(self, 'worker_monitor_task') and self.worker_monitor_task:
                self.worker_monitor_task.cancel()
                try:
                    await self.worker_monitor_task
                except asyncio.CancelledError:
                    pass

            # Cancel worker task if it exists
            if self.worker_task:
                self.worker_task.cancel()
                try:
                    await self.worker_task
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


    # async def _monitor_worker(self):
    #     """Monitor worker task and restart if necessary with better diagnostics."""
    #     try:
    #         self.logger.info("Worker monitoring started")
            
    #         while True:
    #             try:
    #                 current_worker = self.worker_task
                    
    #                 if current_worker is None:
    #                     self.logger.warning("No worker task found, starting a new one")
    #                     self.worker_task = asyncio.create_task(self._process_queue())
                        
    #                 elif current_worker.done():
    #                     # Get exception if there is one
    #                     worker_exception = None
    #                     try:
    #                         worker_exception = current_worker.exception()
    #                     except asyncio.InvalidStateError:
    #                         # Task was cancelled, not an error
    #                         self.logger.info("Previous worker was cancelled")
                        
    #                     if worker_exception:
    #                         self.logger.error(f"Worker failed with error: {worker_exception}", exc_info=worker_exception)
                        
    #                     self.worker_task = asyncio.create_task(self._process_queue())
    #                     self.logger.warning("Worker task has terminated, restarted with a new task")
                        
    #                 # Check queue health
    #                 queue_size = self.url_queue.qsize()
    #                 active_tasks = len(self.active_tasks)
                    
    #                 # Get URLs that are in queued state in processed_urls
    #                 queued_urls = [url for url, info in self.processed_urls.items() 
    #                             if info.get("status") == "queued"]
                    
    #                 # self.logger.debug(f"Worker monitor: queue_size={queue_size}, active_tasks={active_tasks}, queued_urls={len(queued_urls)}")
                    
    #                 # If there are URLs marked as queued but queue is empty, there's a mismatch
    #                 if queue_size == 0 and len(queued_urls) > 0:
    #                     self.logger.warning(f"Queue counter mismatch detected: 0 items in queue but {len(queued_urls)} URLs in 'queued' state")
    #                     await self.reset_queue()

    #                 # If there are items in the queue but no active tasks, something might be wrong
    #                 if queue_size > 0 and active_tasks == 0 and not self.worker_task.done():
    #                     self.logger.warning(f"Potential stall detected: {queue_size} items in queue but no active tasks")
                    
    #                 # Check every 5 seconds
    #                 await asyncio.sleep(5)
                    
    #             except Exception as monitor_error:
    #                 self.logger.error(f"Error in worker monitor: {str(monitor_error)}", exc_info=True)
    #                 await asyncio.sleep(5)  # Continue monitoring
        
    #     except Exception as fatal_error:
    #         self.logger.critical(f"Fatal error in worker monitor: {str(fatal_error)}", exc_info=True)

    async def debug_queue_state(self):
        """Debug method to diagnose queue state."""
        self.logger.info(f"Queue diagnostics:")
        self.logger.info(f"Queue size: {self.url_queue.qsize()}")
        self.logger.info(f"Active tasks: {len(self.active_tasks)}")
        self.logger.info(f"Processed URLs: {len(self.processed_urls)}")
        
        # Try to inspect the queue's internal counter
        try:
            # This is implementation-specific and might not work
            unfinished = getattr(self.url_queue, "_unfinished_tasks", None)
            self.logger.info(f"Queue unfinished tasks: {unfinished}")
        except:
            self.logger.info("Could not access queue internals")
        
        # Check processed_urls that should be in the queue
        queued_urls = [url for url, info in self.processed_urls.items() 
                    if info.get("status") == "queued"]
        self.logger.info(f"URLs in 'queued' state: {len(queued_urls)}")
        
        # Print the first few queued URLs
        if queued_urls:
            for i, url in enumerate(queued_urls[:3]):
                self.logger.info(f"Queued URL {i}: {url}")
        
        # Check if worker is running
        if self.worker_task:
            self.logger.info(f"Worker task state: {'running' if not self.worker_task.done() else 'done'}")
            if self.worker_task.done():
                try:
                    exc = self.worker_task.exception()
                    if exc:
                        self.logger.error(f"Worker exception: {exc}")
                except:
                    pass


    async def reset_queue(self):
        """Reset the queue to fix counter issues."""
        self.logger.warning("Resetting queue due to potential counter mismatch")
        
        # Record the old queue for diagnostics
        old_queue_size = self.url_queue.qsize()
        
        # Create a new queue
        new_queue = asyncio.Queue()
        
        # Find all URLs in queued state
        queued_urls = [(url, info) for url, info in self.processed_urls.items() 
                    if info.get("status") == "queued"]
        
        self.logger.info(f"Found {len(queued_urls)} URLs to requeue (old queue size was {old_queue_size})")
        
        # Add them to the new queue
        for url, info in queued_urls:
            task_id = info.get("task_id")
            # Reconstruct metadata from the processed_urls entry
            metadata = {
                "context": info.get("browser_context"),
                "tab_id": info.get("tab_id"),
                "window_id": info.get("window_id"),
                "bookmark_id": info.get("bookmark_id")
            }
            
            # Put in new queue
            await new_queue.put({
                "url": url,
                "metadata": metadata,
                "task_id": task_id
            })
        
        # Optionally try to drain the old queue before replacing it
        try:
            while not self.url_queue.empty():
                try:
                    self.url_queue.get_nowait()
                    self.url_queue.task_done()
                except asyncio.QueueEmpty:
                    break
        except Exception as e:
            self.logger.error(f"Error draining old queue: {str(e)}")
        
        # Replace the old queue
        self.url_queue = new_queue
        self.logger.info(f"Queue reset complete, new size: {new_queue.qsize()}")


    def _handle_task_failure(self, url: str, exception: Exception):
        """Handle a failed task."""
        self.logger.error(f"Task for URL {url} failed with error: {str(exception)}")
        
        # Update status in processed_urls
        if url in self.processed_urls:
            self.processed_urls[url].update({
                "status": "error",
                "error": str(exception),
                "completed_at": datetime.now().isoformat()
            })