from typing import Dict, Any
import logging

from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.auth.providers.local_auth_provider import LocalAuthProvider
from core.infrastructure.auth.providers.anthropic_auth_provider import AnthropicAuthProvider


logger = logging.getLogger(__name__)

class AuthProviderFactory:
    """
    Factory for creating auth provider instances.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the auth provider factory.
        
        Args:
            config: Configuration dictionary with provider settings
        """
        self.config = config
        self.storage_path = config.get("storage_path", "./credentials")
        self.session_validator = config.get("session_validator")
        
        # Register provider types
        self.provider_types = {
            "local": LocalAuthProvider,
            "anthropic": AnthropicAuthProvider,
            # Register other providers here
        }
        
        logger.info(f"AuthProviderFactory initialized with providers: {list(self.provider_types.keys())}")
    
    def get_provider(self, provider_type: str) -> AuthProviderInterface:
        """
        Get an auth provider instance for the specified type.
        
        Args:
            provider_type: The type of provider to create
            
        Returns:
            AuthProviderInterface: The auth provider instance
            
        Raises:
            ValueError: If provider type is not supported
        """
        if provider_type not in self.provider_types:
            raise ValueError(f"Unsupported auth provider type: {provider_type}")
            
        provider_class = self.provider_types[provider_type]
        
        if provider_type == "local":
            # LocalAuthProvider has a different constructor
            admin_token = self.config.get("admin_token")
            session_expiry = self.config.get("session_expiry_seconds", 3600)
            
            return provider_class(
                storage_path=self.storage_path,
                session_expiry_seconds=session_expiry,
                admin_token=admin_token
            )
        else:
            # Cloud providers
            return provider_class(
                storage_path=self.storage_path,
                session_validator=self.session_validator
            )
    
    def get_available_provider_types(self) -> Dict[str, str]:
        """
        Get a dictionary of available provider types.
        
        Returns:
            Dict[str, str]: Mapping of provider type IDs to class names
        """
        return {
            provider_type: provider_class.__name__
            for provider_type, provider_class in self.provider_types.items()
        }