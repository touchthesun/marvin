from typing import List
import time

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
    - Embedding Support
    """
     
    CURRENT_SCHEMA_VERSION = "1.1"
    
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
        migrations = []
        
        # Add migration for embedding support (1.0 -> 1.1)
        if from_version == "1.0":
            migrations.append(self.setup_embedding_schema)
            
        return migrations

    async def verify_relationship_types(self) -> bool:
        """Verify that required relationship types exist in the database."""
        required_types = ["HAS_KEYWORD", "HAS_CHUNK", "LINKS_TO", "SIMILAR_TO"]
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
        
    async def setup_embedding_schema(self, transaction=None) -> None:
        """Set up Neo4j schema for embedding support."""
        start_time = time.time()
        self.logger.info("Setting up schema for vector embeddings")
        
        try:
            # Check Neo4j version to determine vector index support
            neo4j_version = await self._get_neo4j_version(transaction)
            self.logger.info(f"Detected Neo4j version: {neo4j_version}")
            
            # Extract major version
            version_parts = neo4j_version.split('.')
            major_version = int(version_parts[0]) if version_parts and version_parts[0].isdigit() else 0
            
            # Add embedding status property index
            embedding_status_index = """
            CREATE INDEX page_embedding_status IF NOT EXISTS 
            FOR (p:Page) ON (p.embedding_status)
            """
            
            await self.connection.execute_query(
                embedding_status_index,
                transaction=transaction,
                transaction_id="create_embedding_status_index"
            )
            
            # Neo4j 5.0+ supports vector indexes
            if major_version >= 5:
                await self._setup_vector_indexes(transaction)
            else:
                await self._setup_legacy_embedding_indexes(transaction)
                
            # Create indexes for Chunk nodes regardless of version
            await self._setup_chunk_indexes(transaction)
            
            # Create relationship type for semantic similarity if needed
            await self._ensure_semantic_relationship_type(transaction)
            
            elapsed = time.time() - start_time
            self.logger.info(f"Embedding schema setup completed in {elapsed:.2f}s")
            
        except Exception as e:
            elapsed = time.time() - start_time
            self.logger.error(f"Error setting up embedding schema after {elapsed:.2f}s: {str(e)}", exc_info=True)
            raise SchemaError(
                message="Failed to set up embedding schema",
                operation="setup_embedding_schema",
                cause=e
            )

    async def _get_neo4j_version(self, transaction=None) -> str:
        """Get the Neo4j server version."""
        try:
            version_query = "CALL dbms.components() YIELD name, versions RETURN versions[0] as version"
            result = await self.connection.execute_query(
                version_query,
                transaction=transaction,
                transaction_id="get_neo4j_version"
            )
            
            if result and len(result) > 0:
                return result[0].get("version", "Unknown")
            return "Unknown"
        except Exception as e:
            self.logger.warning(f"Error getting Neo4j version: {str(e)}")
            return "Unknown"

    async def _setup_vector_indexes(self, transaction=None) -> None:
        """Set up vector indexes for Neo4j 5.0+."""
        start_time = time.time()
        self.logger.info("Creating vector indexes for embedding search")
        
        try:
            # First check if vector indexes are supported
            test_query = """
            CALL db.indexes() YIELD name, type
            RETURN count(*) as count
            """
            
            await self.connection.execute_query(
                test_query,
                transaction=transaction,
                transaction_id="test_vector_indexes"
            )
            
            # Vector index dimensions for different embedding types
            dimensions = {
                "metadata": 1536,  # OpenAI default
                "content": 1536,
                "summary": 1536,
                "chunk": 1536
            }
            
            # Create vector index for metadata embeddings
            metadata_index_query = f"""
            CREATE VECTOR INDEX page_metadata_embedding_index IF NOT EXISTS
            FOR (p:Page)
            ON p.metadata_embedding
            OPTIONS {{indexConfig: {{`vector.dimensions`: {dimensions['metadata']}, `vector.similarity_function`: 'cosine'}}}}
            """
            
            await self.connection.execute_query(
                metadata_index_query,
                transaction=transaction,
                transaction_id="create_metadata_embedding_index"
            )
            self.logger.info("Created vector index for metadata embeddings")
            
            # Create vector index for content embeddings
            content_index_query = f"""
            CREATE VECTOR INDEX page_content_embedding_index IF NOT EXISTS
            FOR (p:Page)
            ON p.content_embedding
            OPTIONS {{indexConfig: {{`vector.dimensions`: {dimensions['content']}, `vector.similarity_function`: 'cosine'}}}}
            """
            
            await self.connection.execute_query(
                content_index_query,
                transaction=transaction,
                transaction_id="create_content_embedding_index"
            )
            self.logger.info("Created vector index for content embeddings")
            
            # Create vector index for summary embeddings
            summary_index_query = f"""
            CREATE VECTOR INDEX page_summary_embedding_index IF NOT EXISTS
            FOR (p:Page)
            ON p.summary_embedding
            OPTIONS {{indexConfig: {{`vector.dimensions`: {dimensions['summary']}, `vector.similarity_function`: 'cosine'}}}}
            """
            
            await self.connection.execute_query(
                summary_index_query,
                transaction=transaction,
                transaction_id="create_summary_embedding_index"
            )
            self.logger.info("Created vector index for summary embeddings")
            
            elapsed = time.time() - start_time
            self.logger.info(f"Vector indexes created successfully in {elapsed:.2f}s")
            
        except Exception as e:
            self.logger.error(f"Error creating vector indexes: {str(e)}", exc_info=True)
            self.logger.warning("Falling back to legacy embedding indexes")
            await self._setup_legacy_embedding_indexes(transaction)

    async def _setup_legacy_embedding_indexes(self, transaction=None) -> None:
        """Set up traditional indexes for embeddings in older Neo4j versions."""
        self.logger.info("Creating legacy indexes for embedding properties")
        
        # Create regular indexes for embedding-related properties
        embedding_indexes = [
            "CREATE INDEX page_embedding_model IF NOT EXISTS FOR (p:Page) ON (p.embedding_model)",
            "CREATE INDEX page_embedding_updated IF NOT EXISTS FOR (p:Page) ON (p.embedding_updated_at)"
        ]
        
        for index in embedding_indexes:
            self.logger.debug(f"Executing index creation: {index}")
            await self.connection.execute_query(
                index,
                transaction=transaction,
                transaction_id="create_embedding_index"
            )
        
        self.logger.info("Legacy embedding indexes created successfully")
        self.logger.warning("Vector similarity search will be less efficient without vector indexes")

    async def _setup_chunk_indexes(self, transaction=None) -> None:
        """Set up indexes for Chunk nodes."""
        self.logger.info("Creating indexes for Chunk nodes")

        # First ensure the HAS_CHUNK relationship type exists
        has_chunk_query = """
        MERGE (source:_SchemaInit {id: 'chunk_source'})
        MERGE (target:Chunk {id: 'schema_chunk'})
        MERGE (source)-[r:HAS_CHUNK {chunk_index: 0, _schema_init: true}]->(target)
        """
        
        await self.connection.execute_query(
            has_chunk_query,
            transaction=transaction,
            transaction_id="create_has_chunk_relationship"
        )
        self.logger.info("Ensured HAS_CHUNK relationship type exists")
        
        chunk_indexes = [
            "CREATE INDEX chunk_page_id IF NOT EXISTS FOR (c:Chunk) ON (c.page_id)",
            "CREATE INDEX chunk_index IF NOT EXISTS FOR (c:Chunk) ON (c.chunk_index)"
        ]
        
        for index in chunk_indexes:
            self.logger.debug(f"Executing index creation: {index}")
            await self.connection.execute_query(
                index,
                transaction=transaction,
                transaction_id="create_chunk_index"
            )
        
        # Try to create vector index for chunk embeddings if supported
        try:
            chunk_vector_index = """
            CREATE VECTOR INDEX chunk_embedding_index IF NOT EXISTS
            FOR (c:Chunk)
            ON c.embedding
            OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
            """
            
            await self.connection.execute_query(
                chunk_vector_index,
                transaction=transaction,
                transaction_id="create_chunk_vector_index"
            )
            self.logger.info("Created vector index for chunk embeddings")
        except Exception as e:
            self.logger.warning(f"Could not create vector index for chunks: {str(e)}")
            self.logger.info("Creating fallback standard index for chunks")
            
            # Create regular index as fallback
            chunk_reg_index = "CREATE INDEX chunk_model IF NOT EXISTS FOR (c:Chunk) ON (c.model)"
            await self.connection.execute_query(
                chunk_reg_index,
                transaction=transaction,
                transaction_id="create_chunk_reg_index"
            )
        
        self.logger.info("Chunk indexes created successfully")

    async def _ensure_semantic_relationship_type(self, transaction=None) -> None:
        """Ensure SEMANTIC_SIMILAR relationship type exists."""
        self.logger.info("Ensuring SEMANTIC_SIMILAR relationship type exists")
        
        try:
            # Check if relationship type exists
            rel_type_query = """
            CALL db.relationshipTypes() YIELD relationshipType
            WHERE relationshipType = 'SEMANTIC_SIMILAR'
            RETURN count(*) as count
            """
            
            result = await self.connection.execute_query(
                rel_type_query,
                transaction=transaction,
                transaction_id="check_semantic_rel_type"
            )
            
            if result[0]["count"] == 0:
                # Create dummy relationship to ensure type exists
                create_rel_query = """
                MERGE (source:_SchemaInit {id: 'source'})
                MERGE (target:_SchemaInit {id: 'target'})
                CREATE (source)-[r:SEMANTIC_SIMILAR {_schema_init: true, strength: 0.5}]->(target)
                """
                
                await self.connection.execute_query(
                    create_rel_query,
                    transaction=transaction,
                    transaction_id="create_semantic_rel_type"
                )
                self.logger.info("Created SEMANTIC_SIMILAR relationship type")
                
                # Create index on relationship strength
                rel_index_query = """
                CREATE INDEX semantic_similar_strength IF NOT EXISTS 
                FOR ()-[r:SEMANTIC_SIMILAR]->() ON (r.strength)
                """
                
                try:
                    await self.connection.execute_query(
                        rel_index_query,
                        transaction=transaction,
                        transaction_id="create_semantic_rel_index"
                    )
                    self.logger.info("Created index on SEMANTIC_SIMILAR.strength")
                except Exception as e:
                    self.logger.warning(f"Could not create relationship index with standard syntax: {str(e)}")
                    
                    # Try alternative syntax for older Neo4j versions
                    alt_rel_index_query = "CREATE INDEX semantic_similar_strength IF NOT EXISTS ON ()-[r:SEMANTIC_SIMILAR]-() ON (r.strength)"
                    try:
                        await self.connection.execute_query(
                            alt_rel_index_query,
                            transaction=transaction,
                            transaction_id="create_semantic_rel_index_alt"
                        )
                        self.logger.info("Created relationship index using alternative syntax")
                    except Exception as alt_e:
                        self.logger.warning(f"Could not create relationship index with alternative syntax: {str(alt_e)}")
        except Exception as e:
            self.logger.error(f"Error ensuring SEMANTIC_SIMILAR relationship type: {str(e)}", exc_info=True)