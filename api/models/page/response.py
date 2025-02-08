from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Set
from datetime import datetime
from uuid import UUID
from core.domain.content.models.page import PageStatus, BrowserContext
from api.models.common import APIResponse

class PageMetrics(BaseModel):
    """Core metrics for a page."""
    quality_score: float = 0.0
    relevance_score: float = 0.0
    last_visited: Optional[datetime] = None
    visit_count: int = 0
    processing_time: Optional[float] = None
    keyword_count: int = 0

class PageRelationship(BaseModel):
    """Relationship between pages."""
    target_id: UUID
    type: str
    strength: float
    metadata: Dict[str, Any]

class PageData(BaseModel):
    """Core page data model."""
    id: UUID
    url: str
    domain: str
    status: PageStatus
    discovered_at: datetime
    processed_at: Optional[datetime]
    updated_at: Optional[datetime]
    title: Optional[str]
    metadata: Dict[str, Any]
    keywords: Dict[str, float]
    relationships: List[PageRelationship]
    browser_contexts: Set[BrowserContext]
    tab_id: Optional[str]
    window_id: Optional[str]
    bookmark_id: Optional[str]
    last_active: Optional[datetime]
    metrics: PageMetrics

class BatchPageData(BaseModel):
    """Data for batch page operations."""
    pages: List[PageData]
    total_count: int
    success_count: int
    error_count: int

# Type aliases for different response types
PageResponse = APIResponse[PageData]
BatchPageResponse = APIResponse[BatchPageData]