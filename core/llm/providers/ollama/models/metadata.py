from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ModelNamespace:
    """Represents a model namespace (e.g., 'example' in 'example/model:tag')"""
    name: str

    def __str__(self) -> str:
        return self.name

@dataclass
class ModelName:
    """Represents a fully qualified model name with optional namespace and tag"""
    name: str
    namespace: Optional[ModelNamespace] = None
    tag: str = "latest"

    @classmethod
    def parse(cls, model_string: str) -> "ModelName":
        """Parse a model string into its components"""
        # Handle namespace
        if "/" in model_string:
            namespace, rest = model_string.split("/", 1)
            namespace_obj = ModelNamespace(namespace)
        else:
            namespace_obj = None
            rest = model_string

        # Handle tag
        if ":" in rest:
            name, tag = rest.split(":", 1)
        else:
            name = rest
            tag = "latest"

        return cls(name=name, namespace=namespace_obj, tag=tag)

    def __str__(self) -> str:
        """Convert back to string format"""
        base = f"{self.namespace.name}/{self.name}" if self.namespace else self.name
        return f"{base}:{self.tag}" if self.tag != "latest" else base


# Show Model Information
@dataclass
class ModelDetails:
    """Model architecture and formatting details"""
    parent_model: str
    format: str
    family: str
    families: List[str]
    parameter_size: str
    quantization_level: str

@dataclass
class ModelInfo:
    """Technical specifications of the model"""
    architecture: str
    file_type: int
    parameter_count: int
    quantization_version: int
    attention_head_count: int
    attention_head_count_kv: int
    attention_layer_norm_rms_epsilon: float
    block_count: int
    context_length: int
    embedding_length: int
    feed_forward_length: int
    rope_dimension_count: int
    rope_freq_base: int
    vocab_size: int
    bos_token_id: int
    eos_token_id: int
    merges: Optional[List[str]] = None  # Only present if verbose=true
    model: str = "gpt2"
    pre: str = "llama-bpe"
    token_type: Optional[List[str]] = None  # Only present if verbose=true
    tokens: Optional[List[str]] = None  # Only present if verbose=true




@dataclass
class DurationNS:
    """Represents a duration in nanoseconds"""
    nanoseconds: int

    @property
    def milliseconds(self) -> float:
        return self.nanoseconds / 1_000_000

    @property
    def seconds(self) -> float:
        return self.nanoseconds / 1_000_000_000
    

@dataclass
class DurationMetrics:
    """Common duration and performance metrics"""
    total_duration: Optional[int] = None  # nanoseconds
    load_duration: Optional[int] = None   # nanoseconds
    prompt_eval_count: Optional[int] = None
    prompt_eval_duration: Optional[int] = None  # nanoseconds
    eval_count: Optional[int] = None
    sample_count: Optional[int] = None
    sample_duration: Optional[int] = None