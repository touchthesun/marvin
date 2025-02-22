from typing import Dict, List, Optional, Any
import aiohttp
import json
import logging
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ModelStatus(Enum):
    """Status of a model"""
    AVAILABLE = "available"
    DOWNLOADING = "downloading"
    CREATING = "creating"
    ERROR = "error"


@dataclass
class ModelInfo:
    """Information about a model"""
    name: str
    size: int
    digest: str
    modified_at: datetime
    modelfile: Optional[str] = None
    status: ModelStatus = ModelStatus.AVAILABLE
    error: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class OllamaModelManager:
    """Manages Ollama model operations"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def initialize(self) -> None:
        """Initialize the model manager"""
        self._session = aiohttp.ClientSession(base_url=self.base_url)
    
    async def shutdown(self) -> None:
        """Shutdown the model manager"""
        if self._session:
            await self._session.close()
            self._session = None
    
    async def list_local_models(self) -> List[ModelInfo]:
        """List all locally available models"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.get("/api/tags") as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to list models: {response.status}")
                
                data = await response.json()
                models = []
                
                for model in data.get("models", []):
                    models.append(ModelInfo(
                        name=model["name"],
                        size=model["size"],
                        digest=model["digest"],
                        modified_at=datetime.fromisoformat(model["modified_at"]),
                        status=ModelStatus.AVAILABLE
                    ))
                
                return models
                
        except Exception as e:
            logger.error(f"Error listing local models: {str(e)}")
            raise
    
    # TODO this is a placeholder, we should fetch from Ollama API
    async def list_remote_models(self) -> List[str]:
        """List models available from Ollama library"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            return [
                "llama2", "mistral", "llama2-uncensored", "codellama", 
                "phi", "orca-mini", "vicuna"
            ]
        except Exception as e:
            logger.error(f"Error listing remote models: {str(e)}")
            raise
    
    async def pull_model(self, name: str) -> ModelInfo:
        """Pull a model from the Ollama library"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.post("/api/pull", json={"name": name}) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to pull model: {response.status}")
                
                # Process streaming response
                model_info = None
                async for line in response.content:
                    try:
                        data = json.loads(line)
                        
                        if "status" in data:
                            logger.info(f"Pull status: {data['status']}")
                        
                        if "digest" in data:
                            # Final message with model info
                            model_info = ModelInfo(
                                name=name,
                                size=data.get("size", 0),
                                digest=data["digest"],
                                modified_at=datetime.utcnow(),
                                status=ModelStatus.AVAILABLE
                            )
                            
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON in response: {line}")
                
                if not model_info:
                    raise RuntimeError("Failed to get model info after pull")
                
                return model_info
                
        except Exception as e:
            logger.error(f"Error pulling model {name}: {str(e)}")
            raise
    
    async def remove_model(self, name: str) -> None:
        """Remove a local model"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.delete(f"/api/delete", json={"name": name}) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to remove model: {response.status}")
                
        except Exception as e:
            logger.error(f"Error removing model {name}: {str(e)}")
            raise
    
    async def create_model(self, name: str, modelfile: str) -> ModelInfo:
        """Create a new model from a Modelfile"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.post("/api/create", json={
                "name": name,
                "modelfile": modelfile
            }) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to create model: {response.status}")
                
                data = await response.json()
                return ModelInfo(
                    name=name,
                    size=data.get("size", 0),
                    digest=data["digest"],
                    modified_at=datetime.utcnow(),
                    modelfile=modelfile,
                    status=ModelStatus.AVAILABLE
                )
                
        except Exception as e:
            logger.error(f"Error creating model {name}: {str(e)}")
            raise
    
    async def get_model_info(self, name: str) -> ModelInfo:
        """Get information about a specific model"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.post("/api/show", json={"name": name}) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to get model info: {response.status}")
                
                data = await response.json()
                parameters = {}
                modelfile = data.get("modelfile")
                
                # Parse parameters from modelfile if available
                if modelfile:
                    for line in modelfile.split("\n"):
                        if line.startswith("PARAMETER"):
                            parts = line.split()
                            if len(parts) >= 3:
                                parameters[parts[1]] = parts[2]
                
                return ModelInfo(
                    name=name,
                    size=data.get("size", 0),
                    digest=data["digest"],
                    modified_at=datetime.fromisoformat(data["modified_at"]),
                    modelfile=modelfile,
                    parameters=parameters,
                    status=ModelStatus.AVAILABLE
                )
                
        except Exception as e:
            logger.error(f"Error getting info for model {name}: {str(e)}")
            raise
    
    async def get_modelfile(self, name: str) -> str:
        """Get the Modelfile content for a model"""
        if not self._session:
            raise RuntimeError("Model manager not initialized")
            
        try:
            async with self._session.post("/api/show", json={
                "name": name,
                "modelfile": True
            }) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to get modelfile: {response.status}")
                
                data = await response.json()
                return data.get("modelfile", "")
                
        except Exception as e:
            logger.error(f"Error getting modelfile for {name}: {str(e)}")
            raise
    
    async def update_model_parameters(self, name: str, parameters: Dict[str, Any]) -> ModelInfo:
        """Update model parameters by creating a new version with updated Modelfile"""
        try:
            # Get current modelfile
            current_modelfile = await self.get_modelfile(name)
            
            # Parse current modelfile and update parameters
            new_modelfile_lines = []
            seen_params = set()
            
            for line in current_modelfile.split("\n"):
                if line.startswith("PARAMETER"):
                    param_name = line.split()[1]
                    if param_name in parameters:
                        new_modelfile_lines.append(f"PARAMETER {param_name} {parameters[param_name]}")
                        seen_params.add(param_name)
                    else:
                        new_modelfile_lines.append(line)
                else:
                    new_modelfile_lines.append(line)
            
            # Add any new parameters
            for param_name, value in parameters.items():
                if param_name not in seen_params:
                    new_modelfile_lines.append(f"PARAMETER {param_name} {value}")
            
            new_modelfile = "\n".join(new_modelfile_lines)
            
            # Create new version of model
            return await self.create_model(name, new_modelfile)
            
        except Exception as e:
            logger.error(f"Error updating parameters for model {name}: {str(e)}")
            raise