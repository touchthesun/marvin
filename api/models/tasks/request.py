from pydantic import BaseModel
from typing import Dict, Any, Optional


class TaskCreateRequest(BaseModel):
    """Request model for creating a new task."""
    data: Optional[Dict[str, Any]] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "data": {
                    "url": "https://example.com",
                    "context": "active_tab",
                    "metadata": {}
                }
            }
        }


class TaskUpdateRequest(BaseModel):
    """Request model for updating a task."""
    status: Optional[str] = None
    progress: Optional[float] = None
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "completed",
                "progress": 1.0,
                "message": "Task completed successfully",
                "result": {"processed": True}
            }
        }
