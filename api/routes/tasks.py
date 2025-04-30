from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any

from api.state import get_app_state, AppState
from core.utils.logger import get_logger

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = get_logger(__name__)

# Component name for this route
COMPONENT_NAME = "tasks"

@router.get("")
async def get_all_tasks(app_state: AppState = Depends(get_app_state)) -> Dict[str, Any]:
    """
    Get all tasks.
    
    Returns:
        List of all tasks
    """
    if not hasattr(app_state, "task_managers") or COMPONENT_NAME not in app_state.task_managers:
        return {
            "success": True,
            "data": {
                "tasks": []
            }
        }
    
    task_manager = app_state.task_managers[COMPONENT_NAME]
    
    # Get all tasks (we need to implement a method for this in TaskManager)
    tasks = list(task_manager.tasks.values())
    
    return {
        "success": True,
        "data": {
            "tasks": tasks
        }
    }

@router.get("/{task_id}")
async def get_task(task_id: str, app_state: AppState = Depends(get_app_state)) -> Dict[str, Any]:
    """
    Get details of a specific task.
    
    Args:
        task_id: The ID of the task to retrieve
        
    Returns:
        Task details or an error message if task not found
    """
    if not hasattr(app_state, "task_managers") or COMPONENT_NAME not in app_state.task_managers:
        return {
            "success": False,
            "error": {
                "error_code": "TASK_MANAGER_NOT_FOUND",
                "message": "Task manager not initialized"
            }
        }
    
    task_manager = app_state.task_managers[COMPONENT_NAME]
    task = await task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "error_code": "TASK_NOT_FOUND",
                    "message": f"Task {task_id} not found"
                }
            }
        )
    
    return {
        "success": True,
        "data": task
    }

@router.post("")
async def create_task(
    task_data: Dict[str, Any] = Body(...),
    app_state: AppState = Depends(get_app_state)
) -> Dict[str, Any]:
    """
    Create a new task.
    
    Args:
        task_data: Task data to associate with the new task
        
    Returns:
        Created task details including ID
    """
    if not hasattr(app_state, "task_managers") or COMPONENT_NAME not in app_state.task_managers:
        # Initialize task manager if it doesn't exist
        if not hasattr(app_state, "task_managers"):
            app_state.task_managers = {}
        
        from core.utils.task_manager import TaskManager
        app_state.task_managers[COMPONENT_NAME] = TaskManager(COMPONENT_NAME)
        await app_state.task_managers[COMPONENT_NAME].initialize()
    
    task_manager = app_state.task_managers[COMPONENT_NAME]
    task_id = await task_manager.create_task(task_data)
    
    # Get the newly created task
    task = await task_manager.get_task(task_id)
    
    return {
        "success": True,
        "data": task
    }

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, app_state: AppState = Depends(get_app_state)) -> Dict[str, Any]:
    """
    Cancel a specific task.
    
    Args:
        task_id: ID of the task to cancel
        
    Returns:
        Success status and message
    """
    if not hasattr(app_state, "task_managers") or COMPONENT_NAME not in app_state.task_managers:
        return {
            "success": False,
            "error": {
                "error_code": "TASK_MANAGER_NOT_FOUND",
                "message": "Task manager not initialized"
            }
        }
    
    task_manager = app_state.task_managers[COMPONENT_NAME]
    task = await task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "error_code": "TASK_NOT_FOUND",
                    "message": f"Task {task_id} not found"
                }
            }
        )
    
    # Update task status to cancelled
    result = await task_manager.update_task(task_id, {
        "status": "error",
        "message": "Task cancelled by user",
        "error": "Task was cancelled"
    })
    
    if not result:
        return {
            "success": False,
            "error": {
                "error_code": "CANCEL_FAILED",
                "message": f"Failed to cancel task {task_id}"
            }
        }
    
    return {
        "success": True,
        "data": {
            "task_id": task_id,
            "message": "Task cancelled successfully"
        }
    }

@router.post("/{task_id}/retry")
async def retry_task(task_id: str, app_state: AppState = Depends(get_app_state)) -> Dict[str, Any]:
    """
    Retry a failed task.
    
    Args:
        task_id: ID of the task to retry
        
    Returns:
        Success status and new task details
    """
    if not hasattr(app_state, "task_managers") or COMPONENT_NAME not in app_state.task_managers:
        return {
            "success": False,
            "error": {
                "error_code": "TASK_MANAGER_NOT_FOUND",
                "message": "Task manager not initialized"
            }
        }
    
    task_manager = app_state.task_managers[COMPONENT_NAME]
    task = await task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "error_code": "TASK_NOT_FOUND",
                    "message": f"Task {task_id} not found"
                }
            }
        )
    
    # Only retry tasks that are in error state
    if task["status"] != "error":
        return {
            "success": False,
            "error": {
                "error_code": "INVALID_TASK_STATE",
                "message": f"Only tasks in error state can be retried. Current status: {task['status']}"
            }
        }
    
    # Create a new task with the same data
    new_task_id = await task_manager.create_task(task.get("data", {}))
    new_task = await task_manager.get_task(new_task_id)
    
    return {
        "success": True,
        "data": {
            "original_task_id": task_id,
            "new_task_id": new_task_id,
            "task": new_task
        }
    }