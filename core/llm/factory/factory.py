from typing import Dict, Optional, Type
from contextlib import asynccontextmanager
from core.utils.logger import get_logger

from core.llm.providers.base.provider import (
    ProviderConfig,
    ProviderType,
    BaseLLMProvider
)

logger = get_logger(__name__)



class LLMProviderFactory:
    """Factory for creating and managing LLM provider instances"""
    
    def __init__(self):
        self._provider_registry: Dict[str, Type[BaseLLMProvider]] = {}  # Changed to use string keys
        self._active_providers: Dict[str, BaseLLMProvider] = {}
        
    def register_provider(self, provider_type: ProviderType, 
                         provider_class: Type[BaseLLMProvider]) -> None:
        """Register a provider implementation"""
        self._provider_registry[provider_type.value] = provider_class  # Use enum value as key
        logger.info(f"Registered provider implementation for {provider_type.value}")
    
    async def create_provider(self, config: ProviderConfig) -> BaseLLMProvider:
        """Create and initialize a provider instance"""
        provider_class = self._provider_registry.get(config.provider_type.value)  # Use enum value for lookup
        if not provider_class:
            raise ValueError(f"No implementation registered for provider type {config.provider_type.value}")
        
        # Create unique identifier for this provider instance
        provider_id = f"{config.provider_type.value}_{config.model_name}"
        
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
        provider_id = f"{provider_type.value}_{model_name}"
        return self._active_providers.get(provider_id)
    
    async def shutdown_provider(self, provider_type: ProviderType, 
                              model_name: str) -> None:
        """Shutdown and remove a provider instance"""
        provider_id = f"{provider_type.value}_{model_name}"
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