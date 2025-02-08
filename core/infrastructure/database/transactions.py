import asyncio
from dataclasses import dataclass
from typing import Optional, Dict, Callable, T
from uuid import UUID
from datetime import datetime
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    SessionExpired,
)

from core.utils.logger import get_logger


class Transaction:
    """Represents an active transaction."""
    
    def __init__(self):
        self._neo4j_tx = None
        self._operations = []
        self._rollback_handlers = []
        self.logger = get_logger(__name__)

    async def commit(self):
        """Commit the transaction."""
        try:
            if self._neo4j_tx:
                await self._neo4j_tx.commit()
        except Exception as e:
            self.logger.error(f"Commit failed: {str(e)}", exc_info=True)
            await self.rollback()
            raise

    async def rollback(self):
        """Rollback the transaction."""
        try:
            # Execute rollback handlers in reverse order
            for handler in reversed(self._rollback_handlers):
                try:
                    await handler()
                except Exception as e:
                    self.logger.error(f"Rollback handler failed: {str(e)}", exc_info=True)
            
            if self._neo4j_tx:
                await self._neo4j_tx.rollback()
        except Exception as e:
            self.logger.error(f"Rollback failed: {str(e)}", exc_info=True)
            raise

    def add_rollback_handler(self, handler):
        """Add a rollback handler to be called on transaction failure."""
        self._rollback_handlers.append(handler)



@dataclass
class TransactionConfig:
    """Configuration for transaction retry behavior."""
    max_retries: int = 3
    initial_retry_delay: float = 1.0  # seconds
    max_retry_delay: float = 8.0  # seconds
    backoff_factor: float = 2.0

class TransactionManager:
    """Manages database transactions with retry logic."""

    def __init__(self, config: Optional[TransactionConfig] = None):
        self.config = config or TransactionConfig()
        self.logger = get_logger(__name__)
        self._retry_stats: Dict[str, Dict] = {}

    async def execute_in_transaction(
        self,
        tx_func: Callable[..., T],
        *args,
        transaction_id: Optional[str] = None,
        **kwargs
    ) -> T:
        """Execute with retry logic using Neo4j's error classification.
        
        Args:
            tx_func: Function to execute in transaction
            transaction_id: Optional ID for tracking retry patterns
            *args: Positional arguments for tx_func
            **kwargs: Keyword arguments for tx_func
        """
        attempt = 0
        last_error = None
        retry_delay = self.config.initial_retry_delay
        tx_id = transaction_id or str(uuid.uuid4())

        while attempt < self.config.max_retries:
            try:
                result = await tx_func(*args, **kwargs)
                
                # Clear retry stats on success
                if tx_id in self._retry_stats:
                    del self._retry_stats[tx_id]
                    
                return result

            except Exception as e:
                attempt += 1
                last_error = e

                if isinstance(e, Neo4jError):
                    if not e.is_retryable():
                        self.logger.error(
                            "Non-retryable Neo4j error",
                            extra={
                                "error_code": e.code,
                                "error_msg": e.message,
                                "transaction_id": tx_id
                            }
                        )
                        raise

                    # Track retry statistics
                    if tx_id not in self._retry_stats:
                        self._retry_stats[tx_id] = {
                            "first_error": datetime.now(),
                            "attempts": 0,
                            "error_codes": []
                        }
                    
                    stats = self._retry_stats[tx_id]
                    stats["attempts"] += 1
                    stats["error_codes"].append(e.code)
                    stats["last_error"] = datetime.now()

                    self.logger.warning(
                        "Retryable Neo4j error",
                        extra={
                            "error_code": e.code,
                            "error_msg": e.message,
                            "attempt": attempt,
                            "retry_delay": retry_delay,
                            "transaction_id": tx_id
                        }
                    )

                elif isinstance(e, (ServiceUnavailable, SessionExpired)):
                    self.logger.warning(
                        "Service/Session error",
                        extra={
                            "error_type": type(e).__name__,
                            "error_msg": str(e),
                            "attempt": attempt,
                            "transaction_id": tx_id
                        }
                    )
                else:
                    self.logger.error(
                        "Unexpected error in transaction",
                        extra={
                            "error_type": type(e).__name__,
                            "error_msg": str(e),
                            "transaction_id": tx_id
                        }
                    )
                    raise

                if attempt >= self.config.max_retries:
                    self._log_retry_exhaustion(tx_id, e, attempt)
                    raise

                await asyncio.sleep(retry_delay)
                retry_delay = min(
                    retry_delay * self.config.backoff_factor,
                    self.config.max_retry_delay
                )

        raise last_error

    def _log_retry_exhaustion(
        self,
        tx_id: str,
        error: Exception,
        attempts: int
    ):
        """Log detailed information about retry exhaustion."""
        extra = {
            "transaction_id": tx_id,
            "attempts": attempts,
            "error_type": type(error).__name__,
            "error_msg": str(error)
        }

        if tx_id in self._retry_stats:
            stats = self._retry_stats[tx_id]
            extra.update({
                "first_error_time": stats["first_error"].isoformat(),
                "last_error_time": stats["last_error"].isoformat(),
                "error_codes": stats["error_codes"]
            })

        self.logger.error("Max retries exceeded in transaction", extra=extra)
