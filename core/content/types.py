from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Set, Optional
from datetime import datetime

class KeywordType(str, Enum):
    """Types of keywords that can be extracted."""
    ENTITY = "entity"
    CONCEPT = "concept"
    TERM = "term"
    CUSTOM = "custom"

class RelationType(str, Enum):
    """Types of relationships between keywords."""
    CONTAINS = "contains"
    HIERARCHICAL = "hierarchical"
    RELATED = "related"
    SYNONYM = "synonym"
    ENTITY = "entity"
    CUSTOM = "custom"

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

# Custom exceptions
class ExtractionError(Exception):
    """Base exception for extraction errors."""
    pass

class ValidationError(ExtractionError):
    """Raised when input validation fails."""
    pass

class ProcessingError(ExtractionError):
    """Raised when keyword processing fails."""
    pass

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