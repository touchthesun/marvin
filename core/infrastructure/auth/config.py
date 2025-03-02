import os
import logging
from typing import Dict, Optional, Type
from pathlib import Path

from core.infrastructure.auth.providers.anthropic_auth_provider import AnthropicAuthProvider
from .providers.base_auth_provider import AuthProviderInterface
from .providers.local_auth_provider import LocalAuthProvider
from .providers.dev_auth_provider import DevAuthProvider
from .errors import ConfigurationError



logger = logging.getLogger(__name__)


class AuthProviderConfig:
    """
    Configuration manager for auth providers.
    
    This class manages the configuration of auth providers and provides
    a factory for creating auth provider instances.
    """
    
    # Registry of available provider implementations - add Anthropic
    _provider_registry: Dict[str, Type[AuthProviderInterface]] = {
        "local": LocalAuthProvider,
        "anthropic": AnthropicAuthProvider,
        "dev": DevAuthProvider,
        # Add more provider implementations here as they're developed
    }
    
    def __init__(self, config_dir: str):
        """
        Initialize the auth provider configuration.
        
        Args:
            config_dir: Directory to use for configuration files
            
        Raises:
            ConfigurationError: If configuration directory cannot be created
        """
        self.config_dir = Path(config_dir)
        self._ensure_config_dir()
        
        # Cache for provider instances
        self._provider_instances: Dict[str, AuthProviderInterface] = {}
    
    def _ensure_config_dir(self) -> None:
        """
        Ensure the configuration directory exists.
        
        Raises:
            ConfigurationError: If directory cannot be created
        """
        try:
            os.makedirs(self.config_dir, exist_ok=True)
        except Exception as e:
            raise ConfigurationError(f"Failed to create config directory: {str(e)}")
    
    def get_storage_path(self, provider_type: str) -> str:
        """
        Get the storage path for a specific provider type.
        
        Args:
            provider_type: Type of provider
            
        Returns:
            str: Path to storage directory
        """
        return str(self.config_dir / f"{provider_type}_credentials")
    
    def get_provider(self, provider_type: str, **kwargs) -> AuthProviderInterface:
        """
        Get an auth provider instance for the specified type.
        
        Args:
            provider_type: Type of provider to get
            **kwargs: Additional arguments to pass to the provider constructor
            
        Returns:
            AuthProviderInterface: Provider instance
            
        Raises:
            ConfigurationError: If provider type is not supported
        """
        # Check if we already have an instance
        if provider_type in self._provider_instances:
            return self._provider_instances[provider_type]
        
        # Check if provider type is supported
        if provider_type not in self._provider_registry:
            raise ConfigurationError(f"Unsupported provider type: {provider_type}")
        
        # Create provider instance
        provider_class = self._provider_registry[provider_type]
        storage_path = self.get_storage_path(provider_type)
        
        try:
            # Pass any additional arguments to the constructor
            # This allows us to pass a session_validator to cloud providers
            provider_instance = provider_class(storage_path=storage_path, **kwargs)
            self._provider_instances[provider_type] = provider_instance
            logger.info(f"Created auth provider instance for type: {provider_type}")
            return provider_instance
        except Exception as e:
            raise ConfigurationError(f"Failed to create provider instance: {str(e)}", provider_type)
    
    def register_provider_type(self, provider_type: str, provider_class: Type[AuthProviderInterface]) -> None:
        """
        Register a new provider type.
        
        Args:
            provider_type: Type identifier for the provider
            provider_class: Implementation class
            
        Raises:
            ConfigurationError: If provider type is already registered
        """
        if provider_type in self._provider_registry:
            raise ConfigurationError(f"Provider type already registered: {provider_type}")
        
        self._provider_registry[provider_type] = provider_class
        logger.info(f"Registered new provider type: {provider_type}")
    
    def get_available_provider_types(self) -> Dict[str, str]:
        """
        Get all available provider types.
        
        Returns:
            Dict[str, str]: Mapping of provider type to class name
        """
        return {
            provider_type: provider_class.__name__
            for provider_type, provider_class in self._provider_registry.items()
        }


# Singleton instance
_instance: Optional[AuthProviderConfig] = None


def get_auth_provider_config(config_dir: Optional[str] = None) -> AuthProviderConfig:
    """
    Get the singleton AuthProviderConfig instance.
    
    Args:
        config_dir: Optional config directory (only used on first call)
        
    Returns:
        AuthProviderConfig: The singleton instance
        
    Raises:
        ConfigurationError: If config_dir is not provided on first call
    """
    global _instance
    
    if _instance is None:
        if config_dir is None:
            raise ConfigurationError("Config directory must be provided on first initialization")
        
        _instance = AuthProviderConfig(config_dir)
    
    return _instance