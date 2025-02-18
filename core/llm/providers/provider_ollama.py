import aiohttp
import asyncio
import json
from typing import Optional, Dict, Any, AsyncIterator
from datetime import datetime
import logging

from .base import BaseLLMProvider
from .models import (
    ProviderConfig,
    QueryRequest,
    QueryResponse,
    TokenUsage,
    ProviderStatus,
    ModelCapability
)

logger = logging.getLogger(__name__)

class OllamaProvider(BaseLLMProvider):
    """Ollama-specific LLM provider implementation"""
    
    DEFAULT_BASE_URL = "http://localhost:11434"
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.base_url = config.auth_config.get('base_url', self.DEFAULT_BASE_URL)
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def initialize(self) -> None:
        """Initialize the Ollama provider"""
        try:
            self.session = aiohttp.ClientSession(
                base_url=self.base_url,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds)
            )
            
            # Verify connection and model availability
            async with self.session.get("/api/tags") as response:
                if response.status != 200:
                    raise ConnectionError(f"Failed to connect to Ollama: {response.status}")
                
                models = await response.json()
                if not any(model['name'] == self.config.model_name for model in models['models']):
                    # Model not available, try to pull it
                    await self._pull_model()
            
            self._status = ProviderStatus.READY
            logger.info(f"Successfully initialized Ollama provider for model {self.config.model_name}")
            
        except Exception as e:
            self._status = ProviderStatus.ERROR
            self._last_error = str(e)
            logger.error(f"Failed to initialize Ollama provider: {str(e)}")
            raise
    
    async def shutdown(self) -> None:
        """Cleanup Ollama provider resources"""
        if self.session:
            await self.session.close()
        self._status = ProviderStatus.DISABLED
    
    async def _pull_model(self) -> None:
        """Pull the specified model if not already available"""
        if not self.session:
            raise RuntimeError("Provider not initialized")
            
        try:
            async with self.session.post(
                "/api/pull",
                json={"name": self.config.model_name}
            ) as response:
                if response.status != 200:
                    raise ValueError(f"Failed to pull model: {response.status}")
                
                # Stream the pull progress
                async for line in response.content:
                    progress = json.loads(line)
                    logger.debug(f"Pull progress: {progress}")
                    
        except Exception as e:
            raise RuntimeError(f"Failed to pull model {self.config.model_name}: {str(e)}")
    
    async def query(self, request: QueryRequest) -> QueryResponse:
        """Execute a query against the Ollama model"""
        if not self.session:
            raise RuntimeError("Provider not initialized")
            
        start_time = datetime.utcnow()
        
        try:
            # Determine endpoint based on capabilities
            endpoint = "/api/chat" if ModelCapability.CHAT in self.config.capabilities else "/api/generate"
            
            payload = {
                "model": self.config.model_name,
                "prompt": request.prompt,
                "stream": request.stream,
                "options": {
                    "temperature": request.temperature,
                }
            }
            
            if request.max_tokens:
                payload["options"]["num_predict"] = request.max_tokens
                
            if request.stop_sequences:
                payload["options"]["stop"] = request.stop_sequences
            
            async with self.session.post(endpoint, json=payload) as response:
                if response.status != 200:
                    raise RuntimeError(f"Query failed with status {response.status}")
                
                if request.stream:
                    # Handle streaming response
                    full_response = await self._handle_streaming_response(response)
                else:
                    # Handle regular response
                    full_response = await response.json()
                
            end_time = datetime.utcnow()
            latency_ms = (end_time - start_time).total_seconds() * 1000
            
            # Construct token usage (Ollama doesn't provide token counts directly)
            # We'll estimate based on response length
            estimated_tokens = len(full_response['response']) // 4
            token_usage = TokenUsage(
                prompt_tokens=len(request.prompt) // 4,
                completion_tokens=estimated_tokens,
                total_tokens=(len(request.prompt) + len(full_response['response'])) // 4
            )
            
            response = QueryResponse(
                query_id=request.query_id,
                provider_type=self.config.provider_type,
                model_name=self.config.model_name,
                content=full_response['response'],
                created_at=start_time,
                completed_at=end_time,
                latency_ms=latency_ms,
                token_usage=token_usage
            )
            
            # Update metrics
            self._update_metrics(
                success=True,
                latency_ms=latency_ms,
                tokens=token_usage.total_tokens
            )
            
            return response
            
        except Exception as e:
            end_time = datetime.utcnow()
            latency_ms = (end_time - start_time).total_seconds() * 1000
            self._update_metrics(success=False, latency_ms=latency_ms, tokens=0)
            self._last_error = str(e)
            raise
    
    async def _handle_streaming_response(self, response: aiohttp.ClientResponse) -> Dict[str, Any]:
        """Handle streaming response from Ollama"""
        full_response = {"response": ""}
        
        async for line in response.content:
            chunk = json.loads(line)
            if "error" in chunk:
                raise RuntimeError(f"Streaming error: {chunk['error']}")
            full_response["response"] += chunk.get("response", "")
            
            if chunk.get("done", False):
                # Final chunk includes additional metadata
                full_response.update({
                    k: v for k, v in chunk.items()
                    if k not in ["response", "done"]
                })
                break
                
        return full_response