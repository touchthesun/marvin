from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, Generic, TypeVar, List

# Type variable for generic response content
T = TypeVar('T')

@dataclass
class BaseLLMRequest(ABC):
    """Base class for all LLM provider requests"""
    model: str
    stream: bool = True
    
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
    prompt: str
    system: Optional[str] = None
    context: Optional[List[Any]] = None  # Provider-specific context
    options: Optional[Dict[str, Any]] = None  # Provider-specific options


@dataclass
class BaseModelManagementRequest(BaseLLMRequest):
    """Base class for model management requests (load, unload, etc)"""
    pass

@dataclass
class BaseModelInfoRequest(BaseLLMRequest):
    """Base class for model information requests"""
    verbose: bool = False