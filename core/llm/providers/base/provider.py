from enum import Enum
from abc import ABC, abstractmethod
from typing import Dict, Optional, List, Any
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class ModelCapability(Enum):
    """Capabilities that a model might support"""
    COMPLETION = "completion"
    CHAT = "chat"
    STREAMING = "streaming"
    FUNCTION_CALLING = "function_calling"
    EMBEDDINGS = "embeddings"


class ProviderType(Enum):
    """Supported LLM provider types"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    LOCAL = "local"


class ProviderStatus(Enum):
    """Possible states of a provider"""
    INITIALIZING = "initializing"
    READY = "ready"
    ERROR = "error"
    RATE_LIMITED = "rate_limited"
    DISABLED = "disabled"

class ProviderConfig(BaseModel):
    """Base configuration for LLM providers"""
    provider_type: ProviderType
    model_name: str
    capabilities: List[ModelCapability]
    max_tokens: int = Field(gt=0)
    timeout_seconds: int = Field(ge=1, default=30)
    retry_attempts: int = Field(ge=0, default=3)
    
    # Authentication (could be API key or local path)
    auth_config: Dict[str, Any]
    
    # Rate limiting
    requests_per_minute: Optional[int] = None
    concurrent_requests: Optional[int] = None
    
    # Cost tracking
    cost_per_1k_tokens: Optional[float] = None
    
    class Config:
        use_enum_values = True


class QueryRequest(BaseModel):
    """Request for LLM query"""
    query_id: UUID
    prompt: str
    max_tokens: Optional[int] = None
    temperature: float = Field(ge=0.0, le=2.0, default=1.0)
    stream: bool = False
    
    # Optional parameters
    stop_sequences: Optional[List[str]] = None
    function_call: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TokenUsage(BaseModel):
    """Token usage information"""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: Optional[float] = None


class QueryResponse(BaseModel):
    """Response from LLM query"""
    query_id: UUID
    provider_type: ProviderType
    model_name: str
    content: str
    
    # Metadata
    created_at: datetime
    completed_at: datetime
    latency_ms: float
    
    # Usage information
    token_usage: TokenUsage
    
    # Additional data
    finish_reason: Optional[str] = None
    function_call_result: Optional[Dict[str, Any]] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ProviderMetrics(BaseModel):
    """Metrics for provider monitoring"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_tokens: int = 0
    average_latency_ms: float = 0.0
    rate_limits_hit: int = 0
    last_error: Optional[str] = None
    last_updated: datetime = Field(default_factory=datetime.now)


class ProviderStatusResponse(BaseModel):
    """Status response for provider health checks"""
    provider_type: ProviderType
    status: ProviderStatus
    model_name: str
    capabilities: List[ModelCapability]
    metrics: ProviderMetrics
    error_message: Optional[str] = None
    last_successful_request: Optional[datetime] = None


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.metrics = ProviderMetrics()
        self._status = ProviderStatus.INITIALIZING
        self._last_error: Optional[str] = None
        
    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the provider with given configuration"""
        pass
    
    @abstractmethod
    async def shutdown(self) -> None:
        """Clean up provider resources"""
        pass
    
    @abstractmethod
    async def query(self, request: QueryRequest) -> QueryResponse:
        """Execute a query against the LLM"""
        pass
    
    async def get_status(self) -> ProviderStatusResponse:
        """Get current provider status and metrics"""
        return ProviderStatusResponse(
            provider_type=self.config.provider_type,
            status=self._status,
            model_name=self.config.model_name,
            capabilities=self.config.capabilities,
            metrics=self.metrics,
            error_message=self._last_error,
            last_successful_request=self.metrics.last_updated if self.metrics.successful_requests > 0 else None
        )
    
    def _update_metrics(self, success: bool, latency_ms: float, tokens: int) -> None:
        """Update provider metrics"""
        self.metrics.total_requests += 1
        if success:
            self.metrics.successful_requests += 1
        else:
            self.metrics.failed_requests += 1
        
        self.metrics.total_tokens += tokens
        
        # Update rolling average latency
        n = self.metrics.total_requests
        self.metrics.average_latency_ms = (
            (self.metrics.average_latency_ms * (n - 1) + latency_ms) / n
        )
        self.metrics.last_updated = datetime.now()