from fastapi import APIRouter, Depends, HTTPException, status
from api.models.auth.request import CredentialStore, SessionAuth
from api.models.auth.response import (
    CredentialResponse, ProvidersListResponse, ProviderTypesResponse
)
from api.models.common import APIResponse
from core.infrastructure.auth.providers.base import AuthProviderInterface
from core.infrastructure.auth.errors import (
    AuthorizationError, CredentialNotFoundError, StorageError, ValidationError
)
from api.dependencies import (
    get_auth_provider, get_session_token, get_auth_config
)
from core.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/providers", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED)
async def store_provider_credentials(
    credential_data: CredentialStore,
    session_token: str = Depends(get_session_token),
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """
    Store credentials for a provider.
    
    Args:
        credential_data: The credentials to store
        session_token: Session token from Authorization header
        auth_provider: Auth provider instance
        
    Returns:
        CredentialResponse: Response with success status
    """
    try:
        await auth_provider.store_credentials(
            session_token, 
            credential_data.provider_id, 
            {
                "provider_type": credential_data.provider_type,
                **credential_data.credentials
            }
        )
        
        return CredentialResponse(
            success=True,
            data={"provider_id": credential_data.provider_id},
            metadata={"timestamp": "N/A"}
        )
        
    except AuthorizationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except StorageError as e:
        logger.error(f"Failed to store credentials: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store credentials"
        )
    except Exception as e:
        logger.error(f"Unexpected error storing credentials: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )


@router.get("/providers/{provider_id}", response_model=CredentialResponse)
async def get_provider_credentials(
    provider_id: str,
    session_token: str = Depends(get_session_token),
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """
    Get credentials for a provider.
    
    Args:
        provider_id: ID of the provider
        session_token: Session token from Authorization header
        auth_provider: Auth provider instance
        
    Returns:
        CredentialResponse: Response with credential data
    """
    try:
        credentials = await auth_provider.get_credentials(session_token, provider_id)
        
        # Filter out metadata and sensitive information
        metadata = credentials.pop("_metadata", {})
        provider_type = credentials.pop("provider_type", "unknown")
        
        # Return filtered credential data
        return CredentialResponse(
            success=True,
            data={
                "provider_id": provider_id,
                "provider_type": provider_type,
                "metadata": metadata,
                "credential_keys": list(credentials.keys())
            },
            metadata={"timestamp": "N/A"}
        )
        
    except AuthorizationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
    except CredentialNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credentials for provider '{provider_id}' not found"
        )
    except Exception as e:
        logger.error(f"Error retrieving credentials: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve credentials"
        )


@router.delete("/providers/{provider_id}", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def remove_provider_credentials(
    provider_id: str,
    session_token: str = Depends(get_session_token),
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """
    Remove credentials for a provider.
    
    Args:
        provider_id: ID of the provider
        session_token: Session token from Authorization header
        auth_provider: Auth provider instance
        
    Returns:
        APIResponse: Response with success status
    """
    try:
        await auth_provider.remove_credentials(session_token, provider_id)
        
        return APIResponse(
            success=True,
            metadata={"timestamp": "N/A"}
        )
        
    except AuthorizationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
    except CredentialNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credentials for provider '{provider_id}' not found"
        )
    except Exception as e:
        logger.error(f"Error removing credentials: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove credentials"
        )


@router.get("/providers", response_model=ProvidersListResponse)
async def list_providers(
    session_token: str = Depends(get_session_token),
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """
    List all providers with stored credentials.
    
    Args:
        session_token: Session token from Authorization header
        auth_provider: Auth provider instance
        
    Returns:
        ProvidersListResponse: Response with provider information
    """
    try:
        providers = await auth_provider.list_providers(session_token)
        
        # Convert to response model format
        providers_info = {}
        for provider_id, metadata in providers.items():
            provider_type = metadata.pop("provider_type", None)
            providers_info[provider_id] = {
                "provider_id": provider_id,
                "provider_type": provider_type,
                **metadata
            }
        
        return ProvidersListResponse(
            success=True,
            data=providers_info,
            metadata={"timestamp": "N/A"}
        )
        
    except AuthorizationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
    except Exception as e:
        logger.error(f"Error listing providers: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list providers"
        )


@router.get("/provider-types", response_model=ProviderTypesResponse)
async def list_provider_types(
    config = Depends(get_auth_config)
):
    """
    List all available provider types.
    
    Args:
        config: Auth provider configuration
        
    Returns:
        ProviderTypesResponse: Response with provider types
    """
    try:
        provider_types = config.get_available_provider_types()
        
        return ProviderTypesResponse(
            success=True,
            data=provider_types,
            metadata={"timestamp": "N/A"}
        )
        
    except Exception as e:
        logger.error(f"Error listing provider types: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list provider types"
        )


@router.post("/validate", response_model=APIResponse)
async def validate_auth_token(
    session_auth: SessionAuth,
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """
    Validate a session token.
    
    Args:
        session_auth: Session authentication data
        auth_provider: Auth provider instance
        
    Returns:
        APIResponse: Response with validation result
    """
    try:
        valid = await auth_provider.validate_session(session_auth.session_token)
        
        return APIResponse(
            success=valid,
            metadata={"timestamp": "N/A"}
        )
        
    except Exception as e:
        logger.error(f"Error validating session: {str(e)}", exc_info=True)
        return APIResponse(
            success=False,
            error={
                "error_code": "VALIDATION_ERROR",
                "message": "Session validation failed",
                "details": {"error": str(e)}
            },
            metadata={"timestamp": "N/A"}
        )