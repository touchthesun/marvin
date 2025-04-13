# core/infrastructure/embeddings/factory.py
from typing import Dict, Type, Any, Optional

from core.infrastructure.embeddings.providers.base import BaseEmbeddingProvider
from core.infrastructure.embeddings.providers.openai import OpenAIEmbeddingProvider
from core.utils.logger import get_logger
from core.utils.config import load_config

try:
    from core.infrastructure.embeddings.providers.ollama import OllamaEmbeddingProvider
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False



class EmbeddingProviderFactory:
    """Factory for embedding provider instances."""
    
    def __init__(self, auth_provider=None):
        """Initialize the embedding provider factory."""
        self.auth_provider = auth_provider
        self.providers = {}
        self.config = load_config()
        
        # Register providers with better error handling
        self.provider_registry = {
            "openai": OpenAIEmbeddingProvider
        }
        
        # Conditionally register Ollama if available
        if OLLAMA_AVAILABLE:
            self.provider_registry["ollama"] = OllamaEmbeddingProvider
            
        self.logger = get_logger(__name__)
        self.logger.info(f"Embedding provider factory initialized with {len(self.provider_registry)} providers")
        for provider_name in self.provider_registry:
            self.logger.debug(f"Registered embedding provider: {provider_name}")
    
    def register_provider(self, provider_id: str, provider_class: Type[BaseEmbeddingProvider]):
        """Register a new embedding provider."""
        self.provider_registry[provider_id.lower()] = provider_class
        self.logger.info(f"Registered embedding provider: {provider_id}")
    
    async def get_provider(self, provider_id: str, config: Optional[Dict[str, Any]] = None) -> BaseEmbeddingProvider:
        """Get or create an embedding provider with better error handling."""
        if not provider_id:
            raise ValueError("Provider ID cannot be empty")
            
        provider_id = provider_id.lower()  # Normalize to lowercase
        
        # Check if provider already exists
        if provider_id in self.providers:
            self.logger.debug(f"Returning cached provider for {provider_id}")
            return self.providers[provider_id]
        
        self.logger.info(f"Creating new provider for {provider_id}")
        
        # Get provider class with better error handling
        provider_class = self.provider_registry.get(provider_id)
        if not provider_class:
            error_msg = f"Unknown embedding provider: {provider_id}. Available providers: {', '.join(self.provider_registry.keys())}"
            self.logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Get provider configuration
        try:
            provider_config = config or await self._get_provider_config(provider_id)
        except Exception as e:
            error_msg = f"Failed to get configuration for provider {provider_id}: {str(e)}"
            self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        
        # Create provider instance with better error handling
        try:
            self.logger.debug(f"Initializing provider class: {provider_class.__name__}")
            provider = provider_class(provider_config)
            await provider.initialize()
            
            # Cache provider
            self.providers[provider_id] = provider
            
            return provider
        except Exception as e:
            error_msg = f"Failed to initialize provider {provider_id}: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg) from e
    
    async def _get_provider_config(self, provider_id: str) -> Dict[str, Any]:
        """Get provider configuration with integration to central config system."""
        
        # Default configuration with reasonable fallbacks
        default_config = {
            "model": self._get_default_model_for_provider(provider_id),
            "dimensions": 1536,  # Reasonable default for most embedding models
            "normalize": True,
            "provider_id": provider_id
        }
        
        # Use credentials from the central config based on provider
        if provider_id == "openai":
            # Check for required OpenAI credentials
            api_key = self.config.openai_api_key
            if not api_key:
                error_msg = "OpenAI API key not found in configuration. Please set OPENAI_API_KEY environment variable."
                self.logger.error(error_msg)
                raise ValueError(error_msg)
                
            # Build OpenAI config
            return {
                **default_config,
                "api_key": api_key,
                "model": "text-embedding-ada-002"
            }
            
        elif provider_id == "ollama":
            # Ollama doesn't require API keys, just configure the URL
            return {
                **default_config,
                "base_url": "http://localhost:11434",  # Default Ollama URL
                "model": "mxbai-embed-large"  # Default embedding model
            }
        
        # Try to get credentials from auth provider as fallback
        if self.auth_provider:
            credential_ids = [
                f"{provider_id}-embedding",
                provider_id,
                f"embedding-{provider_id}"
            ]
            
            for credential_id in credential_ids:
                try:
                    self.logger.debug(f"Trying credentials for {credential_id} from auth provider")
                    credentials = await self.auth_provider.get_credentials(
                        "dev-token", 
                        credential_id
                    )
                    
                    if credentials:
                        self.logger.info(f"Found credentials for {credential_id}")
                        return {**default_config, **credentials}
                except Exception as e:
                    self.logger.debug(f"Failed to get credentials for {credential_id}: {str(e)}")
                    continue
        
        # If we reach here, we don't have credentials
        error_msg = f"No credentials found for {provider_id}. Please ensure proper configuration."
        self.logger.error(error_msg)
        
        if provider_id == "openai":
            error_msg = "OpenAI API key not found. Please set OPENAI_API_KEY environment variable."
        elif provider_id == "ollama":
            error_msg = "Unable to configure Ollama provider. Please ensure Ollama is installed and running."
        
        raise ValueError(error_msg)
    
    def _get_default_model_for_provider(self, provider_id: str) -> str:
        """Get the default model name for a provider."""
        defaults = {
            "openai": "text-embedding-ada-002",
            "ollama": "nomic-embed-text",
            # Add more defaults as needed
        }
        return defaults.get(provider_id, "default-model")
    
    async def list_providers(self):
        """List all registered providers."""
        return list(self.provider_registry.keys())
    
    async def shutdown(self):
        """Shut down all providers with better error handling."""
        self.logger.info("Shutting down all embedding providers")
        shutdown_errors = []
        
        for provider_id, provider in self.providers.items():
            try:
                self.logger.debug(f"Shutting down provider: {provider_id}")
                await provider.shutdown()
            except Exception as e:
                error_msg = f"Error shutting down provider {provider_id}: {str(e)}"
                self.logger.error(error_msg)
                shutdown_errors.append(error_msg)
        
        self.providers = {}
        
        if shutdown_errors:
            self.logger.warning(f"Completed shutdown with {len(shutdown_errors)} errors")
        else:
            self.logger.info("All embedding providers shut down successfully")