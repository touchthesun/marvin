from abc import ABC, abstractmethod
from typing import Dict, Any, List, AsyncGenerator, Optional

class LLMServiceInterface(ABC):
    """Interface for LLM services in the test harness."""
    
    @abstractmethod
    async def initialize(self) -> 'LLMServiceInterface':
        """Initialize the service and return self."""
        pass
        
    @abstractmethod
    async def shutdown(self) -> None:
        """Clean up resources."""
        pass
    
    @abstractmethod
    async def list_providers(self) -> List[Dict[str, Any]]:
        """List available LLM providers."""
        pass
    
    @abstractmethod
    async def list_models(self, provider_id: str) -> List[Dict[str, Any]]:
        """List available models for a provider."""
        pass
    
    @abstractmethod
    async def generate(self, 
                      provider_id: str,
                      model_id: str,
                      prompt: str,
                      system_prompt: Optional[str] = None,
                      temperature: float = 0.7,
                      max_tokens: int = 1000,
                      stream: bool = False,
                      **kwargs) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate text from the LLM."""
        pass
    
    @abstractmethod
    async def create_agent_task(self,
                               query: str,
                               task_type: str = "query",
                               relevant_urls: Optional[List[str]] = None,
                               provider_id: Optional[str] = None,
                               model_id: Optional[str] = None,
                               **kwargs) -> Dict[str, Any]:
        """Create an agent task."""
        pass
    
    @abstractmethod
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of an agent task."""
        pass
