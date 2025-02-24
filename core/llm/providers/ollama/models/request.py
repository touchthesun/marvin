from dataclasses import dataclass, field
from typing import List, Optional, Union

from .options import OllamaOptions

@dataclass
class OllamaRequest:
    """Common parameters for Ollama requests"""
    model: str = field(default=None)
    temperature: float = field(default=0.7)
    top_p: float = field(default=1.0)

    def to_json(self) -> dict:
        """Convert to API request format"""
        return {"model": self.model}

@dataclass
class GenerationRequest(OllamaRequest):
    """Base class for generation-type requests"""
    prompt: str = field(default=None)


@dataclass
class GenerateRequest(GenerationRequest):
    """Request parameters for /api/generate endpoint"""
    max_tokens: Optional[int] = field(default=None)
    system: Optional[str] = field(default=None)
    template: Optional[str] = field(default=None)
    context: Optional[List[int]] = field(default=None)
    stream: bool = field(default=True)
    raw: bool = field(default=False)
    format: Optional[Union[str, dict]] = field(default=None)
    options: Optional[OllamaOptions] = field(default=None)
    keep_alive: Optional[str] = field(default=None)
    images: Optional[List[str]] = field(default=None)


    def to_json(self) -> dict:
        data = super().to_json()
        data["prompt"] = self.prompt
        
        if self.system is not None:
            data["system"] = self.system
        if self.template is not None:
            data["template"] = self.template
        if self.context is not None:
            data["context"] = self.context
        if not self.stream:  # Only include if False
            data["stream"] = False
        if self.raw:  # Only include if True
            data["raw"] = True
        if self.format is not None:
            data["format"] = self.format
        if self.options is not None:
            data["options"] = self.options.to_dict()
        if self.keep_alive is not None:
            data["keep_alive"] = self.keep_alive
        if self.images is not None:
            data["images"] = self.images
            
        return data


@dataclass
class CopyRequest:
    """Request for copy operations"""
    source: str
    destination: str
    model: str

    def to_json(self) -> dict:
        return {
            "source": self.source,
            "destination": self.destination
        }

# Delete Model
@dataclass
class DeleteRequest(OllamaRequest):
    """Request to delete a model"""
    def to_json(self) -> dict:
        return super().to_json()

# Pull Model
@dataclass
class PullRequest(OllamaRequest):
    """Request to pull a model"""
    insecure: bool = False
    stream: bool = True

    def to_json(self) -> dict:
        data = super().to_json()
        if self.insecure:
            data["insecure"] = True
        if not self.stream:
            data["stream"] = False
        return data


@dataclass
class ShowRequest(OllamaRequest):
    """Request to show model information"""
    verbose: bool = False

    def to_json(self) -> dict:
        data = super().to_json()
        if self.verbose:
            data["verbose"] = True
        return data
