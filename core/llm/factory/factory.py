from typing import Dict, Type
from contextlib import asynccontextmanager
from core.utils.logger import get_logger

from core.llm.providers.anthropic.anthropic_provider import AnthropicProvider
from core.llm.providers.ollama.client import OllamaProvider
from core.llm.providers.config.config_manager import ProviderConfigManager
from core.llm.providers.base.provider import ProviderType
from core.llm.providers.base.provider_base import BaseLLMProvider


logger = get_logger(__name__)

class LLMProviderFactory:
    def __init__(self, config_manager: ProviderConfigManager):
        self.config_manager = config_manager
        self._providers: Dict[str, BaseLLMProvider] = {}
        self._provider_registry: Dict[str, Type[BaseLLMProvider]] = {}
        self.logger = logger
        
        # Register default providers
        self.register_provider(ProviderType.OLLAMA, OllamaProvider)
        self.register_provider(ProviderType.ANTHROPIC, AnthropicProvider)

    def register_provider(self, provider_type: ProviderType, 
                         provider_class: Type[BaseLLMProvider]) -> None:
        """Register a provider implementation"""
        self._provider_registry[provider_type.value] = provider_class
        logger.info(f"Registered provider implementation for {provider_type.value}")

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
        
        # Extract provider type
        provider_type = config.get('provider_type')
        if not provider_type or provider_type not in self._provider_registry:
            raise ValueError(f"Unsupported provider type: {provider_type}")
        
        # Create appropriate provider instance
        provider_class = self._provider_registry[provider_type]
        provider = provider_class(config)
        
        # Initialize the provider
        self.logger.debug(f"Initializing provider of type: {provider_type}")
        await provider.initialize()
        
        # Cache the provider
        self._providers[provider_id] = provider
        self.logger.debug("Provider successfully initialized and cached")
        
        return provider
    
    async def get_provider(self, provider_type: ProviderType, model_name: str) -> BaseLLMProvider:
        """Get or create a provider by type and model"""
        provider_id = f"{provider_type.value}_{model_name}"
        
        # Return cached provider if available
        if provider_id in self._providers:
            return self._providers[provider_id]
        
        # Create new provider config
        config = {
            "provider_type": provider_type.value,
            "model_name": model_name
        }
        
        # Create provider
        provider_class = self._provider_registry.get(provider_type.value)
        if not provider_class:
            raise ValueError(f"No provider registered for type: {provider_type.value}")
        
        provider = provider_class(config)
        await provider.initialize()
        
        # Cache the provider
        self._providers[provider_id] = provider
        return provider
    
    async def shutdown_provider(self, provider_id: str) -> None:
        """Shutdown and remove a provider instance"""
        provider = self._providers.get(provider_id)
        if provider:
            await provider.shutdown()
            del self._providers[provider_id]
            logger.info(f"Shutdown provider {provider_id}")
    
    async def shutdown_all(self) -> None:
        """Shutdown all active providers"""
        for provider_id, provider in list(self._providers.items()):
            try:
                await provider.shutdown()
            except Exception as e:
                logger.error(f"Error shutting down provider {provider_id}: {str(e)}")
        
        self._providers.clear()
        logger.info("Shutdown all providers")

    @asynccontextmanager
    async def get_provider_context(self, provider_type: str, model_name: str):
        """Context manager for temporary provider use"""
        provider = None
        try:
            if provider_type == "anthropic":
                provider_enum = ProviderType.ANTHROPIC
            elif provider_type == "ollama":
                provider_enum = ProviderType.OLLAMA
            else:
                raise ValueError(f"Unsupported provider type: {provider_type}")
                
            provider = await self.get_provider(provider_enum, model_name)
            yield provider
        finally:
            # We don't shut down the provider here since it's cached
            # and might be used by other requests
            pass