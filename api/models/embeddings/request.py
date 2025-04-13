# core/api/models/embeddings/request.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class GenerateEmbeddingRequest(BaseModel):
    """Request model for generating embeddings."""
    text: str = Field(..., description="Text to embed")
    provider_id: str = Field(..., description="Embedding provider ID")
    model_id: Optional[str] = Field(None, description="Specific model to use (provider-dependent)")
    normalize: bool = Field(True, description="Whether to normalize the embedding vector")
    
class BatchEmbeddingRequest(BaseModel):
    """Request model for batch embedding generation."""
    texts: List[str] = Field(..., description="List of texts to embed")
    provider_id: str = Field(..., description="Embedding provider ID")
    model_id: Optional[str] = Field(None, description="Specific model to use (provider-dependent)")
    normalize: bool = Field(True, description="Whether to normalize the embedding vectors")

class PageEmbeddingRequest(BaseModel):
    """Request model for generating embeddings for a page."""
    provider_id: str = Field(..., description="Embedding provider ID")
    model_id: Optional[str] = Field(None, description="Specific model to use (provider-dependent)")
    include_metadata: bool = Field(True, description="Generate embedding for page metadata")
    include_content: bool = Field(False, description="Generate embedding for full page content")
    include_summary: bool = Field(False, description="Generate embedding for page summary if available")
    chunk_size: Optional[int] = Field(None, description="Size of content chunks if chunking is enabled")
    chunk_overlap: Optional[int] = Field(None, description="Overlap between chunks if chunking is enabled")
    
class SearchEmbeddingRequest(BaseModel):
    """Request model for similarity search using embeddings."""
    query: str = Field(..., description="Query text or embedding vector")
    search_mode: str = Field("pages", description="Search mode: 'pages', 'chunks', or 'hybrid'")
    embedding_type: str = Field("metadata", description="Type of embedding to search against")
    provider_id: str = Field(..., description="Embedding provider ID")
    model_id: Optional[str] = Field(None, description="Specific model to use (provider-dependent)")
    threshold: float = Field(0.7, description="Similarity threshold (0-1)")
    limit: int = Field(10, description="Maximum number of results to return")
    filters: Optional[Dict[str, Any]] = Field(None, description="Additional filters for search")