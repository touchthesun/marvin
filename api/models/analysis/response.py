from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from api.models.common import APIResponse

class TaskData(BaseModel):
    """Data about a processing task."""
    task_id: str
    status: str
    progress: float
    started_at: datetime
    completed_at: Optional[datetime] = None
    message: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None

class TaskResult(BaseModel):
    """Results from a completed task."""
    keywords: Dict[str, float]
    relationships: Dict[str, float]
    metadata: Dict[str, Any]

class TaskDetails(TaskData):
    """Detailed task information including results."""
    result: Optional[TaskResult] = None

# Type aliases for different response types
TaskResponse = APIResponse[TaskData]
TaskDetailResponse = APIResponse[TaskDetails]