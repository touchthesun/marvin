import os
import aiohttp
import logging
from typing import Dict, Any
from datetime import datetime

from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.auth.providers.cloud_auth_provider import CloudAuthProvider
from core.infrastructure.auth.storage import SecureStorage
from core.infrastructure.auth.errors import (
    AuthProviderError, 
    AuthorizationError, 
    CredentialNotFoundError, 
    StorageError, 
    ValidationError
    )

logger = logging.getLogger(__name__)

class AnthropicAuthProvider(AuthProviderInterface):
    """
    Auth provider for Anthropic Claude models.
    Manages secure storage and validation of Anthropic API credentials.
    """
    
    def __init__(self, storage_path: str, session_validator=None):
        """
        Initialize the Anthropic auth provider.
        
        Args:
            storage_path: Path for secure credential storage
            session_validator: Optional function or object that validates sessions
                              If not provided, will use admin token validation
        """
        # Initialize secure storage using the provided system
        self.secure_storage = SecureStorage(storage_path)
        self.provider_type = "anthropic"
        
        # Use provided session validator or create a simple one
        self.session_validator = session_validator
        
        # If no session validator is provided, use admin token from env
        if self.session_validator is None:
            self.admin_token = os.environ.get("ADMIN_TOKEN")
            
        logger.info(f"AnthropicAuthProvider initialized with storage at {storage_path}")
    
    async def validate_session(self, session_token: str) -> bool:
        """
        Validate a session token.
        
        Args:
            session_token: The session token to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        # If we have a session validator, use it
        if self.session_validator is not None:
            if hasattr(self.session_validator, 'validate_session'):
                return await self.session_validator.validate_session(session_token)
            else:
                return await self.session_validator(session_token)
                
        # Otherwise, just check against admin token
        return bool(self.admin_token and session_token == self.admin_token)
    
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
            
            # Verify this is an Anthropic provider
            if credentials.get("provider_type") != self.provider_type:
                logger.warning(
                    f"Provider type mismatch: expected {self.provider_type}, "
                    f"got {credentials.get('provider_type')}"
                )
                
            return credentials
        except CredentialNotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error retrieving credentials: {str(e)}")
            raise StorageError(f"Failed to retrieve credentials: {str(e)}")
    
    async def store_credentials(self, session_token: str, provider_id: str, credentials: Dict[str, Any]) -> None:
        """
        Store credentials for a specific provider.
        
        Args:
            session_token: The session token for authorization
            provider_id: The provider identifier
            credentials: The credentials to store
            
        Raises:
            AuthorizationError: If session is invalid
            ValidationError: If credentials are invalid
            StorageError: If storage operation fails
        """
        if not await self.validate_session(session_token):
            raise AuthorizationError(provider_id=provider_id)
        
        # Validate the credentials
        validation_result = self._validate_credentials(credentials)
        if not validation_result["valid"]:
            raise ValidationError(validation_result["message"], provider_id)
        
        try:
            # Ensure provider_type is correctly set
            if "provider_type" not in credentials or credentials["provider_type"] != self.provider_type:
                credentials = credentials.copy()  # Create a copy to avoid modifying the original
                credentials["provider_type"] = self.provider_type
                
            # Add metadata if not present
            if "_metadata" not in credentials:
                credentials["_metadata"] = {}
                
            # Update metadata timestamps
            current_time = datetime.now()
            if "created_at" not in credentials["_metadata"]:
                credentials["_metadata"]["created_at"] = current_time
            credentials["_metadata"]["updated_at"] = current_time
                
            # Use secure storage to encrypt and store
            self.secure_storage.store(provider_id, credentials)
            logger.info(f"Credentials stored for provider: {provider_id}")
        except Exception as e:
            logger.error(f"Error storing credentials: {str(e)}")
            raise StorageError(f"Failed to store credentials: {str(e)}")
    
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
            # Verify this is an Anthropic provider before removing
            try:
                credentials = self.secure_storage.retrieve(provider_id)
                if credentials.get("provider_type") != self.provider_type:
                    logger.warning(
                        f"Provider type mismatch during removal: expected {self.provider_type}, "
                        f"got {credentials.get('provider_type')}"
                    )
            except CredentialNotFoundError:
                # Let the removal operation handle this
                pass
                
            # Use secure storage to remove credentials
            self.secure_storage.remove(provider_id)
            logger.info(f"Credentials removed for provider: {provider_id}")
        except CredentialNotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error removing credentials: {str(e)}")
            raise StorageError(f"Failed to remove credentials: {str(e)}")
    
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
            all_providers = self.secure_storage.list_providers()
            
            # Filter to only include Anthropic providers
            anthropic_providers = {}
            for provider_id, metadata in all_providers.items():
                try:
                    credentials = self.secure_storage.retrieve(provider_id)
                    if credentials.get("provider_type") == self.provider_type:
                        # Include provider type and other metadata in the result
                        provider_metadata = {
                            "provider_type": self.provider_type,
                            **metadata  # Include file metadata
                        }
                        
                        # Add credential metadata if available
                        if "_metadata" in credentials:
                            provider_metadata.update(credentials["_metadata"])
                            
                        anthropic_providers[provider_id] = provider_metadata
                except Exception as e:
                    # Skip if there's an error retrieving this provider
                    logger.debug(f"Error processing provider {provider_id}: {str(e)}")
                    continue
                    
            return anthropic_providers
        except Exception as e:
            logger.error(f"Error listing providers: {str(e)}")
            raise StorageError(f"Failed to list providers: {str(e)}")
    
    def _validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate Anthropic credentials format.
        
        Args:
            credentials: The credentials to validate
            
        Returns:
            Dict with validation result
        """
        # Check for empty credentials
        if not credentials:
            return {
                "valid": False,
                "message": "Credentials cannot be empty"
            }
            
        # Check for api_key
        if "api_key" not in credentials:
            return {
                "valid": False,
                "message": "API key is required for Anthropic provider"
            }
            
        api_key = credentials["api_key"]
        
        # Validate API key format
        if not isinstance(api_key, str) or not api_key.strip():
            return {
                "valid": False,
                "message": "API key must be a non-empty string"
            }
            
        # Check for expected Anthropic key format
        if not api_key.startswith("sk-ant-"):
            return {
                "valid": False,
                "message": "Invalid Anthropic API key format (should start with 'sk-ant-')"
            }
            
        # API base URL validation if provided
        if "api_base" in credentials:
            api_base = credentials["api_base"]
            if not isinstance(api_base, str) or not api_base.startswith(("http://", "https://")):
                return {
                    "valid": False,
                    "message": "API base URL must be a valid HTTP/HTTPS URL"
                }
        
        return {"valid": True, "message": ""}
    
    async def test_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """
        Test Anthropic credentials by making a simple API call.
        
        Args:
            credentials: The credentials to test
            
        Returns:
            Dict with test result
        """
        # First validate the format
        validation = self._validate_credentials(credentials)
        if not validation["valid"]:
            return validation
            
        api_key = credentials["api_key"]
        api_base = credentials.get("api_base", "https://api.anthropic.com/v1")
        
        try:
            # Create a session with the API key
            async with aiohttp.ClientSession(
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            ) as session:
                # Make a simple request to the models endpoint which requires auth
                url = f"{api_base}/models"
                
                async with session.get(url, timeout=10) as response:
                    if response.status == 200:
                        return {"valid": True, "message": ""}
                    else:
                        error_text = await response.text()
                        logger.warning(
                            f"Anthropic API test failed with status {response.status}: {error_text}"
                        )
                        return {
                            "valid": False,
                            "message": f"API request failed with status {response.status}: {error_text}"
                        }
        except Exception as e:
            logger.warning(f"Anthropic API test failed: {str(e)}")
            return {
                "valid": False,
                "message": f"Connection to Anthropic API failed: {str(e)}"
            }