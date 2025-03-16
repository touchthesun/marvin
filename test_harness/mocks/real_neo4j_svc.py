import os
import json
from typing import Dict, List, Any, Optional

from core.utils.logger import get_logger
from core.infrastructure.database.db_connection import ConnectionConfig, DatabaseConnection
from core.infrastructure.database.transactions import TransactionConfig

class RealNeo4jService:
    """
    Real Neo4j service implementation for integration testing.
    
    This service connects to an actual Neo4j instance for integration testing,
    leveraging the same transaction and connection management as the production code.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize Neo4j service with provided configuration.
        
        Args:
            config: Configuration dict with neo4j connection parameters
        """
        self.config = config
        self.uri = config.get("uri", "bolt://localhost:7687")
        self.username = config.get("username", "neo4j")
        self.password = config.get("password", "password")
        self.database = config.get("database", "neo4j")
        
        # Log the configuration to debug connection issues
        self.logger = get_logger("test.real.neo4j")
        self.logger.info(f"Creating RealNeo4jService with URI: {self.uri}, username: {self.username}")
        self.logger.debug(f"Full Neo4j config: {self.config}")
        
        # Setup transaction configuration
        tx_config = TransactionConfig(
            max_retries=config.get("max_retries", 3),
            initial_retry_delay=config.get("initial_retry_delay", 1.0),
            max_retry_delay=config.get("max_retry_delay", 8.0),
            backoff_factor=config.get("backoff_factor", 2.0)
        )
        
        # Create connection config
        self.connection_config = ConnectionConfig(
            uri=self.uri,
            username=self.username,
            password=self.password,
            max_connection_pool_size=config.get("max_connection_pool_size", 10),
            connection_timeout=config.get("connection_timeout", 30),
            transaction_config=tx_config
        )
        
        # Initialize database connection
        self.db_connection = DatabaseConnection(self.connection_config)
        
    async def initialize(self):
        """
        Initialize the Neo4j connection and prepare for testing.
        
        Returns:
            Self reference for fluent API usage
        """
        self.logger.info(f"Initializing Neo4j connection to {self.uri}")
        
        try:
            # Initialize connection
            await self.db_connection.initialize()
            
            # Verify connection by running a simple query
            await self._verify_connection()
            
            # Initialize schema if configured to do so
            if self.config.get("initialize_schema", True):
                await self._initialize_schema()
            
            self.logger.info(f"Neo4j connection successfully established to {self.uri}")
            return self
            
        except Exception as e:
            self.logger.error(f"Failed to connect to Neo4j at {self.uri}: {str(e)}")
            # Make sure to clean up if initialization fails
            await self.shutdown()
            raise
            
    async def shutdown(self):
        """Close the Neo4j connection and clean up resources."""
        self.logger.info("Shutting down Neo4j connection")
        
        try:
            await self.db_connection.shutdown()
            self.logger.info("Neo4j connection closed successfully")
        except Exception as e:
            self.logger.error(f"Error shutting down Neo4j connection: {str(e)}")
    
    async def clear_data(self):
        """Clear all data in the Neo4j database."""
        self.logger.info("Clearing all data from Neo4j database")
        
        query = "MATCH (n) DETACH DELETE n"
        
        try:
            # This needs to be a write query without transaction parameter
            await self.db_connection.execute_write_query(query)
            
            # Verify database is empty
            verify_query = "MATCH (n) RETURN count(n) as count"
            result = await self.db_connection.execute_read_query(verify_query)
            
            count = result[0]["count"] if result and len(result) > 0 else -1
            
            if count != 0:
                self.logger.warning(f"Database clear may not have completed successfully: {count} nodes remaining")
            else:
                self.logger.info("Database cleared successfully")
        except Exception as e:
            self.logger.error(f"Error clearing database: {str(e)}")
            raise
    
    async def load_test_data(self, data_file: str):
        """
        Load test data into the Neo4j database.
        
        Args:
            data_file: Path to JSON test data file or Cypher script
        """
        self.logger.info(f"Loading test data from {data_file}")
        
        if not os.path.exists(data_file):
            raise FileNotFoundError(f"Test data file not found: {data_file}")
        
        # Clear existing data first if configured to do so
        if self.config.get("clear_before_load", True):
            await self.clear_data()
        
        # Determine file type and load appropriately
        if data_file.endswith('.json'):
            await self._load_json_data(data_file)
        elif data_file.endswith('.cypher'):
            await self._load_cypher_data(data_file)
        else:
            raise ValueError(f"Unsupported test data format: {data_file}")
    
    async def _verify_connection(self):
        """Verify that the Neo4j connection is working."""
        query = "RETURN 1 as test"
        try:
            result = await self.db_connection.execute_read_query(query)
            
            if not result or len(result) == 0 or result[0].get("test") != 1:
                raise ConnectionError("Could not verify Neo4j connection")
            
            self.logger.debug("Neo4j connection verified successfully")
        except Exception as e:
            self.logger.error(f"Neo4j connection verification failed: {str(e)}")
            raise
    
    async def _initialize_schema(self):
        """Initialize the database schema for testing."""
        schema_script = self.config.get("schema_script")
        
        if schema_script and os.path.exists(schema_script):
            # Load schema from file
            await self._load_cypher_data(schema_script)
            self.logger.info(f"Loaded schema from {schema_script}")
        else:
            # Create default test schema
            await self._create_default_schema()
            self.logger.info("Created default test schema")
    
    async def _create_default_schema(self):
        """Create a default schema for testing."""
        schema_statements = [
            # Constraints
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Site) REQUIRE s.domain IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (k:Keyword) REQUIRE (k.text, k.language) IS NODE KEY",
            
            # Indexes
            "CREATE INDEX IF NOT EXISTS FOR (p:Page) ON (p.discovered_at)",
            "CREATE INDEX IF NOT EXISTS FOR (p:Page) ON (p.status)",
            "CREATE INDEX IF NOT EXISTS FOR (p:Page) ON (p.domain)"
        ]
        
        # Execute each statement individually
        for statement in schema_statements:
            try:
                self.logger.debug(f"Executing schema statement: {statement}")
                await self.db_connection.execute_write_query(statement)
            except Exception as e:
                self.logger.error(f"Error creating schema: {str(e)} - Statement: {statement}")
                raise
    
    async def _load_cypher_data(self, cypher_file: str):
        """
        Load test data using a Cypher script.
        
        Args:
            cypher_file: Path to Cypher script file
        """
        with open(cypher_file, 'r') as f:
            cypher = f.read()
        
        # Split script by semicolons to get individual statements
        statements = [stmt.strip() for stmt in cypher.split(';') if stmt.strip()]
        self.logger.info(f"Loaded {len(statements)} Cypher statements from {cypher_file}")
        
        # Execute statements one by one
        for i, statement in enumerate(statements):
            try:
                # Use write query for each statement
                self.logger.debug(f"Executing statement {i+1}/{len(statements)}")
                await self.db_connection.execute_write_query(statement)
            except Exception as e:
                self.logger.error(f"Error executing Cypher statement {i+1}: {str(e)}")
                self.logger.error(f"Statement: {statement}")
                raise
        
        self.logger.info(f"Successfully executed {len(statements)} Cypher statements")
    
    async def _load_json_data(self, json_file: str):
        """
        Load test data from a JSON file.
        
        The JSON file should contain nodes and relationships in a format
        compatible with Neo4j import.
        
        Args:
            json_file: Path to JSON file
        """
        with open(json_file, 'r') as f:
            data = json.load(f)
        
        node_count = 0
        rel_count = 0
        
        # Process nodes first
        if "nodes" in data:
            nodes = data["nodes"]
            self.logger.info(f"Loading {len(nodes)} nodes from JSON")
            
            for node_id, node_data in nodes.items():
                try:
                    labels = node_data.get("labels", ["Node"])
                    properties = node_data.get("properties", {})
                    
                    # Create node with labels and properties
                    labels_str = ':'.join(labels)
                    create_query = f"CREATE (n:{labels_str} $props)"
                    
                    await self.db_connection.execute_write_query(
                        create_query,
                        {"props": properties}
                    )
                    node_count += 1
                except Exception as e:
                    self.logger.error(f"Error creating node {node_id}: {str(e)}")
                    raise
        
        # Then process relationships
        if "relationships" in data:
            relationships = data["relationships"]
            self.logger.info(f"Loading {len(relationships)} relationships from JSON")
            
            for i, rel in enumerate(relationships):
                try:
                    from_id = rel.get("from")
                    to_id = rel.get("to")
                    rel_type = rel.get("type")
                    properties = rel.get("properties", {})
                    
                    # Create relationship between nodes
                    rel_query = """
                    MATCH (a), (b)
                    WHERE ID(a) = $from_id AND ID(b) = $to_id
                    CREATE (a)-[r:$type $props]->(b)
                    """
                    
                    # Special handling for relationship type and properties
                    # Neo4j doesn't allow parameterizing relationship types
                    rel_query = rel_query.replace("$type", rel_type)
                    
                    await self.db_connection.execute_write_query(
                        rel_query,
                        {
                            "from_id": from_id,
                            "to_id": to_id,
                            "props": properties
                        }
                    )
                    rel_count += 1
                except Exception as e:
                    self.logger.error(f"Error creating relationship {i}: {str(e)}")
                    raise
        
        self.logger.info(f"Successfully loaded {node_count} nodes and {rel_count} relationships from JSON")
    
    async def execute_query(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query against the Neo4j database.
        
        This method provides a simplified interface for test scripts.
        
        Args:
            query: Cypher query string
            parameters: Optional parameters for the query
            
        Returns:
            List of result records as dictionaries
        """
        # Determine if this is a read or write query
        # Simple heuristic: if it starts with MATCH, RETURN, CALL or SHOW, it's a read query
        query_upper = query.strip().upper()
        is_read_query = any(
            query_upper.startswith(keyword)
            for keyword in ["MATCH", "RETURN", "CALL", "SHOW"]
        ) and not any(
            keyword in query_upper
            for keyword in ["CREATE", "DELETE", "REMOVE", "SET", "MERGE"]
        )
        
        try:
            if is_read_query:
                self.logger.debug(f"Executing read query: {query}")
                return await self.db_connection.execute_read_query(query, parameters)
            else:
                self.logger.debug(f"Executing write query: {query}")
                return await self.db_connection.execute_write_query(query, parameters)
        except Exception as e:
            self.logger.error(f"Query execution error: {str(e)}")
            self.logger.error(f"Query: {query}")
            self.logger.error(f"Parameters: {parameters}")
            raise
    
    # Additional compatibility methods to match the mock service API
    async def create_test_node(self, labels: List[str], properties: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a test node with given labels and properties.
        
        Args:
            labels: List of node labels
            properties: Node properties
            
        Returns:
            Created node data
        """
        labels_str = ':'.join(labels)
        
        query = f"""
        CREATE (n:{labels_str} $props)
        RETURN n
        """
        
        try:
            result = await self.execute_query(query, {"props": properties})
            return result[0] if result else {}
        except Exception as e:
            self.logger.error(f"Error creating test node: {str(e)}")
            raise


    async def apply_schema(self, schema_script):
        """Apply schema definitions to the database.
        
        Args:
            schema_script: Path to Cypher script with schema definitions
            
        Returns:
            Boolean indicating success
        """
        self.logger.info(f"Applying schema from {schema_script}")
        
        try:
            # Check if file exists
            if not os.path.exists(schema_script):
                self.logger.error(f"Schema script file not found: {schema_script}")
                return False
                
            # Read schema script
            with open(schema_script, 'r') as f:
                schema_cypher = f.read()
            
            # Split into statements (assumes ; as separator)
            statements = [s.strip() for s in schema_cypher.split(';') if s.strip()]
            
            # Execute each statement
            for i, statement in enumerate(statements):
                try:
                    await self.execute_query(statement)
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