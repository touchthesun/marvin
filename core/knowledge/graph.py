from utils.logger import get_logger
from typing import Dict, List, Any, Optional, Tuple, Callable, TypeVar
from neo4j import AsyncGraphDatabase
from dataclasses import dataclass
from contextlib import asynccontextmanager
import asyncio
import uuid
import hashlib
from neo4j.exceptions import (
    Neo4jError,
    TransientError,
    ServiceUnavailable,
    SessionExpired,
    TransactionError
)
from core.utils.config import load_config
from core.content.relationships import Relationship
from core.content.keyword_identification import KeywordIdentifier


# Config
T = TypeVar('T')
config = load_config()
NEO4J_URI = config["neo4j_uri"]
NEO4J_USERNAME = config ["neo4j_username"]
NEO4J_PASSWORD = config ["neo4j_password"]

# Configure logging
logger = get_logger(__name__)


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


class Neo4jConnection:
    _driver = None
    _tx_manager = None

    @classmethod
    def get_transaction_manager(cls) -> TransactionManager:
        if cls._tx_manager is None:
            cls._tx_manager = TransactionManager()
        return cls._tx_manager

    @classmethod
    async def get_driver(cls):
        """Get or create the Neo4j driver instance."""
        if cls._driver is None:
            if None in [NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD]:
                logger.error('One or more Neo4j environment variables are missing.')
                raise RuntimeError('Missing Neo4j environment variables.')
            try:
                cls._driver = AsyncGraphDatabase.driver(
                    NEO4J_URI, 
                    auth=(NEO4J_USERNAME, NEO4J_PASSWORD)
                )
                # Verify connectivity asynchronously
                await cls._driver.verify_connectivity()
                logger.info('Successfully connected to Neo4j.')
            except Exception as e:
                logger.error('Failed to connect to Neo4j: %s', e)
                raise
        return cls._driver

    @classmethod
    async def close_driver(cls):
        """Close the Neo4j driver instance."""
        if cls._driver is not None:
            await cls._driver.close()
            cls._driver = None
            logger.info('Neo4j driver closed.')

    @classmethod
    @asynccontextmanager
    async def get_session(cls):
        """Get a Neo4j session as an async context manager."""
        driver = await cls.get_driver()
        async with driver.session() as session:
            yield session


    @classmethod
    def get_transaction_manager(cls) -> TransactionManager:
        """Get or create the transaction manager."""
        if cls._tx_manager is None:
            cls._tx_manager = TransactionManager()
        return cls._tx_manager

    @classmethod
    async def execute_read_query(
        cls,
        query: str,
        parameters: Optional[dict] = None,
        transaction_id: Optional[str] = None
    ) -> List[Any]:
        """Execute a read query with retry logic and error handling.
        
        Args:
            query: The Cypher query to execute
            parameters: Optional query parameters
            transaction_id: Optional ID for tracking retry patterns
            
        Returns:
            List of query results, with single-item records unpacked
            
        Raises:
            Neo4jError: If the query execution fails
        """
        async def read_transaction():
            async with cls.get_session() as session:
                try:
                    result = await session.execute_read(
                        lambda tx: tx.run(query, parameters or {})
                    )
                    records = await result.values()
                    return [
                        record[0] if len(record) == 1 else record 
                        for record in records
                    ]
                except Exception as e:
                    logger.error(
                        "Read query execution failed",
                        extra={
                            "error": str(e),
                            "query": query,
                            "parameters": parameters,
                            "transaction_id": transaction_id
                        }
                    )
                    raise

        return await cls.get_transaction_manager().execute_in_transaction(
            read_transaction,
            transaction_id=transaction_id
        )

    @classmethod
    async def execute_write_query(
        cls,
        query: str,
        parameters: Optional[dict] = None,
        transaction_id: Optional[str] = None
    ) -> List[Any]:
        """Execute a write query with retry logic and error handling.
        
        Args:
            query: The Cypher query to execute
            parameters: Optional query parameters
            transaction_id: Optional ID for tracking retry patterns
            
        Returns:
            List of query results, with single-item records unpacked
            
        Raises:
            Neo4jError: If the query execution fails
        """
        async def write_transaction():
            async with cls.get_session() as session:
                try:
                    result = await session.execute_write(
                        lambda tx: tx.run(query, parameters or {})
                    )
                    records = await result.values()
                    return [
                        record[0] if len(record) == 1 else record 
                        for record in records
                    ]
                except Exception as e:
                    logger.error(
                        "Write query execution failed",
                        extra={
                            "error": str(e),
                            "query": query,
                            "parameters": parameters,
                            "transaction_id": transaction_id
                        }
                    )
                    raise

        return await cls.get_transaction_manager().execute_in_transaction(
            write_transaction,
            transaction_id=transaction_id
        )

    @classmethod
    async def execute_in_transaction(
        cls,
        work_func: Callable[..., T],
        *args,
        **kwargs
    ) -> T:
        """Execute arbitrary work in a transaction with retry logic."""
        return await cls.get_transaction_manager().execute_in_transaction(
            work_func,
            *args,
            **kwargs
        )




class GraphManager:
    """Manages knowledge graph operations using Neo4j"""
    
# TO DO: add helper method for getting site out of page, in case site is not specified
# add this to processing pipeline

    @staticmethod
    async def create_site_with_page(
        site_url: str,
        site_name: str,
        page_url: str,
        page_title: str,
        page_content_summary: str,
        page_metadata: Dict
    ) -> Tuple[Dict, Dict]:
        """Create or update a site and a page, establishing their relationship.
        
        Args:
            site_url: Root domain URL
            site_name: Display name for the site
            page_url: Full page URL
            page_title: Page title
            page_content_summary: Brief content summary
            page_metadata: Additional page metadata
            
        Returns:
            Tuple of (site_node, page_node)
        """
        try:
            logger.info(f"Creating/updating site and page: {site_url} -> {page_url}")
            
            query = """
            MERGE (s:Site {url: $site_url})
            SET s.name = $site_name,
                s.last_updated = datetime()
            
            MERGE (p:Page {url: $page_url})
            SET p.title = $page_title,
                p.content_summary = $page_content_summary,
                p.metadata = $page_metadata,
                p.last_accessed = datetime()
            
            MERGE (s)-[r:CONTAINS]->(p)
            SET r.last_updated = datetime()
            
            RETURN s as site, p as page
            """
            
            parameters = {
                "site_url": site_url,
                "site_name": site_name,
                "page_url": page_url,
                "page_title": page_title,
                "page_content_summary": page_content_summary,
                "page_metadata": page_metadata
            }
            
            result = await Neo4jConnection.execute_write_query(
                query,
                parameters,
                transaction_id=f"site_page_{site_url.split('://')[1].split('/')[0]}"
            )
            if result:
                logger.debug(f"Successfully created/updated site and page: {site_url} -> {page_url}")
                return result[0]['site'], result[0]['page']
            logger.warning(f"No result returned for site/page creation")
            return None, None
            
        except Exception as e:
            logger.error(f"Error creating site/page: {str(e)}")
            raise

 

    @staticmethod
    async def get_page_by_url(url: str) -> Optional[Dict]:
        try:
            logger.info(f"Fetching page with URL: {url}")
            query = """
            MATCH (p:Page {url: $url})
            RETURN p
            """
            result = await Neo4jConnection.execute_read_query(
                query,
                {"url": url},
                transaction_id=f"get_page_{url.split('://')[1]}"
            )
            if result:
                logger.debug(f"Successfully retrieved page: {url}")
                return result[0]
            logger.debug(f"No page found for URL: {url}")
            return None
        except Exception as e:
            logger.error(f"Error fetching page {url}: {str(e)}")
            raise

    @staticmethod
    async def update_page_access(url: str) -> None:
        try:
            logger.info(f"Updating last_accessed for page: {url}")
            query = """
            MATCH (p:Page {url: $url})
            SET p.last_accessed = datetime()
            """
            await Neo4jConnection.execute_write_query(query, {"url": url})
            logger.debug(f"Successfully updated last_accessed for page: {url}")
        except Exception as e:
            logger.error(f"Error updating page access {url}: {str(e)}")
            raise

    @staticmethod
    async def get_related_pages(url: str, limit: int = 10) -> List[Dict]:
        try:
            logger.info(f"Fetching related pages for URL: {url} (limit: {limit})")
            query = """
            MATCH (p:Page {url: $url})-[r]-(related:Page)
            RETURN related, TYPE(r) as relationship_type, r.strength as strength
            ORDER BY r.strength DESC
            LIMIT $limit
            """
            parameters = {
                "url": url,
                "limit": limit
            }
            result = await Neo4jConnection.execute_read_query(
                query,
                parameters,
                transaction_id=f"related_pages_{url.split('://')[1]}"
            )
            
            logger.debug(f"Found {len(result)} related pages for: {url}")
            return result
        except Exception as e:
            logger.error(f"Error fetching related pages for {url}: {str(e)}")
            raise

    @staticmethod
    async def search_graph(
        query_params: Dict, 
        node_type: Optional[str] = None, 
        limit: int = 10
    ) -> List[Dict]:
        """
        Search the knowledge graph using flexible parameters
        
        Args:
            query_params: Dict of property:value pairs to search for
            node_type: Optional node label to restrict search (e.g., 'Page', 'Site')
            limit: Maximum number of results to return
        """
        try:
            logger.info(f"Searching graph with params: {query_params}, type: {node_type}")
            
            # Build dynamic query based on parameters
            where_clauses = []
            parameters = {"limit": limit}
            
            for key, value in query_params.items():
                param_key = f"param_{key}"
                # Handle different types of searches
                if isinstance(value, str) and '%' in value:
                    where_clauses.append(f"n.{key} =~ ${param_key}")  # Regex match
                else:
                    where_clauses.append(f"n.{key} = ${param_key}")
                parameters[param_key] = value

            # Construct full query
            node_label = f":{node_type}" if node_type else ""
            where_clause = " AND ".join(where_clauses) if where_clauses else "true"
            
            query = f"""
            MATCH (n{node_label})
            WHERE {where_clause}
            RETURN n
            LIMIT $limit
            """
            
            result = await Neo4jConnection.execute_read_query(
                query,
                parameters,
                transaction_id=f"search_{node_type or 'all'}_{hashlib.md5(str(query_params).encode()).hexdigest()[:8]}"
            )
            logger.debug(f"Search returned {len(result)} results")
            return [record['n'] for record in result]
        
        except Exception as e:
            logger.error(f"Error searching graph: {str(e)}")
            raise

    @staticmethod
    async def update_node(node_id: str, properties: Dict) -> Dict:
        """
        Update properties of an existing node
        
        Args:
            node_id: Internal Neo4j ID of the node
            properties: Dictionary of properties to update
        """
        try:
            logger.info(f"Updating node {node_id} with properties: {properties}")
            
            # Build dynamic SET clause
            set_clauses = []
            parameters = {"node_id": node_id}
            
            for key, value in properties.items():
                param_key = f"param_{key}"
                set_clauses.append(f"n.{key} = ${param_key}")
                parameters[param_key] = value
            
            query = f"""
            MATCH (n)
            WHERE ID(n) = $node_id
            SET {', '.join(set_clauses)}
            RETURN n
            """
            
            result = await Neo4jConnection.execute_write_query(
                query,
                parameters,
                transaction_id=f"update_node_{node_id}"
            )
            if result:
                logger.debug(f"Successfully updated node: {node_id}")
                return result[0]
            logger.warning(f"No node found for ID: {node_id}")
            return None
        
        except Exception as e:
            logger.error(f"Error updating node {node_id}: {str(e)}")
            raise


    @staticmethod
    async def create_keyword_node(keyword: KeywordIdentifier) -> Dict:
        """Create or update a keyword node from a KeywordIdentifier.
        
        Args:
            keyword: KeywordIdentifier instance
            
        Returns:
            Created/updated node properties
        """
        try:
            logger.info(f"Creating/updating keyword node: {keyword.id}")
            query = """
            MERGE (k:Keyword {id: $id})
            SET k.text = $text,
                k.canonical_text = $canonical_text,
                k.normalized_text = $normalized_text,
                k.keyword_type = $keyword_type,
                k.variants = $variants,
                k.metadata = $metadata,
                k.created_at = $created_at,
                k.updated_at = $updated_at,
                k.schema_version = $schema_version
            RETURN k
            """
            
            parameters = {
                "id": keyword.id,
                "text": keyword.text,
                "canonical_text": keyword.canonical_text,
                "normalized_text": keyword.normalized_text,
                "keyword_type": keyword.keyword_type.value,
                "variants": list(keyword.variants),
                "metadata": keyword.metadata,
                "created_at": keyword.created_at.isoformat(),
                "updated_at": keyword.updated_at.isoformat(),
                "schema_version": "1.0"  # Initial version
            }
            
            result = await Neo4jConnection.execute_write_query(
                query,
                parameters,
                transaction_id=f"kw_{keyword.id}" 
            )
            if result:
                logger.debug(f"Successfully created/updated keyword: {keyword.id}")
                return result[0]['k']
            logger.warning(f"No result returned for keyword creation: {keyword.id}")
            return None
            
        except Exception as e:
            logger.error(f"Error creating keyword {keyword.id}: {str(e)}")
            raise



    @staticmethod
    async def batch_create_keywords(keywords: List[KeywordIdentifier]) -> List[Dict]:
        """Create multiple keyword nodes in a single transaction.
        
        Args:
            keywords: List of KeywordIdentifier instances
            
        Returns:
            List of created/updated nodes
        """
        try:
            logger.info(f"Batch creating {len(keywords)} keywords")
            
            # Prepare batch parameters
            parameters = {
                "keywords": [
                    {
                        "id": kw.id,
                        "text": kw.text,
                        "canonical_text": kw.canonical_text,
                        "normalized_text": kw.normalized_text,
                        "keyword_type": kw.keyword_type.value,
                        "variants": list(kw.variants),
                        "metadata": kw.metadata,
                        "created_at": kw.created_at.isoformat(),
                        "updated_at": kw.updated_at.isoformat(),
                        "schema_version": "1.0"
                    }
                    for kw in keywords
                ]
            }
            
            query = """
            UNWIND $keywords as kw
            MERGE (k:Keyword {id: kw.id})
            SET k.text = kw.text,
                k.canonical_text = kw.canonical_text,
                k.normalized_text = kw.normalized_text,
                k.keyword_type = kw.keyword_type,
                k.variants = kw.variants,
                k.metadata = kw.metadata,
                k.created_at = kw.created_at,
                k.updated_at = kw.updated_at,
                k.schema_version = kw.schema_version
            RETURN k
            """
            batch_id = hashlib.md5("_".join(kw.id for kw in keywords).encode()).hexdigest()[:8]
            
            result = await Neo4jConnection.execute_write_query(
                query,
                parameters,
                transaction_id=f"batch_kw_{batch_id}"
            )
            logger.debug(f"Successfully created {len(result)} keywords")
            return [record['k'] for record in result]
            
        except Exception as e:
            logger.error(f"Error in batch keyword creation: {str(e)}")
            raise



    @staticmethod
    async def get_site_pages(site_url: str) -> List[Dict]:
        """Get all pages associated with a site.
        
        Args:
            site_url: Root domain URL
            
        Returns:
            List of page nodes
        """
        try:
            logger.info(f"Fetching pages for site: {site_url}")
            
            query = """
            MATCH (s:Site {url: $site_url})-[:CONTAINS]->(p:Page)
            RETURN p
            ORDER BY p.last_accessed DESC
            """
            

            result = await Neo4jConnection.execute_read_query(
                query,
                {"site_url": site_url},
                transaction_id=f"get_site_{site_url.split('://')[1].split('/')[0]}"
            )
            logger.debug(f"Found {len(result)} pages for site: {site_url}")
            return [record['p'] for record in result]
            
        except Exception as e:
            logger.error(f"Error fetching site pages: {str(e)}")
            raise

    @staticmethod
    async def link_keywords_to_page(
        keyword_ids: List[str],
        page_url: str,
        relationship_type: str = "CONTAINS"
    ) -> List[Dict]:
        """Create relationships between keywords and a page.
        
        Args:
            keyword_ids: List of keyword IDs
            page_url: URL of the page
            relationship_type: Type of relationship to create
            
        Returns:
            List of created relationships
        """
        try:
            logger.info(f"Linking {len(keyword_ids)} keywords to page: {page_url}")
            
            query = """
            MATCH (k:Keyword)
            WHERE k.id IN $keyword_ids
            MATCH (p:Page {url: $page_url})
            MERGE (p)-[r:$relationship_type]->(k)
            SET r.created_at = datetime(),
                r.confidence = 1.0
            RETURN r
            """
            
            parameters = {
                "keyword_ids": keyword_ids,
                "page_url": page_url,
                "relationship_type": relationship_type
            }
            
            domain = page_url.split('://')[1].split('/')[0]

            result = await Neo4jConnection.execute_write_query(
                query, 
                parameters,
                transaction_id=f"link_kw_{domain}_{len(keyword_ids)}",
                )
            
            logger.debug(f"Created {len(result)} keyword relationships")
            return [record['r'] for record in result]
            
        except Exception as e:
            logger.error(
                f"Error linking keywords to page {page_url}: {str(e)}"
            )
            raise


class GraphSchema:
    """Manages Neo4j schema operations for Marvin"""

    CURRENT_SCHEMA_VERSION = "1.0"

    @staticmethod
    async def create_constraints():
        """Create uniqueness constraints and indexes"""
        try:
            logger.info("Creating schema constraints")
            queries = [
                # Uniqueness constraints
                """CREATE CONSTRAINT site_url IF NOT EXISTS
                   FOR (s:Site) REQUIRE s.url IS UNIQUE""",
                
                """CREATE CONSTRAINT page_url IF NOT EXISTS
                   FOR (p:Page) REQUIRE p.url IS UNIQUE""",
                
                """CREATE CONSTRAINT keyword_id IF NOT EXISTS
                   FOR (k:Keyword) REQUIRE k.id IS UNIQUE""",
                
                # Indexes for frequent lookups
                """CREATE INDEX page_metadata IF NOT EXISTS 
                   FOR (p:Page) ON (p.metadata_quality_score)""",
                
                """CREATE INDEX keyword_normalized_text IF NOT EXISTS
                   FOR (k:Keyword) ON (k.normalized_text)""",
                
                """CREATE INDEX keyword_type IF NOT EXISTS
                   FOR (k:Keyword) ON (k.keyword_type)"""
            ]
            
            for query in queries:
                await Neo4jConnection.execute_write_query(
                    query,
                    transaction_id="schema_create_constraints"
                    )
            logger.info("Successfully created schema constraints and indexes")
            
            # Set schema version
            await GraphSchema.set_schema_version()
            
        except Exception as e:
            logger.error(f"Error creating schema constraints: {str(e)}")
            raise

    @staticmethod
    async def validate_schema() -> bool:
        """Verify all required constraints and indexes exist"""
        try:
            logger.info("Validating schema configuration")
            
            # Check constraints
            constraints_query = """
            CALL db.constraints() YIELD name, description
            RETURN collect(name) as constraints
            """
            result = await Neo4jConnection.execute_read_query(
                constraints_query,
                transaction_id="schema_validate"
                )
            constraints = result[0]['constraints']
            
            required_constraints = [
                'site_url', 'page_url', 'keyword_id'
            ]
            
            missing_constraints = [c for c in required_constraints if c not in constraints]
            
            # Check indexes
            indexes_query = """
            CALL db.indexes() YIELD name, labelsOrTypes, properties
            RETURN collect({
                name: name,
                label: labelsOrTypes[0],
                property: properties[0]
            }) as indexes
            """
            result = await Neo4jConnection.execute_read_query(
                indexes_query,
                transaction_id="schema_validate"
                )
            indexes = result[0]['indexes']
            
            required_indexes = [
                ('Page', 'metadata_quality_score'),
                ('Keyword', 'normalized_text'),
                ('Keyword', 'keyword_type')
            ]
            
            existing_indexes = [(idx['label'], idx['property']) for idx in indexes]
            missing_indexes = [idx for idx in required_indexes if idx not in existing_indexes]
            
            if missing_constraints or missing_indexes:
                if missing_constraints:
                    logger.warning(f"Missing constraints: {missing_constraints}")
                if missing_indexes:
                    logger.warning(f"Missing indexes: {missing_indexes}")
                return False
                
            # Check schema version
            current_version = await GraphSchema.get_schema_version()
            if current_version != GraphSchema.CURRENT_SCHEMA_VERSION:
                logger.warning(
                    f"Schema version mismatch. Current: {current_version}, "
                    f"Expected: {GraphSchema.CURRENT_SCHEMA_VERSION}"
                )
                return False
                
            logger.info("Schema validation successful")
            return True
            
        except Exception as e:
            logger.error(f"Error validating schema: {str(e)}")
            raise

    @staticmethod
    async def initialize_schema():
        """Initialize or update schema to latest version"""
        try:
            logger.info("Initializing schema")
            
            # Check if schema needs initialization
            is_valid = await GraphSchema.validate_schema()
            if not is_valid:
                await GraphSchema.create_constraints()
                logger.info("Schema initialization complete")
            else:
                # Check if migration is needed
                current_version = await GraphSchema.get_schema_version()
                if current_version != GraphSchema.CURRENT_SCHEMA_VERSION:
                    await GraphSchema.migrate_schema(current_version)
                else:
                    logger.info("Schema already up to date")
            
        except Exception as e:
            logger.error(f"Error initializing schema: {str(e)}")
            raise

    @staticmethod
    async def get_schema_version() -> str:
        """Get the current schema version"""
        try:
            query = """
            MATCH (s:SchemaVersion)
            RETURN s.version as version
            ORDER BY s.timestamp DESC
            LIMIT 1
            """
            result = await Neo4jConnection.execute_read_query(
                query,
                transaction_id="schema_get_version"
                )
            if result:
                return result[0]['version']
            return "0.0"  # No version found
        except Exception as e:
            logger.error(f"Error getting schema version: {str(e)}")
            raise

    @staticmethod
    async def set_schema_version(version: str = None):
        """Set the current schema version"""
        try:
            version = version or GraphSchema.CURRENT_SCHEMA_VERSION
            query = """
            CREATE (s:SchemaVersion {
                version: $version,
                timestamp: datetime()
            })
            """
            await Neo4jConnection.execute_write_query(query, {"version": version})
            logger.info(f"Schema version set to {version}")
        except Exception as e:
            logger.error(f"Error setting schema version: {str(e)}")
            raise

    @staticmethod
    async def migrate_schema(from_version: str):
        """Migrate schema from one version to another"""
        try:
            logger.info(f"Migrating schema from version {from_version}")
            
            # Add migration logic here when needed
            # For now, just update the version
            await GraphSchema.set_schema_version()
            
            logger.info("Schema migration complete")
        except Exception as e:
            logger.error(f"Error migrating schema: {str(e)}")
            raise


class GraphRelationshipManager:
    """Bridge between semantic relationships and Neo4j storage.
    
    This class handles:
    - Converting semantic relationships to graph form
    - Efficient batch storage operations
    - Relationship updates and synchronization
    """

    @staticmethod
    async def store_relationships(
        relationships: List[Relationship],
        batch_size: int = 100
    ) -> List[Dict]:
        """Store semantic relationships in Neo4j.
        
        Args:
            relationships: List of semantic relationships to store
            batch_size: Number of relationships to store in each transaction
            
        Returns:
            List of created/updated Neo4j relationships
        """
        try:
            logger.info(f"Storing {len(relationships)} relationships in Neo4j")
            results = []
            
            # Process in batches
            for i in range(0, len(relationships), batch_size):
                batch = relationships[i:i + batch_size]
                
                # Prepare batch parameters
                parameters = {
                    "relationships": [
                        {
                            "source_id": rel.source_id,
                            "target_id": rel.target_id,
                            "type": rel.relationship_type.value,
                            "confidence": rel.confidence,
                            "evidence_count": len(rel.evidence),
                            "metadata": rel.metadata,
                            "created_at": rel.created_at.isoformat(),
                            "updated_at": rel.updated_at.isoformat()
                        }
                        for rel in batch
                    ]
                }
                
                query = """
                UNWIND $relationships as rel
                MATCH (source:Keyword {id: rel.source_id})
                MATCH (target:Keyword {id: rel.target_id})
                MERGE (source)-[r:rel.type]->(target)
                SET r += {
                    confidence: rel.confidence,
                    evidence_count: rel.evidence_count,
                    metadata: rel.metadata,
                    created_at: rel.created_at,
                    updated_at: rel.updated_at
                }
                RETURN r
                """
                
                batch_results = await Neo4jConnection.execute_write_query(
                    query, parameters
                )
                results.extend(batch_results)
                
            logger.debug(f"Successfully stored {len(results)} relationships")
            return results
            
        except Exception as e:
            logger.error(f"Error storing relationships: {str(e)}")
            raise

    @staticmethod
    async def get_keyword_relationships(
        keyword_id: str,
        relationship_type: Optional[RelationType] = None,
        min_confidence: float = 0.0
    ) -> List[Dict]:
        """Get relationships for a keyword from Neo4j.
        
        Args:
            keyword_id: ID of the keyword
            relationship_type: Optional type filter
            min_confidence: Minimum confidence threshold
            
        Returns:
            List of relationship data
        """
        try:
            logger.info(f"Fetching relationships for keyword: {keyword_id}")
            
            # Build type filter
            type_filter = ""
            parameters = {
                "keyword_id": keyword_id,
                "min_confidence": min_confidence
            }
            
            if relationship_type:
                type_filter = "AND type(r) = $rel_type"
                parameters["rel_type"] = relationship_type.value
            
            query = f"""
            MATCH (k:Keyword {{id: $keyword_id}})-[r]->(target:Keyword)
            WHERE r.confidence >= $min_confidence {type_filter}
            RETURN r, target
            UNION
            MATCH (source:Keyword)-[r]->(k:Keyword {{id: $keyword_id}})
            WHERE r.confidence >= $min_confidence {type_filter}
            RETURN r, source as target
            """
            
            results = await Neo4jConnection.execute_read_query(query, parameters)
            logger.debug(f"Found {len(results)} relationships")
            return results
            
        except Exception as e:
            logger.error(
                f"Error fetching relationships for keyword {keyword_id}: {str(e)}"
            )
            raise

    @staticmethod
    async def sync_relationship_metadata(relationship: Relationship) -> Dict:
        """Update relationship metadata in Neo4j.
        
        Args:
            relationship: Updated relationship data
            
        Returns:
            Updated Neo4j relationship
        """
        try:
            logger.info(
                f"Syncing metadata for relationship: "
                f"{relationship.source_id} -> {relationship.target_id}"
            )
            
            query = """
            MATCH (source:Keyword {id: $source_id})
                  -[r:$rel_type]->
                  (target:Keyword {id: $target_id})
            SET r.metadata = $metadata,
                r.confidence = $confidence,
                r.evidence_count = $evidence_count,
                r.updated_at = $updated_at
            RETURN r
            """
            
            parameters = {
                "source_id": relationship.source_id,
                "target_id": relationship.target_id,
                "rel_type": relationship.relationship_type.value,
                "metadata": relationship.metadata,
                "confidence": relationship.confidence,
                "evidence_count": len(relationship.evidence),
                "updated_at": relationship.updated_at.isoformat()
            }
            
            result = await Neo4jConnection.execute_write_query(
                query, 
                parameters,
                transaction_id=f"sync_rel_{relationship.source_id}_{relationship.target_id}"
                )
            if result:
                logger.debug("Successfully synced relationship metadata")
                return result[0]
            logger.warning("No relationship found to update")
            return None
            
        except Exception as e:
            logger.error(f"Error syncing relationship metadata: {str(e)}")
            raise


class BatchTransaction:
    """Context manager for batched operations."""

    def __init__(
        self,
        batch_size: int = 1000,
        error_handler: Optional[Callable[[Exception], None]] = None
    ):
        self.batch_size = batch_size
        self.error_handler = error_handler
        self.operations = []
        self.logger = get_logger(__name__)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.logger.error(
                "Error in batch transaction",
                extra={"error": str(exc_val)}
            )
            if self.error_handler:
                self.error_handler(exc_val)
            return False

        try:
            await self.execute_batch()
        except Exception as e:
            self.logger.error(
                "Error executing batch",
                extra={"error": str(e)}
            )
            if self.error_handler:
                self.error_handler(e)
            raise

    async def add_operation(
        self,
        query: str,
        parameters: Optional[dict] = None
    ):
        """Add an operation to the batch."""
        self.operations.append((query, parameters or {}))
        
        if len(self.operations) >= self.batch_size:
            await self.execute_batch()

    async def execute_batch(self):
        """Execute all queued operations in a transaction."""
        if not self.operations:
            return

        async def execute_operations(tx):
            results = []
            for query, parameters in self.operations:
                result = await tx.run(query, parameters)
                results.append(await result.values())
            return results

        try:
            await Neo4jConnection.execute_in_transaction(execute_operations)
            self.operations.clear()
        except Exception as e:
            self.logger.error(
                "Batch execution failed",
                extra={
                    "operation_count": len(self.operations),
                    "error": str(e)
                }
            )
            raise