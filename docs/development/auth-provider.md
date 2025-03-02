# Auth Provider Implementation Guide

This guide covers the implementation details of the Auth Provider system, focusing on its architecture, components, and integration patterns.

## System Architecture

The Auth Provider system follows a layered architecture:

```
┌─────────────────┐
│  API Layer      │
│  - Routes       │
│  - Models       │
│  - Dependencies │
└────────┬────────┘
         │
┌────────▼────────┐
│  Interface Layer│
│  - Auth Provider│
│    Interface    │
└────────┬────────┘
         │
┌────────▼────────┐
│Implementation   │
│Layer            │
│  - LocalAuth    │
│    Provider     │
└────────┬────────┘
         │
┌────────▼────────┐
│  Storage Layer  │
│  - SecureStorage│
└─────────────────┘
```

### Key Components

1. **AuthProviderInterface**: Abstract base class defining the contract
2. **LocalAuthProvider**: Concrete implementation for local storage
3. **SecureStorage**: Handles credential encryption and storage
4. **API Endpoints**: FastAPI routes for credential management
5. **Dependencies**: FastAPI dependencies for authentication

## Directory Structure

```
core/infrastructure/auth/
├── config.py                  # Provider configuration and factory
├── errors.py                  # Error definitions
├── storage.py                 # Secure storage implementation
└── providers/
    ├── __init__.py            # Package exports
    ├── base.py                # AuthProviderInterface
    └── local_provider.py      # LocalAuthProvider implementation

api/
├── routes/
│   └── auth.py                # API endpoints
├── models/
│   └── auth/
│       ├── __init__.py        # Package exports
│       ├── request.py         # Request models
│       └── response.py        # Response models
└── dependencies/
    └── auth_dependencies.py   # FastAPI dependencies
```

## Implementation Details

### Auth Provider Interface

The `AuthProviderInterface` defines the contract for credential management:

```python
class AuthProviderInterface(ABC):
    @abstractmethod
    async def validate_session(self, session_token: str) -> bool: ...
    
    @abstractmethod
    async def get_credentials(self, session_token: str, provider_id: str) -> Dict[str, Any]: ...
    
    @abstractmethod
    async def store_credentials(self, session_token: str, provider_id: str, credentials: Dict[str, Any]) -> None: ...
    
    @abstractmethod
    async def remove_credentials(self, session_token: str, provider_id: str) -> None: ...
    
    @abstractmethod
    async def list_providers(self, session_token: str) -> Dict[str, Dict[str, Any]]: ...
```

### Local Auth Provider

The `LocalAuthProvider` implements the interface using file-based storage:

```python
class LocalAuthProvider(AuthProviderInterface):
    def __init__(
        self, 
        storage_path: str,
        session_expiry_seconds: int = 3600,
        admin_token: Optional[str] = None
    ):
        self.secure_storage = SecureStorage(storage_path)
        self.session_expiry_seconds = session_expiry_seconds
        self.admin_token = admin_token or os.environ.get("ADMIN_TOKEN")
        self.active_sessions: Dict[str, float] = {}
```

Key features:
- Manages session expiration
- Supports admin token for initial access
- Uses `SecureStorage` for credential storage
- Tracks active sessions

### Secure Storage

The `SecureStorage` class handles encryption and persistence:

```python
class SecureStorage:
    def __init__(self, storage_path: str, master_key_env_var: str = "SECRET_KEY"):
        self.storage_path = Path(storage_path)
        self.master_key_env_var = master_key_env_var
        self._ensure_storage_path()
        self._initialize_encryption()
```

Key features:
- Uses Fernet symmetric encryption
- Derives encryption key from master key
- Stores encrypted credentials in files
- Includes metadata with credentials

### Provider Configuration

The `AuthProviderConfig` manages provider registration and instantiation:

```python
class AuthProviderConfig:
    _provider_registry: Dict[str, Type[AuthProviderInterface]] = {
        "local": LocalAuthProvider,
        # Add more provider implementations here
    }
    
    def __init__(self, config_dir: str):
        self.config_dir = Path(config_dir)
        self._ensure_config_dir()
        self._provider_instances: Dict[str, AuthProviderInterface] = {}
```

Key features:
- Registry of provider implementations
- Factory pattern for provider creation
- Configuration directory management
- Provider instance caching

## FastAPI Integration

### API Routes

The API routes are defined in `api/routes/auth.py`:

```python
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/providers", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED)
async def store_provider_credentials(...): ...

@router.get("/providers", response_model=ProvidersListResponse)
async def list_providers(...): ...

# Additional routes...
```

### Dependencies

FastAPI dependencies handle authentication and provider access:

```python
def get_auth_config() -> AuthProviderConfig: ...

def get_auth_provider(
    provider_type: str = "local",
    config: AuthProviderConfig = Depends(get_auth_config)
) -> AuthProviderInterface: ...

def get_session_token(
    authorization: Optional[str] = Header(None)
) -> str: ...
```

### Request/Response Models

Request models include validation rules:

```python
class CredentialStore(BaseModel):
    provider_id: str = Field(..., description="Unique identifier for the LLM provider")
    provider_type: str = Field(..., description="Type of provider")
    credentials: Dict[str, Any] = Field(..., description="Provider-specific credentials")
    
    @validator('credentials')
    def validate_credentials(cls, v):
        if not v:
            raise ValueError("Credentials cannot be empty")
        return v
```

Response models follow a standard format:

```python
class CredentialResponse(APIResponse):
    data: Optional[Dict[str, Any]] = Field(None, description="Credential data")
```

## Security Considerations

### Encryption

Credentials are encrypted using Fernet symmetric encryption:

```python
# Derive key from master key
kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=salt,
    iterations=100000,
)

key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
self.cipher = Fernet(key)
```

### Authentication

Authentication uses a Bearer token scheme:

```python
async def validate_session(self, session_token: str) -> bool:
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
```

## Extension Points

### Adding New Provider Types

To add a new provider type, register it in the `AuthProviderConfig`:

```python
_provider_registry: Dict[str, Type[AuthProviderInterface]] = {
    "local": LocalAuthProvider,
    "cloud": CloudAuthProvider,  # New provider type
}
```

### Custom Storage Backends

To support different storage backends:

1. Create a new provider implementation:
   ```python
   class CloudAuthProvider(AuthProviderInterface):
       def __init__(self, storage_path: str):
           self.storage = CloudStorage(storage_path)
   ```

2. Implement the required methods

## Configuration Requirements

### Environment Variables

The system requires these environment variables:

```
SECRET_KEY=your-secure-encryption-key
ADMIN_TOKEN=your-admin-token
```

### Directory Structure

Create the necessary directories:

```bash
mkdir -p config/auth
```

## Error Handling

The system uses specialized exceptions:

```python
class AuthProviderError(Exception): ...
class AuthorizationError(AuthProviderError): ...
class CredentialNotFoundError(AuthProviderError): ...
class StorageError(AuthProviderError): ...
class EncryptionError(StorageError): ...
class ValidationError(AuthProviderError): ...
class ConfigurationError(AuthProviderError): ...
```

API endpoints translate these exceptions to HTTP responses:

```python
try:
    # Operation
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
```

## Testing

### Unit Tests

Key unit tests for the Auth Provider system:

```python
async def test_admin_token_validation(auth_provider):
    """Test validation with admin token."""
    admin_token = os.environ["ADMIN_TOKEN"]
    assert await auth_provider.validate_session(admin_token) is True
    
async def test_credential_operations(auth_provider):
    """Test credential storage, retrieval, and removal."""
    # Test implementation
```

### Integration Tests

Test the complete credential lifecycle:

```bash
# Store credentials
curl -X POST http://localhost:8000/api/v1/auth/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "provider_id": "test-provider",
    "provider_type": "anthropic",
    "credentials": {
      "api_key": "test-api-key"
    }
  }'

# List providers
curl -X GET http://localhost:8000/api/v1/auth/providers \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Remove provider
curl -X DELETE http://localhost:8000/api/v1/auth/providers/test-provider \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```