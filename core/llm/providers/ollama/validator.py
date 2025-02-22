from typing import Dict, Any, Optional, List
from enum import Enum
import aiohttp
from pydantic import BaseModel, HttpUrl, Field, validator
import logging
from pathlib import Path

from .config_manager import ProviderConfigValidator

logger = logging.getLogger(__name__)


class KVCacheType(str, Enum):
    """Available K/V cache quantization types"""
    F16 = "f16"
    Q8_0 = "q8_0"
    Q4_0 = "q4_0"


class OllamaEnvironmentConfig(BaseModel):
    """Ollama server environment configuration"""
    host: Optional[str] = Field(None, description="Server binding address")
    models_path: Optional[Path] = Field(None, description="Model storage location")
    allowed_origins: Optional[List[str]] = Field(None, description="Allowed CORS origins")
    keep_alive: Optional[str] = Field(None, description="Global model retention time")
    max_queue: Optional[int] = Field(None, ge=1, description="Maximum request queue size")
    max_loaded_models: Optional[int] = Field(None, ge=1, description="Maximum concurrent loaded models")
    num_parallel: Optional[int] = Field(None, ge=1, description="Number of parallel requests per model")
    flash_attention: Optional[bool] = Field(None, description="Enable Flash Attention")
    kv_cache_type: Optional[KVCacheType] = Field(None, description="K/V cache quantization type")

    @validator('keep_alive')
    def validate_keep_alive(cls, v):
        if v is not None:
            # Validate duration string format (e.g., "10m", "24h") or number
            if not (v.isdigit() or 
                   (v.startswith('-') and v[1:].isdigit()) or
                   (v[:-1].isdigit() and v[-1] in ['s', 'm', 'h'])):
                raise ValueError("Invalid keep_alive format")
        return v


class OllamaModelConfig(BaseModel):
    """Ollama model-specific configuration parameters"""
    num_ctx: Optional[int] = Field(None, ge=512, le=16384, description="Context window size")
    num_gpu: Optional[int] = Field(None, ge=0, description="Number of GPUs to use")
    num_thread: Optional[int] = Field(None, ge=0, description="Number of CPU threads")
    keep_alive: Optional[str] = Field(None, description="Model-specific retention time")
    
    @validator('num_ctx')
    def validate_context_size(cls, v):
        if v is not None and v % 32 != 0:
            raise ValueError("Context size must be a multiple of 32")
        return v
    
    @validator('keep_alive')
    def validate_keep_alive(cls, v):
        if v is not None:
            if not (v.isdigit() or 
                   (v.startswith('-') and v[1:].isdigit()) or
                   (v[:-1].isdigit() and v[-1] in ['s', 'm', 'h'])):
                raise ValueError("Invalid keep_alive format")
        return v


class OllamaConfigValidator(ProviderConfigValidator):
    """Configuration validator for Ollama provider"""
    
    DEFAULT_BASE_URL = "http://localhost:11434"
    REQUIRED_FIELDS = {'model_name', 'provider_type'}
    
    async def validate(self, config: Dict[str, Any]) -> bool:
        """Validate Ollama provider configuration"""
        try:
            # Check required fields
            missing_fields = self.REQUIRED_FIELDS - set(config.keys())
            if missing_fields:
                logger.error(f"Missing required fields: {missing_fields}")
                return False
            
            # Validate provider type
            if config['provider_type'] != 'ollama':
                logger.error("Invalid provider_type, must be 'ollama'")
                return False
            
            # Validate base URL
            base_url = config.get('base_url', self.DEFAULT_BASE_URL)
            try:
                HttpUrl(base_url)
            except Exception as e:
                logger.error(f"Invalid base_url: {str(e)}")
                return False
            
            # Validate environment configuration
            env_config = config.get('environment', {})
            try:
                OllamaEnvironmentConfig(**env_config)
            except Exception as e:
                logger.error(f"Invalid environment configuration: {str(e)}")
                return False
            
            # Validate model configuration
            model_config = config.get('model_config', {})
            try:
                OllamaModelConfig(**model_config)
            except Exception as e:
                logger.error(f"Invalid model configuration: {str(e)}")
                return False
            
            # Verify Ollama server is accessible and model exists
            if not await self._verify_model_availability(base_url, config['model_name']):
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Validation failed: {str(e)}")
            return False
    
    async def _verify_model_availability(self, base_url: str, model_name: str) -> bool:
        """Verify that Ollama server is accessible and the model exists/can be pulled"""
        try:
            async with aiohttp.ClientSession() as session:
                # Check if Ollama server is accessible
                async with session.get(f"{base_url}/api/tags") as response:
                    if response.status != 200:
                        logger.error(f"Failed to connect to Ollama server at {base_url}")
                        return False
                    
                    models = await response.json()
                    available_models = {model['name'] for model in models['models']}
                    
                    if model_name not in available_models:
                        logger.warning(f"Model {model_name} not found in available models")
                        # We could optionally try to pull the model here
                        return False
                    
                    return True
                    
        except aiohttp.ClientError as e:
            logger.error(f"Failed to connect to Ollama server: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during model verification: {str(e)}")
            return False
    
    async def get_schema(self) -> Dict[str, Any]:
        """Get JSON schema for Ollama provider configuration"""
        return {
            "type": "object",
            "required": ["provider_type", "model_name"],
            "properties": {
                "provider_type": {
                    "type": "string",
                    "enum": ["ollama"],
                    "description": "Must be 'ollama'"
                },
                "model_name": {
                    "type": "string",
                    "description": "Name of the Ollama model to use"
                },
                "base_url": {
                    "type": "string",
                    "format": "uri",
                    "description": "Ollama server URL",
                    "default": self.DEFAULT_BASE_URL
                },
                "environment": self._get_environment_schema(),
                "model_config": self._get_model_schema()
            }
        }
    
    def _get_environment_schema(self) -> Dict[str, Any]:
        """Get JSON schema for environment configuration"""
        return {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Server binding address"
                },
                "models_path": {
                    "type": "string",
                    "description": "Model storage location"
                },
                "allowed_origins": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Allowed CORS origins"
                },
                "keep_alive": {
                    "type": "string",
                    "description": "Global model retention time (e.g., '10m', '24h', '-1')"
                },
                "max_queue": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Maximum request queue size"
                },
                "max_loaded_models": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Maximum concurrent loaded models"
                },
                "num_parallel": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Number of parallel requests per model"
                },
                "flash_attention": {
                    "type": "boolean",
                    "description": "Enable Flash Attention"
                },
                "kv_cache_type": {
                    "type": "string",
                    "enum": ["f16", "q8_0", "q4_0"],
                    "description": "K/V cache quantization type"
                }
            }
        }
    
    def _get_model_schema(self) -> Dict[str, Any]:
        """Get JSON schema for model configuration"""
        return {
            "type": "object",
            "properties": {
                "num_ctx": {
                    "type": "integer",
                    "minimum": 512,
                    "maximum": 16384,
                    "multipleOf": 32,
                    "description": "Context window size"
                },
                "num_gpu": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Number of GPUs to use"
                },
                "num_thread": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Number of CPU threads"
                },
                "keep_alive": {
                    "type": "string",
                    "description": "Model-specific retention time (e.g., '10m', '24h', '-1')"
                }
            }
        }
