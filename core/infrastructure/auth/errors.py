from typing import Optional


class AuthProviderError(Exception):
    """Base exception for all Auth Provider related errors."""
    
    def __init__(self, message: str, provider_id: Optional[str] = None):
        self.message = message
        self.provider_id = provider_id
        super().__init__(self.message)


class AuthorizationError(AuthProviderError):
    """Raised when a session is invalid or unauthorized for a requested operation."""
    
    def __init__(self, message: str = "Session invalid or unauthorized", provider_id: Optional[str] = None):
        super().__init__(message, provider_id)


class CredentialNotFoundError(AuthProviderError):
    """Raised when requested credentials do not exist."""
    
    def __init__(self, provider_id: str):
        message = f"Credentials for provider '{provider_id}' not found"
        super().__init__(message, provider_id)


class StorageError(AuthProviderError):
    """Raised when credentials cannot be stored or retrieved."""
    
    def __init__(self, message: str, provider_id: Optional[str] = None):
        super().__init__(message, provider_id)


class EncryptionError(StorageError):
    """Raised when there is an issue with encrypting or decrypting credentials."""
    
    def __init__(self, message: str, provider_id: Optional[str] = None):
        super().__init__(f"Encryption error: {message}", provider_id)


class ValidationError(AuthProviderError):
    """Raised when credential validation fails."""
    
    def __init__(self, message: str, provider_id: Optional[str] = None):
        super().__init__(f"Validation error: {message}", provider_id)


class ConfigurationError(AuthProviderError):
    """Raised when there is an issue with the auth provider configuration."""
    
    def __init__(self, message: str, provider_id: Optional[str] = None):
        super().__init__(f"Configuration error: {message}", provider_id)