from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class ProviderType(str, Enum):
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    OPENAI = "openai"

class GenerationRequest(BaseModel):
    """Generic model for generation requests across providers"""
    provider_id: str = Field(..., description="Provider identifier")
    model_id: str = Field(..., description="Model identifier")
    prompt: str = Field(..., description="Primary prompt/input text")
    system_prompt: Optional[str] = Field(None, description="System instructions")
    temperature: float = Field(0.7, description="Temperature (0.0-1.0)")
    max_tokens: int = Field(1000, description="Maximum tokens to generate")
    stream: bool = Field(False, description="Whether to stream the response")
    additional_params: Dict[str, Any] = Field({}, description="Provider-specific parameters")

class ModelListRequest(BaseModel):
    """Request to list available models"""
    provider_id: str = Field(..., description="Provider identifier")