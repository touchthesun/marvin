from typing import AsyncGenerator
from api.services.page_service import PageService
from api.services.graph_service import GraphService
from api.services.pipeline_service import PipelineService
from api.services.validation_service import ValidationRunner

async def get_validation_runner() -> ValidationRunner:
    """Dependency for ValidationRunner"""
    return ValidationRunner()

async def get_page_service() -> AsyncGenerator[PageService, None]:
    """Dependency for PageService with cleanup"""
    service = PageService()
    try:
        yield service
    finally:
        if hasattr(service, 'cleanup'):
            await service.cleanup()

async def get_graph_service() -> AsyncGenerator[GraphService, None]:
    """Dependency for GraphService with cleanup"""
    service = GraphService()
    try:
        yield service
    finally:
        if hasattr(service, 'cleanup'):
            await service.cleanup()

async def get_pipeline_service() -> AsyncGenerator[PipelineService, None]:
    """Dependency for PipelineService with cleanup"""
    service = PipelineService()
    try:
        yield service
    finally:
        await service.cleanup()

# Compound dependencies
async def get_services():
    """Get all core services as a compound dependency"""
    async for page_service in get_page_service():
        async for graph_service in get_graph_service():
            async for pipeline_service in get_pipeline_service():
                validation_runner = await get_validation_runner()
                return {
                    'page_service': page_service,
                    'graph_service': graph_service,
                    'pipeline_service': pipeline_service,
                    'validation_runner': validation_runner
                }