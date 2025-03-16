from core.domain.content.pipeline import PipelineComponent, ComponentType
from core.infrastructure.database.db_connection import DatabaseConnection
from core.utils.logger import get_logger
from core.domain.content.models.page import Page


class Neo4jStorageComponent(PipelineComponent):
    """Component for storing page information in Neo4j."""
    
    def __init__(self, db_connection: DatabaseConnection):
        self.db_connection = db_connection
        self.logger = get_logger(__name__)
        
    async def process(self, page: Page) -> None:
        """Store page information in Neo4j."""
        self.logger.info(f"Storing page in Neo4j: {page.url}")
        
        try:
            # Convert UUID to string
            page_id = str(page.id)
            
            # Check if page already exists
            check_query = "MATCH (p:Page {url: $url}) RETURN p.id as id"
            check_result = await self.db_connection.execute_query(check_query, {"url": page.url})
            
            if check_result and check_result[0]["id"]:
                # Page exists - update it with the new ID and other properties
                existing_id = check_result[0]["id"]
                self.logger.info(f"Page with URL {page.url} already exists with ID {existing_id}, updating")
                
                update_query = """
                MATCH (p:Page {url: $url})
                SET p.id = $id,
                    p.title = $title,
                    p.updated_at = datetime(),
                    p.status = $status
                RETURN p
                """
                
                params = {
                    "url": page.url,
                    "id": page_id,
                    "title": getattr(page, 'title', ""),
                    "status": page.status.value
                }
                
                await self.db_connection.execute_query(update_query, params)
                self.logger.info(f"Updated existing page for URL {page.url}")
            else:
                # Page doesn't exist - create it
                create_query = """
                CREATE (p:Page {
                    id: $id,
                    url: $url,
                    domain: $domain,
                    title: $title,
                    created_at: datetime(),
                    status: $status
                })
                RETURN p
                """
                
                params = {
                    "id": page_id,
                    "url": page.url,
                    "domain": page.domain,
                    "title": getattr(page, 'title', ""),
                    "status": page.status.value
                }
                
                await self.db_connection.execute_query(create_query, params)
                self.logger.info(f"Created new page for URL {page.url}")
            
            # If keywords were extracted, store them too
            if hasattr(page, 'keywords') and page.keywords:
                await self._store_keywords(page, page_id)
            
        except Exception as e:
            self.logger.error(f"Error storing page in Neo4j: {str(e)}", exc_info=True)
            raise
    
    async def _store_keywords(self, page: Page, page_id: str) -> None:
        """Store page keywords in Neo4j.
        
        Args:
            page: The page containing keywords
            page_id: String ID of the page for Neo4j
        """
        self.logger.info(f"Storing keywords for page: {page.url}")
        
        # Default language - we can try to detect it from the page if available
        default_language = "en"  # Default to English
        if hasattr(page.metadata, 'language') and page.metadata.language:
            default_language = page.metadata.language
        
        for keyword, score in page.keywords.items():
            query = """
            MATCH (p:Page {id: $page_id})
            MERGE (k:Keyword {text: $keyword, language: $language})
            MERGE (p)-[r:HAS_KEYWORD]->(k)
            SET r.score = $score
            """
            
            params = {
                "page_id": page_id,
                "keyword": keyword,
                "language": default_language,  # Add the required language property
                "score": score
            }
            
            try:
                await self.db_connection.execute_query(query, params)
                self.logger.debug(f"Stored keyword '{keyword}' with score {score}")
            except Exception as e:
                self.logger.error(f"Error storing keyword '{keyword}': {str(e)}")
                # Continue with other keywords even if one fails
        
        self.logger.info(f"Finished storing {len(page.keywords)} keywords for page: {page.url}")
    
    async def validate(self, page: Page) -> bool:
        """Validate that this component can process the page."""
        # Basic validation - check if page has required attributes
        return (hasattr(page, 'id') and hasattr(page, 'url') and 
            hasattr(page, 'domain') and hasattr(page, 'metadata'))

    def get_component_type(self) -> ComponentType:
        """Get the type of this component."""
        return ComponentType.STORAGE
    
    async def rollback(self, page: Page) -> None:
        """Rollback component changes if needed."""
        self.logger.info(f"Rolling back storage for page: {page.id}")
        
        try:
            # Delete the page from Neo4j if it exists
            query = "MATCH (p:Page {id: $id}) DETACH DELETE p"
            await self.db_connection.execute_query(query, {"id": page.id})
        except Exception as e:
            self.logger.error(f"Error rolling back storage: {str(e)}")