from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

from .metadata import ModelDetails, ModelInfo, DurationMetrics


@dataclass
class OllamaResponse:
    """Base class for all Ollama responses"""
    # Required fields first
    model: str
    created_at: datetime
    done: bool
    # Optional fields last
    done_reason: Optional[str] = None

    @classmethod
    def from_json(cls, data: dict) -> "OllamaResponse":
        return cls(
            model=data["model"],
            created_at=datetime.fromisoformat(data["created_at"].replace('Z', '+00:00')),
            done=data["done"],
            done_reason=data.get("done_reason")
        )


@dataclass
class PullResponse(OllamaResponse):
    """Response from pull request"""
    digest: Optional[str] = None
    total: Optional[int] = None
    completed: Optional[int] = None

    @classmethod
    def from_json(cls, data: dict) -> "PullResponse":
        base = super().from_json(data)
        return cls(
            model=base.model,
            created_at=base.created_at,
            done=base.done,
            done_reason=base.done_reason,
            status=data["status"],
            digest=data.get("digest"),
            total=data.get("total"),
            completed=data.get("completed")
        )
    

@dataclass
class ShowResponse:
    """Response containing model information"""
    # Required fields from both OllamaResponse and ShowResponse
    model: str
    created_at: datetime
    done: bool
    details: ModelDetails
    model_info: ModelInfo
    modelfile: str
    parameters: str
    template: str
    # Optional fields last
    done_reason: Optional[str] = None

    @classmethod
    def from_json(cls, data: dict) -> "ShowResponse":
        base = OllamaResponse.from_json(data)
        return cls(
            model=base.model,
            created_at=base.created_at,
            done=base.done,
            done_reason=base.done_reason,
            modelfile=data["modelfile"],
            parameters=data["parameters"],
            template=data["template"],
            details=ModelDetails(**data["details"]),
            model_info=ModelInfo(**data["model_info"])
        )

@dataclass
class GenerateResponse:
    """Response from /api/generate endpoint"""
    # Required fields first
    model: str
    created_at: datetime
    done: bool
    response: str
    
    # Optional fields from both parent classes
    done_reason: Optional[str] = None
    context: Optional[List[int]] = None
    total_duration: Optional[int] = None
    load_duration: Optional[int] = None
    prompt_eval_count: Optional[int] = None
    prompt_eval_duration: Optional[int] = None
    eval_count: Optional[int] = None

    @classmethod
    def from_json(cls, data: dict) -> "GenerateResponse":
        base = OllamaResponse.from_json(data)
        return cls(
            model=base.model,
            created_at=base.created_at,
            done=base.done,
            done_reason=base.done_reason,
            response=data.get("response", ""),
            context=data.get("context"),
            total_duration=data.get("total_duration"),
            load_duration=data.get("load_duration"),
            prompt_eval_count=data.get("prompt_eval_count"),
            prompt_eval_duration=data.get("prompt_eval_duration"),
            eval_count=data.get("eval_count")
        )