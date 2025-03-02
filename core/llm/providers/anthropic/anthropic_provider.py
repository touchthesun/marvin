import aiohttp
import time
import asyncio
import json
import os
from typing import Dict, Any, List, AsyncIterator
from datetime import datetime

from core.llm.providers.base.provider import (QueryRequest, QueryResponse, 
    ProviderStatus, TokenUsage
)
from core.llm.providers.anthropic.models.response import GenerateResponse, ListModelsResponse, ModelInfo
from core.llm.providers.anthropic.models.request import GenerateRequest
from core.llm.providers.base.provider_base import BaseLLMProvider
from core.infrastructure.auth.providers.dev_auth_provider import DevAuthProvider
from core.llm.providers.base.config import ProviderConfig, ProviderType
from core.llm.providers.base.exceptions import (
    ProviderConfigError, ProviderConnectionError, 
    ProviderAPIError, ProviderTimeoutError, ProviderNotInitializedError
)
from core.utils.logger import get_logger

logger = get_logger(__name__)

class AnthropicProvider(BaseLLMProvider):
    """Provider implementation for Anthropic's Claude models."""
    
    def __init__(self, config: ProviderConfig):
        if config.provider_type != ProviderType.ANTHROPIC:
            raise ProviderConfigError(f"Expected ANTHROPIC provider type, got {config.provider_type}")
            
        super().__init__(config)
        self.session = None
        self.api_key = None
        self.api_base = None
        storage_path = os.environ.get("MARVIN_CONFIG_DIR", "./config")
        self.auth_provider = DevAuthProvider(storage_path)

        
    async def initialize(self) -> None:
        """Initialize the Anthropic provider."""
        try:
            # Get credentials from storage
            credentials = await self.auth_provider.get_credentials(
                "dev-token",  # Any token works with DevAuthProvider
                "anthropic-main"  # Or your chosen provider ID
            )
            
            # Extract API key
            self.api_key = credentials.get("api_key")
            if not self.api_key:
                raise ProviderConfigError("Missing API key in Anthropic configuration")
                
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
            
    async def shutdown(self) -> None:
        """Clean up provider resources."""
        if self.session and not self.session.closed:
            await self.session.close()
            
    async def generate(self, request: GenerateRequest) -> AsyncIterator[GenerateResponse]:
        """Generate text using Claude API with streaming"""
        if self._status != ProviderStatus.READY or not self.session:
            raise ProviderNotInitializedError("Provider not initialized")
            
        # Use provided model or default to the one in config
        if not request.model:
            request.model = self.config.model_name
            
        # Prepare the payload
        payload = request.to_json()
        
        start_time = time.time()
        
        try:
            url = f"{self.api_base}/messages"
            
            async with self.session.post(
                url=url,
                json=payload,
                timeout=self.config.timeout_seconds
            ) as response:
                if response.status != 200:
                    error_data = await response.text()
                    raise ProviderAPIError(
                        f"Anthropic API error: {response.status}",
                        status_code=response.status,
                        response=error_data
                    )
                
                # Process streaming response if requested
                if request.stream:
                    # Parse SSE format from Anthropic
                    async for line in response.content:
                        line = line.strip()
                        if not line or line == b'[DONE]':
                            continue
                            
                        try:
                            # Handle SSE format (data: {json})
                            if line.startswith(b'data: '):
                                line = line[6:]  # Remove the 'data: ' prefix
                            
                            chunk = json.loads(line)
                            
                            # Add model information which may not be in the chunk
                            if "model" not in chunk:
                                chunk["model"] = request.model
                                
                            # Add created_at if not in the chunk
                            if "created_at" not in chunk:
                                chunk["created_at"] = datetime.now().isoformat()
                                
                            # Determine if this is the final chunk
                            is_done = chunk.get("type") == "message_stop"
                            chunk["done"] = is_done
                            
                            # Parse the chunk into a response
                            response_obj = GenerateResponse.from_json(chunk)
                            
                            # Update metrics on final chunk
                            if is_done:
                                # Estimate token count as a rough approximation
                                tokens = len(request.prompt) // 4 + len(response_obj.response) // 4
                                
                                self._update_metrics(
                                    success=True,
                                    latency_ms=(time.time() - start_time) * 1000,
                                    tokens=tokens
                                )
                            
                            yield response_obj
                            
                        except json.JSONDecodeError:
                            continue
                else:
                    # Non-streaming response
                    data = await response.json()
                    
                    # Add done flag for consistency
                    data["done"] = True
                    
                    # Create response object
                    response_obj = GenerateResponse.from_json(data)
                    
                    # Update metrics
                    tokens = response_obj.total_tokens or (len(request.prompt) // 4 + len(response_obj.response) // 4)
                    
                    self._update_metrics(
                        success=True,
                        latency_ms=(time.time() - start_time) * 1000,
                        tokens=tokens
                    )
                    
                    yield response_obj
        
        except Exception as e:
            # Update metrics for failure
            self._update_metrics(
                success=False, 
                latency_ms=(time.time() - start_time) * 1000, 
                tokens=0
            )
            
            # Record error
            self._last_error = str(e)
            
            # Re-raise appropriate exception
            if isinstance(e, asyncio.TimeoutError):
                raise ProviderTimeoutError(f"Anthropic request timed out: {str(e)}")
            elif isinstance(e, aiohttp.ClientError):
                raise ProviderConnectionError(f"Anthropic connection error: {str(e)}")
            else:
                raise
            
    async def query(self, request: QueryRequest) -> QueryResponse:
        """Execute a query against Claude."""
        if self._status != ProviderStatus.READY:
            raise ProviderConfigError(f"Anthropic provider not ready: {self._status}")
            
        start_time = time.time()
        
        try:
            # Convert to Anthropic format
            anthropic_payload = self._prepare_anthropic_payload(request)
            
            # Send request to Anthropic
            response_data = await self._send_request(
                "messages", 
                anthropic_payload, 
                request.stream
            )
            
            # Process response
            content = self._extract_content(response_data)
            
            # Calculate token usage - this would need more precise calculation
            # but serves as an approximation
            token_usage = TokenUsage(
                prompt_tokens=len(request.prompt) // 4,  # Rough approximation
                completion_tokens=len(content) // 4,     # Rough approximation
                total_tokens=(len(request.prompt) + len(content)) // 4,
                estimated_cost=None  # Would calculate based on model rates
            )
            
            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000
            
            # Update metrics
            self._update_metrics(
                success=True,
                latency_ms=latency_ms,
                tokens=token_usage.total_tokens
            )
            
            # Create response
            return QueryResponse(
                query_id=request.query_id,
                provider_type=self.config.provider_type,
                model_name=self.config.model_name,
                content=content,
                created_at=request.created_at,
                completed_at=datetime.now(),
                latency_ms=latency_ms,
                token_usage=token_usage,
                finish_reason=response_data.get("stop_reason")
            )
            
        except Exception as e:
            # Update metrics for failure
            latency_ms = (time.time() - start_time) * 1000
            self._update_metrics(success=False, latency_ms=latency_ms, tokens=0)
            
            # Record error
            self._last_error = str(e)
            
            # Re-raise appropriate exception
            if isinstance(e, asyncio.TimeoutError):
                raise ProviderTimeoutError(f"Anthropic request timed out: {str(e)}")
            elif isinstance(e, aiohttp.ClientError):
                raise ProviderConnectionError(f"Anthropic connection error: {str(e)}")
            else:
                raise
    

    async def list_models(self) -> List[ModelInfo]:
        """List available Claude models"""
        if self._status != ProviderStatus.READY or not self.session:
            raise ProviderNotInitializedError("Provider not initialized")
            
        try:
            url = f"{self.api_base}/models"
            
            async with self.session.get(
                url=url,
                timeout=self.config.timeout_seconds
            ) as response:
                if response.status != 200:
                    error_data = await response.text()
                    raise ProviderAPIError(
                        f"Anthropic API error: {response.status}",
                        status_code=response.status,
                        response=error_data
                    )
                
                data = await response.json()
                # Parse response into structured object
                response_obj = ListModelsResponse.from_json(data)
                return response_obj.models
                
        except Exception as e:
            self._last_error = str(e)
            
            if isinstance(e, asyncio.TimeoutError):
                raise ProviderTimeoutError(f"Anthropic request timed out: {str(e)}")
            elif isinstance(e, aiohttp.ClientError):
                raise ProviderConnectionError(f"Anthropic connection error: {str(e)}")
            else:
                raise

    async def get_model_info(self, model_name: str) -> Dict[str, Any]:
        """Get detailed model information"""
        if self._status != ProviderStatus.READY or not self.session:
            raise ProviderNotInitializedError("Provider not initialized")
            
        try:
            url = f"{self.api_base}/models/{model_name}"
            
            async with self.session.get(
                url=url,
                timeout=self.config.timeout_seconds
            ) as response:
                if response.status != 200:
                    error_data = await response.text()
                    raise ProviderAPIError(
                        f"Anthropic API error: {response.status}",
                        status_code=response.status,
                        response=error_data
                    )
                
                model_info = await response.json()
                
                # Format the response similarly to the example you provided
                return {
                    "name": model_info.get("id"),
                    "capabilities": model_info.get("capabilities", []),
                    "max_tokens": model_info.get("context_window"),
                    "description": model_info.get("description", "")
                }
                
        except Exception as e:
            self._last_error = str(e)
            
            if isinstance(e, asyncio.TimeoutError):
                raise ProviderTimeoutError(f"Anthropic request timed out: {str(e)}")
            elif isinstance(e, aiohttp.ClientError):
                raise ProviderConnectionError(f"Anthropic connection error: {str(e)}")
            else:
                raise
    
    async def _send_request(self, endpoint: str, payload: Dict[str, Any], stream: bool = False) -> Dict[str, Any]:
        """Send a request to the Anthropic API."""
        if stream:
            payload["stream"] = True
            
        url = f"{self.api_base}/{endpoint}"
        
        try:
            async with self.session.post(
                url=url,
                json=payload,
                timeout=self.config.timeout_seconds
            ) as response:
                if response.status != 200:
                    error_data = await response.text()
                    raise ProviderAPIError(
                        f"Anthropic API error: {response.status}",
                        status_code=response.status,
                        response=error_data
                    )
                    
                if stream:
                    # Handle streaming implementation in the caller
                    return None
                else:
                    return await response.json()
                    
        except ProviderAPIError:
            raise
        except aiohttp.ClientError as e:
            raise ProviderConnectionError(f"Failed to connect to Anthropic API: {str(e)}")
        except asyncio.TimeoutError:
            raise ProviderTimeoutError(f"Request to Anthropic API timed out after {self.config.timeout_seconds}s")
            
    def _prepare_anthropic_payload(self, request: QueryRequest) -> Dict[str, Any]:
        """Convert generic QueryRequest to Anthropic-specific format."""
        # This is a simplified version - you'd need to properly format
        # the messages for Anthropic's API based on your application's needs
        
        # Basic implementation assuming simple text completion
        payload = {
            "model": self.config.model_name,
            "messages": [{"role": "user", "content": request.prompt}],
            "max_tokens": request.max_tokens or self.config.max_tokens,
            "temperature": request.temperature,
        }
        
        # Add stop sequences if provided
        if request.stop_sequences:
            payload["stop_sequences"] = request.stop_sequences
            
        return payload
        
    def _extract_content(self, response_data: Dict[str, Any]) -> str:
        """Extract content from Anthropic response."""
        # Extract text from Anthropic's response format
        if "content" in response_data:
            # Handle messages API response format
            content_blocks = response_data.get("content", [])
            text_blocks = [
                block.get("text", "") 
                for block in content_blocks 
                if block.get("type") == "text"
            ]
            return "".join(text_blocks)
        else:
            # Fallback for unexpected response format
            return str(response_data)