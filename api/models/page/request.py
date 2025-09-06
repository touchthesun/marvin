from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Set
from core.domain.content.models.page import BrowserContext, PageStatus

class PageCreate(BaseModel):
    """Model for creating a single page."""
    url: str
    
    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('URL must be a non-empty string')
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v
    context: BrowserContext
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None
    browser_contexts: Set[BrowserContext] = Field(default_factory=set)
    content: Optional[str] = None
    title: Optional[str] = None 

class BatchPageCreate(BaseModel):
    """Model for creating multiple pages."""
    pages: List[PageCreate]

class PageUpdate(BaseModel):
    """Model for updating page context."""
    context: BrowserContext
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None

class PageQuery(BaseModel):
    """Model for querying pages."""
    context: Optional[BrowserContext] = None
    status: Optional[PageStatus] = None
    domain: Optional[str] = None