from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from api.models.common import APIResponse


class CredentialMetadata(BaseModel):
    """Metadata about stored credentials."""
    created_at: Optional[float] = Field(None, description="Timestamp of creation")
    updated_at: Optional[float] = Field(None, description="Timestamp of last update")
    provider_type: str = Field(..., description="Type of provider")
    

class ProviderInfo(BaseModel):
    """Information about a provider with stored credentials."""
    provider_id: str = Field(..., description="Unique identifier for the provider")
    created: Optional[float] = Field(None, description="Creation timestamp")
    modified: Optional[float] = Field(None, description="Last modification timestamp")
    size: Optional[int] = Field(None, description="Size of the encrypted data")
    provider_type: Optional[str] = Field(None, description="Type of provider")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class CredentialResponse(APIResponse):
    """Response for credential operations."""
    data: Optional[Dict[str, Any]] = Field(None, description="Credential data")


class ProvidersListResponse(APIResponse):
    """Response for listing available providers."""
    data: Dict[str, ProviderInfo] = Field(
        ..., 
        description="Mapping of provider IDs to provider information"
    )


class ProviderTypesResponse(APIResponse):
    """Response for listing available provider types."""
    data: Dict[str, str] = Field(
        ..., 
        description="Mapping of provider type IDs to provider type names"
    )