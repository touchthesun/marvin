import json
from neo4j import AsyncGraphDatabase
from core.utils.logger import get_logger



class RealNeo4jService:
    """Real Neo4j service for testing using local Neo4j instance."""

    def __init__(self, config):
        self.config = config
        self.uri = config.get("uri", "bolt://localhost:7687")
        self.username = config.get("username", "neo4j")
        self.password = config.get("password", "password")
        self.driver = None
        self.logger = get_logger("test.real.neo4j")
        self.initialized = False

    async def initialize(self):
        """Initialize Neo4j connection."""
        try:
            # Initialize Neo4j driver
            await self._init_driver()

            # Initialize or validate test schema
            await self._init_schema()

            self.initialized = True
            return self

        except Exception as e:
            self.logger.error(f"Neo4j initialization failed: {str(e)}")
            await self.shutdown()
            raise

    async def _init_driver(self):
        """Initialize connection to Neo4j."""
        self.driver = AsyncGraphDatabase.driver(
            self.uri,
            auth=(self.username, self.password)
        )
        # Verify connectivity
        await self.driver.verify_connectivity()
        self.logger.info(f"Connected to Neo4j at {self.uri}")

    async def _init_schema(self):
        """Initialize or validate schema for testing."""
        # Check if we need to create test schema
        if self.config.get("use_test_schema", True):
            schema_script = self.config.get("schema_script", None)
            if schema_script:
                await self._execute_script(schema_script)
            else:
                # Apply default test schema
                await self._create_default_test_schema()

        # Validate schema
        is_valid = await self._validate_schema()
        if not is_valid:
            raise Exception("Neo4j schema validation failed")

    async def shutdown(self):
        """Shut down Neo4j resources."""
        try:
            if self.driver:
                await self.driver.close()
                self.driver = None

            self.initialized = False

        except Exception as e:
            self.logger.error(f"Neo4j shutdown error: {str(e)}")

    async def clear_data(self):
        """Clear all data in the graph."""
        query = "MATCH (n) DETACH DELETE n"
        await self.execute_query(query)

    async def load_test_data(self, data_file):
        """Load test data from Cypher or JSON file."""
        if data_file.endswith('.cypher'):
            await self._execute_script(data_file)
        elif data_file.endswith('.json'):
            await self._load_json_data(data_file)
        else:
            raise ValueError(f"Unsupported data file format: {data_file}")

    async def execute_query(self, query, parameters=None):
        """Execute a Cypher query against Neo4j."""
        async with self.driver.session() as session:
            result = await session.run(query, parameters or {})
            data = await result.data()
            return data

    async def _execute_script(self, script_path):
        """Execute a Cypher script file."""
        with open(script_path, 'r') as f:
            script = f.read()

        # Split script into statements
        statements = [s.strip() for s in script.split(';') if s.strip()]

        async with self.driver.session() as session:
            for statement in statements:
                await session.run(statement)

        self.logger.info(f"Executed script: {script_path}")

    async def _validate_schema(self):
        """Validate current schema state."""
        try:
            # Check constraints
            constraints = await self.execute_query("SHOW CONSTRAINTS")

            # Check indexes  
            indexes = await self.execute_query("SHOW INDEXES")

            # Basic validation logic
            required_constraints = ["page_url", "site_url", "keyword_id"]
            for req in required_constraints:
                found = any(c.get("name") == req for c in constraints)
                if not found:
                    self.logger.warning(f"Required constraint missing: {req}")
                    return False

            self.logger.info("Schema validation passed")
            return True

        except Exception as e:
            self.logger.error(f"Schema validation error: {str(e)}")
            return False

    async def _create_default_test_schema(self):
        """Create default schema for testing."""
        constraints = [
            "CREATE CONSTRAINT page_url IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE",
            "CREATE CONSTRAINT site_url IF NOT EXISTS FOR (s:Site) REQUIRE s.url IS UNIQUE",
            "CREATE CONSTRAINT keyword_id IF NOT EXISTS FOR (k:Keyword) REQUIRE k.id IS UNIQUE"
        ]

        indexes = [
            "CREATE INDEX page_metadata IF NOT EXISTS FOR (p:Page) ON (p.metadata_quality_score)",
            "CREATE INDEX keyword_normalized_text IF NOT EXISTS FOR (k:Keyword) ON (k.normalized_text)"
        ]

        async with self.driver.session() as session:
            for constraint in constraints:
                await session.run(constraint)

            for index in indexes:
                await session.run(index)

        self.logger.info("Created default test schema")

    async def _load_json_data(self, json_file):
        """Load test data from JSON file."""

        with open(json_file, 'r') as f:
            data = json.load(f)

        if "nodes" in data:
            await self._create_nodes_from_json(data["nodes"])

        if "relationships" in data:
            await self._create_relationships_from_json(data["relationships"])

        self.logger.info(f"Loaded JSON data from {json_file}")

    async def _create_nodes_from_json(self, nodes):
        """Create nodes from JSON data."""
        for node in nodes:
            labels = ":".join(node["labels"])
            properties = json.dumps(node["properties"])

            query = f"CREATE (:{labels} {properties})"
            await self.execute_query(query)

    async def _create_relationships_from_json(self, relationships):
        """Create relationships from JSON data."""
        for rel in relationships:
            query = """
            MATCH (a), (b)
            WHERE id(a) = $start_id AND id(b) = $end_id
            CREATE (a)-[r:$type $properties]->(b)
            """

            await self.execute_query(
                query,
                {
                    "start_id": rel["start_node_id"],
                    "end_id": rel["end_node_id"],
                    "type": rel["type"],
                    "properties": rel["properties"]
                }
            )