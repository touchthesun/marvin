from dataclasses import dataclass, field
from datetime import datetime
from neo4j.graph import Node
from typing import Dict, List, Optional, Set, Union
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
    """Central data model representing a web page in the system."""
    # Core identification
    url: str
    domain: str
    id: UUID = field(default_factory=uuid4)
    
    # Status
    status: PageStatus = PageStatus.DISCOVERED
    
    # Content
    title: Optional[str] = None
    keywords: Dict[str, float] = field(default_factory=dict)
    
    # Metadata, relationships, and metrics
    metadata: PageMetadata = field(
        default_factory=lambda: PageMetadata(
            discovered_at=datetime.now(),
            status=PageStatus.DISCOVERED,
            metadata_quality_score=0.0,
            last_accessed=None,
            tab_id=None,
            window_id=None,
            bookmark_id=None,
            word_count=None,
            reading_time_minutes=None,
            language=None,
            source_type=None,
            author=None,
            published_date=None,
            modified_date=None,
            custom_metadata={}
        )
    )
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

    @property
    def browser_contexts(self) -> Set[BrowserContext]:
        """Get the page's browser contexts."""
        print(f"\nAccessing browser_contexts for page {self.id}")
        print(f"Page object id: {id(self)}")
        print(f"Metadata object id: {id(self.metadata)}")
        print(f"Metadata type: {type(self.metadata)}")
        print(f"Metadata fields: {getattr(self.metadata, '__dataclass_fields__', 'Not a dataclass')}")
        print(f"Metadata dict: {self.metadata.__dict__}")
        
        if not hasattr(self.metadata, 'browser_contexts'):
            print("WARNING: Metadata missing browser_contexts!")
            print(f"Available attributes: {dir(self.metadata)}")
            # Initialize it
            self.metadata.browser_contexts = set()
            
        return self.metadata.browser_contexts
    
    @browser_contexts.setter
    def browser_contexts(self, contexts: Set[BrowserContext]):
        """Set the page's browser contexts."""
        self.metadata.browser_contexts = contexts

    def update_browser_contexts(
        self,
        context: BrowserContext,
        tab_id: Optional[str] = None,
        window_id: Optional[str] = None,
        bookmark_id: Optional[str] = None
    ):
        """Add or update a browser context."""
        self.browser_contexts.add(context)
        
        if context in (BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB):
            self.metadata.tab_id = tab_id
            self.metadata.window_id = window_id
            self.metadata.last_active = datetime.now()
        elif context == BrowserContext.BOOKMARKED:
            self.metadata.bookmark_id = bookmark_id
            
        self.metadata.updated_at = datetime.now()

    def remove_browser_context(self, context: BrowserContext):
        """Remove a browser context."""
        self.browser_contexts.discard(context)
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
    
    @classmethod
    def from_dict(cls, data: Union[Dict, 'Node']) -> 'Page':
        """Create a Page instance from dictionary representation or Neo4j Node."""
        # Convert Node to dict if needed
        if hasattr(data, 'properties'):
            properties = dict(data.properties)
            properties['id'] = uuid4()
        else:
            properties = data
            if 'id' in properties:
                try:
                    properties['id'] = UUID(properties['id'])
                except ValueError:
                    properties['id'] = uuid4()
            else:
                properties['id'] = uuid4()
        
        # Create basic page instance
        page = cls(
            url=properties['url'],
            domain=properties['domain'],
            id=properties['id'],
            title=properties.get('title')
        )
        
        # Set status
        if 'status' in properties:
            page.status = PageStatus(properties['status'])
        
        # Set keywords
        if 'keywords' in properties:
            page.keywords = properties['keywords']
        
        # Set metadata using from_dict method
        if 'metadata' in properties:
            page.metadata = PageMetadata.from_dict(properties['metadata'])
                
        # Set metrics separately since they're not part of PageMetadata
        if 'metadata' in properties and 'metrics' in properties['metadata']:
            metrics = properties['metadata']['metrics']
            if metrics:
                page.metadata.metrics = PageMetrics(
                    quality_score=metrics.get('quality_score', 0.0),
                    relevance_score=metrics.get('relevance_score', 0.0),
                    last_visited=datetime.fromisoformat(metrics['last_visited']) if 'last_visited' in metrics else None,
                    visit_count=metrics.get('visit_count', 0),
                    processing_time=metrics.get('processing_time'),
                    keyword_count=metrics.get('keyword_count', 0)
                )
        
        # Set relationships
        if 'relationships' in properties:
            page.relationships = [
                PageRelationship(
                    target_id=UUID(r['target_id']),
                    relation_type=RelationType(r['type']),
                    strength=r['strength'],
                    metadata=r.get('metadata', {})
                )
                for r in properties['relationships']
            ]
        
        # Set errors
        if 'errors' in properties:
            page.errors = properties['errors']
        
        return page