from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, TypeVar, List

from core.llm.common.types import BaseModelInfo

# Type variable for generic response content
T = TypeVar('T')



@dataclass
class BaseLLMResponse(ABC):
    """Base class for all LLM provider responses"""
    model: str
    created_at: datetime
    done: bool
    done_reason: Optional[str] = None
    
    @classmethod
    @abstractmethod
    def from_json(cls, data: dict) -> "BaseLLMResponse":
        """Create response object from provider-specific format"""
        pass


@dataclass
class BaseGenerateResponse(BaseLLMResponse):
    """Base class for text generation responses"""
    response: str = ""
    context: Optional[List[Any]] = None  # Provider-specific context
    
    # Common metrics most providers expose
    total_duration: Optional[int] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

@dataclass
class BaseModelManagementResponse(BaseLLMResponse):
    """Base class for model management responses"""
    status: str
    error: Optional[str] = None

@dataclass
class BaseModelInfoResponse(BaseLLMResponse):
    """Base class for model information responses"""
    model_info: BaseModelInfo
    raw_model_data: Dict[str, Any]  # Provider-specific raw data