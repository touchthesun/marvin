"""
FastAPI dependency providers for Marvin services.

This module provides dependencies in several categories:
- Base component providers: Basic building blocks like DB connections
- Service lifecycle managers: Context managers for service lifecycles
- Individual service providers: FastAPI dependencies for each service
- Compound service provider: Combined service context for routes
"""
import os
from typing import AsyncGenerator, Optional
from fastapi import Depends, Header, HTTPException, status
from contextlib import asynccontextmanager
from core.infrastructure.auth.config import get_auth_provider_config, AuthProviderConfig
from core.infrastructure.auth.errors import ConfigurationError
from api.models.auth.request import SessionAuth
from core.infrastructure.auth.providers.base import AuthProviderInterface
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.graph_operations import GraphOperationManager
from core.services.graph.graph_service import GraphService
from core.services.content.page_service import PageService
from core.services.content.pipeline_service import PipelineService
from core.services.validation_service import ValidationRunner
from core.domain.content.pipeline import (
    DefaultStateManager, DefaultComponentCoordinator,
    DefaultEventSystem, PipelineConfig
)
from api.state import get_app_state, AppState
from core.utils.config import load_config


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

async def get_auth_config() -> AuthProviderConfig:
    """
    Get the auth provider configuration.
    
    Returns:
        AuthProviderConfig: The auth provider configuration
    """
    app_state = get_app_state()
    config_dir = os.path.join(app_state.config_dir, "auth")
    
    try:
        return get_auth_provider_config(config_dir)
    except ConfigurationError as e:
        logger.error(f"Failed to get auth config: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize auth provider configuration"
        )


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
    try:
        return config.get_provider(provider_type)
    except ConfigurationError as e:
        logger.error(f"Failed to get auth provider: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider type: {provider_type}"
        )


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
    authorization: Optional[str] = Header(None)
) -> str:
    """
    Extract session token from Authorization header.
    
    Args:
        authorization: Authorization header
        
    Returns:
        str: Session token
        
    Raises:
        HTTPException: If token is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization format. Use 'Bearer {token}'"
        )
    
    return parts[1]