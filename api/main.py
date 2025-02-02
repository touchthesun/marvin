from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from core.services.content.pipeline_service import PipelineService
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.schema import SchemaManager
from api.config import settings
from api.routes import test
from api.routes.pages import router as pages_router
from api.routes.analysis import router as analysis_router 
from api.routes.graph import router as graph_router
from core.utils.logger import get_logger
from core.utils.config import load_config

# Configure logger
logger = get_logger(__name__)

class AppState:
    """Container for application state."""
    def __init__(self):
        self.pipeline_service: PipelineService = None
        self.db_connection: DatabaseConnection = None
        self.schema_manager: SchemaManager = None

    async def initialize(self):
        """Initialize application services."""
        # Initialize database connection
        config = load_config()
        db_config = ConnectionConfig(
            uri=config["neo4j_uri"],
            username=config["neo4j_username"],
            password=config["neo4j_password"]
        )
        self.db_connection = DatabaseConnection(db_config)
        await self.db_connection.initialize()

        # Initialize schema manager
        self.schema_manager = SchemaManager(self.db_connection)
        await self.schema_manager.initialize()

        # Initialize other services
        # TODO: Initialize pipeline service

    async def cleanup(self):
        """Cleanup application services."""
        if self.db_connection:
            await self.db_connection.shutdown()
        if self.pipeline_service:
            # Assuming PipelineService has a cleanup method
            await self.pipeline_service.cleanup()

app_state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application."""
    try:
        # Startup
        logger.info("Initializing services...")
        await app_state.initialize()
        logger.info("Services initialized successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise
    finally:
        # Shutdown
        logger.info("Cleaning up services...")
        try:
            await app_state.cleanup()
            logger.info("Services cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up services: {e}")

def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    logger.info("Initializing FastAPI application")
    
    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        debug=settings.DEBUG,
        lifespan=lifespan
    )

    # Set up CORS
    logger.debug("Configuring CORS middleware with origins: %s", settings.BACKEND_CORS_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers with versioned prefix
    prefix = settings.API_V1_STR
    app.include_router(pages_router, prefix=prefix)
    app.include_router(analysis_router, prefix=prefix)
    app.include_router(graph_router, prefix=prefix)

    @app.get("/health")
    async def health_check():
        """Health check endpoint with service status."""
        return {
            "status": "healthy",
            "version": settings.VERSION,
            "environment": "development" if settings.DEBUG else "production",
            "services": {
                "pipeline": "running" if app_state.pipeline_service else "not_initialized",
                "database": "running" if app_state.db_connection else "not_initialized",
                "schema": "initialized" if app_state.schema_manager else "not_initialized"
            }
        }

    return app

app = create_application()