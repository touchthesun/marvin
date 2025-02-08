from pydantic import BaseModel
from typing import Optional, List, Set
from enum import Enum

class RelationType(str, Enum):
    """Types of relationships between pages."""
    LINKS_TO = "links_to"
    SIMILAR_TO = "similar_to"
    PRECEDES = "precedes"
    FOLLOWS = "follows"

class GraphQuery(BaseModel):
    """Query parameters for graph operations."""
    depth: int = 1
    relationship_types: Optional[Set[RelationType]] = None
    min_strength: float = 0.0
    limit: int = 100

class SearchQuery(BaseModel):
    """Parameters for graph search operations."""
    query: str
    domains: Optional[List[str]] = None
    include_metadata: bool = False
    limit: int = 100