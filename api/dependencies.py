"""
FastAPI dependency providers for Marvin services.

This module provides dependencies in several categories:
- Base component providers: Basic building blocks like DB connections
- Service lifecycle managers: Context managers for service lifecycles
- Individual service providers: FastAPI dependencies for each service
- Compound service provider: Combined service context for routes
"""

from typing import AsyncGenerator, Optional, Dict
from fastapi import Depends, Header, HTTPException, status, Request
from contextlib import asynccontextmanager
from core.infrastructure.auth.config import AuthProviderConfig
from api.models.auth.request import SessionAuth
from api.state import get_app_state
from api.task_manager import TaskManager
from core.infrastructure.auth.config import AuthProviderConfig, get_auth_provider_config
from core.infrastructure.auth.providers.base_auth_provider import AuthProviderInterface
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.graph_operations import GraphOperationManager
from core.services.graph.graph_service import GraphService
from core.services.content.page_service import PageService
from core.services.content.pipeline_service import PipelineService
from core.services.validation_service import ValidationRunner
from core.services.embeddings.embedding_service import EmbeddingService
from core.infrastructure.embeddings.factory import EmbeddingProviderFactory
from core.domain.content.pipeline import (
    DefaultStateManager, DefaultComponentCoordinator,
    DefaultEventSystem, PipelineConfig
)
from api.state import get_app_state, AppState
from core.utils.config import load_config
from core.utils.logger import get_logger

# Initialize logger
logger = get_logger(__name__)

# Cache of task managers by component name
_task_managers: Dict[str, TaskManager] = {}

# Base component providers

async def get_db_config() -> ConnectionConfig:
    """Provide database configuration."""
    config = load_config()
    return ConnectionConfig(
        uri=config["neo4j_uri"],
        username=config["neo4j_username"],
        password=config["neo4j_password"]
    )

async def get_db_connection(
    config: ConnectionConfig = Depends(get_db_config)
) -> AsyncGenerator[DatabaseConnection, None]:
    """Provide database connection with lifecycle management."""
    connection = DatabaseConnection(config)
    try:
        await connection.initialize()
        yield connection
    finally:
        await connection.shutdown()


async def get_graph_operations(
    connection: DatabaseConnection = Depends(get_db_connection)
) -> GraphOperationManager:
    """Provide GraphOperationManager instance."""
    return GraphOperationManager(connection)

async def get_pipeline_config() -> PipelineConfig:
    """Provide pipeline configuration."""
    return PipelineConfig()

async def get_validation_runner() -> ValidationRunner:
    """Provide ValidationRunner instance."""
    return ValidationRunner()

# Service lifecycle managers
@asynccontextmanager
async def manage_graph_service(
    graph_operations: GraphOperationManager = Depends(get_graph_operations)
) -> AsyncGenerator[GraphService, None]:
    """Manage GraphService lifecycle."""
    service = GraphService(graph_operations)
    try:
        await service.initialize()
        yield service
    finally:
        await service.cleanup()

async def get_app_db_connection(
    app_state: AppState = Depends(get_app_state)
) -> DatabaseConnection:
    """Get database connection from app state."""
    if not app_state.db_connection:
        raise RuntimeError("Database connection not initialized")
    return app_state.db_connection


@asynccontextmanager
async def manage_pipeline_service(
    config: PipelineConfig = Depends(get_pipeline_config),
    db_connection: DatabaseConnection = Depends(get_app_db_connection)
) -> AsyncGenerator[PipelineService, None]:
    """Manage PipelineService lifecycle."""
    components = {
        "state_manager": DefaultStateManager(config),
        "component_coordinator": DefaultComponentCoordinator(config),
        "event_system": DefaultEventSystem(config),
        "config": config,
        "db_connection": db_connection
    }
    service = PipelineService(**components)
    try:
        await service.initialize()
        yield service
    finally:
        await service.cleanup()

# Individual service providers
async def get_graph_service(
    graph_operations: GraphOperationManager = Depends(get_graph_operations)
) -> AsyncGenerator[GraphService, None]:
    """Provide GraphService with lifecycle management."""
    async with manage_graph_service(graph_operations) as service:
        yield service

async def get_page_service(
    graph_service: GraphService = Depends(get_graph_service)
) -> AsyncGenerator[PageService, None]:
    """Provide PageService with lifecycle management."""
    async with manage_page_service(graph_service=graph_service) as service:
        yield service

async def get_embedding_provider_factory(app_state = Depends(get_app_state)):
    """Get embedding provider factory."""
    if not hasattr(app_state, "embedding_factory"):
        app_state.embedding_factory = EmbeddingProviderFactory(
            auth_provider=app_state.auth_provider
        )
    return app_state.embedding_factory

async def get_embedding_service(
    factory = Depends(get_embedding_provider_factory),
    graph_service = Depends(get_graph_service)
):
    """Get embedding service."""
    return EmbeddingService(factory, graph_service)


@asynccontextmanager
async def manage_page_service(
    graph_service: GraphService = Depends(get_graph_service)
) -> AsyncGenerator[PageService, None]:
    """Manage PageService lifecycle."""
    service = PageService(graph_service)
    try:
        await service.initialize()
        yield service
    finally:
        await service.cleanup()

async def get_pipeline_service(
    config: PipelineConfig = Depends(get_pipeline_config),
    db_connection: DatabaseConnection = Depends(get_app_db_connection)
) -> AsyncGenerator[PipelineService, None]:  # Changed return type
    """Provide PipelineService with lifecycle management."""
    async with manage_pipeline_service(config=config, db_connection=db_connection) as service:
        yield service  # Now this matches the return type

# Compound service provider
class ServiceContext:
    """Context for holding all services."""
    def __init__(
        self,
        page_service: PageService,
        graph_service: GraphService,
        pipeline_service: PipelineService,
        validation_runner: ValidationRunner
    ):
        self.page_service = page_service
        self.graph_service = graph_service
        self.pipeline_service = pipeline_service
        self.validation_runner = validation_runner

async def get_service_context(
    page_service: PageService = Depends(get_page_service),
    graph_service: GraphService = Depends(get_graph_service),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
    validation_runner: ValidationRunner = Depends(get_validation_runner)
) -> ServiceContext:
    """Get context with all services."""
    return ServiceContext(
        page_service=page_service,
        graph_service=graph_service,
        pipeline_service=pipeline_service,
        validation_runner=validation_runner
    )

# Auth Dependencies

def get_auth_config() -> AuthProviderConfig:
    """
    Get the auth provider configuration.
    
    Returns:
        AuthProviderConfig: The auth provider configuration
    """
    app_state = get_app_state()
    
    # Check if auth config is initialized
    if not app_state.auth_config:
        logger.error("Auth provider configuration not initialized")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth provider not initialized"
        )
    
    return app_state.auth_config


async def get_auth_provider(
    provider_type: str = "local",
    config: AuthProviderConfig = Depends(get_auth_config)
) -> AuthProviderInterface:
    """
    Get an auth provider instance.
    
    Args:
        provider_type: Type of provider to get
        config: Auth provider configuration
        
    Returns:
        AuthProviderInterface: The auth provider instance
    """
    config = load_config()
    env = config.get("environment", "development")
    config_dir = config.get("config_dir", "./config")
    
    # Get auth config
    auth_config = get_auth_provider_config(config_dir)
    
    if env == "production":
        # Use strict auth provider in production
        return auth_config.get_provider("local")
    else:
        # Use development auth provider locally
        return auth_config.get_provider("dev")


async def validate_session(
    session_auth: SessionAuth,
    provider_type: str = "local",
    auth_provider: AuthProviderInterface = Depends(get_auth_provider)
) -> bool:
    """
    Validate a session token.
    
    Args:
        session_auth: Session authentication data
        provider_type: Type of provider to use
        auth_provider: Auth provider instance
        
    Returns:
        bool: True if session is valid
        
    Raises:
        HTTPException: If session is invalid
    """
    try:
        valid = await auth_provider.validate_session(session_auth.session_token)
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session token"
            )
        return True
    except Exception as e:
        logger.error(f"Session validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session validation failed"
        )


async def get_session_token(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> str:
    """Extract session token from Authorization header or fallback to dev token"""
    config = load_config()
    env = config.get("environment", "development")
    
    # Try to get from header first
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
    
    # If in development, use a default token
    if env == "development":
        return config.get("admin_token", "dev-token")
    
    # In production, require proper authorization
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authorization header is required"
    )

async def get_task_manager(component_name: str, app_state = Depends(get_app_state)):
    """
    Get (or create) a TaskManager instance for a specific component.
    
    This factory function ensures we reuse the same TaskManager
    instance for each component throughout the application.
    
    Args:
        component_name: The component name to get a TaskManager for
        app_state: The application state (injected)
        
    Returns:
        An initialized TaskManager instance
    """
    if component_name not in _task_managers:
        # Create new TaskManager
        task_manager = TaskManager(component_name)
        await task_manager.initialize()
        _task_managers[component_name] = task_manager
        
        # Register for cleanup when app shuts down
        if not hasattr(app_state, "_registered_task_managers"):
            app_state._registered_task_managers = []
        
        app_state._registered_task_managers.append(task_manager)
        
    return _task_managers[component_name]

# Convenience functions for common components
async def get_agent_task_manager(app_state = Depends(get_app_state)):
    """Get the agent task manager."""
    return await get_task_manager("agent", app_state)

async def get_analysis_task_manager(app_state = Depends(get_app_state)):
    """Get the analysis task manager."""
    return await get_task_manager("analysis", app_state)