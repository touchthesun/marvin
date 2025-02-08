from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum
from uuid import UUID

class AgentTaskType(str, Enum):
    """Types of tasks the agent can perform."""
    QUERY = "query"              # Direct question answering
    RESEARCH = "research"        # In-depth research task
    SUMMARIZE = "summarize"      # Summarize content/findings
    ANALYZE = "analyze"          # Analyze relationships/patterns
    RECOMMEND = "recommend"      # Make recommendations

class AgentRequest(BaseModel):
    """Base request model for agent interactions."""
    task_type: AgentTaskType
    query: str
    context: Optional[Dict[str, Any]] = None
    constraints: Optional[Dict[str, Any]] = None
    relevant_urls: Optional[List[str]] = None
    conversation_id: Optional[UUID] = None

class ResearchRequest(AgentRequest):
    """Specific request for research tasks."""
    depth: int = 2
    max_sources: int = 10
    include_domains: Optional[List[str]] = None
    exclude_domains: Optional[List[str]] = None