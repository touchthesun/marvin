from typing import Dict, List, Optional, AsyncContextManager
import neo4j
from contextlib import asynccontextmanager
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    SessionExpired,
)
from core.common.errors import DatabaseError
from core.utils.logger import get_logger
from core.infrastructure.database.transactions import TransactionManager, TransactionConfig


class ConnectionConfig:
    """Configuration for database connection."""
    def __init__(
        self,
        uri: str,
        username: str,
        password: str,
        max_connection_pool_size: int = 50,
        connection_timeout: int = 30,
        transaction_config: Optional[TransactionConfig] = None
    ):
        self.uri = uri
        self.username = username
        self.password = password
        self.max_connection_pool_size = max_connection_pool_size
        self.connection_timeout = connection_timeout
        self.transaction_config = transaction_config or TransactionConfig()

class DatabaseConnection:
    """Low-level database connection management.
    
    Responsibilities:
    - Connection lifecycle management
    - Connection pooling
    - Basic query execution
    - Transaction management
    - Low-level error handling
    """
    
    def __init__(self, config: ConnectionConfig):
        self.config = config
        self._driver: Optional[AsyncDriver] = None
        self._tx_manager = TransactionManager(config.transaction_config)
        self.logger = get_logger(__name__)
        
    async def initialize(self) -> None:
        """Initialize and verify database connection."""
        try:
            if not self._driver:
                self.logger.debug("Initializing database connection")
                self._driver = AsyncGraphDatabase.driver(
                    self.config.uri,
                    auth=(self.config.username, self.config.password),
                    max_connection_pool_size=self.config.max_connection_pool_size,
                    connection_timeout=self.config.connection_timeout
                )
                # Verify connectivity
                await self._driver.verify_connectivity()
                self.logger.info(
                    "Successfully initialized database connection",
                    extra={"uri": self.config.uri}
                )
                
        except Exception as e:
            self.logger.error(
                "Failed to initialize database connection",
                extra={
                    "error": str(e),
                    "uri": self.config.uri
                }
            )
            raise DatabaseError(
                message="Failed to initialize database connection",
                cause=e
            )
        
    async def shutdown(self) -> None:
        """Clean up database connections."""
        if self._driver:
            try:
                self.logger.debug("Shutting down database connection")
                await self._driver.close()
                self._driver = None
                self.logger.info("Successfully closed database connection")
            except Exception as e:
                self.logger.error(
                    "Error during database shutdown",
                    extra={"error": str(e)}
                )
                raise DatabaseError(
                    message="Error during database shutdown",
                    cause=e
                )
    
    @asynccontextmanager
    async def session(self) -> AsyncContextManager[AsyncSession]:
        """Get a database session."""
        if not self._driver:
            await self.initialize()
        
        session = None
        try:
            session = self._driver.session()
            yield session
        finally:
            if session:
                await session.close()
    
    @asynccontextmanager
    async def transaction(self) -> AsyncContextManager[neo4j.AsyncTransaction]:
        """Get a managed database transaction."""
        async with self.session() as session:
            tx = None
            try:
                tx = await session.begin_transaction()
                yield tx
                await tx.commit()
            except Exception as e:
                if tx:
                    await tx.rollback()
                raise DatabaseError(
                    message="Transaction failed",
                    cause=e
                )
    
    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict] = None,
        transaction: Optional[neo4j.AsyncTransaction] = None,
        read_only: bool = False,
        transaction_id: Optional[str] = None
    ) -> List[Dict]:
        """Execute a database query with retry support.
        
        Args:
            query: The Cypher query to execute
            parameters: Optional query parameters
            transaction: Optional existing transaction
            read_only: Whether this is a read-only query
            transaction_id: Optional ID for tracking retries
            
        Returns:
            List of query result records as dictionaries
            
        Raises:
            DatabaseError: If query execution fails
        """
        
        async def run_query(tx: neo4j.AsyncTransaction) -> List[Dict]:
            try:
                result = await tx.run(query, parameters or {})
                data = await result.data()
                await result.consume()
                return data
            except Exception as e:
                self.logger.error(
                    "Query execution error",
                    extra={
                        "query": query,
                        "parameters": parameters,
                        "error": str(e)
                    }
                )
                raise DatabaseError(
                    message="Query execution failed",
                    query=query,
                    parameters=parameters,
                    cause=e
                )
        
        try:
            if transaction:
                # Use existing transaction
                return await run_query(transaction)
            else:
                # Execute with retry logic through transaction manager
                async def wrapped_query():
                    async with self.transaction() as tx:
                        return await run_query(tx)
                
                return await self._tx_manager.execute_in_transaction(
                    wrapped_query,
                    transaction_id=transaction_id
                )
                
        except Exception as e:
            if isinstance(e, DatabaseError):
                raise
            self.logger.error(
                "Query execution failed",
                extra={
                    "query": query,
                    "parameters": parameters,
                    "read_only": read_only,
                    "error": str(e)
                }
            )
            raise DatabaseError(
                message="Query execution failed",
                query=query,
                parameters=parameters,
                cause=e
            )

    async def execute_read_query(
        self,
        query: str,
        parameters: Optional[Dict] = None,
        transaction_id: Optional[str] = None
    ) -> List[Dict]:
        """Execute a read-only query."""
        return await self.execute_query(
            query,
            parameters,
            read_only=True,
            transaction_id=transaction_id
        )

    async def execute_write_query(
        self,
        query: str,
        parameters: Optional[Dict] = None,
        transaction_id: Optional[str] = None
    ) -> List[Dict]:
        """Execute a write query."""
        return await self.execute_query(
            query,
            parameters,
            read_only=False,
            transaction_id=transaction_id
        )

    def _handle_database_error(
        self,
        error: Exception,
        query: Optional[str] = None,
        parameters: Optional[Dict] = None
    ) -> DatabaseError:
        """Transform database errors into DatabaseError instances."""
        if isinstance(error, Neo4jError):
            message = f"Neo4j error ({error.code}): {error.message}"
        elif isinstance(error, ServiceUnavailable):
            message = "Database service unavailable"
        elif isinstance(error, SessionExpired):
            message = "Database session expired"
        else:
            message = f"Database error: {str(error)}"
            
        return DatabaseError(
            message=message,
            query=query,
            parameters=parameters,
            cause=error
        )