from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Set, Optional
from datetime import datetime
from uuid import UUID

class KeywordType(str, Enum):
    """Types of keywords that can be extracted."""
    ENTITY = "entity"
    CONCEPT = "concept"
    TERM = "term"
    CUSTOM = "custom"

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

    def to_dict(self) -> Dict:
        return {
            'quality_score': self.quality_score,
            'relevance_score': self.relevance_score,
            'last_visited': self.last_visited.isoformat() if self.last_visited else None,
            'visit_count': self.visit_count,
            'processing_time': self.processing_time,
            'keyword_count': self.keyword_count
        }

@dataclass
class PageMetadata:
    """Metadata associated with a webpage."""
    discovered_at: datetime
    browser_contexts: Set[BrowserContext] = field(default_factory=set)
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None
    last_active: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metrics: PageMetrics = field(default_factory=PageMetrics)
    custom_metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            'discovered_at': self.discovered_at.isoformat(),
            'browser_contexts': [ctx.value for ctx in self.browser_contexts],
            'tab_id': self.tab_id,
            'window_id': self.window_id,
            'bookmark_id': self.bookmark_id,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'metrics': self.metrics.to_dict(),
            **self.custom_metadata
        }

class EntityType(str, Enum):
    """Types of entities that are recognized."""
    PERSON = "person"
    ORG = "organization"
    PRODUCT = "product"
    GPE = "geopolitical_entity"
    LOC = "location"
    WORK_OF_ART = "work_of_art"
    EVENT = "event"
    DATE = "date"
    TIME = "time"
    MONEY = "money"
    QUANTITY = "quantity"
    ORDINAL = "ordinal"
    CARDINAL = "cardinal"
    PERCENT = "percent"
    LANGUAGE = "language"
    LAW = "law"
    NORP = "nationality_or_political_group"

class ProcessingStatus(str, Enum):
    """Status of document or batch processing."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"



@dataclass
class RawKeyword:
    """Represents a keyword as initially extracted, before processing.
    
    Attributes:
        text: The actual keyword text
        score: Raw score from the extraction method
        source: Name of the extractor that found this keyword
        frequency: Number of occurrences in the text
        positions: List of (start, end) positions in text
        metadata: Additional extractor-specific information
    """
    text: str
    score: float
    source: str
    frequency: int = 1
    positions: List[tuple[int, int]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class KeywordRelationship:
    """Represents a relationship between two keywords.
    
    Attributes:
        source: The source keyword text
        target: The target keyword text
        relationship_type: The type of relationship
        confidence: Confidence score for this relationship
        metadata: Additional relationship information
    """
    source: str
    target: str
    relationship_type: RelationType
    confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ProcessedKeyword:
    """Represents a fully processed keyword with normalized scores and relationships.
    
    Attributes:
        text: The keyword text
        normalized_score: Score normalized across all extraction methods
        frequency: Total frequency across all extractors
        keyword_type: The type of keyword
        relationships: List of relationships to other keywords
        sources: List of extractors that found this keyword
        metadata: Combined metadata from all sources
    """
    text: str
    normalized_score: float
    frequency: int
    keyword_type: KeywordType
    relationships: List[KeywordRelationship] = field(default_factory=list)
    sources: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class EntityMention:
    """A single mention of an entity in text.
    
    Attributes:
        text: The entity text
        start: Starting character position
        end: Ending character position
        sentence_id: ID of the containing sentence
        type: Entity type
        score: Confidence score
    """
    text: str
    start: int
    end: int
    sentence_id: int
    type: EntityType
    score: float = 1.0

@dataclass
class RelationshipContext:
    """Context for a potential relationship between entities.
    
    Attributes:
        sentence_text: The full text of the containing sentence
        sentence_id: ID of the sentence
        entity1_position: (start, end) position of first entity
        entity2_position: (start, end) position of second entity
        dependency_path: Optional dependency path between entities
        verb_phrase: Optional connecting verb phrase
    """
    sentence_text: str
    sentence_id: int
    entity1_position: tuple[int, int]
    entity2_position: tuple[int, int]
    dependency_path: Optional[str] = None
    verb_phrase: Optional[str] = None

@dataclass
class DocumentMetadata:
    """Metadata for a document in the processing queue.
    
    Attributes:
        doc_id: Unique document identifier
        source: Document source (URL, file path, etc.)
        size_bytes: Document size in bytes
        content_type: MIME type or content format
        timestamp: Processing timestamp
        status: Current processing status
        error: Optional error message
        processing_time: Time taken to process
        batch_id: ID of containing batch
    """
    doc_id: str
    source: str
    size_bytes: int
    content_type: str
    timestamp: datetime
    status: ProcessingStatus
    error: Optional[str] = None
    processing_time: Optional[float] = None
    batch_id: Optional[str] = None

@dataclass
class BatchMetadata:
    """Metadata for a processing batch.
    
    Attributes:
        batch_id: Unique batch identifier
        total_docs: Total number of documents
        completed_docs: Number of completed documents
        failed_docs: Number of failed documents
        start_time: Batch start timestamp
        end_time: Optional completion timestamp
        status: Current batch status
        error: Optional error message
    """
    batch_id: str
    total_docs: int
    completed_docs: int
    failed_docs: int
    start_time: datetime
    end_time: Optional[datetime] = None
    status: ProcessingStatus = ProcessingStatus.PENDING
    error: Optional[str] = None


class PageStatus(Enum):
    """Represents the current status of a page in the system."""
    DISCOVERED = "discovered"  # URL known but not yet processed
    IN_PROGRESS = "processing"  # Currently being processed
    ACTIVE = "active"         # Successfully processed and active
    HISTORY = "history"       # In browser history only
    ERROR = "error"          # Processing failed

@dataclass
class PageMetadata:
    """Metadata associated with a webpage.
    
    This class represents additional information about a webpage
    that isn't part of its core content but is useful for processing
    and analysis.
    """
    discovered_at: datetime
    last_accessed: Optional[datetime] = None
    status: PageStatus = PageStatus.DISCOVERED
    metadata_quality_score: float = 0.0
    
    # Browser context
    tab_id: Optional[str] = None
    window_id: Optional[str] = None
    bookmark_id: Optional[str] = None
    
    # Content quality metrics
    word_count: Optional[int] = None
    reading_time_minutes: Optional[float] = None
    language: Optional[str] = None
    
    # Additional metadata
    source_type: Optional[str] = None
    author: Optional[str] = None
    published_date: Optional[datetime] = None
    modified_date: Optional[datetime] = None
    
    # Custom metadata
    custom_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert metadata to dictionary format."""
        return {
            "discovered_at": self.discovered_at.isoformat(),
            "last_accessed": self.last_accessed.isoformat() if self.last_accessed else None,
            "status": self.status.value,
            "metadata_quality_score": self.metadata_quality_score,
            "tab_id": self.tab_id,
            "window_id": self.window_id,
            "bookmark_id": self.bookmark_id,
            "word_count": self.word_count,
            "reading_time_minutes": self.reading_time_minutes,
            "language": self.language,
            "source_type": self.source_type,
            "author": self.author,
            "published_date": self.published_date.isoformat() if self.published_date else None,
            "modified_date": self.modified_date.isoformat() if self.modified_date else None,
            **self.custom_metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PageMetadata':
        """Create PageMetadata instance from dictionary."""
        # Handle datetime fields
        discovered_at = datetime.fromisoformat(data.pop('discovered_at'))
        last_accessed = datetime.fromisoformat(data.pop('last_accessed')) if data.get('last_accessed') else None
        published_date = datetime.fromisoformat(data.pop('published_date')) if data.get('published_date') else None
        modified_date = datetime.fromisoformat(data.pop('modified_date')) if data.get('modified_date') else None
        
        # Handle status enum
        status = PageStatus(data.pop('status')) if data.get('status') else PageStatus.NEW
        
        # Extract known fields
        known_fields = {
            'metadata_quality_score',
            'tab_id',
            'window_id',
            'bookmark_id',
            'word_count',
            'reading_time_minutes',
            'language',
            'source_type',
            'author'
        }
        
        # Separate known fields from custom metadata
        standard_metadata = {
            k: data[k] for k in known_fields 
            if k in data
        }
        
        custom_metadata = {
            k: v for k, v in data.items() 
            if k not in known_fields
        }
        
        return cls(
            discovered_at=discovered_at,
            last_accessed=last_accessed,
            status=status,
            published_date=published_date,
            modified_date=modified_date,
            custom_metadata=custom_metadata,
            **standard_metadata
        )