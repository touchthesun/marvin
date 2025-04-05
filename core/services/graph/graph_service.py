import time
from typing import Dict, List, Any, Optional
from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID, uuid4

from core.domain.content.types import PageMetadata
from core.domain.content.models.page import Page
from core.domain.content.types import PageMetadata, BrowserContext, PageStatus
from core.domain.content.models.site import Site
from core.infrastructure.database.graph_operations import GraphOperationManager
from core.infrastructure.database.transactions import Transaction
from core.common.errors import ValidationError, ServiceError
from core.utils.logger import get_logger
from core.services.base import BaseService


class GraphService(BaseService):
    """High-level service for knowledge graph operations.
    
    This service implements business logic for managing the knowledge graph,
    including page storage, relationship management, and content analysis.
    
    Responsibilities:
    - Business logic implementation
    - Input validation
    - Error handling
    - Transaction coordination
    - Service-level operations
    """
    
    def __init__(self, graph_operations: GraphOperationManager):
        super().__init__()
        self.graph_operations = graph_operations
        self.logger = get_logger(__name__)

    async def add_page_to_graph(
        self,
        page: Page,
        metadata: PageMetadata
    ) -> Dict[str, Any]:
        """Add a page to the knowledge graph with proper validation.
        
        Args:
            page: Domain model containing page information
            metadata: Additional metadata about the page
            
        Returns:
            Dict containing the created/updated page node data
            
        Raises:
            ValidationError: If page data is invalid
            ServiceError: If operation fails
        """
        try:
            # Input validation
            if not self._validate_page(page):
                raise ValidationError(
                    message="Invalid page data",
                    details={"url": page.url}
                )

            # Extract site information
            site = self._extract_site_info(page)
            
            # Prepare page data with metadata
            page_data = self._prepare_page_data(page, metadata)
            
            async with self.graph_operations.transaction() as tx:
                # Create or update site
                site_node = await self.graph_operations.create_or_update_node(
                    labels=["Site"],
                    properties=site.to_dict(),
                    transaction=tx
                )
                
                # Create or update page
                page_node = await self.graph_operations.create_or_update_node(
                    labels=["Page"],
                    properties=page_data,
                    transaction=tx
                )
                
                # Create site-page relationship
                await self.graph_operations.create_relationship(
                    start_node_id=site_node["id"],
                    end_node_id=page_node["id"],
                    relationship_type="CONTAINS",
                    properties={"last_updated": datetime.now().isoformat()},
                    transaction=tx
                )
                
                return page_node

        except Exception as e:
            self.logger.error(f"Error adding page to graph: {str(e)}")
            raise ServiceError(
                message="Failed to add page to graph",
                details={"url": page.url},
                cause=e
            )

    async def find_related_content(
        self,
        url: str,
        min_relevance: float = 0.5,
        max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """Find content related to a URL with relevance scoring.
        
        Args:
            url: Page URL to find related content for
            min_relevance: Minimum relevance score (0-1)
            max_results: Maximum number of results to return
            
        Returns:
            List of related content with relevance scores
        """
        try:
            async with self.graph_operations.transaction() as tx:
                # Get the source page
                source_page = await self.graph_operations.get_node_by_property(
                    label="Page",
                    property_name="url",
                    property_value=url,
                    transaction=tx
                )
                
                if not source_page:
                    self.logger.warning(f"No page found with URL: {url}")
                    return []
                
                # Convert Neo4j Node object to dictionary if needed
                source_id = source_page.id if hasattr(source_page, 'id') else source_page.get('id')

                # Find related pages through various relationship types
                related = await self.graph_operations.find_related_nodes(
                    start_node_id=str(source_id),
                    relationship_types=[
                        "SIMILAR_TO",
                        "LINKS_TO",
                        "REFERENCED_BY"
                    ],
                    min_score=min_relevance,
                    limit=max_results,
                    transaction=tx
                )
                
                return self._format_related_results(related)

        except Exception as e:
            self.logger.error(f"Error finding related content: {str(e)}")
            raise ServiceError(
                message="Failed to find related content",
                details={"url": url},
                cause=e
            )

    async def analyze_page_connections(
        self,
        url: str
    ) -> Dict[str, Any]:
        """Analyze how a page connects to existing knowledge.
        
        Performs a deep analysis of how a page connects to existing
        content in the knowledge graph, including:
        - Direct relationships
        - Common topics/keywords
        - Semantic similarities
        - Citation patterns
        
        Args:
            url: URL of the page to analyze
            
        Returns:
            Dict containing analysis results
        """
        try:
            async with self.graph_operations.transaction() as tx:
                analysis = {
                    "direct_connections": await self._analyze_direct_connections(url, tx),
                    "topic_clusters": await self._analyze_topic_clusters(url, tx),
                    "semantic_neighbors": await self._find_semantic_neighbors(url, tx),
                    "citation_patterns": await self._analyze_citations(url, tx)
                }
                
                return self._enrich_analysis_results(analysis)

        except Exception as e:
            self.logger.error(f"Error analyzing page connections: {str(e)}")
            raise ServiceError(
                message="Failed to analyze page connections",
                details={"url": url},
                cause=e
            )
        
    
    async def _get_page_by_url(self, tx: Transaction, url: str) -> Optional[Page]:
        """Get a page by URL using the provided transaction.
        
        Args:
            tx: Transaction object
            url: URL to look up
            
        Returns:
            Page instance if found, None otherwise
        """
        try:
            self.logger.debug(f"Attempting to get page with URL: {url}")
            
            node = await self.graph_operations.get_node_by_property(
                label="Page",
                property_name="url",
                property_value=url,
                transaction=tx
            )
            
            # Handle the None case explicitly
            if node is None:
                self.logger.debug(f"No page found for URL: {url}")
                return None
                
            self.logger.debug(f"Retrieved page node: {node}")
            
            # Convert node to Page object
            if hasattr(node, 'properties'):
                node_data = dict(node.properties)
                node_data['id'] = str(node.id) if hasattr(node, 'id') else None
                return self._reconstruct_page_from_node(node_data)
            
            return node
            
        except Exception as e:
            self.logger.error(f"Error getting page by URL: {str(e)}")
            raise ServiceError(
                message="Failed to get page by URL",
                details={"url": url},
                cause=e
            )
        

    async def _create_or_update_page(self, tx: Transaction, page: Page) -> Dict[str, Any]:
        """Create or update a page in the graph."""
        try:
            # Ensure metadata has discovered_at
            if not hasattr(page.metadata, 'discovered_at'):
                page.metadata.discovered_at = datetime.now()

            # Convert page to dict for storage
            page_data = self._prepare_page_data(page)
            
            # Create/update the page node
            page_node = await self.graph_operations.create_or_update_node(
                labels=["Page"],
                properties=page_data,
                match_properties=['url'],  # Match on URL when updating
                transaction=tx
            )
            
            # Check if this is a new node - convert Node to dict if needed
            node_data = dict(page_node.properties) if hasattr(page_node, 'properties') else page_node
            is_new_node = node_data.get("created", False) if isinstance(node_data, dict) else False
            
            # If we're creating a new page, also create site relationship
            if is_new_node:
                site = self._extract_site_info(page)
                site_node = await self.graph_operations.create_or_update_node(
                    labels=["Site"],
                    properties=site.to_dict(),
                    transaction=tx
                )
                
                # Handle Node objects for site node as well
                site_id = site_node.id if hasattr(site_node, 'id') else site_node.get('id')
                page_id = page_node.id if hasattr(page_node, 'id') else node_data.get('id')
                
                await self.graph_operations.create_relationship(
                    start_node_id=str(site_id),
                    end_node_id=str(page_id),
                    relationship_type="CONTAINS",
                    properties={"last_updated": datetime.now().isoformat()},
                    transaction=tx
                )
            
            return node_data
                
        except Exception as e:
            self.logger.error(f"Error creating/updating page: {str(e)}")
            raise ServiceError(
                message="Failed to create/update page",
                details={"url": page.url},
                cause=e
            )

    # Helper methods
    def _validate_page(self, page: Page) -> bool:
        """Validate page data."""
        return (
            bool(page.url) and
            bool(page.domain) and
            bool(page.title)
        )

    def _extract_site_info(self, page: Page) -> Site:
        """Extract site information from page."""
        parsed_url = urlparse(page.url)
        return Site(
            url=f"{parsed_url.scheme}://{page.domain}",
            domain=page.domain,
            name=page.domain
        )

    def _prepare_page_data(self, page: Page) -> Dict[str, Any]:
        """Prepare page data for Neo4j storage by flattening nested structures.
        
        Args:
            page: Page object to prepare
            
        Returns:
            Dict of flattened page data suitable for Neo4j
        """
        # Start with basic page fields
        page_data = {
            'url': str(page.url),
            'domain': str(page.domain),
            'status': str(page.status.value),  # Convert enum to string
            'title': str(page.title) if page.title else None,
        }
        if hasattr(page, 'id') and page.id:
            page_data['id'] = str(page.id)
        
        # Handle keywords - ensure they're primitive types
        if page.keywords:
            page_data['keywords'] = {str(k): float(v) for k, v in page.keywords.items()}
        
        # Flatten metadata
        if page.metadata:
            metadata_dict = {
                'discovered_at': page.metadata.discovered_at.isoformat() if page.metadata.discovered_at else None,
                'last_accessed': page.metadata.last_accessed.isoformat() if page.metadata.last_accessed else None,
                'metadata_quality_score': float(page.metadata.metadata_quality_score),
                'tab_id': str(page.metadata.tab_id) if page.metadata.tab_id else None,
                'window_id': str(page.metadata.window_id) if page.metadata.window_id else None,
                'bookmark_id': str(page.metadata.bookmark_id) if page.metadata.bookmark_id else None,
                'word_count': int(page.metadata.word_count) if page.metadata.word_count is not None else None,
                'reading_time_minutes': float(page.metadata.reading_time_minutes) if page.metadata.reading_time_minutes is not None else None,
                'language': str(page.metadata.language) if page.metadata.language else None,
                'source_type': str(page.metadata.source_type) if page.metadata.source_type else None,
                'author': str(page.metadata.author) if page.metadata.author else None,
                'published_date': page.metadata.published_date.isoformat() if page.metadata.published_date else None,
                'modified_date': page.metadata.modified_date.isoformat() if page.metadata.modified_date else None,
                'browser_contexts': [str(context.value) for context in page.metadata.browser_contexts] if page.metadata.browser_contexts else []
            }
            page_data.update(metadata_dict)
            
            # Handle custom metadata - ensure primitive types
            if page.metadata.custom_metadata:
                for key, value in page.metadata.custom_metadata.items():
                    if isinstance(value, (int, float, str, bool)):
                        page_data[f'custom_{str(key)}'] = value
                    else:
                        page_data[f'custom_{str(key)}'] = str(value)
        
        # Flatten metrics
        if hasattr(page.metadata, 'metrics') and page.metadata.metrics:
            metrics_dict = {
                'metric_quality_score': float(page.metadata.metrics.quality_score),
                'metric_relevance_score': float(page.metadata.metrics.relevance_score),
                'metric_visit_count': int(page.metadata.metrics.visit_count),
                'metric_keyword_count': int(page.metadata.metrics.keyword_count),
                'metric_processing_time': float(page.metadata.metrics.processing_time) if page.metadata.metrics.processing_time is not None else None,
                'metric_last_visited': page.metadata.metrics.last_visited.isoformat() if page.metadata.metrics.last_visited else None
            }
            page_data.update(metrics_dict)
        
        # Remove any None values as Neo4j doesn't handle them well
        return {k: v for k, v in page_data.items() if v is not None}
    

    def _reconstruct_page_from_node(self, node_data: Dict[str, Any]) -> Page:
        """Reconstruct a Page object from flattened Neo4j data."""
        try:
            self.logger.debug(f"Reconstructing page from node data: {node_data}")
            
            # Handle ID conversion
            page_id = node_data.get('id')
            self.logger.debug(f"Raw ID value: {page_id}, type: {type(page_id)}")
            
            if page_id:
                try:
                    # If it's already a UUID string
                    if isinstance(page_id, str) and len(page_id) == 36:
                        id_value = UUID(page_id)
                    # If it's a Neo4j internal ID (integer)
                    elif isinstance(page_id, (int, str)):
                        id_value = uuid4()  # Generate new UUID for Neo4j IDs
                    else:
                        id_value = uuid4()
                except ValueError:
                    self.logger.warning(f"Could not parse UUID from: {page_id}, generating new one")
                    id_value = uuid4()
            else:
                id_value = uuid4()
                
            self.logger.debug(f"Final ID value: {id_value}")
            
            # Rest of the reconstruction code...
            discovered_time = self._parse_datetime(node_data.get('discovered_at')) or datetime.now()
            
            metadata = PageMetadata(
                discovered_at=discovered_time,
                last_accessed=self._parse_datetime(node_data.get('last_accessed')),
                metadata_quality_score=float(node_data.get('metadata_quality_score', 0.0)),
                tab_id=node_data.get('tab_id'),
                window_id=node_data.get('window_id'),
                bookmark_id=node_data.get('bookmark_id'),
                word_count=node_data.get('word_count'),
                reading_time_minutes=node_data.get('reading_time_minutes'),
                language=node_data.get('language'),
                source_type=node_data.get('source_type'),
                author=node_data.get('author'),
                published_date=self._parse_datetime(node_data.get('published_date')),
                modified_date=self._parse_datetime(node_data.get('modified_date')),
                browser_contexts={BrowserContext(c) for c in node_data.get('browser_contexts', [])}
            )
            
            # Create page with the properly handled ID
            return Page(
                url=node_data['url'],
                domain=node_data['domain'],
                id=id_value,
                status=PageStatus(node_data.get('status', 'discovered')),
                title=node_data.get('title'),
                keywords=node_data.get('keywords', {}),
                metadata=metadata
            )
            
        except Exception as e:
            self.logger.error(f"Error reconstructing page: {str(e)}", exc_info=True)
            raise
                
    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        """Safely parse a datetime value from various formats.
        
        Args:
            value: Value to parse into datetime
            
        Returns:
            Parsed datetime or None if parsing fails
        """
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                self.logger.warning(f"Could not parse datetime from string: {value}")
                return None
        self.logger.warning(f"Unexpected datetime value type: {type(value)}")
        return None

    def _format_related_results(
        self,
        related: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Format related content results."""
        return [{
            "page": item["node"],
            "relevance": item["score"],
            "relationship_type": item["type"],
            "metadata": item["metadata"]
        } for item in related]

    # Analysis helper methods
    async def _analyze_direct_connections(
        self,
        url: str,
        transaction
    ) -> Dict[str, Any]:
        """Analyze direct page connections."""
        pass

    async def _analyze_topic_clusters(
        self,
        url: str,
        transaction
    ) -> Dict[str, Any]:
        """Analyze topic clustering."""
        pass

    async def _find_semantic_neighbors(
        self,
        url: str,
        transaction
    ) -> Dict[str, Any]:
        """Find semantically similar content."""
        pass

    async def _analyze_citations(
        self,
        url: str,
        transaction
    ) -> Dict[str, Any]:
        """Analyze citation patterns."""
        pass

    def _enrich_analysis_results(
        self,
        analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Enrich analysis results with additional metadata."""
        pass


    async def _query_pages(
        self,
        tx: Transaction,
        status: Optional[str] = None,
        domain: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Query pages based on criteria.
        
        Args:
            tx: Transaction object
            status: Optional status filter
            domain: Optional domain filter
            
        Returns:
            List of page data dictionaries
        """
        try:
            # Build query conditions
            conditions = {}
            if status:
                conditions['status'] = status
            if domain:
                conditions['domain'] = domain
                
            nodes = await self.graph_operations.query_nodes(
                label="Page",
                conditions=conditions,
                transaction=tx
            )
            
            # Convert nodes to dictionary format
            pages = []
            for node in nodes:
                if hasattr(node, 'properties'):
                    node_data = dict(node.properties)
                    node_data['id'] = str(node.id) if hasattr(node, 'id') else None
                    pages.append(node_data)
            
            return pages
            
        except Exception as e:
            self.logger.error(f"Error querying pages: {str(e)}")
            raise ServiceError(
                details={"status": status, "domain": domain},
                cause=e
            )

    async def check_task_exists(self, task_id):
        """Check if a task exists in the database."""
        result = await self.graph_operations.connection.execute_query(
            "MATCH (t:Task {id: $task_id}) RETURN count(t) as count",
            {"task_id": task_id}
        )
        exists = result[0]["count"] > 0
        self.logger.info(f"Task {task_id} exists in database: {exists}")
        return exists
    
    # Embedding Service Integration
    async def store_embedding(
        self, 
        tx: Transaction, 
        page_id: str, 
        embedding: List[float],
        embedding_type: str = "metadata",
        model: str = "text-embedding-ada-002"
    ) -> None:
        """Store embedding for a page in Neo4j."""
        self.logger.debug(f"Storing {embedding_type} embedding for page {page_id}, model: {model}")
        try:
            # Use graph operations to store embedding
            query = """
            MATCH (p:Page {id: $page_id})
            SET p.embedding_model = $model,
                p.embedding_updated_at = datetime(),
                p.embedding_status = 'completed'
            """
            
            # Add embedding based on type
            if embedding_type == "metadata":
                query += ", p.metadata_embedding = $embedding"
            elif embedding_type == "full_content":
                query += ", p.content_embedding = $embedding"
            elif embedding_type == "summary":
                query += ", p.summary_embedding = $embedding"
            else:
                # Default to metadata
                query += ", p.metadata_embedding = $embedding"
                self.logger.warning(f"Unknown embedding type: {embedding_type}, defaulting to metadata")
            
            # Execute query
            start_time = time.time()
            await self.graph_operations.connection.execute_query(
                query,
                {
                    "page_id": page_id,
                    "embedding": embedding,
                    "model": model
                },
                transaction=tx
            )
            elapsed = time.time() - start_time
            self.logger.debug(f"Embedding stored in Neo4j in {elapsed:.2f}s")
            
        except Exception as e:
            self.logger.error(f"Error storing embedding: {str(e)}", exc_info=True)
            raise

    async def store_chunk_embedding(
        self, 
        tx: Transaction, 
        page_id: str, 
        embedding: List[float],
        chunk_index: int,
        total_chunks: int,
        start_char: int,
        end_char: int,
        model: str = "text-embedding-ada-002"
    ) -> None:
        """
        Store embedding for a content chunk in Neo4j.
        
        Args:
            tx: Database transaction
            page_id: Page ID
            embedding: Embedding vector
            chunk_index: Index of this chunk
            total_chunks: Total number of chunks
            start_char: Start character position
            end_char: End character position
            model: Embedding model used
        """
        try:
            # Create a Chunk node and connect to Page
            query = """
            MATCH (p:Page {id: $page_id})
            MERGE (c:Chunk {
                page_id: $page_id,
                chunk_index: $chunk_index
            })
            SET c.embedding = $embedding,
                c.start_char = $start_char,
                c.end_char = $end_char,
                c.total_chunks = $total_chunks,
                c.model = $model,
                c.created_at = datetime()
            MERGE (p)-[:HAS_CHUNK]->(c)
            """
            
            # Execute query
            await self.graph_operations.connection.execute_query(
                query,
                {
                    "page_id": page_id,
                    "embedding": embedding,
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks,
                    "start_char": start_char,
                    "end_char": end_char,
                    "model": model
                },
                transaction=tx
            )
            
        except Exception as e:
            self.logger.error(f"Error storing chunk embedding: {str(e)}", exc_info=True)
            raise

    async def update_page_embedding_status(
        self, 
        tx: Transaction, 
        page_id: str,
        status: str,
        last_updated: datetime = None,  # Make it optional
        model: str = None,
        error: str = None
    ) -> None:
        try:
            # Update page status
            query = """
            MATCH (p:Page {id: $page_id})
            SET p.embedding_status = $status
            """
            
            if model:
                query += ", p.embedding_model = $model"
            
            if error:
                query += ", p.embedding_error = $error"
            
            # Only add last_updated if it's not None
            if last_updated:
                query += ", p.embedding_updated_at = $last_updated"
                
            # Build parameters dict
            params = {
                "page_id": page_id,
                "status": status,
                "model": model,
                "error": error
            }
            
            # Only add last_updated parameter if it exists
            if last_updated:
                params["last_updated"] = last_updated.isoformat()
            else:
                # Use current time if no timestamp provided
                params["last_updated"] = datetime.now().isoformat()
                query += ", p.embedding_updated_at = $last_updated"
            
            # Execute query with correct parameter order
            await self.graph_operations.connection.execute_query(
                query,
                parameters=params,
                transaction=tx
            )
            
        except Exception as e:
            self.logger.error(f"Error updating embedding status: {str(e)}", exc_info=True)
            raise

    async def get_page_embedding(
        self, 
        tx: Transaction, 
        page_id: str,
        embedding_type: str = "metadata"
    ) -> Optional[List[float]]:
        """
        Get embedding for a page.
        
        Args:
            tx: Database transaction
            page_id: Page ID
            embedding_type: Type of embedding to retrieve
            
        Returns:
            Embedding vector or None if not found
        """
        try:
            # Determine which embedding to retrieve
            embedding_field = "metadata_embedding"
            if embedding_type == "full_content":
                embedding_field = "content_embedding"
            elif embedding_type == "summary":
                embedding_field = "summary_embedding"
            
            # Query to get embedding
            query = f"""
            MATCH (p:Page {{id: $page_id}})
            RETURN p.{embedding_field} AS embedding
            """
            
            # Execute query
            result = await self.graph_operations.connection.execute_query(
                query,
                {"page_id": page_id},
                transaction=tx
            )
            
            # Check if embedding exists
            if result and result[0].get("embedding"):
                return result[0]["embedding"]
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting page embedding: {str(e)}", exc_info=True)
            return None
        


    async def find_similar_by_embedding(
        self, 
        tx: Transaction, 
        embedding: List[float],
        embedding_type: str = "metadata",
        limit: int = 5,
        threshold: float = 0.7,
        model: str = None
    ) -> List[Dict[str, Any]]:
        """
        Find pages with similar embeddings using Neo4j's vector functions.
        """
        try:
            # Determine which embedding field to use for comparison
            embedding_field = "metadata_embedding"
            if embedding_type == "full_content":
                embedding_field = "content_embedding"
            elif embedding_type == "summary":
                embedding_field = "summary_embedding"
            
            # Model filter
            model_filter = ""
            if model:
                model_filter = "AND p.embedding_model = $model"
            
            # Use vector.similarity function instead of manual calculation
            query = f"""
            MATCH (p:Page)
            WHERE p.{embedding_field} IS NOT NULL {model_filter}
            
            // Use native vector similarity function
            WITH p, vector.similarity(p.{embedding_field}, $embedding) AS similarity
            WHERE similarity >= $threshold
            
            RETURN p.id AS id, p.url AS url, p.title AS title, similarity
            ORDER BY similarity DESC
            LIMIT $limit
            """
            
            # Execute query
            result = await self.graph_operations.connection.execute_query(
                query,
                parameters={
                    "embedding": embedding,
                    "threshold": threshold,
                    "limit": limit,
                    "model": model
                },
                transaction=tx
            )
            
            # Process results
            similar_pages = []
            for item in result:
                similar_pages.append({
                    "id": item["id"],
                    "url": item["url"],
                    "title": item["title"],
                    "similarity": item["similarity"]
                })
            
            return similar_pages
            
        except Exception as e:
            self.logger.error(f"Error finding similar pages: {str(e)}", exc_info=True)
            raise
                

    async def get_page_embeddings(
        self, 
        tx: Transaction, 
        page_id: str
    ) -> Dict[str, Any]:
        """
        Get all embeddings associated with a page.
        
        Args:
            tx: Database transaction
            page_id: Page ID
                
        Returns:
            Dictionary containing all embedding types for the page
        """
        try:
            self.logger.debug(f"Getting all embeddings for page {page_id}")
            
            # Query to get all embedding types
            query = """
            MATCH (p:Page {id: $page_id})
            RETURN p.metadata_embedding AS metadata_embedding,
                p.content_embedding AS content_embedding,
                p.summary_embedding AS summary_embedding,
                p.embedding_model AS model,
                p.embedding_status AS status,
                p.embedding_updated_at AS last_updated
            """
            
            # Execute query
            result = await self.graph_operations.connection.execute_query(
                query,
                {"page_id": page_id},
                transaction=tx
            )
            
            # Check if page and embeddings exist
            if not result:
                self.logger.warning(f"No page found with ID: {page_id}")
                return {}
                
            # Get chunk embeddings
            chunk_query = """
            MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
            RETURN c.chunk_index AS index, 
                c.embedding AS embedding,
                c.start_char AS start_char,
                c.end_char AS end_char,
                c.total_chunks AS total_chunks,
                c.model AS model,
                c.created_at AS created_at
            ORDER BY c.chunk_index
            """
            
            chunk_result = await self.graph_operations.connection.execute_query(
                chunk_query,
                {"page_id": page_id},
                transaction=tx
            )
            
            # Assemble response
            embeddings = {
                "metadata_embedding": result[0].get("metadata_embedding"),
                "content_embedding": result[0].get("content_embedding"),
                "summary_embedding": result[0].get("summary_embedding"),
                "model": result[0].get("model"),
                "status": result[0].get("status"),
                "last_updated": result[0].get("last_updated"),
                "chunks": [
                    {
                        "index": chunk.get("index"),
                        "embedding": chunk.get("embedding"),
                        "start_char": chunk.get("start_char"),
                        "end_char": chunk.get("end_char"),
                        "total_chunks": chunk.get("total_chunks"),
                        "model": chunk.get("model"),
                        "created_at": chunk.get("created_at")
                    }
                    for chunk in chunk_result
                ]
            }
            
            self.logger.debug(f"Retrieved {len(embeddings['chunks'])} chunk embeddings for page {page_id}")
            return embeddings
            
        except Exception as e:
            self.logger.error(f"Error getting page embeddings: {str(e)}", exc_info=True)
            raise ServiceError(
                message="Failed to get page embeddings",
                details={"page_id": page_id},
                cause=e
            )
            
    async def delete_page_embeddings(
        self, 
        tx: Transaction, 
        page_id: str,
        embedding_types: List[str] = None
    ) -> Dict[str, Any]:
        """
        Delete embeddings for a page.
        
        Args:
            tx: Database transaction
            page_id: Page ID
            embedding_types: List of embedding types to delete (if None, delete all)
                
        Returns:
            Dictionary with deletion results
        """
        try:
            self.logger.info(f"Deleting embeddings for page {page_id}, types: {embedding_types}")
            
            # If specific types are specified, delete only those
            if embedding_types:
                # Build the SET clause dynamically
                set_clauses = []
                if "metadata" in embedding_types:
                    set_clauses.append("p.metadata_embedding = NULL")
                if "content" in embedding_types:
                    set_clauses.append("p.content_embedding = NULL")
                if "summary" in embedding_types:
                    set_clauses.append("p.summary_embedding = NULL")
                
                if set_clauses:
                    # Delete specific embedding types
                    query = f"""
                    MATCH (p:Page {{id: $page_id}})
                    SET {', '.join(set_clauses)},
                        p.embedding_updated_at = datetime(),
                        p.embedding_status = 'partial'
                    RETURN p.id AS id
                    """
                    
                    await self.graph_operations.connection.execute_query(
                        query,
                        {"page_id": page_id},
                        transaction=tx
                    )
            else:
                # Delete all embeddings
                query = """
                MATCH (p:Page {id: $page_id})
                SET p.metadata_embedding = NULL,
                    p.content_embedding = NULL, 
                    p.summary_embedding = NULL,
                    p.embedding_updated_at = datetime(),
                    p.embedding_status = 'pending'
                RETURN p.id AS id
                """
                
                await self.graph_operations.connection.execute_query(
                    query,
                    {"page_id": page_id},
                    transaction=tx
                )
            
            # Delete chunk embeddings if requested
            if not embedding_types or "chunks" in embedding_types:
                # Delete chunk nodes
                chunk_query = """
                MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
                DETACH DELETE c
                """
                
                await self.graph_operations.connection.execute_query(
                    chunk_query,
                    {"page_id": page_id},
                    transaction=tx
                )
                
                self.logger.debug(f"Deleted chunk embeddings for page {page_id}")
            
            return {
                "success": True,
                "page_id": page_id,
                "deleted_types": embedding_types if embedding_types else "all"
            }
            
        except Exception as e:
            self.logger.error(f"Error deleting page embeddings: {str(e)}", exc_info=True)
            raise ServiceError(
                message="Failed to delete page embeddings",
                details={"page_id": page_id},
                cause=e
            )
            

    async def get_embedding_stats(
        self, 
        tx: Transaction
    ) -> Dict[str, Any]:
        """
        Get statistics about embeddings in the knowledge graph.
        
        Args:
            tx: Database transaction
                
        Returns:
            Dictionary with embedding statistics
        """
        try:
            self.logger.debug("Getting embedding statistics")
            
            # Query to get counts of pages with different embedding types
            query = """
            MATCH (p:Page)
            RETURN 
                count(p) AS total_pages,
                count(p.metadata_embedding) AS pages_with_metadata_embedding,
                count(p.content_embedding) AS pages_with_content_embedding,
                count(p.summary_embedding) AS pages_with_summary_embedding,
                count(CASE WHEN p.embedding_status = 'completed' THEN 1 END) AS completed,
                count(CASE WHEN p.embedding_status = 'pending' THEN 1 END) AS pending,
                count(CASE WHEN p.embedding_status = 'processing' THEN 1 END) AS processing,
                count(CASE WHEN p.embedding_status = 'failed' THEN 1 END) AS failed,
                count(CASE WHEN p.embedding_status = 'partial' THEN 1 END) AS partial
            """
            
            result = await self.graph_operations.connection.execute_query(
                query,
                {},
                transaction=tx
            )
            
            # Get counts of chunk embeddings
            chunk_query = """
            MATCH (c:Chunk)
            RETURN count(c) AS total_chunks,
                avg(c.end_char - c.start_char) AS avg_chunk_size
            """
            
            chunk_result = await self.graph_operations.connection.execute_query(
                chunk_query,
                {},
                transaction=tx
            )
            
            # Get model distribution
            model_query = """
            MATCH (p:Page)
            WHERE p.embedding_model IS NOT NULL
            RETURN p.embedding_model AS model, count(p) AS count
            ORDER BY count DESC
            """
            
            model_result = await self.graph_operations.connection.execute_query(
                model_query,
                {},
                transaction=tx
            )
            
            # Assemble response
            stats = {
                "total_pages": result[0].get("total_pages", 0),
                "embedding_coverage": {
                    "metadata": result[0].get("pages_with_metadata_embedding", 0),
                    "content": result[0].get("pages_with_content_embedding", 0),
                    "summary": result[0].get("pages_with_summary_embedding", 0)
                },
                "embedding_status": {
                    "completed": result[0].get("completed", 0),
                    "pending": result[0].get("pending", 0),
                    "processing": result[0].get("processing", 0),
                    "failed": result[0].get("failed", 0),
                    "partial": result[0].get("partial", 0)
                },
                "chunks": {
                    "total": chunk_result[0].get("total_chunks", 0),
                    "avg_size": chunk_result[0].get("avg_chunk_size", 0)
                },
                "models": {
                    item.get("model"): item.get("count")
                    for item in model_result
                }
            }
            
            # Calculate percentages
            if stats["total_pages"] > 0:
                for key, value in stats["embedding_coverage"].items():
                    stats["embedding_coverage"][f"{key}_pct"] = round(value / stats["total_pages"] * 100, 2)
                    
                for key, value in stats["embedding_status"].items():
                    stats["embedding_status"][f"{key}_pct"] = round(value / stats["total_pages"] * 100, 2)
            
            self.logger.debug(f"Retrieved embedding statistics: {stats}")
            return stats
            
        except Exception as e:
            self.logger.error(f"Error getting embedding statistics: {str(e)}", exc_info=True)
            raise ServiceError(
                message="Failed to get embedding statistics",
                cause=e
            )

    async def get_page_by_id(self, tx: Transaction, page_id: str) -> Optional[Page]:
        """Get a page by its ID using the provided transaction.
        
        Args:
            tx: Transaction object
            page_id: ID of the page to retrieve
            
        Returns:
            Page instance if found, None otherwise
        """
        try:
            self.logger.debug(f"Retrieving page with ID: {page_id}")
            
            node = await self.graph_operations.get_node_by_property(
                label="Page",
                property_name="id",
                property_value=page_id,
                transaction=tx
            )
            
            # Handle the None case explicitly
            if node is None:
                self.logger.debug(f"No page found with ID: {page_id}")
                return None
                
            self.logger.debug(f"Retrieved page node: {node}")
            
            # Convert node to Page object
            if hasattr(node, 'properties'):
                node_data = dict(node.properties)
                node_data['id'] = str(node.id) if hasattr(node, 'id') else page_id
                return self._reconstruct_page_from_node(node_data)
            
            # If node is already dict-like
            if isinstance(node, dict):
                return self._reconstruct_page_from_node(node)
                
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting page by ID: {str(e)}", exc_info=True)
            raise ServiceError(
                message="Failed to get page by ID",
                details={"page_id": page_id},
                cause=e
            )
        
    