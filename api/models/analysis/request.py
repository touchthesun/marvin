from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from core.domain.content.models.page import BrowserContext

class AnalysisRequest(BaseModel):
    """Request to analyze a URL."""
    url: HttpUrl
    context: BrowserContext = BrowserContext.ACTIVE_TAB
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None

class BatchAnalysisRequest(BaseModel):
    """Request to analyze multiple URLs."""
    urls: List[AnalysisRequest]