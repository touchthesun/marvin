from typing import List

from core.utils.logger import get_logger
from core.infrastructure.database.db_connection import DatabaseConnection
from core.common.errors import SchemaError

class SchemaManager:
    """Manages database schema operations including versioning and migrations.
    
    Responsibilities:
    - Schema version management
    - Constraint creation and validation
    - Index management
    - Schema migrations
    """
     
    CURRENT_SCHEMA_VERSION = "1.0"
    
    def __init__(self, connection: DatabaseConnection):
        self.connection = connection
        self.logger = get_logger(__name__)

    async def initialize(self) -> None:
        """Initialize or update schema to latest version."""
        try:
            self.logger.info("Initializing schema")
            
            # Validate current schema state
            is_valid = await self.validate_schema()
            if not is_valid:
                await self.create_constraints()
                self.logger.info("Schema initialization complete")
            else:
                # Check for needed migrations
                current_version = await self.get_version()
                if current_version != self.CURRENT_SCHEMA_VERSION:
                    await self.migrate(current_version)
                else:
                    self.logger.info("Schema already up to date")
            
            # Verify relationship types exist
            rel_types_valid = await self.verify_relationship_types()
            if not rel_types_valid:
                self.logger.info("Created missing relationship types")
                    
        except Exception as e:
            self.logger.error("Schema initialization failed", extra={"error": str(e)})
            raise SchemaError(
                message="Failed to initialize schema",
                operation="initialize",
                cause=e
            )

    async def create_constraints(self) -> None:
        """Create all required constraints and indexes."""
        constraints = [
            # Uniqueness constraints
            """CREATE CONSTRAINT site_url IF NOT EXISTS
               FOR (s:Site) REQUIRE s.url IS UNIQUE""",
            """CREATE CONSTRAINT page_url IF NOT EXISTS
               FOR (p:Page) REQUIRE p.url IS UNIQUE""",
            """CREATE CONSTRAINT keyword_id IF NOT EXISTS
               FOR (k:Keyword) REQUIRE k.id IS UNIQUE""",
            """CREATE CONSTRAINT keyword_text IF NOT EXISTS
               FOR (k:Keyword) REQUIRE k.text IS UNIQUE"""
        ]
        
        indexes = [
            # Performance indexes
            """CREATE INDEX page_metadata IF NOT EXISTS 
               FOR (p:Page) ON (p.metadata_quality_score)""",
            """CREATE INDEX keyword_normalized_text IF NOT EXISTS
               FOR (k:Keyword) ON (k.normalized_text)""",
            """CREATE INDEX keyword_type IF NOT EXISTS
               FOR (k:Keyword) ON (k.keyword_type)"""
        ]

        relationship_indexes = [
            """CREATE INDEX has_keyword_weight IF NOT EXISTS 
            FOR ()-[r:HAS_KEYWORD]->() ON (r.weight)""",
            """CREATE INDEX has_keyword_score IF NOT EXISTS 
            FOR ()-[r:HAS_KEYWORD]->() ON (r.score)"""
        ]
        
        try:
            async with self.connection.transaction() as tx:
                # Create constraints first
                for query in constraints:
                    await self.connection.execute_query(
                        query,
                        transaction=tx,
                        transaction_id="create_constraints"
                    )
                    
                # Then create node indexes
                for query in indexes:
                    await self.connection.execute_query(
                        query,
                        transaction=tx,
                        transaction_id="create_indexes"
                    )
                    
                # Create relationship indexes
                for query in relationship_indexes:
                    try:
                        await self.connection.execute_query(
                            query,
                            transaction=tx,
                            transaction_id="create_relationship_indexes"
                        )
                    except Exception as e:
                        # Some Neo4j versions have different syntax for relationship indexes
                        self.logger.warning(f"Failed to create relationship index with standard syntax: {str(e)}")
                        
                        # Try alternative syntax for older Neo4j versions
                        alt_query = query.replace("FOR ()-[r:HAS_KEYWORD]->() ON", "ON")
                        try:
                            await self.connection.execute_query(
                                alt_query,
                                transaction=tx,
                                transaction_id="create_relationship_indexes_alt"
                            )
                            self.logger.info("Created relationship index using alternative syntax")
                        except Exception as alt_e:
                            self.logger.error(f"Failed to create relationship index with alternative syntax: {str(alt_e)}")
                
                # Set schema version
                await self.set_version(self.CURRENT_SCHEMA_VERSION, tx)
                
            self.logger.info("Successfully created schema constraints and indexes")
            
        except Exception as e:
            self.logger.error("Failed to create constraints", extra={"error": str(e)})
            raise SchemaError(
                message="Failed to create constraints and indexes",
                operation="create_constraints",
                cause=e
            )

    async def validate_schema(self) -> bool:
        """Validate current schema state."""
        try:
            self.logger.info("Validating schema configuration")
            
            queries = [
                # Check constraints
                """SHOW CONSTRAINTS""",
                # Check indexes
                """SHOW INDEXES""",
                # Check basic node types
                """MATCH (p:Page) RETURN count(p) as page_count""",
                """MATCH (s:Site) RETURN count(s) as site_count""",
                """MATCH (k:Keyword) RETURN count(k) as keyword_count"""
            ]
            
            async with self.connection.transaction() as tx:
                for query in queries:
                    await self.connection.execute_query(
                        query,
                        transaction=tx,
                        transaction_id="validate_schema"
                    )
                    
            self.logger.info("Schema validation complete")
            return True
            
        except Exception as e:
            self.logger.warning("Schema validation failed", extra={"error": str(e)})
            return False

    async def get_version(self) -> str:
        """Get current schema version."""
        try:
            query = """
            OPTIONAL MATCH (s:SchemaVersion)
            WITH s ORDER BY s.timestamp DESC LIMIT 1
            RETURN COALESCE(s.version, "0.0") as version
            """
            
            result = await self.connection.execute_read_query(
                query,
                transaction_id="get_schema_version"
            )
            
            return result[0]['version'] if result else "0.0"
            
        except Exception as e:
            self.logger.error("Failed to get schema version", extra={"error": str(e)})
            return "0.0"

    async def set_version(
        self,
        version: str,
        transaction = None
    ) -> None:
        """Record schema version."""
        try:
            query = """
            CREATE (s:SchemaVersion {
                version: $version,
                timestamp: datetime()
            })
            """
            
            await self.connection.execute_query(
                query,
                parameters={"version": version},
                transaction=transaction,
                transaction_id="set_schema_version"
            )
            
            self.logger.info("Schema version updated", extra={"version": version})
            
        except Exception as e:
            self.logger.error(
                "Failed to set schema version",
                extra={"version": version, "error": str(e)}
            )
            raise SchemaError(
                message="Failed to set schema version",
                operation="set_version",
                cause=e
            )

    async def migrate(self, from_version: str) -> None:
        """Execute schema migration from one version to another."""
        try:
            self.logger.info(
                "Starting schema migration",
                extra={"from_version": from_version, "to_version": self.CURRENT_SCHEMA_VERSION}
            )
            
            migrations = self._get_migrations(from_version)
            
            async with self.connection.transaction() as tx:
                for migration in migrations:
                    await migration(tx)
                    
                await self.set_version(self.CURRENT_SCHEMA_VERSION, tx)
                
            self.logger.info("Schema migration complete")
            
        except Exception as e:
            self.logger.error(
                "Schema migration failed",
                extra={
                    "from_version": from_version,
                    "to_version": self.CURRENT_SCHEMA_VERSION,
                    "error": str(e)
                }
            )
            raise SchemaError(
                message="Schema migration failed",
                operation="migrate",
                details={
                    "from_version": from_version,
                    "to_version": self.CURRENT_SCHEMA_VERSION
                },
                cause=e
            )

    def _get_migrations(self, from_version: str) -> List:
        """Get list of required migration functions."""
        # Add migration functions as needed
        return []

    async def verify_relationship_types(self) -> bool:
        """Verify that required relationship types exist in the database."""
        required_types = ["HAS_KEYWORD", "LINKS_TO", "SIMILAR_TO"]
        missing_types = []
        
        try:
            # Check for relationship types
            query = """
            CALL db.relationshipTypes() YIELD relationshipType
            RETURN collect(relationshipType) as types
            """
            
            result = await self.connection.execute_read_query(query)
            existing_types = result[0]['types'] if result else []
            
            for req_type in required_types:
                if req_type not in existing_types:
                    missing_types.append(req_type)
                    
            if missing_types:
                self.logger.warning(
                    "Missing relationship types in schema",
                    extra={"missing_types": missing_types}
                )
                
                # Create dummy relationships to ensure types exist
                await self._create_dummy_relationship_types(missing_types)
                return False
            
            self.logger.info("All required relationship types exist in schema")
            return True
            
        except Exception as e:
            self.logger.error(
                "Failed to verify relationship types",
                extra={"error": str(e)}
            )
            return False

    async def _create_dummy_relationship_types(self, missing_types: List[str]) -> None:
        """Create dummy relationships to ensure relationship types exist."""
        self.logger.info(
            "Creating dummy relationships for missing types",
            extra={"types": missing_types}
        )
        
        try:
            async with self.connection.transaction() as tx:
                # Create dummy nodes if needed
                await self.connection.execute_query(
                    """
                    MERGE (source:_SchemaInit {id: 'source'})
                    MERGE (target:_SchemaInit {id: 'target'})
                    """,
                    transaction=tx
                )
                
                # Create dummy relationships for each missing type
                for rel_type in missing_types:
                    await self.connection.execute_query(
                        f"""
                        MATCH (source:_SchemaInit {{id: 'source'}}),
                            (target:_SchemaInit {{id: 'target'}})
                        CREATE (source)-[r:{rel_type} {{_schema_init: true}}]->(target)
                        """,
                        transaction=tx
                    )
                    
                    self.logger.info(f"Created dummy relationship of type {rel_type}")
                
            self.logger.info("Successfully created dummy relationships for schema initialization")
            
        except Exception as e:
            self.logger.error(
                "Failed to create dummy relationships",
                extra={"error": str(e)}
            )
            raise SchemaError(
                message="Failed to create dummy relationships for schema initialization",
                operation="_create_dummy_relationship_types",
                cause=e
            )