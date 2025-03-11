import asyncio
from datetime import datetime, timedelta
from core.domain.content.models.page import Page
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.graph_operations import GraphOperationManager
from core.services.graph.graph_service import GraphService
from core.services.content.page_service import PageService
from core.domain.content.types import BrowserContext, PageStatus
from core.infrastructure.database.transactions import Transaction
from core.utils.config import load_config
from core.utils.logger import get_logger

logger = get_logger(__name__)

async def create_test_pages(page_service: PageService) -> None:
    """Create test pages for development and testing."""
    # Use fixed timestamps for consistency
    now = datetime.now()
    yesterday = now - timedelta(days=1)
    
    test_pages = [
        {
            "url": "https://example.com/page1",
            "domain": "example.com",
            "title": "Example Page 1",
            "context": BrowserContext.ACTIVE_TAB,
            "tab_id": "tab1",
            "window_id": "window1",
            "metadata": {
                "discovered_at": now,
                "last_accessed": now,
                "status": PageStatus.ACTIVE,
                "metadata_quality_score": 0.8,
                "word_count": 1500,
                "reading_time_minutes": 7.5,
                "language": "en",
                "source_type": "article",
                "author": "John Doe",
                "browser_contexts": {BrowserContext.ACTIVE_TAB}
            },
            "metrics": {
                "quality_score": 0.85,
                "relevance_score": 0.9,
                "visit_count": 3,
                "keyword_count": 25,
                "last_visited": now
            }
        },
        {
            "url": "https://example.com/page2",
            "domain": "example.com",
            "title": "Example Page 2",
            "context": BrowserContext.HISTORY,
            "tab_id": None,
            "window_id": None,
            "metadata": {
                "discovered_at": yesterday,
                "last_accessed": yesterday,
                "status": PageStatus.HISTORY,
                "metadata_quality_score": 0.7,
                "word_count": 800,
                "reading_time_minutes": 4.0,
                "language": "en",
                "source_type": "blog",
                "author": "Jane Smith",
                "browser_contexts": {BrowserContext.HISTORY}
            },
            "metrics": {
                "quality_score": 0.75,
                "relevance_score": 0.8,
                "visit_count": 1,
                "keyword_count": 15,
                "last_visited": yesterday
            }
        }
    ]
    
    tx = Transaction()
    try:
        created_pages = []
        for page_data in test_pages:
            logger.info(f"Creating test page: {page_data['url']}")
            
            # Create page with metadata
            page = Page(
                url=page_data["url"],
                domain=page_data["domain"],
                title=page_data["title"]
            )
            
            # Set metadata
            for key, value in page_data["metadata"].items():
                setattr(page.metadata, key, value)
            
            # Set metrics
            for key, value in page_data["metrics"].items():
                setattr(page.metadata.metrics, key, value)
            
            # Create or update page
            result = await page_service.get_or_create_page(
                tx=tx,
                url=page_data["url"],
                context=page_data["context"],
                tab_id=page_data["tab_id"],
                window_id=page_data["window_id"]
            )
            created_pages.append(result)
        
        await tx.commit()
        logger.info(f"Successfully created {len(created_pages)} test pages")
        
        # Verify pages were created
        verification_tx = Transaction()
        try:
            for page in created_pages:
                result = await page_service.query_pages(
                    tx=verification_tx,
                    domain="example.com"
                )
                logger.info(f"Found {len(result)} pages during verification")
        finally:
            await verification_tx.commit()
            
    except Exception as e:
        await tx.rollback()
        logger.error(f"Error creating test pages: {str(e)}", exc_info=True)
        raise

async def initialize_services():
    """Initialize all required services with proper dependency chain."""
    # Load configuration
    config = load_config()
    logger.info("Loaded configuration")
    
    # Initialize database connection
    db_config = ConnectionConfig(
        uri=config["neo4j_uri"],
        username=config["neo4j_username"],
        password=config["neo4j_password"],
        max_connection_pool_size=50,
        connection_timeout=30 
    )
    
    logger.debug(f"Initializing database connection to {db_config.uri}")
    db_connection = DatabaseConnection(db_config)
    await db_connection.initialize()
    logger.info("Database connection initialized")
    
    # Create service chain
    graph_operations = GraphOperationManager(db_connection)
    graph_service = GraphService(graph_operations)
    page_service = PageService(graph_service)
    logger.info("Services initialized")
    
    return db_connection, page_service

async def cleanup_services(db_connection):
    """Cleanup services and connections."""
    logger.info("Cleaning up services")
    await db_connection.shutdown()
    logger.info("Cleanup complete")

async def main():
    """Main function to create test data."""
    try:
        logger.info("Starting test data creation")
        # Initialize services
        db_connection, page_service = await initialize_services()
        
        # Create test data
        await create_test_pages(page_service)
        
        logger.info("Test data creation completed successfully")
        
    except Exception as e:
        logger.error(f"Error creating test data: {str(e)}", exc_info=True)
        raise
    finally:
        # Cleanup
        await cleanup_services(db_connection)

if __name__ == "__main__":
    asyncio.run(main())