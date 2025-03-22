from core.utils.logger import get_logger
from typing import Dict, Any


class BaseMockService:
    """Base class for all mock services."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the mock service.
        
        Args:
            config: Service configuration
        """
        self.config = config
        self.logger = get_logger(f"test.mock.{self.__class__.__name__}")
        
    async def initialize(self):
        """Initialize the service."""
        self.logger.info(f"Initializing {self.__class__.__name__}")
        return self
        
    async def shutdown(self):
        """Shutdown the service."""
        self.logger.info(f"Shutting down {self.__class__.__name__}")