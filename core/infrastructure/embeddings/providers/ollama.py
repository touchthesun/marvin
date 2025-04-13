# core/infrastructure/embeddings/providers/ollama.py
import aiohttp
import json
import time
from typing import List, Dict, Any, Optional
from datetime import datetime

from core.domain.embeddings.models import (
    EmbeddingVector
)
from core.infrastructure.embeddings.providers.base import BaseEmbeddingProvider, EmbeddingProviderStatus

class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    """Provider implementation for Ollama local embedding models."""
    
    DEFAULT_BASE_URL = "http://localhost:11434"
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Ollama provider.
        
        Args:
            config: Configuration dictionary with host and model settings
        """
        super().__init__(config)
        self.base_url = config.get("base_url", self.DEFAULT_BASE_URL)
        # Update default model to mxbai-embed-large since it's specifically for embeddings
        self.default_model = config.get("model", "mxbai-embed-large")
        self.session = None
        self.timeout = config.get("timeout", 60)  # seconds
        
        # Map model names to dimensions - focus on embedding-specific models
        self.model_dimensions = {
            "llama3": 4096,
            "nomic-embed-text": 768,
            "all-minilm": 384,
            "mxbai-embed-large": 1024,
            "mxbai-embed-small": 384,
            # Add other models as they become available
        }
        
        # Known embedding-specific models for validation
        self.embedding_models = [
            "nomic-embed-text",
            "all-minilm",
            "mxbai-embed-large",
            "mxbai-embed-small"
        ]
    
    async def initialize(self) -> None:
        """Initialize the provider with necessary setup."""
        await super().initialize()
        
        try:
            self.logger.info(f"Initializing Ollama embedding provider with server: {self.base_url}")
            
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            )
            
            # Test connection to Ollama server by listing models
            async with self.session.get(f"{self.base_url}/api/tags") as response:
                if response.status != 200:
                    error_text = await response.text()
                    error_msg = f"Error connecting to Ollama server: {response.status} - {error_text}"
                    self.logger.error(error_msg)
                    self._status = EmbeddingProviderStatus.ERROR
                    self._last_error = error_msg
                    raise ConnectionError(error_msg)
                
                # Check if our model is available
                try:
                    models = await response.json()
                    model_names = [model['name'] for model in models.get('models', [])]
                    
                    # Check if preferred embedding model is available
                    if self.default_model not in model_names:
                        if self.default_model in self.embedding_models:
                            self.logger.warning(f"Embedding model {self.default_model} not found, attempting to pull it")
                            await self._pull_model(self.default_model)
                        else:
                            # If default model is not in our known embedding models list
                            # but another embedding model is available, use that
                            available_embedding_models = [m for m in self.embedding_models if m in model_names]
                            if available_embedding_models:
                                self.default_model = available_embedding_models[0]
                                self.logger.info(f"Using available embedding model: {self.default_model}")
                            else:
                                self.logger.warning(f"No known embedding models found, will attempt to pull {self.default_model}")
                                await self._pull_model(self.default_model)
                except Exception as e:
                    self.logger.error(f"Error processing model list: {str(e)}", exc_info=True)
                    # Continue initialization despite this error
                
                self._status = EmbeddingProviderStatus.READY
                self.logger.info(f"Ollama embedding provider initialized with model: {self.default_model}")
                
        except Exception as e:
            error_msg = f"Failed to initialize Ollama provider: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self._status = EmbeddingProviderStatus.ERROR
            self._last_error = error_msg
            raise
    
    async def _pull_model(self, model_name: str) -> None:
        """Pull a model from Ollama."""
        if not self.session:
            raise RuntimeError("Provider not initialized")
            
        try:
            self.logger.info(f"Pulling model: {model_name}")
            async with self.session.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name}
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise ValueError(f"Failed to pull model: {response.status} - {error_text}")
                
                # Stream the pull progress
                async for line in response.content:
                    try:
                        line_text = line.decode('utf-8').strip()
                        if not line_text:
                            continue
                            
                        progress = json.loads(line_text)
                        if "status" in progress:
                            self.logger.debug(f"Pull progress: {progress['status']}")
                    except json.JSONDecodeError:
                        self.logger.warning(f"Invalid JSON in pull response: {line}")
                    except Exception as e:
                        self.logger.error(f"Error processing pull response: {str(e)}")
                
                self.logger.info(f"Successfully pulled model: {model_name}")
                    
        except Exception as e:
            error_msg = f"Failed to pull model {model_name}: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg)
    
    async def get_embedding(self, text: str, model: Optional[str] = None) -> EmbeddingVector:
        """
        Get an embedding for a single text string.
        
        Args:
            text: Text to embed
            model: Optional model identifier, uses default if not specified
            
        Returns:
            EmbeddingVector object
        """
        if not self.session:
            self.logger.debug("Session not initialized, calling initialize()")
            await self.initialize()
            
        model_id = model or self.default_model
        text_length = len(text)
        
        # Logging with truncated text for readability
        display_text = text[:50] + "..." if len(text) > 50 else text
        self.logger.debug(f"Getting embedding for text: '{display_text}' (length: {text_length}) with model: {model_id}")
        
        # Check if model supports embeddings
        if model_id not in self.model_dimensions and model_id not in self.embedding_models:
            self.logger.warning(f"Model {model_id} is not verified for embeddings, proceeding anyway")
        
        # Prepare request
        payload = {
            "model": model_id,
            "prompt": text,  # Ollama uses "prompt" instead of "input"
        }
        
        # Make request to Ollama
        start_time = time.time()
        try:
            async with self.session.post(f"{self.base_url}/api/embeddings", json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    
                    # Special handling for common error cases
                    if "model not found" in error_text.lower():
                        self.logger.error(f"Model {model_id} not found, attempting to pull it")
                        try:
                            await self._pull_model(model_id)
                            # Retry once after pulling the model
                            return await self.get_embedding(text, model_id)
                        except Exception as pull_error:
                            self.logger.error(f"Failed to pull model: {str(pull_error)}")
                            raise ValueError(f"Model {model_id} not found and could not be pulled")
                    
                    self.logger.error(f"Error from Ollama: {error_text}")
                    self._status = EmbeddingProviderStatus.ERROR
                    self._last_error = f"Error from Ollama API: {response.status} - {error_text}"
                    self._update_metrics(success=False, latency_ms=(time.time() - start_time) * 1000, tokens=0)
                    raise ValueError(f"Error from Ollama API: {response.status} - {error_text}")
                
                # Parse response
                response_text = await response.text()
                try:
                    data = json.loads(response_text)
                except json.JSONDecodeError:
                    self.logger.error(f"Invalid JSON response from Ollama: {response_text[:100]}")
                    raise ValueError(f"Invalid JSON response from Ollama API")
                
                # Extract embedding
                embedding = data.get("embedding", [])
                if not embedding:
                    self.logger.error(f"No embedding found in response: {data}")
                    raise ValueError("No embedding returned from Ollama API")
                
                dimension = len(embedding)
                
                elapsed = time.time() - start_time
                self.logger.debug(f"Got embedding from Ollama in {elapsed:.2f}s, dimension: {dimension}")
                
                # Update metrics
                token_estimate = len(text) // 4  # Rough token estimate
                self._update_metrics(
                    success=True,
                    latency_ms=elapsed * 1000,
                    tokens=token_estimate
                )
                
                # Update status
                self._status = EmbeddingProviderStatus.READY
                
                return EmbeddingVector(
                    vector=embedding,
                    model=model_id,
                    dimension=dimension,
                    normalized=False,  # Most Ollama models don't normalize by default
                    created_at=datetime.now()
                )
                
        except Exception as e:
            elapsed = time.time() - start_time
            self.logger.error(f"Error getting embedding: {str(e)}", exc_info=True)
            self._status = EmbeddingProviderStatus.ERROR
            self._last_error = str(e)
            self._update_metrics(success=False, latency_ms=elapsed * 1000, tokens=0)
            raise
    
    async def batch_embed(self, texts: List[str], model: Optional[str] = None) -> List[EmbeddingVector]:
        """
        Get embeddings for multiple text strings.
        
        Args:
            texts: List of texts to embed
            model: Optional model identifier, uses default if not specified
            
        Returns:
            List of EmbeddingVector objects
        """
        if not self.session:
            await self.initialize()
            
        model_id = model or self.default_model
        
        self.logger.debug(f"Batch embedding {len(texts)} texts with model: {model_id}")
        
        # Ollama doesn't support batch embedding natively, so we'll implement it
        # with multiple calls and track overall stats
        embeddings = []
        total_tokens = 0
        total_latency = 0
        start_time = time.time()
        success_count = 0
        errors = []
        
        for i, text in enumerate(texts):
            try:
                self.logger.debug(f"Processing text {i+1}/{len(texts)}")
                text_start_time = time.time()
                
                # Get embedding for single text
                embedding = await self.get_embedding(text, model_id)
                
                text_elapsed = time.time() - text_start_time
                total_latency += text_elapsed
                total_tokens += len(text) // 4  # Rough token estimate
                
                embeddings.append(embedding)
                success_count += 1
                
            except Exception as e:
                self.logger.error(f"Error embedding text {i+1}: {str(e)}", exc_info=True)
                errors.append(str(e))
                # Add None placeholder for failed embeddings to maintain order
                embeddings.append(None)
        
        # Calculate overall metrics
        batch_elapsed = time.time() - start_time
        self.logger.info(f"Completed batch embedding of {success_count}/{len(texts)} texts in {batch_elapsed:.2f}s")
        
        if errors:
            self.logger.warning(f"Encountered {len(errors)} errors during batch embedding")
            if len(errors) <= 3:
                for i, error in enumerate(errors):
                    self.logger.warning(f"Error {i+1}: {error}")
        
        # Update metrics for the batch operation
        self._update_metrics(
            success=success_count == len(texts),
            latency_ms=batch_elapsed * 1000,
            tokens=total_tokens
        )
        
        # Filter out None values if any embedding failed
        embeddings = [e for e in embeddings if e is not None]
        
        return embeddings
    
    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available embedding models.
        
        Returns:
            List of model information dictionaries
        """
        if not self.session:
            await self.initialize()
            
        try:
            # Query Ollama for available models
            async with self.session.get(f"{self.base_url}/api/tags") as response:
                if response.status != 200:
                    self.logger.error(f"Error listing models: {response.status}")
                    return []
                
                data = await response.json()
                models = data.get("models", [])
                
                # Filter and format model info
                model_info = []
                for model in models:
                    name = model.get("name", "")
                    dimension = self.model_dimensions.get(name, 0)
                    is_embedding_model = name in self.embedding_models
                    
                    model_info.append({
                        "id": name,
                        "name": name,
                        "dimensions": dimension,
                        "provider": "ollama",
                        "size": model.get("size", 0),
                        "modified_at": model.get("modified_at", ""),
                        "supports_embeddings": is_embedding_model or dimension > 0,
                        "is_embedding_specific": is_embedding_model
                    })
                
                # Put embedding-specific models at the top of the list
                model_info.sort(key=lambda m: (not m.get("is_embedding_specific"), m.get("name")))
                
                return model_info
                
        except Exception as e:
            self.logger.error(f"Error listing models: {str(e)}", exc_info=True)
            return []
    
    async def shutdown(self) -> None:
        """Clean up provider resources."""
        await super().shutdown()
        if self.session:
            self.logger.debug("Closing aiohttp session")
            await self.session.close()
            self.session = None