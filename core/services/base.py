from typing import Any
from core.infrastructure.database.transactions import Transaction
from core.utils.logger import get_logger

logger = get_logger(__name__)

class BaseService:
    """Base class for all API services with transaction support."""
    
    def __init__(self):
        self.logger = logger

    async def initialize(self) -> None:
        """Initialize service resources."""
        pass

    async def cleanup(self) -> None:
        """Cleanup service resources."""
        pass

    async def execute_in_transaction(self, tx: Transaction, operation: str, *args, **kwargs) -> Any:
        """Execute an operation within a transaction context."""
        try:
            # Get the operation method
            method = getattr(self, f"_{operation}")
            # Execute with transaction context
            result = await method(tx, *args, **kwargs)
            return result
        except Exception as e:
            self.logger.error(f"Operation {operation} failed: {str(e)}", exc_info=True)
            raise