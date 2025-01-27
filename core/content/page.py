from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Set
from enum import Enum
from uuid import UUID, uuid4

class PageStatus(Enum):
    """Represents the current status of a page in the system."""
    DISCOVERED = "discovered"  # URL known but not yet processed
    IN_PROGRESS = "processing"  # Currently being processed
    ACTIVE = "active"         # Successfully processed and active
    HISTORY = "history"     # In browser history only
    ERROR = "error"          # Processing failed

class RelationType(Enum):
    """Types of relationships between pages."""
    LINKS_TO = "links_to"         # Direct link
    SIMILAR_TO = "similar_to"     # Content similarity
    PRECEDES = "precedes"         # Temporal relationship
    REFERENCES = "references"     # Citation/reference
    PART_OF = "part_of"          # Hierarchical relationship

class BrowserContext(Enum):
    """Represents the browser context of a page."""
    ACTIVE_TAB = "active_tab"      # Currently focused tab
    OPEN_TAB = "open_tab"          # Open but not focused
    BACKGROUND = "background"       # Not currently open
    BOOKMARKED = "bookmarked"      # Saved in bookmarks
    HISTORY = "history"            # In browser history only



@dataclass
class PageRelationship:
    """Represents a relationship between two pages."""
    target_id: UUID
    relation_type: RelationType
    strength: float = 1.0
    metadata: Dict = field(default_factory=dict)

@dataclass
class PageMetrics:
    """Tracks various metrics about the page."""
    quality_score: float = 0.0
    relevance_score: float = 0.0
    last_visited: Optional[datetime] = None
    visit_count: int = 0
    processing_time: Optional[float] = None
    keyword_count: int = 0
    
    def update_quality(self, metadata_quality: float, keyword_quality: float):
        """Update quality score based on metadata and keyword quality."""
        self.quality_score = (metadata_quality + keyword_quality) / 2

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
    
    # Browser context
    browser_contexts: Set[BrowserContext] = field(default_factory=set)
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None
    last_active: Optional[datetime] = None

    # Status and timestamps
    status: PageStatus = PageStatus.DISCOVERED
    discovered_at: datetime = field(default_factory=datetime.now)
    processed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Content and metadata
    title: Optional[str] = None
    metadata: Dict = field(default_factory=dict)
    keywords: Dict[str, float] = field(default_factory=dict)  # keyword -> score mapping
    
    # Relationships
    relationships: List[PageRelationship] = field(default_factory=list)
    
    # Metrics
    metrics: PageMetrics = field(default_factory=PageMetrics)

    # Errors
    errors: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate and initialize the page object."""
        if not self.url:
            raise ValueError("URL is required")
        if not self.domain:
            raise ValueError("Domain is required")
    
    def update_metadata(self, metadata: Dict):
        """Update page metadata and record the update time."""
        self.metadata.update(metadata)
        self.updated_at = datetime.now()
    
    def update_keywords(self, keywords: Dict[str, float]):
        """Update page keywords with scores."""
        self.keywords = keywords
        self.metrics.keyword_count = len(keywords)
        self.updated_at = datetime.now()
    
    def add_relationship(self, target_id: UUID, relation_type: RelationType, 
                        strength: float = 1.0, metadata: Dict = None):
        """Add a relationship to another page."""
        relationship = PageRelationship(
            target_id=target_id,
            relation_type=relation_type,
            strength=strength,
            metadata=metadata or {}
        )
        self.relationships.append(relationship)
        self.updated_at = datetime.now()
    
    def record_visit(self, tab_id: Optional[str] = None, window_id: Optional[str] = None):
        """Record a page visit with browser context."""
        now = datetime.now()
        self.metrics.last_visited = now
        self.metrics.visit_count += 1
        
        if tab_id and window_id:
            self.tab_id = tab_id
            self.window_id = window_id
            self.last_active = now

    def update_browser_contexts(self, context: BrowserContext, 
                              tab_id: Optional[str] = None,
                              window_id: Optional[str] = None,
                              bookmark_id: Optional[str] = None):
        """Add or update a browser context."""
        self.browser_contexts.add(context)
        
        # Update context-specific IDs
        if context in (BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB):
            self.tab_id = tab_id
            self.window_id = window_id
            self.last_active = datetime.now()
        elif context == BrowserContext.BOOKMARKED:
            self.bookmark_id = bookmark_id
            
        self.updated_at = datetime.now()

    def remove_browser_context(self, context: BrowserContext):
        """Remove a browser context."""
        self.browser_contexts.discard(context)
        self.updated_at = datetime.now()
    
    def mark_processed(self, processing_time: float = None):
        """Mark the page as processed and record metrics."""
        self.status = PageStatus.ACTIVE
        self.processed_at = datetime.now()
        self.updated_at = datetime.now()
        if processing_time is not None:
            self.metrics.processing_time = processing_time
    
    def to_dict(self) -> Dict:
        return {
            'id': str(self.id),
            'url': self.url,
            'domain': self.domain,
            'status': self.status.value,
            'discovered_at': self.discovered_at.isoformat(),
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'title': self.title,
            'metadata': self.metadata,
            'keywords': self.keywords,
            'relationships': [
                {
                    'target_id': str(r.target_id),
                    'type': r.relation_type.value,
                    'strength': r.strength,
                    'metadata': r.metadata
                }
                for r in self.relationships
            ],
            'browser_contexts': self.browser_contexts,
            'tab_id': self.tab_id,
            'window_id': self.window_id,
            'bookmark_id': self.bookmark_id,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'metrics': {
                'quality_score': self.metrics.quality_score,
                'relevance_score': self.metrics.relevance_score,
                'last_visited': self.metrics.last_visited.isoformat() 
                    if self.metrics.last_visited else None,
                'visit_count': self.metrics.visit_count,
                'processing_time': self.metrics.processing_time,
                'keyword_count': self.metrics.keyword_count
            }
        }