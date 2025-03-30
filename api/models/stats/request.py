from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class StatsRequest(BaseModel):
    """Request model for stats API."""
    start_date: Optional[datetime] = Field(
        default=None, 
        description="Start date for filtering stats (ISO format: YYYY-MM-DDTHH:MM:SS)",
        example="2023-01-01T00:00:00"
    )
    end_date: Optional[datetime] = Field(
        default=None, 
        description="End date for filtering stats (ISO format: YYYY-MM-DDTHH:MM:SS)",
        example="2023-12-31T23:59:59"
    )
    include_types: Optional[List[str]] = Field(
        default=None,
        description="Types of stats to include",
        example=["captures", "relationships", "queries"]
    )
    detailed: bool = Field(
        default=False,
        description="Whether to include detailed statistics"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "start_date": "2023-01-01T00:00:00",
                "end_date": "2023-12-31T23:59:59",
                "include_types": ["captures", "relationships", "queries"],
                "detailed": False
            }
        }