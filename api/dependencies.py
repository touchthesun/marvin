from typing import AsyncGenerator
from fastapi import Depends
from contextlib import asynccontextmanager

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

@asynccontextmanager
async def manage_page_service(
    graph_service: GraphService
) -> AsyncGenerator[PageService, None]:
    """Manage PageService lifecycle."""
    service = PageService(graph_service)
    try:
        await service.initialize()
        yield service
    finally:
        await service.cleanup()

@asynccontextmanager
async def manage_pipeline_service(
    config: PipelineConfig = Depends(get_pipeline_config)
) -> AsyncGenerator[PipelineService, None]:
    """Manage PipelineService lifecycle."""
    components = {
        "state_manager": DefaultStateManager(),
        "component_coordinator": DefaultComponentCoordinator(config),
        "event_system": DefaultEventSystem(),
        "config": config
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
    async with manage_page_service(graph_service) as service:
        yield service

async def get_pipeline_service(
    config: PipelineConfig = Depends(get_pipeline_config)
) -> AsyncGenerator[PipelineService, None]:
    """Provide PipelineService with lifecycle management."""
    async with manage_pipeline_service(config) as service:
        yield service

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