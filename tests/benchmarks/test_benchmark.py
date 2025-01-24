import pytest
import json
import shutil
import asyncio
import aiohttp
import spacy
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Union, Any

from core.content.processor import (
    ContentProcessor, ContentProcessorConfig, KeywordProcessor, ProcessorConfig
)
from core.content.keyword_identification import (
    KeywordNormalizer, VariantManager
)
from core.pipeline.pipeline import (
    ProcessingEvent,
    ProcessingStage,
    PipelineConfig,
    StageConfig,
    PipelineContext,
    DefaultStateManager,
    DefaultComponentCoordinator,
    DefaultPipelineOrchestrator,
    DefaultEventSystem,
)
from core.content.page import Page, PageStatus
from core.content.relationships import RelationshipManager
from .benchmark_formatter import BenchmarkAnalyzer
from .benchmark_types import BenchmarkResult
from core.content.validation import KeywordValidator, ValidationConfig
from core.content.abbreviations import AbbreviationService
from core.utils.logger import get_logger

# Configure logging
logger = get_logger(__name__)

def get_project_root() -> Path:
    """Get the absolute path to the project root directory."""
    return Path(__file__).resolve().parent.parent.parent


def clean_output_directory(output_dir: Path) -> None:
    """Clean up the output directory before test run."""
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def get_benchmark_pages() -> List[Path]:
    """Get all HTML files from benchmark directory."""
    # Get the directory containing the current test file
    current_dir = Path(__file__).resolve().parent
    benchmark_dir = current_dir / "pages"
    
    logger.info(f"Current directory: {current_dir}")
    logger.info(f"Looking for benchmark pages in: {benchmark_dir}")
    
    if not benchmark_dir.exists():
        logger.error(f"Benchmark directory not found: {benchmark_dir}")
        return []
    
    pages = list(benchmark_dir.glob("*.html"))
    if not pages:
        # Try listing all files in the directory to debug
        try:
            all_files = list(benchmark_dir.iterdir())
            logger.info(f"All files in directory: {[f.name for f in all_files]}")
        except Exception as e:
            logger.error(f"Error listing directory contents: {e}")
    else:
        logger.info(f"Found {len(pages)} benchmark pages: {[p.name for p in pages]}")
    
    return pages

def debug_directory_structure():
    """Debug function to print directory structure."""
    current_file = Path(__file__).resolve()
    current_dir = current_file.parent
    
    logger.info(f"Current file: {current_file}")
    logger.info(f"Current directory: {current_dir}")
    
    # List contents of current directory
    logger.info("Contents of current directory:")
    try:
        for item in current_dir.iterdir():
            logger.info(f"  {item.name} {'[DIR]' if item.is_dir() else '[FILE]'}")
    except Exception as e:
        logger.error(f"Error listing current directory: {e}")
    
    # List contents of pages directory
    pages_dir = current_dir / "pages"
    logger.info(f"\nContents of pages directory ({pages_dir}):")
    try:
        if pages_dir.exists():
            for item in pages_dir.iterdir():
                logger.info(f"  {item.name}")
        else:
            logger.error("Pages directory does not exist")
    except Exception as e:
        logger.error(f"Error listing pages directory: {e}")

class BenchmarkConfig:
    """Configuration for benchmark testing."""
    
    @staticmethod
    def create_default_config() -> PipelineConfig:
        """Create default pipeline configuration for benchmarking."""
        config = PipelineConfig(
            max_concurrent_pages=5,
            event_logging_enabled=True,
            default_timeout=120.0
        )
        
        # Configure stages with benchmark-appropriate settings
        config.stage_configs.update({
            ProcessingStage.INITIALIZE.value: StageConfig(
                timeout_seconds=10.0,
                required=True,
                validation_required=True
            ),
            ProcessingStage.METADATA.value: StageConfig(
                timeout_seconds=30.0,
                required=False,
                validation_required=True
            ),
            ProcessingStage.CONTENT.value: StageConfig(
                timeout_seconds=60.0,
                required=True,
                validation_required=True
            ),
            ProcessingStage.ANALYSIS.value: StageConfig(
                timeout_seconds=120.0,
                required=False,
                validation_required=True
            ),
            ProcessingStage.STORAGE.value: StageConfig(
                timeout_seconds=30.0,
                required=False,
                validation_required=True
            )
        })
        
        return config


class BenchmarkRunner:
    """Runs benchmarks and collects results."""
    
    def __init__(self, 
                 content_processor: ContentProcessor,
                 output_dir: Path,
                 config: Optional[PipelineConfig] = None):
        """Initialize benchmark runner with components and configuration."""
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.logger = get_logger(__name__)
        
        # Create pipeline context
        self.context = PipelineContext(
            state_manager=DefaultStateManager(),
            component_coordinator=DefaultComponentCoordinator(
                config or BenchmarkConfig.create_default_config()
            ),
            event_system=DefaultEventSystem(),
            config=config or BenchmarkConfig.create_default_config()
        )
        
        # Create orchestrator and register content processor
        self.orchestrator = DefaultPipelineOrchestrator(self.context)
        self.orchestrator.register_component(
            content_processor,
            ProcessingStage.CONTENT
        )
        
        # Initialize analyzer
        self.analyzer = BenchmarkAnalyzer(output_dir)

        # Initialize results tracking
        self.results: List[BenchmarkResult] = []
        self.events: Dict[str, List[ProcessingEvent]] = {}
        
        # Register event handler
        self.orchestrator.register_event_handler(self._handle_event)
        self.orchestrator.register_event_handler(self._handle_page_object)



    async def _process_file(self, file_path: Path) -> Optional[BenchmarkResult]:
        """Process a local HTML file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return await self._run_benchmark(
                f"file://{file_path}",
                content,
                str(file_path)
            )
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}", exc_info=True)
            return None

    async def _process_url(self, url: str) -> Optional[BenchmarkResult]:
        """Process a remote URL."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        raise Exception(f"HTTP {response.status}")
                    content = await response.text()
                    
            return await self._run_benchmark(url, content, url)
        except Exception as e:
            logger.error(f"Error processing URL {url}: {e}", exc_info=True)
            return None
        
    def _handle_page_object(self, event: ProcessingEvent) -> None:
        """Handle events containing page objects."""
        if 'page_object' in event.metadata:
            page_object = event.metadata['page_object']
            page_id = str(page_object.id)
            page_url = page_object.url  # Page URL is guaranteed to exist
            
            self.logger.debug(f"Received page object event for {page_url} (ID: {page_id})")
            
            # Extract page details
            page_details = self._extract_page_object_details(page_object)
            
            # Look for matching result using the URL directly
            matched_result = next(
                (r for r in self.results if r.page_path == page_url), 
                None
            )
            
            if matched_result:
                self.logger.debug(f"Found matching result for {page_url}")
                matched_result.page_object = page_details
            else:
                self.logger.debug(f"No matching result yet for {page_url}, storing in pending objects")
                self.pending_page_objects[page_url] = page_details

    def _normalize_url(self, url: str) -> str:
        """Normalize URLs for comparison with better handling of file paths."""
        # First handle file URLs
        if url.startswith('file://'):
            url = url[7:]
        
        # Handle potential Windows-style paths
        url = str(Path(url))
        
        # Remove any trailing slashes
        url = url.rstrip('/')
        
        return url


    def _extract_page_object_details(self, page: Page) -> Dict[str, Any]:
        """
        Extract key details from the Page object for reporting.
        
        Args:
            page: Page object to extract details from
        
        Returns:
            Dictionary of key Page object details
        """
        return {
            # Core identification
            'url': page.url,
            'domain': page.domain,
            'id': str(page.id),
            
            # Status and timestamps
            'status': page.status.value,
            'discovered_at': page.discovered_at.isoformat() if page.discovered_at else None,
            'processed_at': page.processed_at.isoformat() if page.processed_at else None,
            'updated_at': page.updated_at.isoformat() if page.updated_at else None,
            
            # Content details
            'title': page.title,
            'keywords': page.keywords,
            
            # Metrics
            'metrics': {
                'quality_score': page.metrics.quality_score,
                'relevance_score': page.metrics.relevance_score,
                'processing_time': page.metrics.processing_time,
                'keyword_count': page.metrics.keyword_count,
                'last_visited': page.metrics.last_visited.isoformat() if page.metrics.last_visited else None,
                'visit_count': page.metrics.visit_count
            },
            
            # Metadata
            'metadata': page.metadata,
            
            # Relationships
            'relationships': [
                {
                    'target_id': str(rel.target_id),
                    'relation_type': rel.relation_type.value,
                    'strength': rel.strength,
                    'metadata': rel.metadata
                } for rel in page.relationships
            ],
            
            # Browser context
            'browser_context': {
                'context': page.browser_context.value,
                'tab_id': page.tab_id,
                'window_id': page.window_id,
                'bookmark_id': page.bookmark_id,
                'last_active': page.last_active.isoformat() if page.last_active else None
            },
            
            # Errors
            'errors': page.errors
        }

    async def run_all(self, sources: Union[List[Path], List[str]]) -> None:
        """Run benchmarks on all sources and analyze results.
        
        Args:
            sources: List of file paths and/or URLs to process
        """
        if not sources:
            self.logger.warning("No benchmark sources found to process")
            return

        self.logger.info(f"Running benchmarks on {len(sources)} sources")
        
        # Clear previous results
        self.results = []
        self.events.clear()
        
        # Track page objects that arrive before their results
        self.pending_page_objects = {}
        
        # Process each source and collect results
        for source in sources:
            source_name = source.name if isinstance(source, Path) else source
            self.logger.info(f"Processing {source_name}")
            
            try:
                # Get content based on source type
                if isinstance(source, Path):
                    with open(source, 'r', encoding='utf-8') as f:
                        content = f.read()
                        url = f"file://{source}"
                else:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(source) as response:
                            if response.status != 200:
                                raise Exception(f"HTTP {response.status}")
                            content = await response.text()
                            url = source

                self.logger.debug(f"Creating result for source: {source_name}")
                self.logger.debug(f"Using URL: {url}")
                
                # Create result object and capture initial metrics
                result = BenchmarkResult(str(url))
                result.content_length = len(content)

                # Check for pending page object using URL directly
                if url in self.pending_page_objects:
                    self.logger.debug(f"Found pending page object for {url}")
                    result.page_object = self.pending_page_objects[url]
                    del self.pending_page_objects[url]
                
                # Add to results list before processing
                self.results.append(result)
                
                # Check if we have a pending page object for this URL
                normalized_url = self._normalize_url(url)
                if normalized_url in self.pending_page_objects:
                    self.logger.debug(f"Found pending page object for {normalized_url}")
                    result.page_object = self.pending_page_objects[normalized_url]
                    del self.pending_page_objects[normalized_url]
                
                # Process through pipeline and capture timing
                start_time = datetime.now()
                page = await self.orchestrator.process_page(url, content)
                result.processing_time = (datetime.now() - start_time).total_seconds()
                
                # Collect metrics
                result.metadata_quality = page.metadata.get('quality', {}).get('score', 0)
                result.keyword_count = len(page.keywords)
                result.keywords = [
                    {'text': k, 'score': s} 
                    for k, s in page.keywords.items()
                ]

                # Get relationships
                if 'relationships' in page.metadata:
                    result.relationships = page.metadata['relationships']
                elif hasattr(page, 'relationships'):
                    result.relationships = [rel.to_dict() for rel in page.relationships]

                # Add pipeline metrics
                page_events = self.events.get(str(page.id), [])
                result.pipeline_metrics = self._process_pipeline_events(page_events)
                result.final_status = page.status.value
                
                # Check for error events
                error_events = [e for e in page_events if e.stage == ProcessingStage.ERROR]
                if error_events:
                    result.errors.extend(e.message for e in error_events)
                        
            except Exception as e:
                self.logger.error(f"Error processing {source_name}: {e}", exc_info=True)
                result = BenchmarkResult(str(url))
                result.errors.append(str(e))
                result.final_status = PageStatus.ERROR.value
                self.results.append(result)
        
        # Now that all processing is complete, save results
        self.logger.info("Saving individual results")
        for result in self.results:
            if not result.page_object:
                self.logger.warning(f"No page object found for {result.page_path}")
            self._save_result(result)
        
        # Generate analysis
        self.logger.info("Generating analysis")
        self.analyzer.analyze_results(self.results)
        self.logger.info("Analysis complete")


    def _handle_event(self, event: ProcessingEvent) -> None:
        """Handle pipeline events."""
        # Use metadata to get page identifier
        page_id = event.metadata.get('page_id', 'unknown')
        if page_id not in self.events:
            self.events[page_id] = []
        self.events[page_id].append(event)

    
    def _process_pipeline_events(self, events: List[ProcessingEvent]) -> Dict:
        """Process pipeline events into metrics."""
        metrics = {
            'stage_times': {},
            'component_times': {},
            'total_components': 0,
            'errors': [],
            'stage_sequence': []
        }
        
        current_stage = None
        stage_start = None
        
        for event in events:
            # Track stage sequence
            if event.stage != current_stage:
                if current_stage and stage_start:
                    duration = (event.timestamp - stage_start).total_seconds()
                    metrics['stage_times'][current_stage.value] = duration
                
                current_stage = event.stage
                stage_start = event.timestamp
                metrics['stage_sequence'].append(current_stage.value)
            
            # Track component times
            if event.component_type:
                comp_type = event.component_type.value
                if comp_type not in metrics['component_times']:
                    metrics['component_times'][comp_type] = 0
                    metrics['total_components'] += 1
                
                if 'duration' in event.metadata:
                    metrics['component_times'][comp_type] += event.metadata['duration']
            
            # Track errors
            if event.stage == ProcessingStage.ERROR:
                metrics['errors'].append(event.message)
        
        return metrics


    def _save_result(self, result: BenchmarkResult) -> None:
        """
        Save individual benchmark result with condensed Page object details.
        
        Args:
            result: BenchmarkResult to save
        """
        result_dir = self.output_dir / 'individual'
        result_dir.mkdir(parents=True, exist_ok=True)
        
        # Use simple name without timestamp for consistent file naming
        base_name = Path(result.page_path).stem
        filename = f"{base_name}.json"
        output_path = result_dir / filename
        
        self.logger.info(f"Saving result to {output_path}")
        
        try:
            # Start with the page object if available
            result_dict = {}
            if result.page_object:
                self.logger.debug(f"Page object found for {result.page_path}")
                result_dict['page_object'] = {
                    'core_details': {
                        'id': result.page_object.get('id'),
                        'url': result.page_object.get('url'),
                        'domain': result.page_object.get('domain'),
                        'title': result.page_object.get('title'),
                        'status': result.page_object.get('status')
                    },
                    'timestamps': {
                        'discovered_at': result.page_object.get('discovered_at'),
                        'processed_at': result.page_object.get('processed_at'),
                        'updated_at': result.page_object.get('updated_at')
                    },
                    'metrics': result.page_object.get('metrics', {}),
                    'browser_context': result.page_object.get('browser_context', {}),
                    'metadata': result.page_object.get('metadata', {}).get('validation_results', {})  # Only include validation results
                }
            else:
                self.logger.warning(f"No page object found for {result.page_path}")
                
            # Add the rest of the result data
            result_dict.update({
                'page_path': result.page_path,
                'content_length': result.content_length,
                'processing_time': result.processing_time,
                'metadata_quality': result.metadata_quality,
                'keyword_count': result.keyword_count,
                'keywords': result.keywords,
                'relationships': result.relationships,
                'pipeline_metrics': result.pipeline_metrics,
                'final_status': result.final_status,
                'errors': result.errors
            })

            # Write the result to file with pretty formatting
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result_dict, f, indent=2, default=str)
                
            self.logger.info(f"Successfully saved result to {output_path}")
            
        except Exception as e:
            self.logger.error(f"Failed to save result for {result.page_path}: {e}", exc_info=True)
            # Re-raise to ensure the error is noticed
            raise


@pytest.fixture(scope="session")
def nlp():
    """
    Load spaCy model once for the entire test session.
    
    Using a medium-sized model with word vectors for better semantic analysis.
    """
    try:
        # Load medium-sized model with word vectors
        nlp = spacy.load("en_core_web_md")
        return nlp
    except OSError:
        # Handle case where model isn't installed
        pytest.fail("SpaCy 'en_core_web_md' model not found. Install with: python -m spacy download en_core_web_md")


@pytest.fixture(scope="module")
def content_processor(nlp):
    """Initialize ContentProcessor with all dependencies."""
    config = ContentProcessorConfig(
        min_content_length=0  # Temporarily disable length check
    )
    normalizer = KeywordNormalizer()
    variant_manager = VariantManager()
    relationship_manager = RelationshipManager(nlp)
    
    # Create validator first since KeywordProcessor needs it
    validator = KeywordValidator(
        nlp=nlp,
        config=ValidationConfig(),
        abbreviation_service=AbbreviationService()
    )
    
    keyword_processor = KeywordProcessor(
        config=ProcessorConfig(),
        normalizer=normalizer,
        variant_manager=variant_manager,
        validator=validator  # Pass the validator
    )
    
    return ContentProcessor(
        config=config,
        keyword_processor=keyword_processor,
        relationship_manager=relationship_manager,
        normalizer=normalizer,
        nlp=nlp,
        validator=validator  # Also pass it to ContentProcessor
    )

@pytest.fixture(scope="function")
def event_loop():
    """Create an event loop for async tests with function scope."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()

def get_benchmark_pages() -> List[Path]:
    """Get all HTML files from benchmark directory."""
    project_root = get_project_root()
    benchmark_dir = project_root / "tests" / "benchmarks" / "pages"
    
    logger.info(f"Project root: {project_root}")
    logger.info(f"Looking for benchmark pages in: {benchmark_dir}")
    
    if not benchmark_dir.exists():
        logger.error(f"Benchmark directory not found: {benchmark_dir}")
        return []
        
    # List all files in directory first
    try:
        all_files = list(benchmark_dir.iterdir())
        logger.info(f"All files in directory: {[f.name for f in all_files]}")
        
        # Now try the glob pattern
        pattern = "*.html"
        logger.info(f"Searching with pattern: {pattern}")
        pages = list(benchmark_dir.glob(pattern))
        logger.info(f"Files matching pattern: {[p.name for p in pages]}")
        
        # Try rglob as well to see if it makes a difference
        rglob_pages = list(benchmark_dir.rglob(pattern))
        logger.info(f"Files matching with rglob: {[p.name for p in rglob_pages]}")
        
        # As a fallback, manually filter
        manual_pages = [f for f in all_files if f.name.lower().endswith('.html')]
        logger.info(f"Files found by manual filtering: {[p.name for p in manual_pages]}")
        
        if not pages and manual_pages:
            logger.warning("glob failed but manual filtering found pages - using manual results")
            pages = manual_pages
            
        return pages
        
    except Exception as e:
        logger.error(f"Error accessing directory: {e}", exc_info=True)
        return []


async def test_benchmark_pages(content_processor):
    """Run benchmarks on test pages and URLs."""
    logger.info("Starting benchmark test")
    
    # Setup
    benchmark_pages = get_benchmark_pages()  # Keep existing page discovery
    project_root = get_project_root()
    pages_dir = project_root / "tests" / "benchmarks" / "pages"
    output_dir = project_root / "tests" / "benchmarks" / "logs"
    
    # Clean output directory
    logger.info(f"Cleaning output directory: {output_dir}")
    clean_output_directory(output_dir)
    
    # Verify input directory
    assert pages_dir.exists(), f"Pages directory not found at {pages_dir}"
    assert benchmark_pages, f"No benchmark pages found in {pages_dir}"
    
    # Create and run benchmark suite
    logger.info("Initializing benchmark runner")
    runner = BenchmarkRunner(
        content_processor=content_processor,
        output_dir=output_dir
    )

    # Modify event handler to capture Page object
    def page_capture_handler(event: ProcessingEvent):
        """
        Capture Page object for each benchmark result.
        
        This event handler looks for the page_object in the event metadata.
        """
        if 'page_object' in event.metadata:
            result = next(
                (r for r in runner.results if r.page_path == event.metadata.get('page_id')), 
                None
            )
            if result:
                result.page_object = runner._extract_page_object_details(
                    event.metadata['page_object']
                )
    
    # Register the page capture handler
    runner.orchestrator.register_event_handler(page_capture_handler)
    
    # Add some test URLs to the benchmark pages
    test_sources = list(benchmark_pages)  # Convert pages to list
    test_sources.extend([
        "https://www.penny-arcade.com/comic/2025/01/20/bot-without-my-daughter"
    ])
    
    logger.info("Running benchmarks")
    await runner.run_all(test_sources)  # Changed to async call
    
    # Basic validations
    logger.info("Validating results")
    assert len(runner.results) == len(test_sources), "Should process all sources"
    for result in runner.results:
        if not result.errors:  # Only check content length for successful runs
            assert result.content_length > 0, "Content should not be empty"
    
    # Verify outputs
    logger.info("Verifying outputs")
    summary_path = output_dir / 'summary.json'
    assert summary_path.exists(), f"Summary file not found at {summary_path}"
    
    individual_dir = output_dir / 'individual'
    assert individual_dir.exists(), f"Individual results directory not found at {individual_dir}"
    result_files = list(individual_dir.glob('*.json'))
    assert len(result_files) > 0, "No individual result files generated"
    
    # Verify visualizations
    viz_dir = output_dir / 'visualizations'
    assert viz_dir.exists(), "Visualization directory not found"
    assert list(viz_dir.glob('*.png')), "No visualization files generated"