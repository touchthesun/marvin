import os
import json
import base64
from typing import Dict, Any
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from .errors import StorageError, EncryptionError, CredentialNotFoundError


class SecureStorage:
    """
    Secure storage for credentials using encryption.
    
    This class handles the secure storage and retrieval of credentials,
    using Fernet symmetric encryption to protect sensitive data.
    """
    
    def __init__(self, storage_path: str, master_key_env_var: str = "SECRET_KEY"): 
        """
        Initialize secure storage.
        
        Args:
            storage_path: Path to the directory where encrypted credentials will be stored
            master_key_env_var: Name of the environment variable containing the master key
        
        Raises:
            ConfigurationError: If the storage path cannot be created or accessed
        """
        self.storage_path = Path(storage_path)
        self.master_key_env_var = master_key_env_var
        
        # Ensure storage directory exists
        self._ensure_storage_path()
        
        # Initialize encryption key
        self._initialize_encryption()
    
    def _ensure_storage_path(self) -> None:
        """
        Ensure the storage directory exists and is accessible.
        
        Raises:
            StorageError: If storage path cannot be created or accessed
        """
        try:
            os.makedirs(self.storage_path, exist_ok=True)
        except Exception as e:
            raise StorageError(f"Failed to create storage directory: {str(e)}")
    
    def _initialize_encryption(self) -> None:
        """
        Initialize encryption with the master key.
        
        Raises:
            EncryptionError: If master key is not available or invalid
        """
        try:
            # Get master key from environment variable
            master_key = os.environ.get(self.master_key_env_var)
            if not master_key:
                raise EncryptionError("Master key not found in environment variables")
            
            # Use PBKDF2 to derive a secure key
            salt = b'marvin_secure_storage'  # Fixed salt
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            
            key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
            self.cipher = Fernet(key)
            
        except Exception as e:
            if isinstance(e, EncryptionError):
                raise
            raise EncryptionError(f"Failed to initialize encryption: {str(e)}")
    
    def _get_provider_file_path(self, provider_id: str) -> Path:
        """
        Get the file path for a provider's credentials.
        
        Args:
            provider_id: The provider identifier
            
        Returns:
            Path: The file path for the encrypted credentials
        """
        # Sanitize provider_id to ensure it's safe for filesystem
        safe_id = "".join(c for c in provider_id if c.isalnum() or c in "._-")
        return self.storage_path / f"{safe_id}.enc"
    
    def store(self, provider_id: str, credentials: Dict[str, Any]) -> None:
        """
        Encrypt and store credentials for a provider.
        
        Args:
            provider_id: The provider identifier
            credentials: The credentials to store
            
        Raises:
            StorageError: If credentials cannot be stored
            EncryptionError: If encryption fails
        """
        try:
            # Convert credentials to JSON string
            cred_json = json.dumps(credentials)
            
            # Encrypt the credentials
            encrypted_data = self.cipher.encrypt(cred_json.encode())
            
            # Write to file
            file_path = self._get_provider_file_path(provider_id)
            with open(file_path, 'wb') as f:
                f.write(encrypted_data)
                
        except Exception as e:
            if isinstance(e, (StorageError, EncryptionError)):
                raise
            raise StorageError(f"Failed to store credentials: {str(e)}", provider_id)
    
    def retrieve(self, provider_id: str) -> Dict[str, Any]:
        """
        Retrieve and decrypt credentials for a provider.
        
        Args:
            provider_id: The provider identifier
            
        Returns:
            Dict[str, Any]: The decrypted credentials
            
        Raises:
            CredentialNotFoundError: If credentials do not exist
            StorageError: If credentials cannot be retrieved
            EncryptionError: If decryption fails
        """
        file_path = self._get_provider_file_path(provider_id)
        
        if not file_path.exists():
            raise CredentialNotFoundError(provider_id)
        
        try:
            # Read encrypted data
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()
            
            # Decrypt the data
            decrypted_data = self.cipher.decrypt(encrypted_data)
            
            # Parse JSON
            return json.loads(decrypted_data.decode())
            
        except Exception as e:
            if isinstance(e, (CredentialNotFoundError, EncryptionError)):
                raise
            raise StorageError(f"Failed to retrieve credentials: {str(e)}", provider_id)
    
    def remove(self, provider_id: str) -> None:
        """
        Remove stored credentials for a provider.
        
        Args:
            provider_id: The provider identifier
            
        Raises:
            CredentialNotFoundError: If credentials do not exist
            StorageError: If credentials cannot be removed
        """
        file_path = self._get_provider_file_path(provider_id)
        
        if not file_path.exists():
            raise CredentialNotFoundError(provider_id)
        
        try:
            os.remove(file_path)
        except Exception as e:
            raise StorageError(f"Failed to remove credentials: {str(e)}", provider_id)
    
    def list_providers(self) -> Dict[str, Dict[str, Any]]:
        """
        List all providers with stored credentials.
        
        Returns:
            Dict[str, Dict[str, Any]]: A dictionary mapping provider IDs to metadata
        """
        result = {}
        
        try:
            for file_path in self.storage_path.glob("*.enc"):
                provider_id = file_path.stem
                
                # Get basic file metadata
                metadata = {
                    "created": file_path.stat().st_ctime,
                    "modified": file_path.stat().st_mtime,
                    "size": file_path.stat().st_size,
                }
                
                result[provider_id] = metadata
                
            return result
            
        except Exception as e:
            raise StorageError(f"Failed to list providers: {str(e)}")