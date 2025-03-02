from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class AuthProviderInterface(ABC):
    """
    Abstract base class for authentication provider implementations.
    Defines the interface for secure credential storage and access for LLM providers.
    """
    
    @abstractmethod
    async def validate_session(self, session_token: str) -> bool:
        """
        Validates if the provided session token is valid and authorized.
        
        Args:
            session_token: The session token to validate
            
        Returns:
            bool: True if session is valid, False otherwise
        """
        pass
    
    @abstractmethod
    async def get_credentials(self, session_token: str, provider_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves stored credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: Identifier for the LLM provider
            
        Returns:
            Optional[Dict[str, Any]]: The credentials if found and authorized, None otherwise
            
        Raises:
            AuthorizationError: If session is invalid or unauthorized
            CredentialNotFoundError: If credentials do not exist
        """
        pass
    
    @abstractmethod
    async def store_credentials(self, session_token: str, provider_id: str, credentials: Dict[str, Any]) -> None:
        """
        Securely stores credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: Identifier for the LLM provider
            credentials: The credentials to store
            
        Raises:
            AuthorizationError: If session is invalid or unauthorized
            StorageError: If credentials cannot be stored
        """
        pass
    
    @abstractmethod
    async def remove_credentials(self, session_token: str, provider_id: str) -> None:
        """
        Removes stored credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: Identifier for the LLM provider
            
        Raises:
            AuthorizationError: If session is invalid or unauthorized
            CredentialNotFoundError: If credentials do not exist
        """
        pass
    
    @abstractmethod
    async def list_providers(self, session_token: str) -> Dict[str, Dict[str, Any]]:
        """
        Lists all providers with stored credentials (without exposing sensitive data).
        
        Args:
            session_token: The session token for authorization
            
        Returns:
            Dict[str, Dict[str, Any]]: A dictionary mapping provider IDs to metadata about each provider
            
        Raises:
            AuthorizationError: If session is invalid or unauthorized
        """
        pass