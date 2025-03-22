import aiohttp
import asyncio
import json
from typing import Dict, Any, List, AsyncGenerator, Optional

from core.utils.logger import get_logger
from test_harness.services.base_llm_service import LLMServiceInterface

class RealLLMService(LLMServiceInterface):
    """
    Real LLM service that connects to the actual API endpoints.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize with configuration.
        
        Args:
            config: Service configuration
        """
        self.config = config
        self.logger = get_logger("test.llm.real")
        self.base_url = config.get("api_base_url", "http://localhost:8000")
        self.api_key = config.get("api_key", "test-api-key")
        self.session = None
        self.default_provider = config.get("default_provider", "anthropic")
        self.default_model = config.get("default_model", "claude-3-haiku-20240307")
        
    async def initialize(self) -> 'RealLLMService':
        """Initialize the service and create HTTP session."""
        self.logger.info("Initializing real LLM service")
        self.session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        
        # Test connection to API
        try:
            providers = await self.list_providers()
            self.logger.info(f"Connected to API with {len(providers)} providers available")
        except Exception as e:
            self.logger.error(f"Failed to connect to API: {str(e)}")
            # Continue anyway, as the API might start later
        
        return self
    
    async def shutdown(self) -> None:
        """Clean up resources."""
        self.logger.info("Shutting down real LLM service")
        if self.session:
            await self.session.close()
    
    async def list_providers(self) -> List[Dict[str, Any]]:
        """List available LLM providers."""
        if not self.session:
            raise RuntimeError("Service not initialized")
            
        async with self.session.get(f"{self.base_url}/api/llm/providers") as response:
            data = await response.json()
            if not data.get("success", False):
                self.logger.error(f"Error listing providers: {data.get('error')}")
                return []
            return data.get("data", {}).get("providers", [])
    
    async def list_models(self, provider_id: str) -> List[Dict[str, Any]]:
        """List available models for a provider."""
        if not self.session:
            raise RuntimeError("Service not initialized")
            
        request_data = {"provider_id": provider_id}
        async with self.session.post(
            f"{self.base_url}/api/llm/models", 
            json=request_data
        ) as response:
            data = await response.json()
            if not data.get("success", False):
                self.logger.error(f"Error listing models: {data.get('error')}")
                return []
            return data.get("data", {}).get("models", [])
    
    async def generate(self, 
                      provider_id: str = None,
                      model_id: str = None,
                      prompt: str = "",
                      system_prompt: Optional[str] = None,
                      temperature: float = 0.7,
                      max_tokens: int = 1000,
                      stream: bool = False,
                      **kwargs) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate text from the LLM."""
        if not self.session:
            raise RuntimeError("Service not initialized")
        
        # Use defaults if not specified
        provider_id = provider_id or self.default_provider
        model_id = model_id or self.default_model
        
        request_data = {
            "provider_id": provider_id,
            "model_id": model_id,
            "prompt": prompt,
            "system_prompt": system_prompt,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "additional_params": kwargs
        }
        
        if not stream:
            # Non-streaming request
            async with self.session.post(
                f"{self.base_url}/api/llm/generate", 
                json=request_data
            ) as response:
                data = await response.json()
                if not data.get("success", False):
                    self.logger.error(f"Error generating text: {data.get('error')}")
                    yield {"error": data.get("error")}
                else:
                    yield data.get("data", {})
        else:
            # Streaming request
            async with self.session.post(
                f"{self.base_url}/api/llm/generate", 
                json=request_data,
                headers={"Accept": "text/event-stream"}
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"Error in streaming request: {error_text}")
                    yield {"error": error_text}
                else:
                    # Process server-sent events
                    buffer = ""
                    async for chunk in response.content:
                        buffer += chunk.decode('utf-8')
                        if buffer.endswith('\n\n'):
                            for line in buffer.split('\n\n'):
                                if line.startswith('data: '):
                                    try:
                                        event_data = json.loads(line[6:])
                                        yield event_data
                                    except json.JSONDecodeError:
                                        self.logger.error(f"Invalid JSON in SSE: {line[6:]}")
                            buffer = ""
    
    async def create_agent_task(self,
                               query: str,
                               task_type: str = "query",
                               relevant_urls: Optional[List[str]] = None,
                               provider_id: Optional[str] = None,
                               model_id: Optional[str] = None,
                               **kwargs) -> Dict[str, Any]:
        """Create an agent task."""
        if not self.session:
            raise RuntimeError("Service not initialized")
            
        request_data = {
            "query": query,
            "task_type": task_type,
            "relevant_urls": relevant_urls or [],
            "provider_id": provider_id,
            "model_id": model_id,
            **kwargs
        }
        
        async with self.session.post(
            f"{self.base_url}/api/agent/query", 
            json=request_data
        ) as response:
            data = await response.json()
            if not data.get("success", False):
                self.logger.error(f"Error creating agent task: {data.get('error')}")
            return data
    
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of an agent task."""
        if not self.session:
            raise RuntimeError("Service not initialized")
            
        async with self.session.get(
            f"{self.base_url}/api/agent/status/{task_id}"
        ) as response:
            data = await response.json()
            if not data.get("success", False):
                self.logger.error(f"Error getting task status: {data.get('error')}")
            return data
