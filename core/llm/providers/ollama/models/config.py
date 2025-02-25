
from typing import Optional, Dict, Any, List
from pydantic import Field

from core.llm.providers.base.config import ProviderType
from core.llm.providers.base.provider import ModelCapability
from core.llm.providers.base.provider_base import ProviderConfig


class OllamaProviderConfig(ProviderConfig):
    """Ollama-specific provider configuration"""
    # Required base fields
    provider_type: ProviderType = ProviderType.OLLAMA
    capabilities: List[ModelCapability] = [
        ModelCapability.COMPLETION,
        ModelCapability.CHAT,
        ModelCapability.STREAMING
    ]
    
    # Ollama-specific fields
    base_url: str = "http://localhost:11434"
    models_path: Optional[str] = None
    keep_alive: Optional[str] = "5m"
    
    # Optional base fields with defaults
    max_tokens: int = Field(default=2048, gt=0)
    timeout_seconds: int = Field(default=30, ge=1)
    retry_attempts: int = Field(default=3, ge=0)
    auth_config: Dict[str, Any] = Field(default_factory=dict)
    requests_per_minute: Optional[int] = None
    concurrent_requests: Optional[int] = None
    cost_per_1k_tokens: Optional[float] = None

    class Config:
        use_enum_values = True