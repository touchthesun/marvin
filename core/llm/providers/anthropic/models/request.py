from dataclasses import dataclass, field
from typing import List, Optional, Union

from core.llm.providers.base.request import BaseLLMRequest, BaseGenerateRequest


@dataclass
class AnthropicRequest(BaseLLMRequest):
    """Base class for Anthropic requests"""
    temperature: float = field(default=0.7)
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    stop_sequences: Optional[List[str]] = None
    
    def to_json(self) -> dict:
        """Convert to API request format"""
        data = {
            "model": self.model,
            "temperature": self.temperature
        }
        
        if self.max_tokens is not None:
            data["max_tokens"] = self.max_tokens
        if self.top_p is not None:
            data["top_p"] = self.top_p
        if self.top_k is not None:
            data["top_k"] = self.top_k
        if self.stop_sequences:
            data["stop_sequences"] = self.stop_sequences
            
        return data


@dataclass
class Message:
    """Message format for Anthropic API"""
    role: str
    content: str

    def to_json(self) -> dict:
        return {
            "role": self.role,
            "content": self.content
        }


@dataclass
class GenerateRequest(AnthropicRequest, BaseGenerateRequest):
    """Request parameters for Claude message generation"""
    prompt: str = field(default=None)
    system: Optional[str] = None
    messages: Optional[List[Message]] = None
    stream: bool = field(default=True)
    
    def to_json(self) -> dict:
        """Convert to Anthropic API request format"""
        data = super().to_json()
        
        # Handle messages - either convert prompt to message or use provided messages
        if self.messages:
            data["messages"] = [msg.to_json() for msg in self.messages]
        elif self.prompt:
            data["messages"] = [{"role": "user", "content": self.prompt}]
            
        # Add system prompt if provided
        if self.system:
            data["system"] = self.system
            
        # Add stream parameter if not default
        if not self.stream:
            data["stream"] = False
            
        return data


@dataclass
class EmbeddingRequest(AnthropicRequest):
    """Request for text embeddings (if Anthropic supports this)"""
    input: Union[str, List[str]] = field(default_factory=lambda: "")
    
    def to_json(self) -> dict:
        data = super().to_json()
        data["input"] = self.input
        return data