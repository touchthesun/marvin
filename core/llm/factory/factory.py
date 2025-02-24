from typing import Dict, Optional, Type
from contextlib import asynccontextmanager
from core.utils.logger import get_logger

from core.llm.providers.ollama.client import OllamaProvider
from core.llm.providers.config.config_manager import ProviderConfigManager
from core.llm.providers.ollama.models.config import OllamaProviderConfig
from core.llm.providers.base.provider import ProviderType
from core.llm.providers.base.provider_base import BaseLLMProvider
from core.llm.providers.base.config import ProviderConfig


logger = get_logger(__name__)



class LLMProviderFactory:
    def __init__(self, config_manager: ProviderConfigManager):
        self.config_manager = config_manager
        self._providers: Dict[str, BaseLLMProvider] = {}
        self.logger = logger

    async def create_provider(self, provider_id: str) -> BaseLLMProvider:
        """Create or return a cached provider instance"""
        self.logger.debug(f"Creating provider for ID: {provider_id}")
        
        if provider_id in self._providers:
            self.logger.debug(f"Returning cached provider for {provider_id}")
            return self._providers[provider_id]
        
        # Get provider configuration
        self.logger.debug(f"Fetching configuration for {provider_id}")
        config = await self.config_manager.get_provider_config(provider_id)
        if not config:
            raise ValueError(f"No configuration found for provider: {provider_id}")
        
        self.logger.debug(f"Retrieved config: {config}")
        
        # Create appropriate provider instance
        provider_type = config.get('provider_type')
        self.logger.debug(f"Creating provider of type: {provider_type}")
        
        try:
            if provider_type == ProviderType.OLLAMA.value:
                provider_config = OllamaProviderConfig(**config)
                provider = OllamaProvider(provider_config)
            else:
                raise ValueError(f"Unsupported provider type: {provider_type}")
            
            # Initialize the provider
            self.logger.debug("Initializing provider")
            await provider.initialize()
            
            # Cache the provider
            self._providers[provider_id] = provider
            self.logger.debug("Provider successfully initialized and cached")
            
            return provider
            
        except Exception as e:
            self.logger.error(f"Failed to create provider: {str(e)}", exc_info=True)
            raise

    def register_provider(self, provider_type: ProviderType, 
                         provider_class: Type[BaseLLMProvider]) -> None:
        """Register a provider implementation"""
        self._provider_registry[provider_type.value] = provider_class  # Use enum value as key
        logger.info(f"Registered provider implementation for {provider_type.value}")
    
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