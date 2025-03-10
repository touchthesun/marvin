from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api.config.config import settings
from api.state import app_state, get_app_state
from api.routes.pages import router as pages_router
from api.routes.analysis import router as analysis_router 
from api.routes.graph import router as graph_router
from api.routes.auth import router as auth_router
from api.routes.llm import router as llm_router
from core.utils.logger import get_logger


# Configure logger
logger = get_logger(__name__)



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application."""
    try:
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
    app_state = get_app_state()
    
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
    app.include_router(auth_router, prefix=prefix)
    app.include_router(llm_router, prefix=prefix)

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
                "schema": "initialized" if app_state.schema_manager else "not_initialized",
                "auth": "running" if app_state.auth_config else "not_initialized",
                "llm": "running" if app_state.llm_factory else "not_initialized"  # Add this line
            }
        }

    return app

app = create_application()