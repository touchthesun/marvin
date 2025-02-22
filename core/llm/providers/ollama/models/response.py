from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

from .metadata import ModelDetails, ModelInfo, DurationMetrics


@dataclass
class OllamaResponse:
    """Base class for all Ollama responses"""
    model: str
    created_at: datetime
    done: bool
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
    status: str
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
class ShowResponse(OllamaResponse):
    """Response containing model information"""
    modelfile: str
    parameters: str
    template: str
    details: ModelDetails
    model_info: ModelInfo

    @classmethod
    def from_json(cls, data: dict) -> "ShowResponse":
        base = super().from_json(data)
        return cls(
            model=base.model,
            created_at=base.created_at,
            done=base.done,
            done_reason=base.done_reason,
            modelfile=data["modelfile"],
            parameters=data["parameters"],
            template=data["template"],
            details=ModelDetails(**data["details"]),
            model_info=ModelInfo(**{k.split('.')[-1]: v for k, v in data["model_info"].items()})
        )
    

@dataclass
class GenerateResponse(OllamaResponse, DurationMetrics):
    """Response from /api/generate endpoint"""
    response: str = ""
    context: Optional[List[int]] = None

    @classmethod
    def from_json(cls, data: dict) -> "GenerateResponse":
        base = super().from_json(data)
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
            eval_count=data.get("eval_count"),
            eval_duration=data.get("eval_duration")
        )
    