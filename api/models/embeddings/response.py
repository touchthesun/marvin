# api/models/embeddings/response.py
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from api.models.common import APIResponse

class EmbeddingData(BaseModel):
    """Embedding data for API response"""
    embedding: List[float]
    model: str
    dimension: int
    normalized: bool

class BatchEmbeddingData(BaseModel):
    """Batch embedding data for API response"""
    embeddings: List[List[float]]
    model: str
    dimension: Optional[int] = None
    normalized: bool
    count: int

class PageEmbeddingData(BaseModel):
    """Page embedding data for API response"""
    page_id: str
    url: str
    status: str
    model: str
    has_metadata_embedding: bool
    has_content_embedding: bool
    has_summary_embedding: bool
    chunk_count: int
    last_updated: str
    error: Optional[str] = None

class SimilarityData(BaseModel):
    """Similarity search results for API response"""
    query: str
    similar_items: List[Dict[str, Any]]
    count: int

class EmbeddingResponse(APIResponse):
    """API response for embedding generation"""
    data: Optional[EmbeddingData] = None

class BatchEmbeddingResponse(APIResponse):
    """API response for batch embedding generation"""
    data: Optional[BatchEmbeddingData] = None

class PageEmbeddingResponse(APIResponse):
    """API response for page embedding generation"""
    data: Optional[PageEmbeddingData] = None

class SimilarityResponse(APIResponse):
    """API response for similarity search"""
    data: Optional[SimilarityData] = None