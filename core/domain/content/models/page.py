from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Set
from uuid import UUID, uuid4
from core.domain.content.types import (
    PageStatus,
    PageMetrics,
    PageMetadata,
    PageRelationship,
    BrowserContext, 
    RelationType
)


@dataclass
class Page:
    """Central data model representing a web page in the system.
    
    This class serves as the primary domain object, containing all relevant
    information about a webpage including its content, metadata, relationships,
    and system status.
    """
    # Core identification
    url: str
    domain: str
    id: UUID = field(default_factory=uuid4)
    
    # Status
    status: PageStatus = PageStatus.DISCOVERED
    
    # Content
    title: Optional[str] = None
    keywords: Dict[str, float] = field(default_factory=dict)  # keyword -> score mapping
    
    # Metadata, relationships, and metrics
    metadata: PageMetadata = field(default_factory=lambda: PageMetadata(
        discovered_at=datetime.now(),
        metrics=PageMetrics()
    ))
    relationships: List[PageRelationship] = field(default_factory=list)
    
    # Error tracking
    errors: List[str] = field(default_factory=list)

    def __post_init__(self):
        """Validate and initialize the page object."""
        if not self.url:
            raise ValueError("URL is required")
        if not self.domain:
            raise ValueError("Domain is required")
    
    def update_metadata(self, metadata_dict: Dict):
        """Update custom metadata and record the update time."""
        self.metadata.custom_metadata.update(metadata_dict)
        self.metadata.updated_at = datetime.now()
    
    def update_keywords(self, keywords: Dict[str, float]):
        """Update page keywords with scores."""
        self.keywords = keywords
        self.metadata.metrics.keyword_count = len(keywords)
        self.metadata.updated_at = datetime.now()
    
    def add_relationship(
        self,
        target_id: UUID,
        relation_type: RelationType,
        strength: float = 1.0,
        metadata: Dict = None
    ):
        """Add a relationship to another page."""
        relationship = PageRelationship(
            target_id=target_id,
            relation_type=relation_type,
            strength=strength,
            metadata=metadata or {}
        )
        self.relationships.append(relationship)
        self.metadata.updated_at = datetime.now()
    
    def record_visit(
        self,
        tab_id: Optional[str] = None,
        window_id: Optional[str] = None
    ):
        """Record a page visit with browser context."""
        now = datetime.now()
        self.metadata.metrics.last_visited = now
        self.metadata.metrics.visit_count += 1
        
        if tab_id and window_id:
            self.metadata.tab_id = tab_id
            self.metadata.window_id = window_id
            self.metadata.last_active = now
            self.metadata.updated_at = now

    def update_browser_context(
        self,
        context: BrowserContext,
        tab_id: Optional[str] = None,
        window_id: Optional[str] = None,
        bookmark_id: Optional[str] = None
    ):
        """Add or update a browser context."""
        self.metadata.browser_contexts.add(context)
        
        if context in (BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB):
            self.metadata.tab_id = tab_id
            self.metadata.window_id = window_id
            self.metadata.last_active = datetime.now()
        elif context == BrowserContext.BOOKMARKED:
            self.metadata.bookmark_id = bookmark_id
            
        self.metadata.updated_at = datetime.now()

    def remove_browser_context(self, context: BrowserContext):
        """Remove a browser context."""
        self.metadata.browser_contexts.discard(context)
        self.metadata.updated_at = datetime.now()
    
    def mark_processed(self, processing_time: float = None):
        """Mark the page as processed and record metrics."""
        self.status = PageStatus.ACTIVE
        self.metadata.processed_at = datetime.now()
        self.metadata.updated_at = datetime.now()
        if processing_time is not None:
            self.metadata.metrics.processing_time = processing_time

    def to_dict(self) -> Dict:
        """Convert page to dictionary representation."""
        return {
            'id': str(self.id),
            'url': self.url,
            'domain': self.domain,
            'status': self.status.value,
            'title': self.title,
            'keywords': self.keywords,
            'metadata': self.metadata.to_dict(),
            'relationships': [
                {
                    'target_id': str(r.target_id),
                    'type': r.relation_type.value,
                    'strength': r.strength,
                    'metadata': r.metadata
                }
                for r in self.relationships
            ],
            'errors': self.errors
        }