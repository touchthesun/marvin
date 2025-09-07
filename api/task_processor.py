"""
Task Processor: Bridge between TaskManager and PipelineService
Monitors tasks and processes them through the pipeline
"""

import asyncio
import httpx
from typing import Dict, Any
from core.utils.logger import get_logger

logger = get_logger(__name__)

class TaskProcessor:
    """Processes tasks by connecting TaskManager to PipelineService"""
    
    def __init__(self, task_manager, base_url: str = "http://localhost:8000"):
        self.task_manager = task_manager
        self.base_url = base_url
        self.running = False
        self.processor_task = None
    
    async def start(self):
        """Start the task processor"""
        if self.running:
            return
        
        self.running = True
        self.processor_task = asyncio.create_task(self._process_loop())
        logger.info("Task processor started")
    
    async def stop(self):
        """Stop the task processor"""
        self.running = False
        if self.processor_task:
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass
        logger.info("Task processor stopped")
    
    async def _process_loop(self):
        """Main processing loop - non-blocking"""
        while self.running:
            try:
                # Get all enqueued tasks
                enqueued_tasks = [
                    task for task in self.task_manager.tasks.values()
                    if task.get("status") == "enqueued"
                ]
                
                # Process each enqueued task (but don't block)
                if enqueued_tasks:
                    logger.info(f"Found {len(enqueued_tasks)} enqueued tasks")
                    for task in enqueued_tasks[:1]:  # Process only 1 at a time
                        try:
                            # Process in background without blocking
                            asyncio.create_task(self._process_task(task))
                        except Exception as e:
                            logger.error(f"Error starting task {task.get('id')}: {e}")
                
                # Wait longer to avoid busy loop
                await asyncio.sleep(5)  # Check every 5 seconds, not every 1 second
                
            except Exception as e:
                logger.error(f"Error in task processor loop: {e}")
                await asyncio.sleep(10)  # Wait longer on error
    
    async def _process_task(self, task: Dict[str, Any]):
        """Process a single task through PipelineService"""
        task_id = task["id"]
        task_data = task["data"]
        
        logger.info(f"Processing task {task_id} for URL: {task_data.get('url')}")
        
        # Update task status to running
        await self.task_manager.update_task_status(task_id, "running", progress=0.1)
        
        # Call PipelineService via analysis endpoint
        async with httpx.AsyncClient() as client:
            payload = {
                "url": task_data["url"],
                "context": "active_tab"  # Use the context from task data if available
            }
            
            response = await client.post(
                f"{self.base_url}/api/v1/analysis/analyze",
                json=payload,
                timeout=30.0
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    # Mark task as completed
                    await self.task_manager.update_task_status(
                        task_id, 
                        "completed", 
                        progress=1.0,
                        message="Page processed successfully"
                    )
                    logger.info(f"Task {task_id} completed successfully")
                else:
                    await self._mark_task_failed(task, result.get("error", "Unknown error"))
            else:
                await self._mark_task_failed(task, f"HTTP {response.status_code}")
    
    async def _mark_task_failed(self, task: Dict[str, Any], error: str):
        """Mark a task as failed"""
        task_id = task["id"]
        await self.task_manager.update_task_status(
            task_id,
            "failed", 
            progress=0.0,
            message=f"Processing failed: {error}"
        )
        logger.error(f"Task {task_id} failed: {error}")
