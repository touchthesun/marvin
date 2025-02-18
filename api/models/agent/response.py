from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from api.models.common import APIResponse

class SourceReference(BaseModel):
    """Reference to a source used by the agent."""
    url: str
    title: Optional[str] = None
    relevance_score: float
    context_used: Optional[str] = None
    accessed_at: datetime

class AgentThought(BaseModel):
    """Representation of agent's reasoning process."""
    thought: str
    action: str
    action_input: Dict[str, Any]
    observation: Optional[str] = None
    timestamp: datetime

class AgentData(BaseModel):
    """Core response data from agent."""
    response: str
    sources: List[SourceReference]
    confidence_score: float
    thoughts: Optional[List[AgentThought]] = None
    metadata: Dict[str, Any] = {}

class ConversationData(BaseModel):
    """Data about an ongoing conversation."""
    conversation_id: UUID
    messages: List[Dict[str, Any]]
    context: Dict[str, Any]
    started_at: datetime
    last_updated: datetime

# Type aliases for different response types
AgentResponse = APIResponse[AgentData]
ConversationResponse = APIResponse[ConversationData]