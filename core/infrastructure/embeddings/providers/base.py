# core/infrastructure/embeddings/providers/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum

from core.domain.embeddings.models import (
    EmbeddingVector, ContentChunk
)
from core.utils.logger import get_logger


class EmbeddingProviderStatus(Enum):
    """Possible states of an embedding provider"""
    INITIALIZING = "initializing"
    READY = "ready"
    ERROR = "error"
    RATE_LIMITED = "rate_limited"
    DISABLED = "disabled"


class EmbeddingProviderMetrics:
    """Metrics for embedding provider monitoring"""
    
    def __init__(self):
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.total_tokens = 0
        self.average_latency_ms = 0.0
        self.rate_limits_hit = 0
        self.last_error = None
        self.last_updated = datetime.now()


class BaseEmbeddingProvider(ABC):
    """Abstract base class for embedding providers"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the provider.
        
        Args:
            config: Provider configuration dictionary
        """
        self.config = config
        self.logger = get_logger(f"{__name__}.{self.__class__.__name__}")
        self.metrics = EmbeddingProviderMetrics()
        self._status = EmbeddingProviderStatus.INITIALIZING
        self._last_error: Optional[str] = None
        
        # Extract provider type from config
        if isinstance(config, dict):
            self.provider_type = config.get("provider_type", "unknown")
        else:
            # For potentially different config object types
            self.provider_type = getattr(config, "provider_type", "unknown")
            if hasattr(self.provider_type, "value"):
                self.provider_type = self.provider_type.value
    
    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the provider with necessary setup"""
        self.logger.info(f"Initializing {self.__class__.__name__}")
        pass
    
    @abstractmethod
    async def get_embedding(self, text: str, model: Optional[str] = None) -> EmbeddingVector:
        """
        Get an embedding for a single text string.
        
        Args:
            text: Text to embed
            model: Optional model identifier, uses default if not specified
            
        Returns:
            EmbeddingVector object
        """
        pass
    
    @abstractmethod
    async def batch_embed(self, texts: List[str], model: Optional[str] = None) -> List[EmbeddingVector]:
        """
        Get embeddings for multiple text strings.
        
        Args:
            texts: List of texts to embed
            model: Optional model identifier, uses default if not specified
            
        Returns:
            List of EmbeddingVector objects
        """
        pass
    
    @abstractmethod
    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available embedding models.
        
        Returns:
            List of model information dictionaries
        """
        pass
    
    @abstractmethod
    async def shutdown(self) -> None:
        """Clean up provider resources"""
        self.logger.info(f"Shutting down {self.__class__.__name__}")
    
    async def get_status(self) -> Dict[str, Any]:
        """Get current provider status and metrics"""
        return {
            "provider_type": self.provider_type,
            "status": self._status.value,
            "metrics": {
                "total_requests": self.metrics.total_requests,
                "successful_requests": self.metrics.successful_requests,
                "failed_requests": self.metrics.failed_requests,
                "total_tokens": self.metrics.total_tokens,
                "average_latency_ms": self.metrics.average_latency_ms,
                "rate_limits_hit": self.metrics.rate_limits_hit,
                "last_updated": self.metrics.last_updated.isoformat()
            },
            "error_message": self._last_error,
            "last_successful_request": self.metrics.last_updated.isoformat() if self.metrics.successful_requests > 0 else None
        }
    
    def _update_metrics(self, success: bool, latency_ms: float, tokens: int = 0) -> None:
        """Update provider metrics"""
        self.metrics.total_requests += 1
        if success:
            self.metrics.successful_requests += 1
        else:
            self.metrics.failed_requests += 1
        
        self.metrics.total_tokens += tokens
        
        # Update rolling average latency
        n = self.metrics.total_requests
        self.metrics.average_latency_ms = (
            (self.metrics.average_latency_ms * (n - 1) + latency_ms) / n
        )
        self.metrics.last_updated = datetime.now()
    
    async def chunk_text(self, text: str, chunk_size: int = 1000, 
                         chunk_overlap: int = 200) -> List[ContentChunk]:
        """
        Split text into chunks with overlap.
        
        Args:
            text: Text to split
            chunk_size: Maximum size of each chunk
            chunk_overlap: Overlap between consecutive chunks
            
        Returns:
            List of ContentChunk objects (without embeddings)
        """
        if not text:
            return []
            
        chunks = []
        text_length = len(text)
        
        if text_length <= chunk_size:
            # Single chunk case
            return [ContentChunk(
                content=text,
                start_char=0,
                end_char=text_length,
                chunk_index=0,
                total_chunks=1
            )]
        
        # Calculate effective step size
        step_size = chunk_size - chunk_overlap
        
        # Calculate total chunks needed
        total_chunks = (text_length - chunk_overlap + step_size - 1) // step_size
        
        # Create chunks
        for i in range(total_chunks):
            start = i * step_size
            end = min(start + chunk_size, text_length)
            
            # Create chunk
            chunk = ContentChunk(
                content=text[start:end],
                start_char=start,
                end_char=end,
                chunk_index=i,
                total_chunks=total_chunks
            )
            chunks.append(chunk)
        
        return chunks