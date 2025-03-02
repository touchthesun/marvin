from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List



@dataclass
class BaseLLMRequest(ABC):
    """Base class for all LLM provider requests"""
    model: str
    stream: bool = field(default=True)
    
    @abstractmethod
    def to_json(self) -> dict:
        """Convert request to provider-specific format"""
        return {
            "model": self.model,
            "stream": self.stream
        }
    

@dataclass
class BaseGenerateRequest(BaseLLMRequest):
    """Base class for text generation requests"""
    prompt: Optional[str] = None
    system: Optional[str] = None
    context: Optional[List[Any]] = None
    options: Optional[Dict[str, Any]] = None

    def to_json(self) -> dict:
        """Convert request to provider-specific format"""
        json = super().to_json()
        json.update({
            "prompt": self.prompt,
            "system": self.system,
            "context": self.context,
            "options": self.options
        })
        return json


@dataclass
class BaseModelManagementRequest(BaseLLMRequest):
    """Base class for model management requests (load, unload, etc)"""
    pass

@dataclass
class BaseModelInfoRequest(BaseLLMRequest):
    """Base class for model information requests"""
    verbose: bool = False