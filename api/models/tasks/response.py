from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime


class TaskData(BaseModel):
    """Individual task data model."""
    id: str
    status: str  # enqueued, running, completed, error
    created_at: float
    queued_at: str
    progress: float
    message: str
    data: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "status": "running",
                "created_at": 1693920000.0,
                "queued_at": "2023-09-05T12:00:00",
                "progress": 0.5,
                "message": "Processing task",
                "data": {"url": "https://example.com"},
                "result": None,
                "error": None
            }
        }


class TaskResponse(BaseModel):
    """Response model for single task operations."""
    success: bool
    data: TaskData
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": {
                    "id": "123e4567-e89b-12d3-a456-426614174000",
                    "status": "completed",
                    "created_at": 1693920000.0,
                    "queued_at": "2023-09-05T12:00:00",
                    "progress": 1.0,
                    "message": "Task completed successfully",
                    "data": {"url": "https://example.com"},
                    "result": {"processed": True},
                    "error": None
                }
            }
        }


class TaskListResponse(BaseModel):
    """Response model for listing all tasks."""
    success: bool
    data: Dict[str, List[TaskData]]
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": {
                    "tasks": [
                        {
                            "id": "123e4567-e89b-12d3-a456-426614174000",
                            "status": "running",
                            "created_at": 1693920000.0,
                            "queued_at": "2023-09-05T12:00:00",
                            "progress": 0.5,
                            "message": "Processing task",
                            "data": {"url": "https://example.com"},
                            "result": None,
                            "error": None
                        }
                    ]
                }
            }
        }


class TaskActionResponse(BaseModel):
    """Response model for task actions (cancel, retry)."""
    success: bool
    data: Dict[str, Any]
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": {
                    "task_id": "123e4567-e89b-12d3-a456-426614174000",
                    "message": "Task cancelled successfully"
                }
            }
        }
