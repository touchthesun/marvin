# core/infrastructure/embeddings/providers/simulated.py
import random
import math
from typing import Dict, Any
from datetime import datetime

from core.domain.embeddings.models import EmbeddingVector
from core.infrastructure.embeddings.providers.base import BaseEmbeddingProvider
from core.utils.logger import get_logger

class SimulatedEmbeddingProvider(BaseEmbeddingProvider):
    """A simulated embedding provider for testing."""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize the simulated provider."""
        super().__init__(config)
        self.dimensions = config.get("dimensions", 10)
        self.logger = get_logger(__name__)
        self.logger.info(f"Initialized simulated embedding provider with {self.dimensions} dimensions")
    
    async def initialize(self):
        """Initialize the provider (no-op for simulated provider)."""
        self.logger.info("Simulated provider initialized")
        self.initialized = True
    
    async def get_embedding(self, text: str, model: str = None) -> EmbeddingVector:
        """Generate a simulated embedding for testing."""
        # Create a deterministic but seemingly random embedding based on text hash
        seed = sum(ord(c) for c in text) % 10000
        random.seed(seed)
        
        # Generate vector
        vector = [random.uniform(-0.1, 0.1) for _ in range(self.dimensions)]
        
        # Normalize
        magnitude = math.sqrt(sum(x*x for x in vector))
        if magnitude > 0:
            vector = [x/magnitude for x in vector]
        
        return EmbeddingVector(
            vector=vector,
            model=model or "simulated-model",
            dimension=self.dimensions,
            normalized=True,
            created_at=datetime.now()
        )
    
    async def shutdown(self):
        """Shut down the provider (no-op for simulated provider)."""
        self.logger.info("Simulated provider shut down")