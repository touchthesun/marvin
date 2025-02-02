import asyncio
from urllib.parse import urlparse
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable, Set, Tuple
from enum import Enum
from datetime import datetime
from core.common.errors import PipelineError, ValidationError, StageError, ComponentError
from core.domain.content.models.page import Page, PageStatus
from core.utils.logger import get_logger

# Configure logging
logger = get_logger(__name__)


class ComponentType(Enum):
    """Types of pipeline components."""
    METADATA = "metadata"
    CONTENT = "content"
    KEYWORD = "keyword"
    BROWSER = "browser"
    STORAGE = "storage"
    CUSTOM = "custom"

class ProcessingStage(Enum):
    """Stages of the processing pipeline."""
    INITIALIZE = "initialize"
    METADATA = "metadata"
    CONTENT = "content"
    ANALYSIS = "analysis"
    STORAGE = "storage"
    COMPLETE = "complete"
    ERROR = "error"

@dataclass
class ProcessingEvent:
    """Event generated during pipeline processing."""
    stage: ProcessingStage
    component_type: ComponentType
    timestamp: datetime
    status: str
    message: str
    metadata: Dict[str, Any] = field(default_factory=dict)

class PipelineComponent(ABC):
    """Base interface for all pipeline components."""
    
    @abstractmethod
    async def process(self, page: Page) -> None:
        """Process a page and update it with results.
        
        Args:
            page: Page object to process
            
        Raises:
            ProcessingError: If processing fails
        """
        pass
    
    @abstractmethod
    def get_component_type(self) -> ComponentType:
        """Get the type of this component."""
        pass
    
    @abstractmethod
    async def validate(self, page: Page) -> bool:
        """Validate that this component can process the page.
        
        Args:
            page: Page to validate
            
        Returns:
            bool: Whether the page can be processed
        """
        pass

class PipelineOrchestrator(ABC):
    """Coordinates the execution of pipeline components."""
    
    @abstractmethod
    async def process_page(self, url: str, html_content: str) -> Page:
        """Process a web page through the complete pipeline.
        
        Args:
            url: Page URL
            html_content: Raw HTML content
            
        Returns:
            Processed Page object
            
        Raises:
            PipelineError: If pipeline processing fails
        """
        pass
    
    @abstractmethod
    def register_component(self, component: PipelineComponent, 
                         stage: ProcessingStage) -> None:
        """Register a component for a specific pipeline stage."""
        pass
    
    @abstractmethod
    def register_event_handler(self, handler: Callable[[ProcessingEvent], None]) -> None:
        """Register a handler for pipeline events."""
        pass
    
    @abstractmethod
    async def abort_processing(self, page: Page) -> None:
        """Abort processing for a page and cleanup."""
        pass

class StateManager(ABC):
    """Manages page state throughout pipeline processing."""
    
    @abstractmethod
    async def initialize_page(self, url: str) -> Page:
        """Create and initialize a new Page object."""
        pass
    
    @abstractmethod
    async def update_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Update page processing stage."""
        pass
    
    @abstractmethod
    async def mark_complete(self, page: Page) -> None:
        """Mark page processing as complete."""
        pass
    
    @abstractmethod
    async def mark_error(self, page: Page, error: Exception) -> None:
        """Mark page as having encountered an error."""
        pass

class ComponentCoordinator(ABC):
    """Coordinates execution of pipeline components."""
    
    @abstractmethod
    async def execute_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Execute all components for a given stage."""
        pass
    
    @abstractmethod
    async def validate_stage(self, page: Page, stage: ProcessingStage) -> bool:
        """Validate all components for a stage can process the page."""
        pass
    
    @abstractmethod
    def get_stage_components(self, stage: ProcessingStage) -> List[PipelineComponent]:
        """Get all components registered for a stage."""
        pass

class EventSystem(ABC):
    """Handles pipeline events and notifications."""
    
    @abstractmethod
    def emit_event(self, event: ProcessingEvent) -> None:
        """Emit a pipeline event."""
        pass
    
    @abstractmethod
    def register_handler(self, handler: Callable[[ProcessingEvent], None]) -> None:
        """Register an event handler."""
        pass
    
    @abstractmethod
    def clear_handlers(self) -> None:
        """Remove all event handlers."""
        pass

class BrowserContextManager(ABC):
    """Manages browser state and context."""
    
    @abstractmethod
    async def update_tab_state(self, page: Page, tab_id: str, 
                             window_id: str) -> None:
        """Update page browser tab state."""
        pass
    
    @abstractmethod
    async def update_bookmark_state(self, page: Page, 
                                  bookmark_id: str) -> None:
        """Update page bookmark state."""
        pass
    
    @abstractmethod
    async def get_active_tab_info(self) -> Dict[str, str]:
        """Get information about the currently active tab."""
        pass



@dataclass
class RetryPolicy:
    """Configuration for retry behavior."""
    max_attempts: int = 3
    delay_seconds: float = 1.0
    max_delay_seconds: float = 30.0
    exponential_backoff: bool = True

@dataclass
class StageConfig:
    """Configuration for a pipeline stage."""
    timeout_seconds: float = 30.0
    required: bool = True
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    concurrent_components: bool = True
    validation_required: bool = True

@dataclass
class PipelineConfig:
    """Configuration for the pipeline."""
    max_concurrent_pages: int = 10
    stage_configs: Dict[str, StageConfig] = field(default_factory=dict)
    default_timeout: float = 60.0
    event_logging_enabled: bool = True
    
    def __post_init__(self):
        """Set default stage configurations."""
        default_stages = {
            'initialize': StageConfig(timeout_seconds=5.0),
            'metadata': StageConfig(timeout_seconds=30.0),
            'content': StageConfig(timeout_seconds=60.0),
            'analysis': StageConfig(timeout_seconds=120.0),
            'storage': StageConfig(timeout_seconds=30.0)
        }
        for stage, config in default_stages.items():
            if stage not in self.stage_configs:
                self.stage_configs[stage] = config

@dataclass
class ComponentResult:
    """Result of a component's processing."""
    component_type: ComponentType
    success: bool
    processing_time: float
    error: Optional[Exception] = None
    metadata: Dict = field(default_factory=dict)

@dataclass
class StageResult:
    """Result of a pipeline stage's processing."""
    stage: ProcessingStage
    start_time: datetime
    end_time: Optional[datetime] = None
    success: bool = False
    component_results: List[ComponentResult] = field(default_factory=list)
    error: Optional[Exception] = None

@dataclass
class PipelineResult:
    """Complete result of pipeline processing."""
    page_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    success: bool = False
    stage_results: List[StageResult] = field(default_factory=list)
    final_status: PageStatus = PageStatus.ERROR
    processing_time: Optional[float] = None
    error: Optional[Exception] = None

    def add_stage_result(self, result: StageResult) -> None:
        """Add a stage result and update overall status."""
        self.stage_results.append(result)
        if not result.success:
            self.success = False
        
        if result.end_time:
            self.end_time = result.end_time
            if self.start_time:
                self.processing_time = (
                    self.end_time - self.start_time
                ).total_seconds()

@dataclass
class ProcessingMetrics:
    """Metrics collected during pipeline processing."""
    total_processing_time: float = 0.0
    component_times: Dict[str, float] = field(default_factory=dict)
    error_counts: Dict[str, int] = field(default_factory=dict)
    successful_stages: int = 0
    failed_stages: int = 0
    retry_counts: Dict[str, int] = field(default_factory=dict)
    
    def update_from_result(self, result: PipelineResult) -> None:
        """Update metrics from a pipeline result."""
        if result.processing_time:
            self.total_processing_time += result.processing_time
            
        for stage_result in result.stage_results:
            if stage_result.success:
                self.successful_stages += 1
            else:
                self.failed_stages += 1
                
            for comp_result in stage_result.component_results:
                comp_type = comp_result.component_type.value
                self.component_times[comp_type] = (
                    self.component_times.get(comp_type, 0) + 
                    comp_result.processing_time
                )
                
                if not comp_result.success:
                    self.error_counts[comp_type] = (
                        self.error_counts.get(comp_type, 0) + 1
                    )


# Helper Methods

def parse_url(url: str) -> Tuple[str, str]:
    """Extract domain and normalized URL.
    
    Args:
        url: Input URL string
        
    Returns:
        Tuple of (normalized_url, domain)
        
    Example:
        "https://docs.example.com/path" -> ("https://docs.example.com/path", "example.com")
        "file:///path/to/file.html" -> ("file:///path/to/file.html", "localhost")
    """
    parsed = urlparse(url)
    
    # Handle file URLs
    if parsed.scheme == 'file':
        return url, 'localhost'
        
    # Extract domain, handling subdomains
    domain_parts = parsed.netloc.split('.')
    if len(domain_parts) > 2:
        domain = '.'.join(domain_parts[-2:])
    else:
        domain = parsed.netloc
        
    return url, domain


# Pipeline Implementation

class DefaultStateManager(StateManager):
    """Default implementation of pipeline state management."""
    
    def __init__(self):
        self._pages: Dict[str, Page] = {}
        self._stage_history: Dict[str, List[ProcessingStage]] = {}
        
    async def initialize_page(self, url: str) -> Page:
        """Create and initialize a new Page object."""
        normalized_url, domain = parse_url(url)
        page = Page(url=normalized_url, domain=domain)
        self._pages[page.id] = page
        self._stage_history[page.id] = []
        return page
    
    async def update_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Update page processing stage."""
        if page.id not in self._pages:
            raise PipelineError(f"Unknown page ID: {page.id}")
        
        self._stage_history[page.id].append(stage)
        page.status = PageStatus.IN_PROGRESS
        
    async def mark_complete(self, page: Page) -> None:
        """Mark page processing as complete."""
        if page.id not in self._pages:
            raise PipelineError(f"Unknown page ID: {page.id}")
        
        page.status = PageStatus.ACTIVE
        
    async def mark_error(self, page: Page, error: Exception) -> None:
        """Mark page as having encountered an error."""
        if page.id not in self._pages:
            raise PipelineError(f"Unknown page ID: {page.id}")
            
        page.status = PageStatus.ERROR
        page.errors.append(str(error))

class DefaultComponentCoordinator(ComponentCoordinator):
    """Default implementation of component coordination."""
    
    def __init__(self, config: PipelineConfig):
        self.config = config
        self._components: Dict[ProcessingStage, List[PipelineComponent]] = {
            stage: [] for stage in ProcessingStage 
            if stage not in {ProcessingStage.COMPLETE, ProcessingStage.ERROR}
        }
        
    async def execute_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Execute all components for a given stage."""
        components = self._components.get(stage, [])
        if not components:
            return
            
        stage_config = self.config.stage_configs.get(
            stage.value,
            StageConfig()
        )
        
        if stage_config.concurrent_components:
            await self._execute_concurrent(components, page, stage_config)
        else:
            await self._execute_sequential(components, page, stage_config)
    
    async def _execute_concurrent(
        self,
        components: List[PipelineComponent],
        page: Page,
        config: StageConfig
    ) -> None:
        """Execute components concurrently."""
        tasks = []
        for component in components:
            task = self._execute_component_with_retry(
                component, page, config.retry_policy
            )
            tasks.append(task)
            
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            raise StageError(f"Stage execution failed: {str(e)}")
    
    async def _execute_sequential(
        self,
        components: List[PipelineComponent],
        page: Page,
        config: StageConfig
    ) -> None:
        """Execute components sequentially."""
        for component in components:
            try:
                await self._execute_component_with_retry(
                    component, page, config.retry_policy
                )
            except Exception as e:
                raise StageError(
                    f"Component {component.__class__.__name__} failed: {str(e)}"
                )
    
    async def _execute_component_with_retry(
        self,
        component: PipelineComponent,
        page: Page,
        retry_policy: RetryPolicy
    ) -> None:
        """Execute a component with retry logic."""
        attempts = 0
        delay = retry_policy.delay_seconds
        
        while attempts < retry_policy.max_attempts:
            try:
                start_time = datetime.now()
                await component.process(page)
                duration = (datetime.now() - start_time).total_seconds()
                
                # Track timing in page metadata
                if 'component_timings' not in page.metadata:
                    page.metadata['component_timings'] = {}
                page.metadata['component_timings'][component.__class__.__name__] = duration
                return
            except Exception as e:
                attempts += 1
                if attempts == retry_policy.max_attempts:
                    raise ComponentError(
                        f"Component failed after {attempts} attempts: {str(e)}"
                    )
                    
                if retry_policy.exponential_backoff:
                    delay = min(
                        delay * 2,
                        retry_policy.max_delay_seconds
                    )
                    
                await asyncio.sleep(delay)
    
    async def validate_stage(self, page: Page, stage: ProcessingStage) -> bool:
        """Validate all components for a stage can process the page.
        
        Enhanced validation includes:
        - Individual component validation tracking
        - Detailed validation failure information
        - Resource cleanup on validation failure
        """
        components = self._components.get(stage, [])
        if not components:
            return True
            
        validation_results = {}
        try:
            # Validate each component individually for better error tracking
            for component in components:
                try:
                    is_valid = await component.validate(page)
                    validation_results[component.__class__.__name__] = is_valid
                except Exception as e:
                    validation_results[component.__class__.__name__] = False
                    logger.error(f"Validation failed for {component.__class__.__name__}: {e}")
            
            # Store validation results in page metadata
            if 'validation_results' not in page.metadata:
                page.metadata['validation_results'] = {}
            page.metadata['validation_results'][stage.value] = validation_results
            
            return all(validation_results.values())
        except Exception as e:
            raise ValidationError(f"Stage validation failed: {str(e)}")
    
    def get_stage_components(
        self, stage: ProcessingStage
    ) -> List[PipelineComponent]:
        """Get all components registered for a stage."""
        return self._components.get(stage, []).copy()
        
    def register_component(
        self,
        component: PipelineComponent,
        stage: ProcessingStage
    ) -> None:
        """Register a component for a specific stage."""
        if stage not in self._components:
            self._components[stage] = []
        self._components[stage].append(component)

class DefaultEventSystem(EventSystem):
    """Default implementation of pipeline event system."""
    
    def __init__(self):
        self._handlers: Set[Callable[[ProcessingEvent], None]] = set()
        
    def emit_event(self, event: ProcessingEvent) -> None:
        """Emit a pipeline event."""
        for handler in self._handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(f"Event handler failed: {str(e)}")
    
    def register_handler(
        self,
        handler: Callable[[ProcessingEvent], None]
    ) -> None:
        """Register an event handler."""
        self._handlers.add(handler)
    
    def clear_handlers(self) -> None:
        """Remove all event handlers."""
        self._handlers.clear()

@dataclass
class PipelineContext:
    """Context for pipeline execution."""
    state_manager: StateManager
    component_coordinator: ComponentCoordinator
    event_system: EventSystem
    config: PipelineConfig = field(default_factory=PipelineConfig)

class DefaultPipelineOrchestrator(PipelineOrchestrator):
    """Default implementation of pipeline orchestration."""
    
    def __init__(self, context: PipelineContext):
        self.context = context
        
    async def process_page(self, url: str, html_content: str) -> Page:
        """Process a web page through the complete pipeline."""
        # Initialize page
        page = await self.context.state_manager.initialize_page(url)
        page.content = html_content
        
        try:
            # Process each stage
            for stage in ProcessingStage:
                if stage in {ProcessingStage.COMPLETE, ProcessingStage.ERROR}:
                    continue
                    
                await self._process_stage(page, stage)
                
            # Mark completion
            await self.context.state_manager.mark_complete(page)
            self._emit_event(page, ProcessingStage.COMPLETE, "Pipeline complete")
            
        except Exception as e:
            await self.context.state_manager.mark_error(page, e)
            self._emit_event(
                page,
                ProcessingStage.ERROR,
                f"Pipeline failed: {str(e)}"
            )
            raise
            
        return page
    
    async def _process_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Process a single pipeline stage."""
        stage_config = self.context.config.stage_configs.get(
            stage.value, 
            StageConfig()
        )
    
        # Update state and emit start event
        await self.context.state_manager.update_stage(page, stage)
        self._emit_event(page, stage, f"Starting stage {stage.value}")
    
        # Validate stage if required
        if stage_config.validation_required:
            await self._validate_stage(page, stage)
        
        # Execute stage with timeout
        start_time = datetime.now()
        try:
            await self._execute_stage_with_timeout(
                page, 
                stage, 
                stage_config.timeout_seconds
            )
        
            # Record success
            duration = (datetime.now() - start_time).total_seconds()
            self._emit_event(
                page,
                stage, 
                f"Completed stage {stage.value}",
                {'duration': duration}
            )
        
        except (TimeoutError, ValidationError, Exception) as e:
            self._handle_stage_error(page, stage, stage_config, e)

    async def _validate_stage(self, page: Page, stage: ProcessingStage) -> None:
        """Validate a pipeline stage."""
        is_valid = await self.context.component_coordinator.validate_stage(page, stage)
        if not is_valid:
            raise ValidationError(f"Stage validation failed: {stage.value}")

    async def _execute_stage_with_timeout(
        self, 
        page: Page,
        stage: ProcessingStage,
        timeout: int
    ) -> None:
        """Execute stage with timeout handling."""
        try:
        # Replace timeout context manager with wait_for
            await asyncio.wait_for(
                self.context.component_coordinator.execute_stage(page, stage),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"Stage {stage.value} timed out after {timeout} seconds"
            )

    def _handle_stage_error(
        self,
        page: Page, 
        stage: ProcessingStage,
        config: StageConfig,
        error: Exception
    ) -> None:
        """Handle stage execution errors."""
        self._emit_event(
            page,
            ProcessingStage.ERROR,
            f"Stage {stage.value} failed: {str(error)}"
        )
        if config.required:
            raise error
    
    def register_component(
        self,
        component: PipelineComponent,
        stage: ProcessingStage
    ) -> None:
        """Register a component for a specific pipeline stage."""
        self.context.component_coordinator.register_component(component, stage)
    
    def register_event_handler(
        self,
        handler: Callable[[ProcessingEvent], None]
    ) -> None:
        """Register a handler for pipeline events."""
        self.context.event_system.register_handler(handler)
    
    async def abort_processing(self, page: Page) -> None:
        """Abort processing for a page and cleanup."""
        await self.context.state_manager.mark_error(
            page,
            Exception("Processing aborted")
        )
        self._emit_event(page, ProcessingStage.ERROR, "Processing aborted")
    
    def _emit_event(
        self,
        page: Page,
        stage: ProcessingStage,
        message: str,
        metadata: Optional[Dict] = None
    ) -> None:
        """Emit a pipeline event with enhanced metadata.
        
        Includes additional context:
        - Component timing information
        - Validation results if available
        - Current stage metrics
        - Cumulative processing metrics
        """
        if metadata is None:
            metadata = {}
            
        metadata.update({
            'page_id': page.id,
            'page_object': page,
            'stage': stage.value,
            'timestamp': datetime.now().isoformat(),
            'component_timings': page.metadata.get('component_timings', {}),
            'validation_results': page.metadata.get('validation_results', {}),
            'total_processing_time': sum(
                timing 
                for timing in page.metadata.get('component_timings', {}).values()
            )
        })
        
        event = ProcessingEvent(
            stage=stage,
            component_type=ComponentType.CUSTOM,
            timestamp=datetime.now(),
            status="info",
            message=message,
            metadata=metadata
        )
        
        self.context.event_system.emit_event(event)