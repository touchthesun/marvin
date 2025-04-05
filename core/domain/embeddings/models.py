# core/domain/embeddings/models.py
from enum import Enum
from typing import List, Dict, Optional, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field, field_validator

from core.utils.logger import get_logger

# Initialize logger
logger = get_logger(__name__)

class EmbeddingType(str, Enum):
    """Types of embeddings for different content parts"""
    FULL_CONTENT = "full_content"  # Embedding of the entire page content
    METADATA = "metadata"          # Embedding of page metadata (title, description, etc.)
    CHUNK = "chunk"                # Embedding of a content chunk
    SUMMARY = "summary"            # Embedding of content summary
    KEYWORD = "keyword"            # Embedding of a keyword or phrase

class EmbeddingModel(str, Enum):
    """Supported embedding models"""
    OPENAI_ADA_002 = "text-embedding-ada-002"
    OPENAI_3_SMALL = "text-embedding-3-small"
    OPENAI_3_LARGE = "text-embedding-3-large"
    SENTENCE_TRANSFORMERS = "all-MiniLM-L6-v2"
    OLLAMA_MXBAI_LARGE = "mxbai-embed-large"
    # Add other embedding models as needed

class EmbeddingDimension(int, Enum):
    """Common embedding dimensions for supported models"""
    OPENAI_ADA_002 = 1536
    OPENAI_3_SMALL = 1536
    OPENAI_3_LARGE = 3072
    SENTENCE_TRANSFORMERS = 384
    # Add other dimensions as needed

class EmbeddingStatus(str, Enum):
    """Status of embedding processing"""
    PENDING = "pending"       # Not yet processed
    PROCESSING = "processing" # Currently being processed
    COMPLETED = "completed"   # Successfully processed
    FAILED = "failed"         # Processing failed
    SKIPPED = "skipped"       # Skipped due to policy or constraint

class EmbeddingVector(BaseModel):
    """Single embedding vector with metadata"""
    vector: List[float]
    model: EmbeddingModel
    dimension: int = Field(..., description="Dimension of the embedding vector")
    normalized: bool = Field(False, description="Whether the vector is normalized to unit length")
    created_at: datetime = Field(default_factory=datetime.now)
    
    @field_validator('vector')
    def check_dimensions(cls, v, info):
        """Validate that vector dimensions match specified dimension"""
        if hasattr(info, 'data') and 'dimension' in info.data and len(v) != info.data['dimension']:
            error_msg = f"Vector length {len(v)} does not match specified dimension {info.data['dimension']}"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        return v
    
    def normalize(self) -> 'EmbeddingVector':
        """Return a normalized copy of the vector (unit length)"""
        if self.normalized:
            return self
        
        import numpy as np
        vec = np.array(self.vector)
        norm = np.linalg.norm(vec)
        if norm > 0:
            normalized_vec = (vec / norm).tolist()
        else:
            normalized_vec = vec.tolist()
            
        return EmbeddingVector(
            vector=normalized_vec,
            model=self.model,
            dimension=self.dimension,
            normalized=True,
            created_at=self.created_at
        )
    
    def similarity(self, other: 'EmbeddingVector') -> float:
        """Calculate cosine similarity with another embedding."""
        # Make sure both vectors are normalized
        vec1 = self.normalize() if not self.normalized else self
        vec2 = other.normalize() if not other.normalized else other
        
        # For vectors of different dimensions, we can't calculate similarity directly
        if vec1.dimension != vec2.dimension:
            raise ValueError(f"Cannot calculate similarity between vectors of different dimensions: {vec1.dimension} vs {vec2.dimension}")
        
        # Calculate dot product (cosine similarity for normalized vectors)
        return sum(a * b for a, b in zip(vec1.vector, vec2.vector))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage or serialization."""
        return {
            "vector": self.vector,
            "model": self.model.value if isinstance(self.model, Enum) else self.model,
            "dimension": self.dimension,
            "normalized": self.normalized,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'EmbeddingVector':
        """Create from dictionary representation."""
        # Handle datetime conversion
        if "created_at" in data and isinstance(data["created_at"], str):
            try:
                data["created_at"] = datetime.fromisoformat(data["created_at"])
            except ValueError:
                data["created_at"] = datetime.now()
        
        # Handle model enum conversion
        if "model" in data and isinstance(data["model"], str):
            try:
                data["model"] = EmbeddingModel(data["model"])
            except ValueError:
                # If the model isn't in the enum, use the string value
                pass
            
        return cls(**data)
    
    def truncate(self, max_dimension: int) -> 'EmbeddingVector':
        """Return a truncated version of this vector (for dimension reduction)."""
        if max_dimension >= self.dimension:
            return self
            
        return EmbeddingVector(
            vector=self.vector[:max_dimension],
            model=self.model,
            dimension=max_dimension,
            normalized=False,  # Truncation breaks normalization
            created_at=self.created_at
        )

    @classmethod
    def zeros(cls, dimension: int, model: Union[EmbeddingModel, str] = EmbeddingModel.OPENAI_ADA_002) -> 'EmbeddingVector':
        """Create a zero vector of specified dimension."""
        return cls(
            vector=[0.0] * dimension,
            model=model,
            dimension=dimension,
            normalized=True  # Zero vector is technically normalized
        )

    @classmethod
    def random(cls, dimension: int, model: Union[EmbeddingModel, str] = EmbeddingModel.OPENAI_ADA_002) -> 'EmbeddingVector':
        """Create a random unit vector of specified dimension."""
        import random
        import math
        
        # Generate random vector
        vector = [random.uniform(-1, 1) for _ in range(dimension)]
        
        # Normalize
        magnitude = math.sqrt(sum(x*x for x in vector))
        if magnitude > 0:
            vector = [x/magnitude for x in vector]
            
        return cls(
            vector=vector,
            model=model,
            dimension=dimension,
            normalized=True
        )
    
    def __add__(self, other: 'EmbeddingVector') -> 'EmbeddingVector':
        """Add two embedding vectors."""
        if self.dimension != other.dimension:
            raise ValueError(f"Cannot add vectors of different dimensions: {self.dimension} vs {other.dimension}")
            
        return EmbeddingVector(
            vector=[a + b for a, b in zip(self.vector, other.vector)],
            model=self.model,
            dimension=self.dimension,
            normalized=False  # Addition breaks normalization
        )

    def __sub__(self, other: 'EmbeddingVector') -> 'EmbeddingVector':
        """Subtract an embedding vector from this one."""
        if self.dimension != other.dimension:
            raise ValueError(f"Cannot subtract vectors of different dimensions: {self.dimension} vs {other.dimension}")
            
        return EmbeddingVector(
            vector=[a - b for a, b in zip(self.vector, other.vector)],
            model=self.model,
            dimension=self.dimension,
            normalized=False  # Subtraction breaks normalization
        )

    def __mul__(self, scalar: float) -> 'EmbeddingVector':
        """Multiply embedding vector by a scalar."""
        return EmbeddingVector(
            vector=[x * scalar for x in self.vector],
            model=self.model,
            dimension=self.dimension,
            normalized=False  # Scalar multiplication breaks normalization
        )
    
    # Add NumPy support for better performance
    def to_numpy(self):
        """Convert to NumPy array for efficient operations."""
        import numpy as np
        return np.array(self.vector)

    @classmethod
    def from_numpy(cls, array, model=EmbeddingModel.OPENAI_ADA_002, normalized=False):
        """Create from NumPy array."""
        import numpy as np
        return cls(
            vector=array.tolist() if isinstance(array, np.ndarray) else array,
            model=model,
            dimension=len(array),
            normalized=normalized
        )

    # Optimize normalization with NumPy
    def normalize(self) -> 'EmbeddingVector':
        """Return a normalized copy of the vector (unit length)."""
        if self.normalized:
            return self
        
        import numpy as np
        vec = np.array(self.vector)
        norm = np.linalg.norm(vec)
        if norm > 0:
            normalized_vec = (vec / norm).tolist()
        else:
            normalized_vec = vec.tolist()
            
        return EmbeddingVector(
            vector=normalized_vec,
            model=self.model,
            dimension=self.dimension,
            normalized=True,
            created_at=self.created_at
        )

class ContentChunk(BaseModel):
    """Chunk of content with position information"""
    content: str
    start_char: int
    end_char: int
    chunk_index: int = Field(..., description="Index of this chunk in the sequence")
    total_chunks: int = Field(..., description="Total number of chunks")
    embedding: Optional[EmbeddingVector] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class PageEmbeddings(BaseModel):
    """Collection of embeddings for a page"""
    page_id: str
    url: str
    metadata_embedding: Optional[EmbeddingVector] = None
    content_embedding: Optional[EmbeddingVector] = None
    summary_embedding: Optional[EmbeddingVector] = None
    chunk_embeddings: List[ContentChunk] = Field(default_factory=list)
    keyword_embeddings: Dict[str, EmbeddingVector] = Field(default_factory=dict)
    model: EmbeddingModel
    status: EmbeddingStatus = EmbeddingStatus.PENDING
    last_updated: datetime = Field(default_factory=datetime.now)
    error: Optional[str] = None
    version: str = "1.0"

class EmbeddingRequestConfig(BaseModel):
    """Configuration for an embedding request"""
    provider_id: str = "ollama"  
    model_id: Optional[EmbeddingModel] = None 
    normalize: bool = True
    include_metadata: bool = True
    include_content: bool = False
    include_summary: bool = True
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks: Optional[int] = None
    
    model_config = {
        "validate_assignment": True,
        "extra": "forbid",
    }