from typing import Dict, Optional, Any, Set, List
from core.content.page import Page, BrowserContext
from core.knowledge.graph import Neo4jConnection
from core.content.page import Page, BrowserContext, PageStatus
from core.utils.url import extract_domain
from core.utils.logger import get_logger
from api.services.graph_service import GraphService

logger =  get_logger(__name__)

class PageService:
    def __init__(self):
        self._url_to_page = {}  # URL -> Page mapping
        self.graph_service = GraphService()

    async def get_or_create_page(self, url: str, context: BrowserContext, **context_data) -> Page:
        if url in self._url_to_page:
            page = self._url_to_page[url]
            page.update_browser_contexts(context, **context_data)
            page.record_visit()
        else:
            page = Page(url=url, domain=extract_domain(url))
            page.update_browser_contexts(context, **context_data)
            self._url_to_page[url] = page
            
        await self.graph_service.create_or_update_page(page)
        return page
    
    async def update_page(self, page: Page) -> Dict[str, Any]:
        """Update an existing page in Neo4j.
        
        This is a full update operation that replaces all page data.
        For partial updates, use the specific update methods instead.
        
        Args:
            page: Updated Page object
            
        Returns:
            Dictionary representing the updated page node
            
        Raises:
            ValueError: If page doesn't exist
            Exception: For database or connection errors
        """
        try:
            # Check if page exists
            existing_page = await self.get_page_by_url(page.url)
            if not existing_page:
                raise ValueError(f"Page not found: {page.url}")
            
            # Prepare update data
            page_data = page.to_dict()
            
            query = """
            MATCH (p:Page {url: $url})
            SET p += $page_data,
                p.updated_at = datetime()
            RETURN p
            """
            
            result = await Neo4jConnection.execute_write_query(
                query,
                {
                    "url": page.url,
                    "page_data": page_data
                }
            )
            
            if not result:
                raise ValueError(f"Failed to update page: {page.url}")
                
            self.logger.info(f"Updated page in Neo4j: {page.url}")
            return result[0]
            
        except Exception as e:
            self.logger.error(f"Error updating page {page.url}: {str(e)}")
            raise

    async def update_page_status(
        self,
        url: str,
        status: PageStatus,
        error_message: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update the processing status of a page.
        
        Args:
            url: URL of the page to update
            status: New status to set
            error_message: Optional error message if status is ERROR
            
        Returns:
            Dictionary representing the updated page node
        """
        try:
            query = """
            MATCH (p:Page {url: $url})
            SET p.status = $status,
                p.updated_at = datetime()
            """
            
            params = {
                "url": url,
                "status": status.value
            }
            
            # Add error handling if needed
            if status == PageStatus.ERROR and error_message:
                query += ", p.errors = p.errors + [$error_message]"
                params["error_message"] = error_message
                
            query += " RETURN p"
            
            result = await Neo4jConnection.execute_write_query(query, params)
            
            if not result:
                raise ValueError(f"Failed to update page status: {url}")
                
            self.logger.info(f"Updated page status to {status.value}: {url}")
            return result[0]
            
        except Exception as e:
            self.logger.error(f"Error updating page status {url}: {str(e)}")
            raise

    async def update_page_metadata(
        self,
        url: str,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update specific metadata fields of a page.
        
        This performs a partial update, only modifying specified fields
        while preserving other existing metadata.
        
        Args:
            url: URL of the page to update
            metadata: Dictionary of metadata fields to update
            
        Returns:
            Dictionary representing the updated page node
        """
        try:
            query = """
            MATCH (p:Page {url: $url})
            SET p.metadata = CASE 
                WHEN p.metadata IS NULL THEN $metadata
                ELSE apoc.map.merge(p.metadata, $metadata)
            END,
            p.updated_at = datetime()
            RETURN p
            """
            
            result = await Neo4jConnection.execute_write_query(
                query,
                {
                    "url": url,
                    "metadata": metadata
                }
            )
            
            if not result:
                raise ValueError(f"Failed to update page metadata: {url}")
                
            self.logger.info(f"Updated page metadata: {url}")
            return result[0]
            
        except Exception as e:
            self.logger.error(f"Error updating page metadata {url}: {str(e)}")
            raise

    async def update_page_contexts(
        self,
        url: str,
        contexts: Set[BrowserContext],
        context_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update the browser contexts of a page.
        
        Args:
            url: URL of the page to update
            contexts: Set of browser contexts
            context_data: Optional additional context data (tab_id, window_id, etc.)
            
        Returns:
            Dictionary representing the updated page node
        """
        try:
            context_values = [c.value for c in contexts]
            
            query = """
            MATCH (p:Page {url: $url})
            SET p.browser_contexts = $contexts,
                p.context_data = $context_data,
                p.updated_at = datetime()
            RETURN p
            """
            
            result = await Neo4jConnection.execute_write_query(
                query,
                {
                    "url": url,
                    "contexts": context_values,
                    "context_data": context_data or {}
                }
            )
            
            if not result:
                raise ValueError(f"Failed to update page contexts: {url}")
                
            self.logger.info(f"Updated page contexts: {url}")
            return result[0]
            
        except Exception as e:
            self.logger.error(f"Error updating page contexts {url}: {str(e)}")
            raise


    async def query_pages(
        self,
        context: Optional[str] = None,
        status: Optional[str] = None,
        domain: Optional[str] = None
    ) -> List[Page]:
        """Query pages based on provided filters."""
        try:
            conditions = []
            params = {}
            
            if status:
                conditions.append("p.status = $status")
                params["status"] = status
                
            if context:
                conditions.append("p.context = $context")
                params["context"] = context
                
            if domain:
                conditions.append("p.domain = $domain")
                params["domain"] = domain
                
            where_clause = " AND ".join(conditions) if conditions else "true"
            
            query = f"""
            MATCH (p:Page)
            WHERE {where_clause}
            RETURN p
            ORDER BY p.discovered_at DESC
            """
            
            result = await Neo4jConnection.execute_read_query(query, params)
            return [Page.from_dict(record["p"]) for record in result]
                
        except Exception as e:
            logger.error(f"Error querying pages: {str(e)}")
            raise