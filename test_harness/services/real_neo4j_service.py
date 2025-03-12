from test_harness.mocks.mock_neo4j_service import BaseMockService
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.graph_operations import GraphOperationManager
from core.infrastructure.database.transactions import Transaction
from core.utils.logger import get_logger
from contextlib import asynccontextmanager

class RealNeo4jService(BaseMockService):
    """Real Neo4j service implementation for test harness.
    
    Uses the existing database infrastructure to provide the same interface as the mock service.
    """
    
    def __init__(self, config):
        super().__init__(config)
        self.logger = get_logger(__name__)
        
        # Extract Neo4j connection config from test config
        neo4j_config = config.get("neo4j", {})
        uri = neo4j_config.get("uri")
        username = neo4j_config.get("username")
        password = neo4j_config.get("password")
        
        self.logger.info(f"Initializing real Neo4j connection to {uri}")
        
        # Create connection configuration
        self.connection_config = ConnectionConfig(
            uri=uri,
            username=username,
            password=password
        )
        
        # Create database connection
        self.connection = None
        self.graph_manager = None
    
    async def initialize(self):
        """Initialize the Neo4j service with real database connection."""
        await super().initialize()
        
        try:
            # Initialize database connection
            self.connection = DatabaseConnection(self.connection_config)
            await self.connection.initialize()
            
            # Initialize graph operation manager
            self.graph_manager = GraphOperationManager(self.connection)
            
            # Test connection
            result = await self.execute_query("RETURN 1 as test")
            self.logger.info(f"Neo4j connection test: {result}")
            
            return self
        except Exception as e:
            self.logger.error(f"Failed to initialize Neo4j service: {str(e)}")
            raise
    
    async def shutdown(self):
        """Shut down the Neo4j service."""
        if self.connection:
            await self.connection.shutdown()
        await super().shutdown()
    
    async def execute_query(self, query, params=None, transaction=None):
        """Execute a Cypher query on the real database."""
        try:
            return await self.connection.execute_query(
                query, 
                parameters=params,
                transaction=transaction
            )
        except Exception as e:
            self.logger.error(f"Error executing query: {str(e)}")
            raise
    
    @asynccontextmanager
    async def transaction(self):
        """Get a transaction context manager."""
        if not self.connection:
            self.logger.error("Cannot create transaction: database connection not initialized")
            raise RuntimeError("Database connection not initialized")
            
        # Use the transaction context manager from the connection
        async with self.connection.transaction() as tx:
            self.logger.debug(f"Created transaction: {tx}")
            yield tx
    
    async def clear_data(self):
        """Clear all data from the database."""
        try:
            # Use a transaction for consistent state
            async with self.transaction() as tx:
                # Delete all relationships first
                await self.execute_query(
                    "MATCH ()-[r]-() DELETE r",
                    transaction=tx
                )
                self.logger.info("Cleared all relationships")
                
                # Then delete all nodes
                await self.execute_query(
                    "MATCH (n) DELETE n",
                    transaction=tx
                )
                self.logger.info("Cleared all nodes")
            
            return True
        except Exception as e:
            self.logger.error(f"Error clearing database: {str(e)}")
            return False
    
    async def apply_schema(self, schema_script):
        """Apply schema definitions to the database."""
        try:
            # Read schema script
            with open(schema_script, 'r') as f:
                schema_cypher = f.read()
            
            # Split into statements (assumes ; as separator)
            statements = [s.strip() for s in schema_cypher.split(';') if s.strip()]
            
            # Execute each statement in its own transaction
            for i, statement in enumerate(statements):
                if statement:
                    try:
                        async with self.transaction() as tx:
                            await self.execute_query(statement, transaction=tx)
                            self.logger.debug(f"Executed schema statement {i+1}/{len(statements)}")
                    except Exception as e:
                        self.logger.error(f"Error executing schema statement {i+1}: {str(e)}")
                        self.logger.error(f"Statement: {statement}")
                        raise
            
            self.logger.info(f"Successfully applied schema with {len(statements)} statements")
            return True
        except Exception as e:
            self.logger.error(f"Error applying schema: {str(e)}")
            return False
    
    # Mock-compatible API with transaction support
    async def page_exists(self, url, transaction=None):
        """Check if a page exists in the database."""
        result = await self.execute_query(
            "MATCH (p:Page {url: $url}) RETURN count(p) as count", 
            {"url": url},
            transaction=transaction
        )
        return result[0]["count"] > 0
    
    async def has_keywords(self, url, transaction=None):
        """Check if a page has associated keywords."""
        result = await self.execute_query(
            "MATCH (p:Page {url: $url})-[:HAS_KEYWORD]->(k) RETURN count(k) as count", 
            {"url": url},
            transaction=transaction
        )
        return result[0]["count"] > 0
    
    async def has_relationships(self, url, transaction=None):
        """Check if a page has non-keyword relationships."""
        result = await self.execute_query(
            """
            MATCH (p:Page {url: $url})-[r]->(o)
            WHERE type(r) <> 'HAS_KEYWORD'
            RETURN count(r) as count
            """, 
            {"url": url},
            transaction=transaction
        )
        return result[0]["count"] > 0
    
    # Access to graph operations manager
    def get_graph_manager(self):
        """Get the graph operations manager."""
        return self.graph_manager
    
    # Methods required by test harness interface
    def get_driver(self):
        """Get the underlying Neo4j driver."""
        if self.connection and hasattr(self.connection, '_driver'):
            return self.connection._driver
        return None