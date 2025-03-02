import time
import logging
from typing import Dict, Any

from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.auth.storage import SecureStorage
from core.infrastructure.auth.errors import CredentialNotFoundError, StorageError

logger = logging.getLogger(__name__)

class DevAuthProvider(AuthProviderInterface):
    """
    Development-mode auth provider that bypasses strict authentication.
    Maintains the same interface as production providers but simplifies
    authentication for local development environments.
    """
    
    def __init__(self, storage_path: str):
        """
        Initialize the development auth provider.
        
        Args:
            storage_path: Path to store credentials
        """
        self.secure_storage = SecureStorage(storage_path)
        self.provider_type = "dev"
        logger.info(f"DevAuthProvider initialized with storage path: {storage_path}")
    
    async def validate_session(self, session_token: str) -> bool:
        """
        Always validates in development mode.
        
        Args:
            session_token: The session token to validate
            
        Returns:
            bool: Always True in development mode
        """
        # In development mode, accept any non-empty token
        return bool(session_token)
    
    async def get_credentials(self, session_token: str, provider_id: str) -> Dict[str, Any]:
        """
        Get credentials for a specific provider.
        
        Args:
            session_token: The session token (not validated)
            provider_id: The provider identifier
            
        Returns:
            Dict[str, Any]: The provider credentials
            
        Raises:
            CredentialNotFoundError: If credentials not found
        """
        try:
            # Get directly from storage, bypassing auth
            credentials = self.secure_storage.retrieve(provider_id)
            logger.debug(f"Retrieved credentials for provider: {provider_id}")
            return credentials
        except CredentialNotFoundError:
            logger.warning(f"Credentials not found for provider: {provider_id}")
            raise
        except Exception as e:
            logger.error(f"Error retrieving credentials: {str(e)}")
            raise StorageError(f"Failed to retrieve credentials: {str(e)}")
    
    async def store_credentials(self, session_token: str, provider_id: str, credentials: Dict[str, Any]) -> None:
        """
        Store credentials for a specific provider.
        
        Args:
            session_token: The session token (not validated)
            provider_id: The provider identifier
            credentials: The credentials to store
            
        Raises:
            StorageError: If storage operation fails
        """
        try:
            # Ensure provider_type is included
            if "provider_type" not in credentials:
                logger.warning(f"Adding missing provider_type to credentials for {provider_id}")
                credentials = credentials.copy()
                credentials["provider_type"] = self.provider_type
            
            # Add/update metadata
            if "_metadata" not in credentials:
                credentials["_metadata"] = {}
                
            current_time = time.time()
            if "created_at" not in credentials["_metadata"]:
                credentials["_metadata"]["created_at"] = current_time
            credentials["_metadata"]["updated_at"] = current_time
            
            # Store in secure storage
            self.secure_storage.store(provider_id, credentials)
            logger.info(f"Credentials stored for provider: {provider_id}")
        except Exception as e:
            logger.error(f"Error storing credentials: {str(e)}")
            raise StorageError(f"Failed to store credentials: {str(e)}")
    
    async def remove_credentials(self, session_token: str, provider_id: str) -> None:
        """
        Remove credentials for a specific provider.
        
        Args:
            session_token: The session token (not validated)
            provider_id: The provider identifier
            
        Raises:
            CredentialNotFoundError: If credentials not found
        """
        try:
            # Remove from secure storage
            self.secure_storage.remove(provider_id)
            logger.info(f"Credentials removed for provider: {provider_id}")
        except CredentialNotFoundError:
            logger.warning(f"No credentials found to remove for provider: {provider_id}")
            raise
        except Exception as e:
            logger.error(f"Error removing credentials: {str(e)}")
            raise StorageError(f"Failed to remove credentials: {str(e)}")
    
    async def list_providers(self, session_token: str) -> Dict[str, Dict[str, Any]]:
        """
        List all providers with stored credentials.
        
        Args:
            session_token: The session token (not validated)
            
        Returns:
            Dict[str, Dict[str, Any]]: Provider mapping with metadata
        """
        try:
            # Get all providers from storage
            providers = self.secure_storage.list_providers()
            logger.debug(f"Found {len(providers)} providers in storage")
            
            # Enhance with provider-specific metadata where available
            for provider_id, metadata in providers.items():
                try:
                    credentials = self.secure_storage.retrieve(provider_id)
                    
                    # Add provider type to metadata
                    if "provider_type" in credentials:
                        metadata["provider_type"] = credentials["provider_type"]
                    
                    # Add credential metadata if available
                    if "_metadata" in credentials:
                        for key, value in credentials["_metadata"].items():
                            metadata[key] = value
                except Exception:
                    # Continue if we can't enhance a particular provider
                    pass
            
            return providers
        except Exception as e:
            logger.error(f"Error listing providers: {str(e)}")
            raise StorageError(f"Failed to list providers: {str(e)}")