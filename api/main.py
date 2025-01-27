from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api.services.pipeline_service import PipelineService
from api.config import settings
from api.routers import test
from api.routers.pages import router as pages_router
from api.routers.analysis import router as analysis_router 
from api.routers.graph import router as graph_router
from core.utils.logger import get_logger
from core.knowledge.graph import GraphSchema

# Configure logger
logger = get_logger(__name__)

# Global pipeline service instance. This is initialized in the lifespan
# context manager and accessed via dependency injection in the routers.
# We use a global variable to ensure the same instance is shared across
# all requests and is properly cleaned up on application shutdown.

pipeline_service: PipelineService = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application.
    
    Handles initialization and cleanup of services.
    """
    # Startup
    logger.info("Initializing services...")
    global pipeline_service
    await GraphSchema.initialize_schema()
    pipeline_service = PipelineService(max_concurrent=5)
    
    yield
    
    # Shutdown
    logger.info("Cleaning up services...")
    if pipeline_service:
        await pipeline_service.cleanup()


def create_application() -> FastAPI:
    """Create FastAPI application with configuration"""
    
    logger.info("Initializing FastAPI application")
    
    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        debug=settings.DEBUG,
        lifespan=lifespan
    )

    # Set up CORS middleware
    logger.debug("Configuring CORS middleware with origins: %s", settings.BACKEND_CORS_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(pages_router, prefix="/api/v1")
    app.include_router(analysis_router, prefix="/api/v1")
    app.include_router(graph_router, prefix="/api/v1")


    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "version": "0.1.0",
            "environment": "development" if settings.DEBUG else "production"
        }

    return app

app = create_application()