from typing import List, Optional, Dict, Any
from urllib.parse import urlparse

from core.content.page import Page, PageStatus, BrowserContext
from core.knowledge.graph import GraphManager, Neo4jConnection
from core.utils.logger import get_logger

logger = get_logger(__name__)

class GraphService:
    """Service layer for Neo4j graph operations.
    
    This service provides a high-level interface for graph operations,
    abstracting the details of Neo4j interaction and providing 
    transaction management.
    """
    
    def __init__(self):
        self.graph_manager = GraphManager()
        self.logger = logger
    
    async def create_or_update_page(self, page: Page) -> Dict[str, Any]:
        """Create or update a page in Neo4j.
        
        This method creates or updates both a Site node and a Page node in Neo4j.
        While create_site_with_page() returns both nodes, we only need the page_node
        here, so we use the Python convention of underscore (_) to indicate we're
        intentionally ignoring the site_node return value.
        
        Args:
            page: Page object to store
            
        Returns:
            Dictionary representing the stored page node
            
        Raises:
            ValueError: If page creation/update fails
            Exception: For other database or connection errors
        """
        try:
            # Extract site information from URL
            parsed_url = urlparse(page.url)
            site_url = f"{parsed_url.scheme}://{page.domain}"
            
            # Prepare page data
            page_data = page.to_dict()
            
            # Store in Neo4j, using _ to ignore the site_node return value
            _, page_node = await self.graph_manager.create_site_with_page(
                site_url=site_url,
                site_name=page.domain,
                page_url=page.url,
                page_title=page.title or "",
                page_content_summary=page_data.get('content_summary', ''),
                page_metadata=page_data
            )
            
            if not page_node:
                raise ValueError(f"Failed to create/update page in Neo4j: {page.url}")
            
            self.logger.info(f"Stored page in Neo4j: {page.url}")
            return page_node
            
        except Exception as e:
            self.logger.error(f"Error storing page {page.url}: {str(e)}")
            raise
    
    async def batch_create_pages(self, pages: List[Page]) -> List[Dict[str, Any]]:
        """Create multiple pages in Neo4j.
        
        Args:
            pages: List of Page objects to store
            
        Returns:
            List of stored node dictionaries
        """
        try:
            results = []
            for page in pages:
                node = await self.create_or_update_page(page)
                results.append(node)
            return results
            
        except Exception as e:
            self.logger.error(f"Error in batch page creation: {str(e)}")
            raise
    
    async def get_page_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Retrieve a page from Neo4j by URL.
        
        Args:
            url: URL to look up
            
        Returns:
            Page node dictionary or None if not found
        """
        try:
            return await self.graph_manager.get_page_by_url(url)
        except Exception as e:
            self.logger.error(f"Error retrieving page {url}: {str(e)}")
            raise
    
    async def get_pages_by_context(
        self,
        context: BrowserContext,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get pages with a specific browser context.
        
        Args:
            context: Browser context to filter by
            limit: Maximum number of results
            
        Returns:
            List of page node dictionaries
        """
        try:
            query = """
            MATCH (p:Page)
            WHERE p.browser_context.status = $context
            RETURN p
            LIMIT $limit
            """
            
            result = await Neo4jConnection.execute_read_query(
                query,
                {"context": context.value, "limit": limit}
            )
            
            return [record["p"] for record in result]
            
        except Exception as e:
            self.logger.error(f"Error querying pages by context {context}: {str(e)}")
            raise
    
    async def get_pages_by_status(
        self,
        status: PageStatus,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get pages with a specific processing status.
        
        Args:
            status: Page status to filter by
            limit: Maximum number of results
            
        Returns:
            List of page node dictionaries
        """
        try:
            query = """
            MATCH (p:Page)
            WHERE p.status = $status
            RETURN p
            LIMIT $limit
            """
            
            result = await Neo4jConnection.execute_read_query(
                query,
                {"status": status.value, "limit": limit}
            )
            
            return [record["p"] for record in result]
            
        except Exception as e:
            self.logger.error(f"Error querying pages by status {status}: {str(e)}")
            raise
    
    async def add_page_relationship(
        self,
        source_url: str,
        target_url: str,
        relationship_type: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a relationship between two pages.
        
        Args:
            source_url: URL of the source page
            target_url: URL of the target page
            relationship_type: Type of relationship
            metadata: Optional relationship metadata
            
        Returns:
            Dictionary representing the created relationship
        """
        try:
            query = """
            MATCH (source:Page {url: $source_url})
            MATCH (target:Page {url: $target_url})
            MERGE (source)-[r:$rel_type]->(target)
            SET r.metadata = $metadata,
                r.created_at = datetime(),
                r.updated_at = datetime()
            RETURN r
            """
            
            result = await Neo4jConnection.execute_write_query(
                query,
                {
                    "source_url": source_url,
                    "target_url": target_url,
                    "rel_type": relationship_type,
                    "metadata": metadata or {}
                }
            )
            
            return result[0] if result else None
            
        except Exception as e:
            self.logger.error(
                f"Error creating relationship between {source_url} and {target_url}: {str(e)}"
            )
            raise

    async def search_pages(
        self,
        url_pattern: Optional[str] = None,
        domain: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Search for pages by URL pattern or domain.
        
        Args:
            url_pattern: Optional pattern to match against URLs
            domain: Optional domain to filter by
            limit: Maximum number of results
            
        Returns:
            List of matching page nodes
            
        Example:
            >>> await graph_service.search_pages(domain="example.com")
            >>> await graph_service.search_pages(url_pattern="blog%")
        """
        try:
            conditions = []
            params = {"limit": limit}
            
            if url_pattern:
                conditions.append("p.url =~ $url_pattern")
                params["url_pattern"] = url_pattern
                
            if domain:
                conditions.append("p.domain = $domain")
                params["domain"] = domain
                
            where_clause = " AND ".join(conditions) if conditions else "true"
            
            query = f"""
            MATCH (p:Page)
            WHERE {where_clause}
            RETURN p
            ORDER BY p.last_active DESC
            LIMIT $limit
            """
            
            result = await Neo4jConnection.execute_read_query(query, params)
            return [record["p"] for record in result]
            
        except Exception as e:
            self.logger.error(f"Error searching pages: {str(e)}")
            raise

    async def get_related_pages(
        self,
        url: str,
        relationship_types: Optional[List[str]] = None,
        min_strength: float = 0.0,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get pages related to a given page.
        
        Args:
            url: URL of the source page
            relationship_types: Optional list of relationship types to filter by
            min_strength: Minimum relationship strength (0.0 to 1.0)
            limit: Maximum number of results
            
        Returns:
            List of related page nodes with relationship data
            
        Example:
            >>> await graph_service.get_related_pages(
            ...     url="https://example.com",
            ...     relationship_types=["LINKS_TO", "SIMILAR_TO"],
            ...     min_strength=0.5
            ... )
        """
        try:
            params = {
                "url": url,
                "min_strength": min_strength,
                "limit": limit
            }
            
            # Build relationship type filter
            rel_filter = ""
            if relationship_types:
                rel_types = "|".join(f":{t}" for t in relationship_types)
                rel_filter = f"[{rel_types}]"
                
            query = f"""
            MATCH (p:Page {{url: $url}})-[r{rel_filter}]->(related:Page)
            WHERE r.strength >= $min_strength
            WITH related, r, r.strength as strength
            ORDER BY strength DESC
            LIMIT $limit
            RETURN related, TYPE(r) as relationship_type, r.strength as strength,
                r.metadata as relationship_metadata
            UNION
            MATCH (p:Page {{url: $url}})<-[r{rel_filter}]-(related:Page)
            WHERE r.strength >= $min_strength
            WITH related, r, r.strength as strength
            ORDER BY strength DESC
            LIMIT $limit
            RETURN related, TYPE(r) as relationship_type, r.strength as strength,
                r.metadata as relationship_metadata
            """
            
            result = await Neo4jConnection.execute_read_query(query, params)
            
            # Format results to include both page and relationship data
            return [{
                "page": record["related"],
                "relationship": {
                    "type": record["relationship_type"],
                    "strength": record["strength"],
                    "metadata": record["relationship_metadata"]
                }
            } for record in result]
            
        except Exception as e:
            self.logger.error(
                f"Error getting related pages for {url}: {str(e)}"
            )
            raise

    async def find_pages_by_keyword(
        self,
        keyword: str,
        match_variants: bool = True,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Find pages containing a specific keyword.
        
        Args:
            keyword: Keyword to search for
            match_variants: Whether to match keyword variants
            limit: Maximum number of results
            
        Returns:
            List of page nodes with keyword scores
        """
        try:
            # Base query using exact match
            query = """
            MATCH (p:Page)-[r:CONTAINS]->(k:Keyword)
            WHERE k.text = $keyword OR k.canonical_text = $keyword
            """
            
            params = {
                "keyword": keyword,
                "limit": limit
            }
            
            # Add variant matching if requested
            if match_variants:
                query += " OR $keyword IN k.variants"
                
            query += """
            WITH p, max(r.score) as keyword_score
            ORDER BY keyword_score DESC
            LIMIT $limit
            RETURN p, keyword_score
            """
            
            result = await Neo4jConnection.execute_read_query(query, params)
            
            return [{
                "page": record["p"],
                "keyword_score": record["keyword_score"]
            } for record in result]
            
        except Exception as e:
            self.logger.error(
                f"Error finding pages for keyword {keyword}: {str(e)}"
            )
            raise