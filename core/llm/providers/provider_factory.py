from abc import ABC, abstractmethod
from typing import Dict, Optional, Type
from contextlib import asynccontextmanager
from core.utils.logger import get_logger
from datetime import datetime

from core.llm.providers.provider_interface import (
    ProviderConfig,
    QueryRequest,
    QueryResponse,
    ProviderStatus,
    ProviderStatusResponse,
    ProviderType,
    ProviderMetrics
)

logger = get_logger(__name__)


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
        self.metrics.last_updated = datetime.utcnow()


class LLMProviderFactory:
    """Factory for creating and managing LLM provider instances"""
    
    def __init__(self):
        self._provider_registry: Dict[ProviderType, Type[BaseLLMProvider]] = {}
        self._active_providers: Dict[str, BaseLLMProvider] = {}
        
    def register_provider(self, provider_type: ProviderType, 
                         provider_class: Type[BaseLLMProvider]) -> None:
        """Register a provider implementation"""
        self._provider_registry[provider_type] = provider_class
        logger.info(f"Registered provider implementation for {provider_type}")
    
    async def create_provider(self, config: ProviderConfig) -> BaseLLMProvider:
        """Create and initialize a provider instance"""
        provider_class = self._provider_registry.get(config.provider_type)
        if not provider_class:
            raise ValueError(f"No implementation registered for provider type {config.provider_type}")
        
        # Create unique identifier for this provider instance
        provider_id = f"{config.provider_type}_{config.model_name}"
        
        if provider_id in self._active_providers:
            logger.warning(f"Provider {provider_id} already exists, returning existing instance")
            return self._active_providers[provider_id]
        
        try:
            provider = provider_class(config)
            await provider.initialize()
            self._active_providers[provider_id] = provider
            logger.info(f"Successfully initialized provider {provider_id}")
            return provider
            
        except Exception as e:
            logger.error(f"Failed to initialize provider {provider_id}: {str(e)}")
            raise
    
    async def get_provider(self, provider_type: ProviderType, 
                          model_name: str) -> Optional[BaseLLMProvider]:
        """Get an existing provider instance"""
        provider_id = f"{provider_type}_{model_name}"
        return self._active_providers.get(provider_id)
    
    async def shutdown_provider(self, provider_type: ProviderType, 
                              model_name: str) -> None:
        """Shutdown and remove a provider instance"""
        provider_id = f"{provider_type}_{model_name}"
        provider = self._active_providers.get(provider_id)
        if provider:
            await provider.shutdown()
            del self._active_providers[provider_id]
            logger.info(f"Shutdown provider {provider_id}")
    
    async def shutdown_all(self) -> None:
        """Shutdown all active providers"""
        for provider_id, provider in list(self._active_providers.items()):
            await provider.shutdown()
            del self._active_providers[provider_id]
        logger.info("Shutdown all providers")


@asynccontextmanager
async def get_provider_instance(factory: LLMProviderFactory, 
                              config: ProviderConfig):
    """Context manager for safely getting and using a provider instance"""
    provider = None
    try:
        provider = await factory.create_provider(config)
        yield provider
    finally:
        if provider:
            await factory.shutdown_provider(config.provider_type, config.model_name)