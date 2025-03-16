import neo4j
import asyncio

from typing import Dict, List, Optional, AsyncIterator
from contextlib import asynccontextmanager
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    SessionExpired,
)
from core.common.errors import DatabaseError, QueryTimeoutError, QueryExecutionError
from core.utils.logger import get_logger
from core.infrastructure.database.metrics import DatabaseMetrics
from core.infrastructure.database.transactions import (
    Transaction, 
    TransactionManager, 
    TransactionConfig
)

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
        self.metrics_collector = DatabaseMetrics()
        
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
        """Get a managed database transaction with enhanced error logging."""
        session = None
        tx = Transaction()
        neo4j_tx = None
        
        try:
            self.logger.debug("Starting database transaction")
            # Create session
            if not self._driver:
                self.logger.debug("Initializing driver before transaction")
                await self.initialize()
                
            session = self._driver.session()
            self.logger.debug(f"Created session: {id(session)}")
            
            try:
                # Begin transaction
                self.logger.debug("Beginning transaction")
                neo4j_tx = await session.begin_transaction()
                self.logger.debug(f"Created transaction: {id(neo4j_tx)}")
                
                # Set transaction on our wrapper
                await tx.set_db_transaction(neo4j_tx)
                self.logger.debug("Transaction initialized successfully")
                
                # Yield transaction to caller
                yield tx
                
                # Commit if we get here
                self.logger.debug("Committing transaction")
                await tx.commit()
                self.logger.debug("Transaction committed successfully")
                
            except Exception as e:
                self.logger.error(f"Error in transaction: {str(e)}", exc_info=True)
                if tx:
                    self.logger.debug("Rolling back transaction due to error")
                    try:
                        await tx.rollback()
                        self.logger.debug("Transaction rollback successful")
                    except Exception as rollback_error:
                        self.logger.error(f"Error during rollback: {str(rollback_error)}")
                
                if isinstance(e, DatabaseError):
                    raise
                else:
                    raise DatabaseError(
                        message="Transaction failed",
                        cause=e
                    )
        except Exception as outer_e:
            self.logger.error(f"Outer error in transaction: {str(outer_e)}", exc_info=True)
            raise
        finally:
            # Always close the session
            if session:
                self.logger.debug(f"Closing session: {id(session)}")
                try:
                    await session.close()
                    self.logger.debug("Session closed successfully")
                except Exception as close_error:
                    self.logger.error(f"Error closing session: {str(close_error)}")
        
    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict] = None,
        transaction: Optional[Transaction] = None,
        read_only: bool = False,
        transaction_id: Optional[str] = None,
        timeout: int = 15
    ) -> List[Dict]:
        """Execute a database query with timeout and enhanced logging."""
        self.logger.debug(f"Executing query (timeout: {timeout}s): {query[:100]}...")
        
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
                    self.logger.debug("Transaction has no database transaction, initializing")
                    session = self._driver.session()
                    await tx.initialize_db_transaction(session)
                
                self.logger.debug(f"Executing query in transaction: {query[:100]}...")
                
                # Add timeout to query execution
                result = await asyncio.wait_for(
                    tx.db_transaction.run(query, parameters or {}),
                    timeout=timeout
                )
                
                self.logger.debug("Query executed, fetching data")
                data = await asyncio.wait_for(
                    result.data(),
                    timeout=timeout
                )
                
                self.logger.debug("Data fetched, consuming results")
                await asyncio.wait_for(
                    result.consume(),
                    timeout=timeout
                )
                
                self.logger.debug(f"Query completed successfully, returning {len(data)} records")
                return data
                
            except asyncio.TimeoutError:
                self.logger.error(f"Query execution timed out after {timeout}s")
                raise DatabaseError(
                    message=f"Query execution timed out after {timeout}s",
                    query=query,
                    parameters=parameters
                )
            except Exception as e:
                self.logger.error(
                    f"Query execution error: {str(e)}",
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
                # Create a new transaction through our method
                async with self.transaction() as tx:
                    return await run_query(tx)
                        
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

            
    async def check_connection_pool(self) -> Dict:
        """Check connection pool status."""
        if not self._driver:
            return {"status": "not_initialized"}
            
        try:
            # For Neo4j 5.x driver
            if hasattr(self._driver, "get_stats"):
                stats = self._driver.get_stats()
                return {
                    "in_use": stats.in_use,
                    "idle": stats.idle,
                    "max_size": self.config.max_connection_pool_size,
                    "status": "healthy" if stats.in_use < self.config.max_connection_pool_size else "at_capacity"
                }
            # Fallback for driver without statistics
            return {
                "max_size": self.config.max_connection_pool_size,
                "status": "metrics_unavailable"
            }
        except AttributeError:
            # Fallback for Neo4j driver versions that don't support statistics
            return {"status": "metrics_unavailable"}
        except Exception as e:
            self.logger.error(f"Error checking connection pool: {str(e)}")
            return {"status": "error", "message": str(e)}

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
    
    @property
    def transaction_manager(self):
        """Alias for _tx_manager for backward compatibility."""
        return self._tx_manager
