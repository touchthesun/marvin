from dataclasses import dataclass, field
from datetime import datetime
from neo4j.graph import Node
from typing import Dict, List, Optional, Set, Union, Any
from uuid import UUID, uuid4
from core.utils.logger import get_logger
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
    content: Optional[str] = None
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
        self.logger = get_logger(__name__)
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
        self.logger.debug(f"Accessing browser_contexts for page {self.id}")
        
        if not hasattr(self.metadata, 'browser_contexts'):
            self.logger.warning(f"Metadata missing browser_contexts for page {self.id}")
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
            self.logger.debug(f"Updating browser contexts for page {self.id}")
            
            # Access the browser_contexts directly from metadata instead of using the property
            if not hasattr(self.metadata, 'browser_contexts'):
                self.metadata.browser_contexts = set()
            
            self.metadata.browser_contexts.add(context)
            
            if context in (BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB):
                self.metadata.tab_id = tab_id
                self.metadata.window_id = window_id
                self.metadata.last_active = datetime.now()
            elif context == BrowserContext.BOOKMARKED:
                self.metadata.bookmark_id = bookmark_id
                
            self.metadata.updated_at = datetime.now()
            self.logger.debug(f"Browser contexts updated successfully for page {self.id}")


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
            'content': self.content,
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
        


    def _parse_datetime(value: Any) -> Optional[datetime]:
        """Helper to parse various datetime formats."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if hasattr(value, 'to_native'):  # Neo4j datetime
            return value.to_native()
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return None

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
        if 'domain' not in properties and 'url' in properties:
            try:
                from urllib.parse import urlparse
                parsed_url = urlparse(properties['url'])
                properties['domain'] = parsed_url.netloc
            except Exception:
                properties['domain'] = 'unknown'

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
        
        # Handle both nested and flattened data structures
        if 'metadata' in properties:
            # Handle nested structure
            page.metadata = PageMetadata.from_dict(properties['metadata'])
        else:
            # Handle flattened structure from Neo4j
            metadata_dict = {
                'discovered_at': cls._parse_datetime(properties.get('discovered_at')),
                'last_accessed': cls._parse_datetime(properties.get('last_accessed')),
                'status': properties.get('status', 'discovered'),
                'metadata_quality_score': properties.get('metadata_quality_score', 0.0),
                'tab_id': properties.get('tab_id'),
                'window_id': properties.get('window_id'),
                'bookmark_id': properties.get('bookmark_id'),
                'browser_contexts': properties.get('browser_contexts', []),
                'word_count': properties.get('word_count'),
                'reading_time_minutes': properties.get('reading_time_minutes'),
                'language': properties.get('language'),
                'source_type': properties.get('source_type'),
                'author': properties.get('author'),
                'published_date': cls._parse_datetime(properties.get('published_date')),
                'modified_date': cls._parse_datetime(properties.get('modified_date')),
                'custom_metadata': properties.get('custom_metadata', {})
            }
            
            # Create metrics dict from prefixed properties
            metrics_dict = {
                'quality_score': properties.get('metric_quality_score', 0.0),
                'relevance_score': properties.get('metric_relevance_score', 0.0),
                'last_visited': cls._parse_datetime(properties.get('metric_last_visited')),
                'visit_count': properties.get('metric_visit_count', 0),
                'processing_time': properties.get('metric_processing_time'),
                'keyword_count': properties.get('metric_keyword_count', 0)
            }
            
            # Create PageMetadata instance
            page.metadata = PageMetadata.from_dict(metadata_dict)
            
            # Set metrics
            if any(metrics_dict.values()):  # Only set if we have any non-default values
                page.metadata.metrics = PageMetrics(**metrics_dict)
        
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