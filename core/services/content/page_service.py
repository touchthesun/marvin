import time
from uuid import UUID

from core.domain.content.types import PageRelationship
from typing import Dict, Optional, Any, Set, List
from core.domain.content.models.page import Page, BrowserContext, PageStatus
from core.utils.url import extract_domain
from core.utils.logger import get_logger
from core.services.graph.graph_service import GraphService
from core.services.base import BaseService
from core.infrastructure.database.transactions import Transaction

class PageService(BaseService):
    """Service for managing Page objects and their persistence.
    
    This service maintains a local cache of Page objects and coordinates
    with GraphService for persistence. All operations are transaction-aware
    and support rollback.
    """
    
    def __init__(self, graph_service: GraphService):
        super().__init__()
        self.graph_service = graph_service
        self._url_to_page = {}
        self.logger = get_logger(__name__)

    async def initialize(self) -> None:
        """Initialize service resources."""
        await super().initialize()
        self._url_to_page.clear()
        self.logger.info("PageService initialized")

    async def cleanup(self) -> None:
        """Cleanup service resources."""
        try:
            self._url_to_page.clear()
            await super().cleanup()
            self.logger.info("PageService cleaned up")
        except Exception as e:
            self.logger.error(f"Error during PageService cleanup: {str(e)}")
            raise

    async def _get_page(
        self,
        tx: Transaction,
        url: str,
        create_if_missing: bool = False
    ) -> Page:
        """Get a page from cache or database."""
        page = self._url_to_page.get(url)
        if not page:
            graph_page = await self.graph_service.execute_in_transaction(
                tx, "get_page_by_url", url
            )
            if graph_page:
                # Handle based on type of returned data
                if isinstance(graph_page, Page):
                    page = graph_page
                elif isinstance(graph_page, dict):
                    page = Page.from_dict(graph_page)
                elif hasattr(graph_page, 'properties'):  # Neo4j Node
                    page = self._create_page_from_node(graph_page)
                else:
                    self.logger.error(f"Unexpected type from graph service: {type(graph_page)}, data: {graph_page}")
                    raise ValueError(f"Unexpected type from graph service: {type(graph_page)}")
                    
                self._url_to_page[url] = page
                tx.add_rollback_handler(lambda: self._url_to_page.pop(url, None))
            elif create_if_missing:
                domain = extract_domain(url)
                page = Page(url=url, domain=domain)
                self._url_to_page[url] = page
                tx.add_rollback_handler(lambda: self._url_to_page.pop(url, None))
            else:
                raise ValueError(f"Page not found: {url}")
        return page
    
    def _create_page_from_node(self, node: Any) -> Page:
        """Create a Page instance from a Neo4j Node.
        
        Args:
            node: Neo4j Node or dictionary representation
            
        Returns:
            Page instance
        
        Raises:
            ValueError: If node is missing required properties
        """
        try:
            start_time = time.time()
            
            # Extract data from Neo4j Node
            if hasattr(node, 'properties'):
                # Neo4j Node object
                data = dict(node.properties)
                # Add ID if available
                if hasattr(node, 'id'):
                    data['id'] = str(node.id)
            else:
                # Dictionary representation
                data = dict(node)
            
            # Create Page using existing GraphService method
            page = self.graph_service._reconstruct_page_from_node(data)
            
            # Log performance
            duration = time.time() - start_time
            self.logger.debug(
                f"Created Page from node in {duration:.3f}s",
                extra={
                    "url": page.url,
                    "properties_count": len(data),
                    "has_keywords": bool(page.keywords)
                }
            )
            
            return page
            
        except Exception as e:
            self.logger.error(f"Error creating Page from node: {str(e)}", exc_info=True)
            # Re-raise with more context
            raise ValueError(f"Failed to create Page from node: {str(e)}") from e

    async def get_or_create_page(
        self,
        tx: Transaction,
        url: str,
        context: BrowserContext,
        **context_data
    ) -> Page:
        """Get or create a page with browser context."""
        page = await self._get_page(tx, url, create_if_missing=True)
        
        # Save old state for rollback
        old_contexts = page.browser_contexts.copy()
        tx.add_rollback_handler(lambda: setattr(page, 'browser_contexts', old_contexts))
        
        # Update contexts and visit info
        page.update_browser_contexts(context, **context_data)
        page.record_visit()
        
        # Persist changes
        await self.graph_service.execute_in_transaction(
            tx, "create_or_update_page", page
        )
        
        return page

    async def update_page_status(
        self,
        tx: Transaction,
        url: str,
        status: PageStatus,
        error_message: Optional[str] = None
    ) -> Page:
        """Update page status."""
        page = await self._get_page(tx, url)
        
        # Save old state for rollback
        old_status = page.status
        old_errors = page.errors.copy()
        tx.add_rollback_handler(lambda: setattr(page, 'status', old_status))
        tx.add_rollback_handler(lambda: setattr(page, 'errors', old_errors))
        
        # Update status
        page.status = status
        if error_message:
            page.errors.append(error_message)
        
        # Persist changes
        await self.graph_service.execute_in_transaction(
            tx, "create_or_update_page", page
        )
        
        return page

    async def update_page_metadata(
        self,
        tx: Transaction,
        url: str,
        metadata: Dict[str, Any]
    ) -> Page:
        """Update page metadata."""
        page = await self._get_page(tx, url)
        
        # Save old state for rollback
        old_metadata = page.metadata.copy()
        tx.add_rollback_handler(lambda: setattr(page, 'metadata', old_metadata))
        
        # Update metadata
        page.metadata.update(metadata)
        
        # Persist changes
        await self.graph_service.execute_in_transaction(
            tx, "create_or_update_page", page
        )
        
        return page

    async def update_page_contexts(
        self,
        tx: Transaction,
        url: str,
        contexts: Set[BrowserContext],
        context_data: Optional[Dict[str, Any]] = None
    ) -> Page:
        """Update page browser contexts."""
        page = await self._get_page(tx, url)
        
        # Save old state for rollback
        old_contexts = page.browser_contexts.copy()
        old_context_data = page.context_data.copy() if hasattr(page, 'context_data') else {}
        tx.add_rollback_handler(lambda: setattr(page, 'browser_contexts', old_contexts))
        tx.add_rollback_handler(lambda: setattr(page, 'context_data', old_context_data))
        
        # Update contexts
        page.browser_contexts = contexts
        if context_data:
            page.context_data = context_data
        
        # Persist changes
        await self.graph_service.execute_in_transaction(
            tx, "create_or_update_page", page
        )
        
        return page


    async def query_pages(
        self,
        tx: Transaction,
        query: Optional[str] = None,
        context: Optional[str] = None,
        status: Optional[str] = None,
        domain: Optional[str] = None,
        url: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        include_relationships: bool = False,
        sort_by: Optional[str] = None
    ) -> List[Page]:
        """
        Query pages with flexible filtering options.
        
        Args:
            tx: Transaction for database operations
            query: Text search across url, title, and keywords
            context: Browser context filter
            status: Page status filter
            domain: Domain filter
            url: Specific URL filter
            limit: Maximum number of results
            offset: Result offset for pagination
            include_relationships: Whether to include relationships
            sort_by: Field to sort by
            
        Returns:
            List of Page objects matching the query
        """
        start_time = time.time()
        
        try:
            # Build Cypher query parameters
            params = {}
            
            # Start building Cypher query
            cypher_query = "MATCH (p:Page) "
            where_clauses = []
            
            # Add specific URL filter if provided
            if url:
                where_clauses.append("p.url = $url")
                params["url"] = url
            
            # Add text search condition with simpler approach
            if query:
                # Search only URL and title for now (we'll fix keywords later)
                search_clauses = [
                    "toLower(p.url) CONTAINS toLower($query)",
                    "toLower(p.title) CONTAINS toLower($query)"
                ]
                
                # Skip the complex keywords search for now
                where_clauses.append("(" + " OR ".join(search_clauses) + ")")
                params["query"] = query
            
            # Add status filter
            if status:
                where_clauses.append("p.status = $status")
                params["status"] = status
            
            # Add domain filter
            if domain:
                where_clauses.append("p.domain = $domain")
                params["domain"] = domain
            
            # Add context filter
            if context:
                where_clauses.append("$context IN p.browser_contexts")
                params["context"] = context
            
            # Combine WHERE clauses if any
            if where_clauses:
                cypher_query += "WHERE " + " AND ".join(where_clauses) + " "
            
            # First RETURN, then ORDER BY, then SKIP and LIMIT (correct Cypher order)
            cypher_query += "RETURN p "
            
            # Add sorting
            if sort_by:
                # Sanitize sort field to prevent injection
                valid_sort_fields = ["url", "title", "status", "domain", "discovered_at"]
                sort_field = sort_by if sort_by in valid_sort_fields else "discovered_at"
                cypher_query += f"ORDER BY p.{sort_field} "
            else:
                # Default sort by latest discovered
                cypher_query += "ORDER BY p.discovered_at DESC "
            
            # Add pagination
            cypher_query += "SKIP $offset LIMIT $limit"
            params["offset"] = offset
            params["limit"] = limit
            
            # Add debug logging for the query
            self.logger.debug(
                f"Executing Cypher query: {cypher_query}",
                extra={"params": params}
            )
            
            # Pass the query through to the graph_service
            result = await self.graph_service.graph_operations.connection.execute_query(
                cypher_query,
                parameters=params,
                transaction=tx._neo4j_tx
            )
            
            # Convert to Page objects
            pages = []
            for record in result:
                page_node = record["p"]
                page = self._create_page_from_node(page_node)
                
                # Manual filtering for keywords if query parameter is provided
                # This is a workaround for the complex Cypher keyword search
                if query and page.keywords:
                    # Only include page if no query, or if a keyword matches
                    query_lower = query.lower()
                    keyword_match = False
                    
                    # Check if any keyword contains the query string
                    for keyword in page.keywords.keys():
                        if query_lower in keyword.lower():
                            keyword_match = True
                            break
                    
                    # If querying by keyword and no match, skip this page
                    if not keyword_match and not (
                        query_lower in page.url.lower() or 
                        (page.title and query_lower in page.title.lower())
                    ):
                        continue
                
                # Get relationships if requested
                if include_relationships:
                    relationships = await self._get_page_relationships(tx, page.id)
                    page.relationships = relationships
                
                pages.append(page)
            
            # Log performance
            duration = time.time() - start_time
            self.logger.info(
                f"Query pages completed in {duration:.3f}s",
                extra={
                    "result_count": len(pages),
                    "query_params": {
                        "query": query,
                        "context": context,
                        "status": status,
                        "domain": domain,
                        "url": url
                    },
                    "duration": duration
                }
            )
            
            return pages
            
        except Exception as e:
            self.logger.error(f"Error in query_pages: {str(e)}", exc_info=True)
            raise
    

    async def _get_page_relationships(self, tx: Transaction, page_id: UUID) -> List[PageRelationship]:
        """
        Get all relationships for a page.
        
        Args:
            tx: Transaction for database operations
            page_id: UUID of the page
            
        Returns:
            List of PageRelationship objects
        """
        start_time = time.time()
        relationship_count = 0
        
        try:
            # Query to get outgoing relationships
            query = """
            MATCH (p:Page {id: $page_id})-[r]->(target:Page)
            RETURN 
                type(r) AS type,
                target.id AS target_id,
                r.strength AS strength,
                properties(r) AS properties
            """
            
            params = {"page_id": str(page_id)}
            
            # Execute query using graph operations dependency
            result = await self.graph_operations.connection.execute_query(
                query,
                parameters=params,
                transaction=tx._neo4j_tx
            )
            
            # Convert to PageRelationship objects
            relationships = []
            for record in result:
                # Extract relationship properties
                rel_type = record["type"]
                target_id_str = record["target_id"]
                properties = record["properties"] if record["properties"] else {}
                
                try:
                    # Convert target_id to UUID
                    target_id = UUID(target_id_str)
                    
                    # Get relationship strength
                    strength = float(record.get("strength", properties.get("strength", 0.5)))
                    
                    # Create relationship object
                    relationship = PageRelationship(
                        type=rel_type,
                        target_id=target_id,
                        strength=strength,
                        metadata={
                            k: v for k, v in properties.items() 
                            if k not in ("strength",)
                        }
                    )
                    
                    relationships.append(relationship)
                    relationship_count += 1
                    
                except (ValueError, TypeError) as e:
                    self.logger.warning(
                        f"Skipping invalid relationship: {str(e)}",
                        extra={
                            "page_id": str(page_id),
                            "target_id": target_id_str,
                            "type": rel_type
                        }
                    )
            
            # Log performance
            duration = time.time() - start_time
            self.logger.debug(
                f"Retrieved {relationship_count} relationships in {duration:.3f}s",
                extra={
                    "page_id": str(page_id),
                    "relationship_count": relationship_count,
                    "duration": duration
                }
            )
            
            return relationships
            
        except Exception as e:
            self.logger.error(
                f"Error retrieving relationships for page {page_id}: {str(e)}",
                exc_info=True
            )
            # Return empty list on error rather than failing
            return []