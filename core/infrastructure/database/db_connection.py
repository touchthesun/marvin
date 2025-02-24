from typing import Dict, List, Optional, AsyncIterator
from contextlib import asynccontextmanager
import neo4j
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    SessionExpired,
)
from core.common.errors import DatabaseError
from core.utils.logger import get_logger
from core.infrastructure.database.transactions import Transaction, TransactionManager, TransactionConfig


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
    async def session(self) -> AsyncIterator[AsyncSession]:
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
    async def transaction(self) -> AsyncIterator[Transaction]:
        """Get a managed database transaction."""
        async with self.session() as session:
            tx = Transaction()
            neo4j_tx = None
            try:
                neo4j_tx = await session.begin_transaction()
                await tx.set_db_transaction(neo4j_tx)
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
        transaction: Optional[Transaction] = None,
        read_only: bool = False,
        transaction_id: Optional[str] = None
    ) -> List[Dict]:
        """Execute a database query with retry support."""
        
        async def run_query(tx: Transaction) -> List[Dict]:
            try:
                # Verify we have a valid transaction
                if not isinstance(tx, Transaction):
                    raise DatabaseError(
                        message="Invalid transaction type",
                        details={"tx_type": str(type(tx))}
                    )
                
                if tx.db_transaction is None:
                    # Create a new session and initialize the transaction
                    session = self._driver.session()
                    await tx.initialize_db_transaction(session)
                
                result = await tx.db_transaction.run(query, parameters or {})
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
                # Use existing transaction or initialize it if needed
                return await run_query(transaction)
            else:
                # Create new transaction through context manager
                async def wrapped_query():
                    tx = Transaction()
                    try:
                        return await run_query(tx)
                    finally:
                        await tx.commit()  # This will also clean up resources
                
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
        transaction: Optional[neo4j.AsyncTransaction] = None,
        transaction_id: Optional[str] = None
    ) -> List[Dict]:
        """Execute a read-only query.
        
        Args:
            query: The Cypher query to execute
            parameters: Optional query parameters
            transaction: Optional existing transaction
            transaction_id: Optional ID for tracking retries
            
        Returns:
            List of query result records as dictionaries
        """
        return await self.execute_query(
            query,
            parameters,
            transaction=transaction,
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