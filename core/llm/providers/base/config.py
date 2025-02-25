from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum
import json


class ProviderType(Enum):
    """Supported LLM provider types"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    LOCAL = "local"

class ModelCapability(Enum):
    """Capabilities that a model might support"""
    COMPLETION = "completion"
    CHAT = "chat"
    STREAMING = "streaming"
    FUNCTION_CALLING = "function_calling"
    EMBEDDINGS = "embeddings"



class ProviderConfig(BaseModel):
    """Base configuration for LLM providers"""
    provider_type: ProviderType
    model_name: str
    capabilities: List[ModelCapability]
    max_tokens: int = Field(gt=0)
    timeout_seconds: int = Field(ge=1, default=30)
    retry_attempts: int = Field(ge=0, default=3)
    
    # Authentication (could be API key or local path)
    auth_config: Dict[str, Any] = Field(default_factory=dict)
    
    # Rate limiting
    requests_per_minute: Optional[int] = None
    concurrent_requests: Optional[int] = None
    
    # Cost tracking
    cost_per_1k_tokens: Optional[float] = None
    
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "ProviderConfig":
        """Create config instance from JSON data"""
        # Convert string enums back to proper enum types
        if isinstance(data['provider_type'], str):
            data['provider_type'] = ProviderType(data['provider_type'])
        
        if isinstance(data['capabilities'], list):
            data['capabilities'] = [ModelCapability(cap) for cap in data['capabilities']]
            
        return cls(**data)

    def model_dump(self) -> Dict[str, Any]:
        """Convert model to dictionary"""
        data = super().model_dump()
        if isinstance(data['provider_type'], ProviderType):
            data['provider_type'] = data['provider_type'].value
        return data

    class Config:
        use_enum_values = True