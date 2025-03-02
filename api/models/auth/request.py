from typing import Dict, Any
from pydantic import BaseModel, Field, field_validator


class CredentialBase(BaseModel):
    """Base model for credential operations."""
    provider_id: str = Field(..., description="Unique identifier for the LLM provider")


class CredentialStore(CredentialBase):
    """Model for storing provider credentials."""
    credentials: Dict[str, Any] = Field(
        ..., 
        description="Provider-specific credentials (API keys, tokens, etc.)"
    )
    provider_type: str = Field(
        ..., 
        description="Type of provider (e.g., 'ollama', 'anthropic')"
    )
    
    @field_validator('credentials')
    def validate_credentials(cls, v):
        """Ensure credentials are not empty."""
        if not v:
            raise ValueError("Credentials cannot be empty")
        return v


class CredentialQuery(CredentialBase):
    """Model for querying provider credentials."""
    pass


class SessionAuth(BaseModel):
    """Model for session authentication."""
    session_token: str = Field(..., description="Session authentication token")