import traceback
import os
import time
import glob

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from api.models.common import APIResponse
from api.models.auth.request import CredentialStore, SessionAuth
from api.models.auth.response import (
    CredentialResponse, ProvidersListResponse, ProviderTypesResponse
)
from api.dependencies import (
    get_auth_provider, get_session_token, get_auth_config
)
from core.infrastructure.auth.storage import SecureStorage
from core.infrastructure.auth.config import get_auth_provider_config
from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.auth.errors import (
    AuthorizationError, CredentialNotFoundError, StorageError, ValidationError
)
from core.utils.config import load_config
from core.utils.logger import get_logger

logger = get_logger(__name__)
config = load_config()

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

    # Debug logging
    logger.debug(f"Auth endpoint accessed with token: '{session_token[:5]}...'")
    logger.debug(f"Auth provider type: {type(auth_provider).__name__}")
    try:
        providers = await auth_provider.list_providers(session_token)
        logger.debug(f"Providers found: {len(providers)}")
        
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
    

@router.get("/diagnostic", response_model=None)
async def diagnostic():
    """Diagnostic endpoint to check critical configurations"""

    
    try:
        # Load config explicitly
        config = load_config()
        
        # Check environment variables
        env_vars = {
            "admin_token": bool(config.get("admin_token")),
            "secret_key": bool(config.get("secret_key")),
            "Path exists": os.path.exists(config.get("STORAGE_PATH", "./storage")),
        }
        
        try:
            auth_config = get_auth_provider_config(config.get("config_dir", "./config"))
            auth_config_info = {
                "Available provider types": list(auth_config.get_available_provider_types().keys())
            }
        except Exception as e:
            auth_config_info = {"error": str(e)}
        
        # Try to instantiate a provider
        provider_info = {}
        try:
            provider = auth_config.get_provider("local")
            provider_info = {
                "Provider type": type(provider).__name__,
                "Storage path exists": os.path.exists(auth_config.get_storage_path("local"))
            }
        except Exception as e:
            provider_info = {"error": str(e)}
            
        return {
            "environment": env_vars,
            "auth_config": auth_config_info,
            "provider": provider_info,
            "config_values": {
                "admin_token_prefix": config.get("admin_token", "")[:5] + "..." if config.get("admin_token") else None,
                "secret_key_prefix": config.get("secret_key", "")[:5] + "..." if config.get("secret_key") else None,
            }
        }
    except Exception as e:
        return {"error": str(e), "traceback": str(traceback.format_exc())}
    

@router.get("/storage-diagnostic")
async def storage_diagnostic():
    """Diagnostic endpoint to check storage configuration and contents"""

    
    try:
        # Get storage path
        config_dir = config.get("config_dir", "./config")
        
        # Directory info
        directory_exists = os.path.exists(config_dir)
        directory_contents = glob.glob(f"{config_dir}/*") if directory_exists else []
        
        # Check environment variables
        env_vars = {
            "config_dir": config.get("config_dir"),
            "secret_key": bool(config.get("secret_key")),
            "admin_token": bool(config.get("admin_token")),
        }
        
        # Try to initialize storage
        storage_error = None
        try:
            storage = SecureStorage(config_dir)
            storage_initialized = True
        except Exception as e:
            storage_error = str(e)
            storage_initialized = False
        
        # Try to list providers
        providers_list = None
        try:
            if storage_initialized:
                providers_list = storage.list_providers()
        except Exception as e:
            providers_list = f"Error: {str(e)}"
        
        # Check for .enc files
        enc_files = [f for f in directory_contents if f.endswith(".enc")]
        
        return {
            "directory": {
                "path": config_dir,
                "exists": directory_exists,
                "contents": directory_contents,
                "enc_files": enc_files
            },
            "environment": env_vars,
            "storage": {
                "initialized": storage_initialized,
                "error": storage_error,
                "providers_list": providers_list
            }
        }
    except Exception as e:
        return {"error": str(e)}
    

@router.get("/debug-headers")
async def debug_headers(request: Request):
    """Debug incoming request headers"""
    headers = dict(request.headers)
    
    # Check specifically for auth header in various forms
    auth_header = headers.get("authorization")
    auth_header_cap = headers.get("Authorization")
    
    logger.debug(f"Headers: {headers}")
    
    return {
        "all_headers": headers,
        "auth_lowercase": auth_header,
        "auth_capitalized": auth_header_cap,
        "header_keys": list(headers.keys())
    }

@router.get("/providers-direct-auth")
async def list_providers_direct(
    token: str = Query(..., description="Admin token"),
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
):
    """List providers with direct authentication"""
    try:
        # Validate token directly
        if token != config.get("admin_token"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        # List providers
        providers = await auth_provider.list_providers(token)
        
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
    except Exception as e:
        logger.error(f"Error in direct auth: {str(e)}", exc_info=True)
        return ProvidersListResponse(
            success=False,
            error={
                "error_code": "DIRECT_AUTH_ERROR",
                "message": str(e)
            },
            metadata={"timestamp": "N/A"}
        )
    
@router.post("/direct-storage-test")
async def direct_storage_test():
    """Test SecureStorage directly"""

    
    try:
        # Get storage path
        config_dir = config.get("config_dir", "./config")
        
        # Create storage instance with your existing class
        storage = SecureStorage(config_dir)
        
        # Create test credentials
        test_id = f"test-{int(time.time())}"
        test_data = {
            "provider_type": "test",
            "test_key": "test_value",
            "_metadata": {
                "created_at": time.time(),
                "updated_at": time.time()
            }
        }
        
        # Log what we're about to do
        logger.debug(f"Attempting to store test credentials with ID: {test_id}")
        logger.debug(f"Storage path: {config_dir}")
        
        # Store it
        storage.store(test_id, test_data)
        logger.debug("Storage successful")
        
        # Try to retrieve it
        retrieved = storage.retrieve(test_id)
        logger.debug(f"Retrieved data successfully: {retrieved is not None}")
        
        # List all providers
        all_providers = storage.list_providers()
        logger.debug(f"Found {len(all_providers)} providers")
        
        return {
            "success": True,
            "test_id": test_id,
            "stored_data": test_data,
            "retrieved": retrieved,
            "all_providers": all_providers
        }
    except Exception as e:
        logger.error(f"Direct storage test failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }
    
@router.post("/add-anthropic-direct")
async def add_anthropic_direct(
    api_key: str = Query(..., description="Anthropic API Key"),
    provider_id: str = Query("anthropic", description="Provider ID")
):
    """Add Anthropic credentials directly using SecureStorage"""
    from core.infrastructure.auth.storage import SecureStorage
    
    try:
        # Get storage path
        config_dir = config.get("config_dir", "./config")
        
        # Create storage instance
        storage = SecureStorage(config_dir)
        
        # Validate API key format
        if not api_key.startswith("sk-ant-"):
            return {
                "success": False,
                "error": "Invalid Anthropic API key format (should start with 'sk-ant-')"
            }
        
        # Create credentials
        credentials = {
            "provider_type": "anthropic",
            "api_key": api_key,
            "api_base": "https://api.anthropic.com/v1",
            "_metadata": {
                "created_at": time.time(),
                "updated_at": time.time()
            }
        }
        
        # Store credentials
        storage.store(provider_id, credentials)
        
        # Try to retrieve to confirm
        retrieved = storage.retrieve(provider_id)
        
        # List all providers
        all_providers = storage.list_providers()
        
        return {
            "success": True,
            "message": f"Anthropic credentials stored with ID: {provider_id}",
            "providers": all_providers
        }
    except Exception as e:
        logger.error(f"Failed to add Anthropic credentials: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }
    

@router.get("/get-anthropic-direct/{provider_id}")
async def get_anthropic_direct(
    provider_id: str = "anthropic"
):
    """Get Anthropic credentials directly using SecureStorage"""
    from core.infrastructure.auth.storage import SecureStorage
    
    try:
        # Get storage path
        config_dir = config.get("config_dir", "./config")
        
        # Create storage instance
        storage = SecureStorage(config_dir)
        
        # Try to retrieve
        try:
            credentials = storage.retrieve(provider_id)
            
            # Mask sensitive data
            if "api_key" in credentials:
                api_key = credentials["api_key"]
                credentials["api_key"] = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***masked***"
            
            return {
                "success": True,
                "provider_id": provider_id,
                "credentials": credentials
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to retrieve credentials: {str(e)}",
                "error_type": type(e).__name__
            }
    except Exception as e:
        logger.error(f"Error in get_anthropic_direct: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }