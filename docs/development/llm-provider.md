# LLM Provider System Technical Documentation

### Overview

The LLM Provider system is a core component of Marvin that abstracts interactions with different Large Language Model providers (such as Anthropic's Claude, OpenAI's GPT, and local models via Ollama). It creates a provider-agnostic interface that allows Marvin to interact with various LLM providers through a consistent API while securely managing credentials.

This document outlines the architecture, security model, and extensibility features of the LLM Provider system.

### System Architecture

The LLM Provider system uses a layered architecture with several key components:

1. **Provider Interface** - A consistent abstraction layer defining how Marvin interacts with LLMs
2. **Provider Implementations** - Provider-specific adapters that handle API differences
3. **Provider Factory** - Dynamic creation and caching of provider instances
4. **Auth Provider** - Secure credential storage and retrieval system
5. **Request/Response Models** - Standardized data structures for LLM interactions

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Marvin Core   │     │  Marvin API    │     │  Test Harness  │
└───────┬────────┘     └───────┬────────┘     └───────┬────────┘
        │                      │                      │
        └──────────────┬───────┴──────────────┬──────┘
                       │                      │
                ┌──────▼──────┐        ┌──────▼──────┐
                │ LLM Factory │◄───────┤ Auth System │
                └──────┬──────┘        └─────────────┘
                       │
      ┌────────────────┼────────────────┐
      │                │                │
┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
│ Anthropic │    │  Ollama   │    │  Other    │
│ Provider  │    │ Provider  │    │ Providers │
└───────────┘    └───────────┘    └───────────┘
```

### Provider Interface

The `BaseLLMProvider` abstract base class defines the contract that all provider implementations must follow. This ensures a consistent interface regardless of the underlying LLM service.

```python
class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.provider_type = config.provider_type.value
        self.metrics = ProviderMetrics()
        self._status = ProviderStatus.INITIALIZING
    
    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the provider with necessary setup"""
        pass
        
    @abstractmethod
    async def generate(self, request: GenerateRequest) -> AsyncIterator[GenerateResponse]:
        """Generate text using the provider's API"""
        pass
    
    @abstractmethod
    async def list_models(self) -> List[ModelInfo]:
        """List available models from this provider"""
        pass
        
    @abstractmethod
    async def shutdown(self) -> None:
        """Clean up provider resources"""
        pass
```

### Configuration System

The `ProviderConfig` class standardizes configuration across different providers while allowing for provider-specific settings:

```python
class ProviderConfig(BaseModel):
    """Configuration for LLM providers"""
    provider_type: ProviderType
    model_name: str
    capabilities: List[ModelCapability]
    max_tokens: int = Field(gt=0)
    timeout_seconds: int = Field(ge=1, default=30)
    retry_attempts: int = Field(ge=0, default=3)
    auth_config: Dict[str, Any] = Field(default_factory=dict)
```

### Provider Factory

The `LLMProviderFactory` handles dynamic creation, caching, and lifecycle management of provider instances:

```python
class LLMProviderFactory:
    def __init__(self, config_manager: ProviderConfigManager):
        self.config_manager = config_manager
        self._providers: Dict[str, BaseLLMProvider] = {}
        self._provider_registry: Dict[str, Type[BaseLLMProvider]] = {}
        
    def register_provider(self, provider_type: ProviderType, 
                         provider_class: Type[BaseLLMProvider]) -> None:
        """Register a provider implementation"""
        self._provider_registry[provider_type.value] = provider_class
        
    async def get_provider(self, provider_type: ProviderType, model_name: str) -> BaseLLMProvider:
        """Get or create a provider by type and model"""
        # Normalize provider_type to ensure consistent handling
        if isinstance(provider_type, str):
            provider_type = ProviderType(provider_type.upper())
            
        provider_id = f"{provider_type.value}_{model_name}"
        
        # Return cached provider if available
        if provider_id in self._providers:
            return self._providers[provider_id]
            
        # Create provider config
        config = ProviderConfig(
            provider_type=provider_type,
            model_name=model_name,
            capabilities=self._get_default_capabilities(provider_type),
            timeout_seconds=60,
            max_tokens=4096,
        )
        
        # Create and initialize provider
        provider_class = self._provider_registry[provider_type.value]
        provider = provider_class(config)
        await provider.initialize()
        
        # Cache the provider
        self._providers[provider_id] = provider
        return provider
```

### Provider Context Management

The factory provides a context manager for temporary provider usage:

```python
@asynccontextmanager
async def get_provider_context(self, provider_type: str, model_name: str):
    """Context manager for provider access"""
    try:
        # Handle case sensitivity
        if isinstance(provider_type, str):
            provider_type_lower = provider_type.lower()
            
            if provider_type_lower == "anthropic":
                provider_enum = ProviderType.ANTHROPIC
            elif provider_type_lower == "ollama":
                provider_enum = ProviderType.OLLAMA
            else:
                raise ValueError(f"Unsupported provider type: {provider_type}")
        else:
            provider_enum = provider_type
                
        provider = await self.get_provider(provider_enum, model_name)
        yield provider
    finally:
        # Provider remains in cache for reuse
        pass
```

### Secure Credential Management

The LLM Provider system works with the Auth Provider to securely manage credentials:

1. Credentials are stored in encrypted format at rest
2. A single source of truth in the .env file provides API keys
3. The Auth Provider retrieves credentials when needed
4. No credentials are stored in code or configuration files

### Auth Provider Integration

LLM providers retrieve credentials from the Auth Provider system:

```python
class AnthropicProvider(BaseLLMProvider):
    """Provider implementation for Anthropic's Claude models."""
    
    async def initialize(self) -> None:
        """Initialize the Anthropic provider."""
        try:
            # Get provider ID from config if available
            provider_id = "anthropic"  # Default provider ID
            
            # Get credentials from storage
            credentials = await self.auth_provider.get_credentials(
                "dev-token",  # For development AuthProvider
                provider_id
            )
            
            # Extract API key
            self.api_key = credentials.get("api_key")
            if not self.api_key:
                raise ProviderConfigError("Missing API key")
                
            self.api_base = credentials.get("api_base", "https://api.anthropic.com/v1")
            
            # Create HTTP session
            self.session = aiohttp.ClientSession(
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            )
            
            # Update provider status
            self._status = ProviderStatus.READY
            
        except Exception as e:
            self._status = ProviderStatus.ERROR
            self._last_error = str(e)
            raise
```

### Auth Storage System

The Secure Storage system provides encrypted credential storage:

```python
class SecureStorage:
    """Secure storage for credentials using encryption."""
    
    def __init__(self, storage_path: str, master_key_env_var: str = "SECRET_KEY"): 
        self.storage_path = Path(storage_path)
        self.master_key_env_var = master_key_env_var
        
        # Initialize encryption
        self._initialize_encryption()
    
    def store(self, provider_id: str, credentials: Dict[str, Any]) -> None:
        """Encrypt and store credentials for a provider."""
        # Convert credentials to JSON string
        cred_json = json.dumps(credentials)
        
        # Encrypt the credentials
        encrypted_data = self.cipher.encrypt(cred_json.encode())
        
        # Write to file
        file_path = self._get_provider_file_path(provider_id)
        with open(file_path, 'wb') as f:
            f.write(encrypted_data)
    
    def retrieve(self, provider_id: str) -> Dict[str, Any]:
        """Retrieve and decrypt credentials for a provider."""
        file_path = self._get_provider_file_path(provider_id)
        
        if not file_path.exists():
            raise CredentialNotFoundError(provider_id)
        
        # Read encrypted data
        with open(file_path, 'rb') as f:
            encrypted_data = f.read()
        
        # Decrypt the data
        decrypted_data = self.cipher.decrypt(encrypted_data)
        
        # Parse JSON
        return json.loads(decrypted_data.decode())
```

### Request/Response Models

The system uses standardized models for requests and responses:

```python
class GenerationRequest:
    """Generic request model for text generation"""
    provider_id: str
    model_id: str
    prompt: str
    system_prompt: Optional[str] = None
    max_tokens: int = 1000
    temperature: float = 0.7
    stream: bool = False
    additional_params: Dict[str, Any] = Field(default_factory=dict)

class GenerateResponse:
    """Generic response model for text generation"""
    response: str
    model: str
    created_at: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    done: bool = False
```

### Extension for New Providers

To add support for a new LLM provider:

1. Create a new provider class implementing the `BaseLLMProvider` interface
2. Register it with the factory
3. Implement provider-specific request/response conversion
4. Add appropriate credential management

Example of adding a new provider:

```python
# 1. Create provider implementation
class NewLLMProvider(BaseLLMProvider):
    """Implementation for a new LLM provider"""
    
    async def initialize(self) -> None:
        """Initialize the provider"""
        # Retrieve credentials, create session, etc.
        
    async def generate(self, request: GenerateRequest) -> AsyncIterator[GenerateResponse]:
        """Generate text using the provider's API"""
        # Convert request to provider-specific format
        # Make API call
        # Convert response to standard format
        
    async def list_models(self) -> List[ModelInfo]:
        """List available models"""
        # Implementation for this provider
        
    async def shutdown(self) -> None:
        """Clean up resources"""
        # Implementation for this provider

# 2. Register with factory
factory.register_provider(ProviderType.NEW_LLM, NewLLMProvider)

# 3. Add provider type to enum
class ProviderType(str, Enum):
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    NEW_LLM = "new_llm"
```

### Implementation in API Routes

The API layer uses the LLM provider system to handle requests:

```python
@router.post("/generate", response_model=APIResponse)
async def generate_completion(
    request: GenerationRequest = Body(...),
    app_state = Depends(get_app_state)
):
    """Generate a completion using any supported provider"""
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        # Get the appropriate provider
        async with app_state.llm_factory.get_provider_context(
            request.provider_id, request.model_id
        ) as provider:
            # Convert generic request to provider-specific request
            provider_request = await _convert_to_provider_request(
                provider.provider_type, request
            )
            
            # Handle non-streaming response
            if not request.stream:
                response_data = {}
                async for response in provider.generate(provider_request):
                    response_data = {
                        "model": response.model,
                        "response": response.response,
                        "tokens": {
                            "prompt": getattr(response, "prompt_tokens", 0),
                            "completion": getattr(response, "completion_tokens", 0),
                            "total": getattr(response, "total_tokens", 0)
                        }
                    }
                
                return {"success": True, "data": response_data}
```

### Integration Testing

The test harness verifies:

1. Proper credential handling between Auth Provider and LLM Provider
2. Correct conversion of requests and responses
3. Appropriate error handling and fallbacks
4. Provider lifecycle management

The test harness can use both real providers (with actual API keys) or mock providers for testing:

```python
async def test_llm_provider_integration():
    """Integration test for LLM provider system"""
    # Set up environment
    env_manager = TestEnvironmentManager(config)
    environment = await env_manager.setup_environment()
    
    # Configure credentials
    await env_manager._setup_anthropic_credentials(None)
    
    # Access API with queries
    api_service = environment["api"]
    
    # Test queries
    query_response = await api_service.send_request(
        "POST", 
        "/api/v1/agent/query", 
        {
            "task_type": "QUERY",
            "query": "Test query",
            "provider_id": "anthropic",
            "model_id": "claude-3-opus-20240229"
        },
        headers={"Authorization": f"Bearer {api_service.auth_token}"}
    )
    
    # Validate response
    assert query_response["success"] is True
    assert "task_id" in query_response["data"]
```

### Best Practices for Extension

When adding new providers, follow these practices:

1. **Abstract Provider-Specific Logic**: Keep provider-specific code contained within provider classes
2. **Credential Security**: Always use the Auth Provider system for credentials
3. **Consistent Error Handling**: Map provider-specific errors to system-wide error types
4. **Request/Response Validation**: Validate all requests and responses
5. **Thorough Testing**: Test with both mock and real APIs where possible

By following these patterns, the LLM Provider system can be extended to support additional providers while maintaining the security, reliability, and consistency of the original implementation.

### Conclusion

The LLM Provider system provides a flexible, secure, and extensible foundation for Marvin's interactions with various language models. By abstracting provider-specific details behind a common interface and securely managing credentials, it enables Marvin to leverage different LLM providers while maintaining a consistent development experience.

The system's architecture supports future growth through clear extension points, comprehensive testing, and secure credential management, ensuring that Marvin can adapt to the rapidly evolving landscape of language model providers.