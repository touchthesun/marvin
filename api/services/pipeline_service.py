from typing import List, Dict, Any
import asyncio
from datetime import datetime
from core.utils.logger import get_logger

logger = get_logger(__name__)

class PipelineService:
    """Service for managing content processing pipeline operations.
    
    Implements a queue-based approach for processing URLs, allowing
    for continuous streaming of new URLs to be processed.
    """
    
    def __init__(self, max_concurrent: int = 5):
        """Initialize the pipeline service.
        
        Args:
            max_concurrent: Maximum number of concurrent processing tasks
        """
        self.max_concurrent = max_concurrent
        self.url_queue = asyncio.Queue()
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.processed_urls: Dict[str, Dict[str, Any]] = {}
        self.logger = logger
        
        # Start processing worker
        self.worker_task = asyncio.create_task(self._process_queue())
    

    async def enqueue_urls(self, urls: List[str]) -> Dict[str, Any]:
        """Add multiple URLs to the processing queue."""
        for url in urls:
            await self.url_queue.put(url)
            
        self.logger.info(f"Enqueued {len(urls)} URLs for processing")
        
        return {
            "urls_enqueued": len(urls),
            "status": "enqueued",
            "queue_size": self.url_queue.qsize(),
            "queued_at": datetime.now().isoformat()
        }

    async def get_status(self, url: str) -> Dict[str, Any]:
        """Get processing status for a URL."""
        # Check if URL has been processed
        if url in self.processed_urls:
            return self.processed_urls[url]
            
        # Check if URL is currently processing
        if url in self.active_tasks:
            return {
                "url": url,
                "status": "processing",
                "started_at": self.active_tasks[url].get_name()
            }
            
        # Check if URL is in queue
        if url in [item for item in self.url_queue._queue]:
            position = [item for item in self.url_queue._queue].index(url)
            return {
                "url": url,
                "status": "queued",
                "queue_position": position
            }
            
        return {
            "url": url,
            "status": "not_found"
        }

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
                url = await self.url_queue.get()
                
                # Start processing
                self.logger.info(f"Processing URL: {url}")
                start_time = datetime.now()
                
                # Create task for URL processing
                task = asyncio.create_task(
                    self._process_url(url, start_time),
                    name=start_time.isoformat()
                )
                self.active_tasks[url] = task
                
            except Exception as e:
                self.logger.error(f"Error in queue processor: {str(e)}")
                await asyncio.sleep(1)

    async def _process_url(self, url: str, start_time: datetime):
        """Process a single URL."""
        try:
            # Simulate processing
            await asyncio.sleep(1)
            
            # Record successful processing
            self.processed_urls[url] = {
                "url": url,
                "status": "completed",
                "started_at": start_time.isoformat(),
                "completed_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            # Record failed processing
            self.processed_urls[url] = {
                "url": url,
                "status": "error",
                "started_at": start_time.isoformat(),
                "error": str(e)
            }
            raise
        finally:
            self.url_queue.task_done()

    def _cleanup_tasks(self):
        """Remove completed tasks from active tasks dict."""
        completed = [url for url, task in self.active_tasks.items() if task.done()]
        for url in completed:
            task = self.active_tasks.pop(url)
            if task.exception():
                self.logger.error(f"Task for {url} failed: {task.exception()}")

    async def cleanup(self):
        """Cleanup resources when shutting down."""
        if hasattr(self, 'worker_task'):
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass