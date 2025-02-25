from dataclasses import dataclass
from typing import Optional



@dataclass
class BaseModelInfo:
    """Common model information fields"""
    model_type: str
    model_family: str
    parameter_size: Optional[str] = None
    quantization: Optional[str] = None
    context_length: Optional[int] = None