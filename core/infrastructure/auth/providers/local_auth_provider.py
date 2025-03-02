import os
import time
import logging
from typing import Dict, Any, Optional

from .base_auth_provider import AuthProviderInterface
from ..errors import AuthorizationError, CredentialNotFoundError, StorageError
from ..storage import SecureStorage


logger = logging.getLogger(__name__)


class LocalAuthProvider(AuthProviderInterface):
    """
    Auth provider implementation for local credential storage.
    
    This provider uses file-based secure storage with encryption for managing
    credentials locally without dependence on external services.
    """
    
    def __init__(
        self, 
        storage_path: str,
        session_expiry_seconds: int = 3600,  # 1 hour
        admin_token: Optional[str] = None
    ):
        """
        Initialize the local auth provider.
        
        Args:
            storage_path: Path to store encrypted credentials
            session_expiry_seconds: How long sessions are valid for
            admin_token: Optional admin token for initial setup (if None, read from env var)
        """
        self.secure_storage = SecureStorage(storage_path)
        self.session_expiry_seconds = session_expiry_seconds
        
        # Read admin token from environment if not provided
        self.admin_token = admin_token or os.environ.get("ADMIN_TOKEN")
        
        # Active sessions with expiry timestamps
        self.active_sessions: Dict[str, float] = {}
        
        logger.info(f"LocalAuthProvider initialized with storage at {storage_path}")
    
    async def validate_session(self, session_token: str) -> bool:
        """
        Validate a session token.
        
        Args:
            session_token: The session token to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        # Check for admin token
        if self.admin_token and session_token == self.admin_token:
            return True
            
        # Check if session exists and is not expired
        if session_token in self.active_sessions:
            expiry_time = self.active_sessions[session_token]
            current_time = time.time()
            
            if current_time < expiry_time:
                # Update expiry time
                self.active_sessions[session_token] = current_time + self.session_expiry_seconds
                return True
            else:
                # Session expired, remove it
                del self.active_sessions[session_token]
        
        return False
    
    async def get_credentials(self, session_token: str, provider_id: str) -> Dict[str, Any]:
        """
        Get credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: The provider identifier
            
        Returns:
            Dict[str, Any]: The provider credentials
            
        Raises:
            AuthorizationError: If session is invalid
            CredentialNotFoundError: If credentials not found
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError(provider_id=provider_id)
        
        try:
            return self.secure_storage.retrieve(provider_id)
        except CredentialNotFoundError:
            raise
        except StorageError as e:
            logger.error(f"Storage error while retrieving credentials: {str(e)}")
            raise
    
    async def store_credentials(self, session_token: str, provider_id: str, credentials: Dict[str, Any]) -> None:
        """
        Store credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: The provider identifier
            credentials: The credentials to store
            
        Raises:
            AuthorizationError: If session is invalid
            StorageError: If storage operation fails
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError(provider_id=provider_id)
        
        try:
            # Add metadata
            credentials_with_meta = {
                **credentials,
                "_metadata": {
                    "created_at": time.time(),
                    "updated_at": time.time()
                }
            }
            
            self.secure_storage.store(provider_id, credentials_with_meta)
            logger.info(f"Credentials stored for provider: {provider_id}")
        except StorageError:
            raise
    
    async def remove_credentials(self, session_token: str, provider_id: str) -> None:
        """
        Remove credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: The provider identifier
            
        Raises:
            AuthorizationError: If session is invalid
            CredentialNotFoundError: If credentials not found
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError(provider_id=provider_id)
        
        try:
            self.secure_storage.remove(provider_id)
            logger.info(f"Credentials removed for provider: {provider_id}")
        except CredentialNotFoundError:
            raise
        except StorageError as e:
            logger.error(f"Storage error while removing credentials: {str(e)}")
            raise
    
    async def list_providers(self, session_token: str) -> Dict[str, Dict[str, Any]]:
        """
        List all providers with stored credentials.
        
        Args:
            session_token: The session token for authorization
            
        Returns:
            Dict[str, Dict[str, Any]]: Provider mapping with metadata
            
        Raises:
            AuthorizationError: If session is invalid
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError()
        
        try:
            providers = self.secure_storage.list_providers()
            
            # Enhance with additional metadata where available
            for provider_id, metadata in providers.items():
                try:
                    credentials = self.secure_storage.retrieve(provider_id)
                    if "_metadata" in credentials:
                        metadata.update(credentials["_metadata"])
                    
                    # Add provider type without exposing sensitive data
                    if "provider_type" in credentials:
                        metadata["provider_type"] = credentials["provider_type"]
                        
                except Exception:
                    # Continue if we can't enhance a particular provider
                    pass
            
            return providers
        except StorageError as e:
            logger.error(f"Storage error while listing providers: {str(e)}")
            raise