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
        result = await self.execute_query(
            "MATCH (t:Task {id: $task_id}) RETURN count(t) as count",
            {"task_id": task_id}
        )
        exists = result[0]["count"] > 0
        self.logger.info(f"Task {task_id} exists in database: {exists}")
        return exists