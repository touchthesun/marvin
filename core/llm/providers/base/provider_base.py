from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime

from core.llm.providers.base.provider import ProviderMetrics, ProviderStatus, QueryResponse, QueryRequest,ProviderStatusResponse
from core.llm.providers.base.config import ProviderConfig


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