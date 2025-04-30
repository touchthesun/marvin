import asyncio
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

from core.utils.logger import get_logger

class TaskManager:
    """
    Reusable task management system for async tasks with DI support.
    
    This class manages the lifecycle of asynchronous tasks, providing
    creation, monitoring, and cleanup capabilities.
    """
    
    def __init__(self, component_name: str):
        """
        Initialize the task manager for a specific component.
        
        Args:
            component_name: Name of the component (used for path and logging)
        """
        self.component_name = component_name
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.logger = get_logger(f"task_manager.{component_name}")
        self.status_path = f"/api/v1/{component_name}/status/"
        self._cleanup_task: Optional[asyncio.Task] = None
    
    async def initialize(self) -> None:
        """Initialize the task manager and start periodic cleanup."""
        self.logger.info(f"Initializing task manager for {self.component_name}")
        
        # Start periodic cleanup task
        if not self._cleanup_task:
            self._cleanup_task = asyncio.create_task(self._run_periodic_cleanup())
            self.logger.debug("Started periodic cleanup task")
    
    async def shutdown(self) -> None:
        """Shutdown the task manager cleanly."""
        self.logger.info(f"Shutting down task manager for {self.component_name}")
        
        # Cancel cleanup task
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self.logger.debug("Cancelled periodic cleanup task")
    
    async def create_task(self, task_data: Optional[Dict[str, Any]] = None) -> str:
        """
        Create a new task and return its ID.
        
        Args:
            task_data: Optional data to associate with the task
            
        Returns:
            Task ID as a string
        """
        task_id = str(uuid.uuid4())
        created_at = time.time()
        
        self.tasks[task_id] = {
            "id": task_id,
            "status": "enqueued",
            "created_at": created_at,
            "queued_at": datetime.now().isoformat(),
            "progress": 0.0,
            "message": f"{self.component_name} task enqueued",
            "data": task_data or {},
            "result": None,
            "error": None
        }
        
        self.logger.info(f"Created {self.component_name} task: {task_id}")
        return task_id
    
    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a task by ID.
        
        Args:
            task_id: The task ID to retrieve
            
        Returns:
            Task data dict or None if not found
        """
        return self.tasks.get(task_id)
    
    async def update_task(self, task_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update a task's state.
        
        Args:
            task_id: The task ID to update
            updates: Dictionary of fields to update
            
        Returns:
            True if task was found and updated, False otherwise
        """
        if task_id in self.tasks:
            self.tasks[task_id].update(updates)
            
            # Log status transitions
            if "status" in updates:
                new_status = updates["status"]
                old_status = self.tasks[task_id].get("status", "unknown")
                if new_status != old_status:
                    self.logger.info(f"Task {task_id} status changed: {old_status} -> {new_status}")
            
            return True
        return False
    
    async def get_status_response(self, task_id: str) -> Dict[str, Any]:
        """
        Get a standardized status response for a task.
        
        Args:
            task_id: The task ID to get status for
            
        Returns:
            API response dictionary with standard format
        """
        if task_id not in self.tasks:
            return {
                "success": False,
                "data": {
                    "task_id": task_id,
                    "status": "error",
                    "progress": 0.0,
                    "message": f"Task {task_id} not found",
                    "success": False,
                    "error": "Task not found"
                }
            }
        
        task = self.tasks[task_id]
        
        response = {
            "success": task["status"] != "error",
            "data": {
                "task_id": task_id,
                "status": task["status"],
                "progress": task.get("progress", 0.0),
                "success": task["status"] != "error",
                "message": task.get("message", f"Task is {task['status']}"),
                "status_endpoint": self.status_path
            }
        }
        
        # Add result if completed
        if task["status"] == "completed" and task.get("result"):
            response["data"]["result"] = task["result"]
        
        # Add error if failed
        if task["status"] == "error" and task.get("error"):
            response["data"]["error"] = task["error"]
            
        return response
    
    async def cleanup_old_tasks(self, max_age_hours: int = 24) -> int:
        """
        Clean up tasks older than the specified age.
        
        Args:
            max_age_hours: Maximum age in hours
            
        Returns:
            Number of tasks removed
        """
        now = time.time()
        max_age_seconds = max_age_hours * 60 * 60
        
        to_remove = []
        for task_id, task in self.tasks.items():
            if now - task["created_at"] > max_age_seconds:
                to_remove.append(task_id)
        
        for task_id in to_remove:
            self.tasks.pop(task_id, None)
        
        if to_remove:
            self.logger.info(f"Cleaned up {len(to_remove)} old {self.component_name} tasks")
        
        return len(to_remove)
    
    async def _run_periodic_cleanup(self, interval: int = 3600) -> None:
        """
        Run periodic cleanup tasks.
        
        Args:
            interval: Cleanup interval in seconds (default: 1 hour)
        """
        try:
            while True:
                await asyncio.sleep(interval)
                await self.cleanup_old_tasks()
        except asyncio.CancelledError:
            self.logger.debug(f"Periodic cleanup for {self.component_name} tasks cancelled")
    
    
    @staticmethod
    async def wait_for_task_completion(
        api_service, 
        task_id: str, 
        auth_token: str, 
        status_endpoint: str, 
        max_wait: int = 60, 
        initial_interval: float = 1
    ) -> Dict[str, Any]:
        """
        Wait for a task to complete with improved error handling and backoff.
        
        Args:
            api_service: API service to use for requests
            task_id: Task ID to check
            auth_token: Authentication token
            status_endpoint: Path to the status endpoint (required)
            max_wait: Maximum wait time in seconds
            initial_interval: Initial polling interval in seconds
            
        Returns:
            Final task status response
        
        Raises:
            ValueError: If status_endpoint is not provided
            TimeoutError: If task does not complete within max_wait
            Exception: For other errors
        """
        logger = get_logger("task_manager.wait")
        
        # Validate status endpoint
        if not status_endpoint:
            raise ValueError("status_endpoint is required and cannot be empty")
        
        # Ensure consistent format with trailing slash
        status_endpoint = status_endpoint.rstrip("/") + "/"
        
        logger.info(f"Using status endpoint: {status_endpoint}")
        logger.info(f"Waiting for task {task_id} to complete at {status_endpoint} (timeout: {max_wait}s)")
        
        start_time = time.time()
        last_status = None
        interval = initial_interval
        not_found_count = 0
        connection_error_count = 0
        
        while time.time() - start_time < max_wait:
            try:
                # Use the provided status endpoint to check task status
                status_response = await api_service.send_request(
                    "GET",
                    f"{status_endpoint}{task_id}",
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                
                # Reset connection error count on successful request
                connection_error_count = 0
                
                last_status = status_response
                
                if not status_response.get("success", False):
                    # Check if this is a task not found error
                    data = status_response.get("data", {})
                    error_message = data.get("message", "")
                    
                    if "not found" in error_message.lower():
                        not_found_count += 1
                        if not_found_count >= 3:
                            logger.error(f"Task {task_id} consistently not found after {not_found_count} attempts")
                            return status_response
                    else:
                        not_found_count = 0
                    
                    logger.warning(f"Error checking task status: {status_response}")
                    await asyncio.sleep(interval)
                    
                    # Increase interval with a cap
                    interval = min(interval * 1.5, 10)
                    continue
                
                # Reset not found counter on success
                not_found_count = 0
                
                # Get status from response
                data = status_response.get("data", {})
                status = data.get("status")
                
                if status in ["completed", "error"]:
                    logger.info(f"Task {task_id} finished with status: {status}")
                    return status_response
                
                progress = data.get("progress", 0)
                logger.debug(f"Task {task_id} in progress: {progress:.1%}")
                
                # Use progressive backoff for polling
                await asyncio.sleep(interval)
                interval = min(interval * 1.2, 10)  # More gradual backoff
                
            except Exception as e:
                connection_error_count += 1
                logger.warning(f"Connection error checking task status (attempt {connection_error_count}): {str(e)}")
                
                # If we've had multiple consecutive connection errors, 
                # return a special response
                if connection_error_count >= 3:
                    logger.error(f"Too many consecutive connection errors ({connection_error_count}), assuming API is unavailable")
                    return {
                        "success": False,
                        "error": {
                            "error_code": "CONNECTION_ERROR",
                            "message": f"API connection error: {str(e)}"
                        }
                    }
                    
                # Use shorter interval for connection errors
                await asyncio.sleep(min(interval, 2))
        
        logger.warning(f"Timeout waiting for task {task_id} to complete after {max_wait}s")
        return last_status or {
            "success": False,
            "error": {
                "error_code": "TIMEOUT",
                "message": f"Task {task_id} did not complete within {max_wait} seconds"
            }
        }
    
    async def get_all_tasks(self) -> List[Dict[str, Any]]:
        """
        Get all tasks.
        
        Returns:
            List of all task data dictionaries
        """
        return list(self.tasks.values())