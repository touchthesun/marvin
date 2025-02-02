from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Set
from datetime import datetime
from uuid import UUID
from core.domain.content.models.page import PageStatus, BrowserContext

class BaseResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class PageMetricsResponse(BaseModel):
    quality_score: float = 0.0
    relevance_score: float = 0.0
    last_visited: Optional[datetime] = None
    visit_count: int = 0
    processing_time: Optional[float] = None
    keyword_count: int = 0

class PageRelationshipResponse(BaseModel):
    target_id: UUID
    type: str
    strength: float
    metadata: Dict

class PageResponse(BaseModel):
    success: bool
    id: UUID
    url: str
    domain: str
    status: PageStatus
    discovered_at: datetime
    processed_at: Optional[datetime]
    updated_at: Optional[datetime]
    title: Optional[str]
    metadata: Dict
    keywords: Dict[str, float]
    relationships: List[PageRelationshipResponse]
    browser_contexts: Set[BrowserContext]
    tab_id: Optional[str]
    window_id: Optional[str]
    bookmark_id: Optional[str]
    last_active: Optional[datetime]
    metrics: PageMetricsResponse

class BatchPageResponse(BaseResponse):
    pages: List[PageResponse]
    total_count: int
    success_count: int
    error_count: int

class TaskResponse(BaseResponse):
    task_id: str
    status: str
    progress: Optional[float] = None
    result: Optional[Dict[str, Any]] = None

class GraphResponse(BaseResponse):
    nodes: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]] = None

class ValidationResponse(BaseResponse):
    validation_errors: List[Dict[str, Any]]
    validation_warnings: List[Dict[str, Any]]