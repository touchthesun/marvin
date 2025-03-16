from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from contextlib import asynccontextmanager
from api.config.config import settings
from api.state import app_state, get_app_state, AppState
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
    """Lifespan context manager for FastAPI application with enhanced error handling."""
    startup_success = False
    try:
        logger.info("Initializing services...")
        start_time = __import__('time').time()
        
        await app_state.initialize()
        
        elapsed = __import__('time').time() - start_time
        logger.info(f"Services initialized successfully in {elapsed:.2f}s")
        startup_success = True
        
        yield
        
    except Exception as e:
        logger.error(f"Error during startup: {e}", exc_info=True)
        # Extra logging for database connection issues
        if hasattr(e, '__cause__') and e.__cause__ is not None:
            logger.error(f"Caused by: {e.__cause__}")
        raise
    finally:
        # Shutdown
        try:
            if startup_success:
                logger.info("Cleaning up services...")
                start_time = __import__('time').time()
                
                await app_state.cleanup()
                
                elapsed = __import__('time').time() - start_time
                logger.info(f"Services cleaned up successfully in {elapsed:.2f}s")
            else:
                logger.info("Cleaning up after failed startup...")
                await app_state.cleanup()
                logger.info("Cleanup after failed startup complete")
        except Exception as e:
            logger.error(f"Error cleaning up services: {e}", exc_info=True)


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
    logger.debug(f"Configuring CORS middleware with origins: {settings.BACKEND_CORS_ORIGINS}")
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
        # Get database connection pool status
        pool_status = {"status": "unknown"}
        if app_state.db_connection:
            try:
                pool_status = await app_state.db_connection.check_connection_pool()
            except Exception as e:
                pool_status = {"status": "error", "message": str(e)}
        
        return {
            "status": "healthy",
            "version": settings.VERSION,
            "environment": "development" if settings.DEBUG else "production",
            "services": {
                "pipeline": "running" if app_state.pipeline_service else "not_initialized",
                "database": "running" if app_state.db_connection else "not_initialized",
                "schema": "initialized" if app_state.schema_manager else "not_initialized",
                "auth": "running" if app_state.auth_config else "not_initialized",
                "llm": "running" if app_state.llm_factory else "not_initialized"
            },
            "connection_pool": pool_status
        }
    
    @app.get("/debug/connection-pool")
    async def connection_pool_debug(app_state: AppState = Depends(get_app_state)) -> Dict[str, Any]:
        """Debug endpoint for connection pool monitoring."""
        if not app_state.db_connection:
            return {"status": "database_not_initialized"}
        
        try:
            pool_status = await app_state.db_connection.check_connection_pool()
            
            # Run a simple query to verify database is responsive
            test_result = await app_state.db_connection.execute_query(
                "RETURN 1 as test", 
                timeout=5
            )
            
            return {
                "pool_status": pool_status,
                "test_query": "success" if test_result else "no_results",
                "timestamp": __import__('datetime').datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Connection pool debug error: {str(e)}")
            return {
                "status": "error",
                "message": str(e),
                "timestamp": __import__('datetime').datetime.now().isoformat()
            }

    return app


app = create_application()