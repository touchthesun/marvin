# core/infrastructure/embeddings/providers/openai.py
import aiohttp
import time
import json
import math
from typing import List, Dict, Any, Optional

from core.domain.embeddings.models import EmbeddingVector
from core.infrastructure.embeddings.providers.base import BaseEmbeddingProvider, EmbeddingProviderStatus


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """Provider implementation for OpenAI's embedding models."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the OpenAI provider.
        
        Args:
            config: Configuration dictionary with api_key and model settings
        """
        super().__init__(config)
        self.api_key = config.get("api_key")
        self.api_base = config.get("api_base", "https://api.openai.com/v1")
        self.default_model = config.get("model", "text-embedding-ada-002")
        self.session = None
        
        # Map model names to dimensions
        self.model_dimensions = {
            "text-embedding-ada-002": 1536,
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072
        }
    
    async def initialize(self) -> None:
        """Initialize the provider with necessary setup."""
        await super().initialize()
        
        if not self.api_key:
            error_msg = "OpenAI API key is required"
            self.logger.error(error_msg)
            self._status = EmbeddingProviderStatus.ERROR
            self._last_error = error_msg
            raise ValueError(error_msg)
            
        # Log API key first characters for debugging (safely)
        api_key_prefix = self.api_key[:4] + "..." if self.api_key and len(self.api_key) > 4 else "None"
        self.logger.info(f"Initializing OpenAI provider with API key prefix: {api_key_prefix}")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        self.logger.debug(f"Creating session with headers: {headers}")
        self.session = aiohttp.ClientSession(headers=headers)
        
        self._status = EmbeddingProviderStatus.READY
        self.logger.info(f"OpenAI embedding provider initialized with model: {self.default_model}")
    
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
        
        # Log more details about the context - is this part of a chunk?
        context_info = getattr(self, 'context', {})
        self.logger.debug(f"Getting embedding for text (length: {text_length}) with model: {model_id}, context: {context_info}")
        
        # Check API key configuration
        if not self.api_key:
            self.logger.error("OpenAI API key not configured - this will likely fail")
        
        # Prepare request
        url = f"{self.api_base}/embeddings"
        payload = {
            "input": text,
            "model": model_id,
            "encoding_format": "float"  # Ensure we're setting this parameter
        }
        
        # Log the full request details (but mask the API key)
        headers_log = {"Authorization": "Bearer sk-...REDACTED..."}
        self.logger.info(f"OpenAI API Request: URL: {url}, Headers: {headers_log}, Payload size: {len(str(payload))} bytes")
        
        # Add text preview for debugging (first 50 chars)
        self.logger.debug(f"Text preview: '{text[:50]}...'")
        
        # Make request to OpenAI
        start_time = time.time()
        try:
            # Add logging for the request attempt
            self.logger.debug(f"Sending API request to OpenAI at {time.strftime('%H:%M:%S')}")
            
            async with self.session.post(url, json=payload) as response:
                # Log raw response for debugging
                response_text = await response.text()
                self.logger.info(f"OpenAI API Response: Status: {response.status}, Body length: {len(response_text)}")
                
                # Add more details for non-200 responses
                if response.status != 200:
                    self.logger.error(f"Error from OpenAI: Status: {response.status}")
                    self.logger.error(f"Response body: {response_text}")
                    self._status = EmbeddingProviderStatus.ERROR
                    self._last_error = f"Error from OpenAI API: {response.status} - {response_text}"
                    self._update_metrics(success=False, latency_ms=(time.time() - start_time) * 1000, tokens=0)
                    raise ValueError(f"Error from OpenAI API: {response.status} - {response_text}")
                
                try:
                    data = await response.json()
                    
                    # Log successful parsing of JSON
                    self.logger.debug("Successfully parsed JSON response")
                    
                    # Validate the response structure
                    if "data" not in data or not data["data"] or "embedding" not in data["data"][0]:
                        error_msg = f"Invalid response structure: {data}"
                        self.logger.error(error_msg)
                        raise ValueError(error_msg)
                    
                    # Extract embedding
                    embedding = data["data"][0]["embedding"]
                    dimension = len(embedding)
                    
                    # Log embedding characteristics
                    self.logger.debug(f"Embedding vector details: dimension={dimension}, first 3 values={embedding[:3]}")
                    
                    # Check for zero vectors or NaN values
                    has_nans = any(math.isnan(x) for x in embedding if isinstance(x, float))
                    has_zeros = all(x == 0 for x in embedding)
                    if has_nans:
                        self.logger.warning("Embedding contains NaN values")
                    if has_zeros:
                        self.logger.warning("Embedding contains all zeros")
                    
                    # Extract token usage information
                    usage = data.get("usage", {})
                    prompt_tokens = usage.get("prompt_tokens", 0)
                    total_tokens = usage.get("total_tokens", 0)
                    
                    elapsed = time.time() - start_time
                    self.logger.debug(f"Got embedding from OpenAI in {elapsed:.2f}s, dimension: {dimension}, tokens: {total_tokens}")
                    
                    # Update metrics
                    self._update_metrics(
                        success=True,
                        latency_ms=elapsed * 1000,
                        tokens=total_tokens
                    )
                    
                    # Update status
                    self._status = EmbeddingProviderStatus.READY
                    
                    # Create embedding vector
                    vector = EmbeddingVector(
                        vector=embedding,
                        model=model_id,
                        dimension=dimension,
                        normalized=False
                    )
                    
                    # Log success
                    self.logger.info(f"Successfully created embedding vector: dimension={dimension}, model={model_id}")
                    
                    return vector
                    
                except json.JSONDecodeError as json_err:
                    self.logger.error(f"Failed to parse JSON response: {str(json_err)}")
                    self.logger.error(f"Raw response: {response_text[:500]}...")
                    raise
                    
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
        
        # Prepare request
        url = f"{self.api_base}/embeddings"
        payload = {
            "input": texts,
            "model": model_id
        }
        
        # Make request to OpenAI
        start_time = time.time()
        try:
            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"Error from OpenAI: {error_text}")
                    self._status = EmbeddingProviderStatus.ERROR
                    self._last_error = f"Error from OpenAI API: {response.status} - {error_text}"
                    self._update_metrics(success=False, latency_ms=(time.time() - start_time) * 1000, tokens=0)
                    raise ValueError(f"Error from OpenAI API: {response.status} - {error_text}")
                
                data = await response.json()
                
                # Extract embeddings and sort by index to ensure order is preserved
                embedding_data = sorted(data["data"], key=lambda x: x["index"])
                embeddings = []
                
                for item in embedding_data:
                    vector = item["embedding"]
                    dimension = len(vector)
                    
                    embeddings.append(EmbeddingVector(
                        vector=vector,
                        model=model_id,
                        dimension=dimension,
                        normalized=False
                    ))
                
                # Extract token usage information
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                total_tokens = usage.get("total_tokens", 0)
                
                elapsed = time.time() - start_time
                self.logger.debug(f"Got {len(embeddings)} embeddings from OpenAI in {elapsed:.2f}s, tokens: {total_tokens}")
                
                # Update metrics
                self._update_metrics(
                    success=True,
                    latency_ms=elapsed * 1000,
                    tokens=total_tokens
                )
                
                # Update status
                self._status = EmbeddingProviderStatus.READY
                
                return embeddings
                
        except Exception as e:
            elapsed = time.time() - start_time
            self.logger.error(f"Error batch embedding: {str(e)}", exc_info=True)
            self._status = EmbeddingProviderStatus.ERROR
            self._last_error = str(e)
            self._update_metrics(success=False, latency_ms=elapsed * 1000, tokens=0)
            raise
    
    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available embedding models.
        
        Returns:
            List of model information dictionaries
        """
        return [
            {
                "id": "text-embedding-ada-002",
                "name": "Ada 002",
                "dimensions": self.model_dimensions["text-embedding-ada-002"],
                "provider": "openai",
                "description": "Good balance of quality and performance"
            },
            {
                "id": "text-embedding-3-small",
                "name": "Embedding 3 Small",
                "dimensions": self.model_dimensions["text-embedding-3-small"],
                "provider": "openai",
                "description": "Most cost-effective embeddings for many use cases"
            },
            {
                "id": "text-embedding-3-large",
                "name": "Embedding 3 Large",
                "dimensions": self.model_dimensions["text-embedding-3-large"],
                "provider": "openai",
                "description": "Most powerful model for embeddings"
            }
        ]
    
    async def shutdown(self) -> None:
        """Clean up provider resources."""
        await super().shutdown()
        if self.session:
            self.logger.debug("Closing aiohttp session")
            await self.session.close()
            self.session = None