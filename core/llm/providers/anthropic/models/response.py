from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any

from core.llm.providers.base.response import BaseGenerateResponse


@dataclass
class ContentBlock:
    """Content block in Anthropic response"""
    type: str
    text: Optional[str] = None
    
    @classmethod
    def from_json(cls, data: dict) -> "ContentBlock":
        return cls(
            type=data["type"],
            text=data.get("text")
        )


@dataclass
class AnthropicResponse:
    """Base class for all Anthropic responses"""
    model: str
    created_at: datetime
    done: bool
    
    @classmethod
    def from_json(cls, data: dict) -> "AnthropicResponse":
        # Handle datetime conversion with timezone
        created_at = data.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif not isinstance(created_at, datetime):
            created_at = datetime.now()
            
        return cls(
            model=data["model"],
            created_at=created_at,
            done=data.get("done", False)
        )


@dataclass
class GenerateResponse(AnthropicResponse, BaseGenerateResponse):
    """Response from message generation"""
    response: str = ""
    stop_reason: Optional[str] = None
    stop_sequence: Optional[str] = None
    
    # Token metrics
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    
    # Delta information for streaming
    delta: Optional[Dict[str, Any]] = None
    delta_type: Optional[str] = None
    
    @classmethod
    def from_json(cls, data: dict) -> "GenerateResponse":
        """Create from API response"""
        # First build the base response
        base = AnthropicResponse.from_json(data)
        
        # Extract response text based on response format
        response_text = ""
        
        # Handle streaming deltas
        if data.get("type") == "content_block_delta" and "delta" in data:
            delta_text = data["delta"].get("text", "")
            response_text = delta_text
            delta = data["delta"]
            delta_type = data["type"]
        # Handle message responses
        elif "content" in data:
            content_blocks = data.get("content", [])
            for block in content_blocks:
                if block.get("type") == "text":
                    response_text += block.get("text", "")
            delta = None
            delta_type = None
        else:
            delta = None
            delta_type = None
            
        return cls(
            model=base.model,
            created_at=base.created_at,
            done=base.done,
            response=response_text,
            stop_reason=data.get("stop_reason"),
            stop_sequence=data.get("stop_sequence"),
            prompt_tokens=data.get("usage", {}).get("input_tokens"),
            completion_tokens=data.get("usage", {}).get("output_tokens"),
            total_tokens=data.get("usage", {}).get("total_tokens"),
            delta=delta,
            delta_type=delta_type
        )


@dataclass
class ModelInfo:
    """Information about an Anthropic model"""
    id: str
    name: str
    description: str
    context_window: int
    pricing: Optional[Dict[str, Any]] = None
    capabilities: Optional[List[str]] = None
    
    @classmethod
    def from_json(cls, data: dict) -> "ModelInfo":
        return cls(
            id=data["id"],
            name=data.get("name", data["id"]),
            description=data.get("description", ""),
            context_window=data.get("context_window", 0),
            pricing=data.get("pricing"),
            capabilities=data.get("capabilities", [])
        )


@dataclass
class ListModelsResponse:
    """Response from listing available models"""
    models: List[ModelInfo]
    
    @classmethod
    def from_json(cls, data: dict) -> "ListModelsResponse":
        return cls(
            models=[ModelInfo.from_json(model_data) for model_data in data.get("data", [])]
        )