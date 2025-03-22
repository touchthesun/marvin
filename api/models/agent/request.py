from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional

class AgentTaskType(str, Enum):
    QUERY = "query"
    SUMMARIZE = "summarize"
    ANALYZE = "analyze"
    RESEARCH = "research"

class AgentRequest(BaseModel):
    """Request model for agent tasks with provider flexibility"""
    query: str = Field(..., description="Query or task description")
    task_type: AgentTaskType = Field(AgentTaskType.QUERY, description="Type of task")
    relevant_urls: Optional[List[str]] = Field(None, description="Relevant URLs to include")
    provider_id: Optional[str] = Field(None, description="Specific LLM provider to use")
    model_id: Optional[str] = Field(None, description="Specific model to use")
    context: Optional[str] = Field(None, description="Additional context")
    constraints: Optional[str] = Field(None, description="Task constraints")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for multi-turn")
