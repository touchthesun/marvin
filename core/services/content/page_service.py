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
        self._url_to_page = {}  # Local cache
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
            node: Neo4j Node object
            
        Returns:
            Page instance
        """
        # Extract data from Neo4j Node
        data = dict(node.properties)
        if hasattr(node, 'id'):
            data['id'] = str(node.id)
            
        # Convert Neo4j types to Python types as needed
        if 'discovered_at' in data and hasattr(data['discovered_at'], 'to_native'):
            data['discovered_at'] = data['discovered_at'].to_native()
            
        return Page.from_dict(data)

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
        context: Optional[str] = None,
        status: Optional[str] = None,
        domain: Optional[str] = None
    ) -> List[Page]:
        """Query pages based on filters.
        
        Args:
            tx: Transaction object
            context: Optional browser context filter
            status: Optional page status filter
            domain: Optional domain filter
            
        Returns:
            List of matching Page objects
        """
        try:
            results = await self.graph_service.execute_in_transaction(
                tx, "query_pages",
                status=status.value if status else None,
                domain=domain
            )
            
            pages = []
            for result in results:
                page = self._reconstruct_page_from_node(result)
                # Filter by context if specified
                if context and context not in page.browser_contexts:
                    continue
                pages.append(page)
                self._url_to_page[page.url] = page
                tx.add_rollback_handler(lambda url=page.url: self._url_to_page.pop(url, None))
                    
            return pages
                
        except Exception as e:
            self.logger.error(f"Error querying pages: {str(e)}")
            raise