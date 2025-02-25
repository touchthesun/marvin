from typing import Optional, Dict, Any, List, AsyncIterator
from datetime import datetime
import anthropic
from pydantic import Field

from core.llm.providers.anthropic.models.request import  GenerateRequest
from core.llm.providers.anthropic.models.response import GenerateResponse
from core.llm.providers.base.provider_base import BaseLLMProvider
from core.llm.providers.base.provider import ProviderStatus
from core.llm.providers.base.config import ProviderType, ModelCapability, ProviderConfig
from core.utils.logger import get_logger

logger = get_logger(__name__)

class AnthropicProviderConfig(ProviderConfig):
    """Anthropic-specific provider configuration"""
    provider_type: ProviderType = ProviderType.ANTHROPIC
    capabilities: List[ModelCapability] = [
        ModelCapability.CHAT,
        ModelCapability.STREAMING,
        ModelCapability.FUNCTION_CALLING
    ]


class AnthropicProvider(BaseLLMProvider):
    """Anthropic-specific LLM provider implementation using official client"""
    
    def __init__(self, config: AnthropicProviderConfig):
        super().__init__(config)
        self.client: Optional[anthropic.Anthropic] = None
    
    async def initialize(self) -> None:
        """Initialize Anthropic client"""
        self.client = anthropic.Anthropic(api_key=self.config.api_key)
        self._status = ProviderStatus.READY
    
    async def shutdown(self) -> None:
        """Cleanup provider resources"""
        # Close aiohttp session
        if self.client:
            await self.client.close()
        self._status = ProviderStatus.DISABLED

    
    async def generate(self, request: GenerateRequest) -> AsyncIterator[GenerateResponse]:
        """Generate text using Claude API with streaming"""
        if not self.client:
            raise RuntimeError("Provider not initialized")
            
        messages = [{"role": "user", "content": request.prompt}]
        if request.system:
            messages.insert(0, {"role": "system", "content": request.system})
        
        stream = await self.client.messages.create(
            model=request.model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=True
        )
        
        async for chunk in stream:
            yield GenerateResponse(
                model=request.model,
                created_at=datetime.now(),
                done=chunk.type == "message_stop",
                response=chunk.delta.text if chunk.delta else "",
                context=None,  # Anthropic doesn't provide token context
                total_duration=None,  # Anthropic uses different metrics
                prompt_tokens=None,  # We can get these from count_tokens() if needed
                completion_tokens=None,
                total_tokens=None
            )

    
    async def list_models(self) -> List[str]:
        """List available Claude models"""
        if not self.client:
            raise RuntimeError("Provider not initialized")
            
        models = await self.client.models.list()
        return [model.id for model in models.data]

    async def get_model_info(self, model_name: str) -> Dict[str, Any]:
        """Get detailed model information"""
        if not self.client:
            raise RuntimeError("Provider not initialized")
            
        model_info = await self.client.models.retrieve(model_name)
        return {
            "name": model_info.id,
            "capabilities": model_info.capabilities,
            "max_tokens": model_info.max_tokens,
            "description": model_info.description
        }
