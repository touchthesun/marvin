from dataclasses import dataclass
from datetime import datetime

from core.llm.providers.base.response import BaseGenerateResponse

@dataclass
class GenerateResponse(BaseGenerateResponse):
    """Response from message generation"""
    @classmethod
    def from_json(cls, data: dict) -> "GenerateResponse":
        return cls(
            model=data["model"],
            created_at=datetime.fromisoformat(data["created_at"]),
            done=data["done"],
            response=data["response"],
            prompt_tokens=data.get("prompt_tokens"),
            completion_tokens=data.get("completion_tokens"),
            total_tokens=data.get("total_tokens")
        )
