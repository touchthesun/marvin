class LLMProviderError(Exception):
    """Base exception class for all LLM provider errors"""
    pass

class ProviderConfigError(LLMProviderError):
    """Errors related to provider configuration"""
    pass

class ProviderConnectionError(LLMProviderError):
    """Errors related to provider connectivity"""
    pass

class ProviderValidationError(LLMProviderError):
    """Errors related to provider validation"""
    pass

class ModelNotFoundError(LLMProviderError):
    """Error when a requested model is not available"""
    pass

class ProviderNotInitializedError(LLMProviderError):
    """Error when trying to use a provider that hasn't been initialized"""
    pass

class ProviderAPIError(LLMProviderError):
    """Errors returned from the provider's API"""
    def __init__(self, message: str, status_code: int = None, response: str = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response

class ProviderTimeoutError(LLMProviderError):
    """Errors related to provider timeouts"""
    pass