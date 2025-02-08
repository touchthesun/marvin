from typing import Optional, Any, Dict, List, Generic, TypeVar
from pydantic import BaseModel
from datetime import datetime

DataT = TypeVar('DataT')

class APIResponse(BaseModel, Generic[DataT]):
    """Base response model for all API endpoints."""
    success: bool
    data: Optional[DataT] = None
    error: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = {
        "timestamp": datetime.now().isoformat()
    }

class PaginatedResponse(APIResponse, Generic[DataT]):
    """Response model for paginated results."""
    data: List[DataT]
    total_count: int
    page: int
    page_size: int