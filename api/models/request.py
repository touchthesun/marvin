from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Set
from pydantic import Field
from core.content.page import BrowserContext, PageStatus

class PageCreate(BaseModel):
    """Model for creating a single page"""
    url: HttpUrl
    context: BrowserContext
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None
    browser_contexts: Set[BrowserContext] = Field(default_factory=set)

class BatchPageCreate(BaseModel):
    """Model for creating multiple pages"""
    pages: List[PageCreate]

class PageUpdate(BaseModel):
    """Model for updating page context"""
    context: BrowserContext
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None

class PageQuery(BaseModel):
    """Model for querying pages"""
    context: Optional[BrowserContext] = None
    status: Optional[PageStatus] = None
    domain: Optional[str] = None