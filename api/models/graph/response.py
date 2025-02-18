from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime
from api.models.common import APIResponse

class GraphNode(BaseModel):
    """Representation of a node in the graph."""
    id: UUID
    url: str
    domain: str
    title: Optional[str] = None
    last_active: Optional[datetime] = None
    metadata: Dict[str, Any] = {}

class GraphEdge(BaseModel):
    """Representation of an edge in the graph."""
    source_id: UUID
    target_id: UUID
    type: str
    strength: float
    metadata: Dict[str, Any] = {}

class GraphData(BaseModel):
    """Complete graph response data."""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: Optional[Dict[str, Any]] = None

class SearchResultData(BaseModel):
    """Search results from the graph."""
    results: List[GraphNode]
    total_count: int
    metadata: Optional[Dict[str, Any]] = None

# Type aliases for different response types
GraphResponse = APIResponse[GraphData]
SearchResponse = APIResponse[SearchResultData]