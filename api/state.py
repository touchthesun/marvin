from typing import Optional
from core.services.pipeline_service import PipelineService

class ApplicationState:
    """Container for application-wide state and services."""
    
    def __init__(self):
        self.pipeline_service: Optional[PipelineService] = None
        
    async def initialize(self):
        """Initialize application services."""
        if not self.pipeline_service:
            self.pipeline_service = PipelineService(max_concurrent=5)
            
    async def cleanup(self):
        """Cleanup application services."""
        if self.pipeline_service:
            await self.pipeline_service.cleanup()
            self.pipeline_service = None

# Global application state
app_state = ApplicationState()