# core/llm/providers/cloud/auth_provider.py
import logging
from abc import abstractmethod
from typing import Dict, Any, Optional

from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.auth.errors import AuthorizationError, CredentialNotFoundError, StorageError
from ..storage import SecureStorage

logger = logging.getLogger(__name__)

class CloudAuthProvider(AuthProviderInterface):
    """
    Abstract base class for cloud-based LLM provider authentication.
    
    Extends the AuthProviderInterface with cloud-specific functionality
    while delegating secure storage to the SecureStorage system.
    """
    
    def __init__(
        self,
        storage_path: str,
        provider_type: str,
        session_validator,  # Function or object that validates sessions
    ):
        """
        Initialize the cloud auth provider.
        
        Args:
            storage_path: Path for the secure storage
            provider_type: Type identifier for this provider (e.g., "anthropic")
            session_validator: Function or object with validate_session method
        """
        self.secure_storage = SecureStorage(storage_path)
        self.provider_type = provider_type
        self.session_validator = session_validator
        
        logger.info(f"CloudAuthProvider initialized for {provider_type}")
    
    async def validate_session(self, session_token: str) -> bool:
        """
        Validate a session token using the provided validator.
        
        Args:
            session_token: The session token to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        # Delegate to the session validator
        if hasattr(self.session_validator, 'validate_session'):
            return await self.session_validator.validate_session(session_token)
        else:
            return await self.session_validator(session_token)
    
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
            credentials = self.secure_storage.retrieve(provider_id)
            
            # Verify this is the right provider type
            stored_provider_type = credentials.get("provider_type") 
            if stored_provider_type and stored_provider_type != self.provider_type:
                logger.warning(
                    f"Provider type mismatch: expected {self.provider_type}, "
                    f"got {stored_provider_type}"
                )
                
            return credentials
            
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
            ValidationError: If credentials are invalid
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError(provider_id=provider_id)
        
        # Validate the credentials before storing
        validation_result = await self.validate_credentials(credentials)
        if not validation_result["valid"]:
            raise ValidationError(validation_result["message"])
        
        try:
            # Ensure provider_type is set correctly
            credentials["provider_type"] = self.provider_type
            
            # Add metadata if not present
            if "_metadata" not in credentials:
                credentials["_metadata"] = {}
                
            # Update metadata timestamps
            current_time = time.time()
            if "created_at" not in credentials["_metadata"]:
                credentials["_metadata"]["created_at"] = current_time
            credentials["_metadata"]["updated_at"] = current_time
            
            self.secure_storage.store(provider_id, credentials)
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
            # Verify this is the right provider type before removing
            try:
                credentials = self.secure_storage.retrieve(provider_id)
                stored_provider_type = credentials.get("provider_type")
                if stored_provider_type and stored_provider_type != self.provider_type:
                    logger.warning(
                        f"Provider type mismatch during removal: expected {self.provider_type}, "
                        f"got {stored_provider_type}"
                    )
            except CredentialNotFoundError:
                # Let the removal operation handle this
                pass
                
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
            
            # Filter for this provider type and enhance with metadata
            filtered_providers = {}
            for provider_id, metadata in providers.items():
                try:
                    credentials = self.secure_storage.retrieve(provider_id)
                    
                    # Only include providers of this type
                    if credentials.get("provider_type") == self.provider_type:
                        if "_metadata" in credentials:
                            metadata.update(credentials["_metadata"])
                            
                        # Include provider type in metadata for the API
                        metadata["provider_type"] = self.provider_type
                        
                        filtered_providers[provider_id] = metadata
                except Exception as e:
                    # Continue if we can't access a particular provider
                    logger.debug(f"Error processing provider {provider_id}: {str(e)}")
                    pass
            
            return filtered_providers
        except StorageError as e:
            logger.error(f"Storage error while listing providers: {str(e)}")
            raise
    
    @abstractmethod
    async def validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate the format and contents of credentials for this provider.
        
        Args:
            credentials: The credentials to validate
            
        Returns:
            Dict with:
                valid: bool - True if valid, False otherwise
                message: str - Error message if invalid
        """
        pass
    
    async def test_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """
        Test credentials against the provider's API to verify they work.
        Optional method that providers can implement to test credentials.
        
        Args:
            credentials: The credentials to test
            
        Returns:
            Dict with:
                valid: bool - True if credentials work, False otherwise
                message: str - Error message if invalid
        """
        # Default implementation just returns validation result
        return await self.validate_credentials(credentials)