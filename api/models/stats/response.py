from pydantic import BaseModel, Field
from api.models.common import APIResponse
from typing import Optional, Dict

class StatsData(BaseModel):
    """Statistics for the system."""
    captures: int = Field(
        default=0,
        description="Number of pages captured"
    )
    relationships: int = Field(
        default=0,
        description="Number of relationships between pages"
    )
    queries: int = Field(
        default=0,
        description="Number of queries executed"
    )
    active_users: Optional[int] = Field(
        default=None,
        description="Number of active users"
    )
    last_updated: Optional[str] = Field(
        default=None,
        description="Timestamp when stats were last updated (ISO format)",
        example="2023-12-31T23:59:59"
    )
    details: Optional[Dict] = Field(
        default=None,
        description="Detailed statistics (if requested)"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "captures": 42,
                "relationships": 128,
                "queries": 15,
                "active_users": 5,
                "last_updated": "2023-12-31T23:59:59",
                "details": None
            }
        }

# Type alias for response type
StatsResponse = APIResponse[StatsData]