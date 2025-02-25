from dataclasses import dataclass, field
from typing import Optional

from core.llm.providers.base.request import BaseLLMRequest, BaseGenerateRequest

@dataclass
class AnthropicRequest(BaseLLMRequest):
    """Base class for Anthropic requests"""
    temperature: float = field(default=0.7)
    max_tokens: Optional[int] = None

    def to_json(self) -> dict:
        return {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens
        }

@dataclass
class GenerateRequest(BaseGenerateRequest):
    """Request parameters for message generation"""
    system: Optional[str] = None
