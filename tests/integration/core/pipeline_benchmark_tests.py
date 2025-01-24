import pytest
import asyncio
from pathlib import Path
from typing import Dict, List
import json
from datetime import datetime

from core.pipeline.pipeline import (
    PipelineOrchestrator,
    ComponentType,
    ProcessingStage,
    ProcessingEvent
)
from core.content.page import Page, PageStatus
from core.content.metadata import MetadataExtractor, MetadataConfig
from core.content.processor import ContentProcessor, ContentProcessorConfig
from core.utils.logger import get_logger

class BenchmarkTestHelper:
    """Helper class for loading and managing benchmark test pages."""
    
    def __init__(self, benchmark_dir: str = "tests/benchmarks/pages"):
        self.benchmark_dir = Path(benchmark_dir)
        self.logger = get_logger(__name__)
        
    def list_benchmark_pages(self) -> List[Path]:
        """Get list of all benchmark HTML files."""
        return list(self.benchmark_dir.glob("*.html"))
    
    async def load_benchmark_page(self, filepath: Path) -> Dict:
        """Load a benchmark page and its metadata.
        
        Returns:
            Dict containing:
            - url: Original URL if available
            - html: Raw HTML content
            - expected: Expected extraction results if available
        """
        try:
            # Load HTML content
            html_content = filepath.read_text(encoding='utf-8')
            
            # Look for accompanying metadata file
            meta_path = filepath.with_suffix('.json')
            expected = {}
            if meta_path.exists():
                expected = json.loads(meta_path.read_text(encoding='utf-8'))
            
            return {
                'url': expected.get('url', f"file://{filepath}"),
                'html': html_content,
                'expected': expected
            }
            
        except Exception as e:
            self.logger.error(f"Failed to load benchmark page {filepath}: {e}")
            raise

class TestPipelineBenchmarks:
    """Integration tests using benchmark pages."""
    
    @pytest.fixture
    def benchmark_helper(self):
        """Create benchmark helper instance."""
        return BenchmarkTestHelper()
    
    @pytest.fixture
    async def orchestrator(self):
        """Create pipeline orchestrator with test configuration."""
        orchestrator = PipelineOrchestrator()
        
        # Configure and add metadata extractor
        metadata_config = MetadataConfig(
            quality_threshold=0.5,
            required_fields=['title']
        )
        metadata_extractor = MetadataExtractor(metadata_config)
        orchestrator.register_component(
            metadata_extractor,
            ProcessingStage.METADATA
        )
        
        # Configure and add content processor
        processor_config = ContentProcessorConfig(
            min_content_length=10,
            min_keyword_score=0.3
        )
        content_processor = ContentProcessor(processor_config)
        orchestrator.register_component(
            content_processor,
            ProcessingStage.CONTENT
        )
        
        return orchestrator
    
    @pytest.fixture
    def events(self) -> List[ProcessingEvent]:
        """Collect pipeline events during test execution."""
        events = []
        
        def collect_event(event: ProcessingEvent):
            events.append(event)
        
        return events, collect_event

    @pytest.mark.parametrize('benchmark_file', 
                           BenchmarkTestHelper().list_benchmark_pages())
    async def test_benchmark_page_processing(self, 
                                          benchmark_file: Path,
                                          benchmark_helper: BenchmarkTestHelper,
                                          orchestrator,
                                          events):
        """Test pipeline processing of benchmark pages."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        # Load benchmark page
        benchmark_data = await benchmark_helper.load_benchmark_page(benchmark_file)
        
        # Process the page
        page = await orchestrator.process_page(
            benchmark_data['url'],
            benchmark_data['html']
        )
        
        # Basic pipeline success verification
        assert page.status == PageStatus.ACTIVE
        assert page.url == benchmark_data['url']
        assert page.metadata.get('quality', {}).get('score', 0) > 0.5
        assert page.metrics.keyword_count > 0
        
        # Verify against expected results if available
        expected = benchmark_data['expected']
        if expected:
            if 'title' in expected:
                assert page.metadata.get('title') == expected['title']
            if 'author' in expected:
                assert page.metadata.get('author') == expected['author']
            if 'keywords' in expected:
                expected_keywords = set(expected['keywords'])
                actual_keywords = set(page.keywords.keys())
                # Check for overlap rather than exact match
                overlap = expected_keywords & actual_keywords
                assert len(overlap) > 0, "No matching keywords found"
    
    async def test_benchmark_error_cases(self,
                                       benchmark_helper: BenchmarkTestHelper,
                                       orchestrator,
                                       events):
        """Test pipeline handling of problematic benchmark pages."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        for benchmark_file in benchmark_helper.list_benchmark_pages():
            benchmark_data = await benchmark_helper.load_benchmark_page(benchmark_file)
            
            # Process page and check for proper error handling
            try:
                page = await orchestrator.process_page(
                    benchmark_data['url'],
                    benchmark_data['html']
                )
                
                # Verify error handling in components
                metadata_issues = [
                    e for e in events_list 
                    if e.component_type == ComponentType.METADATA and 
                    e.status == 'error'
                ]
                content_issues = [
                    e for e in events_list 
                    if e.component_type == ComponentType.CONTENT and 
                    e.status == 'error'
                ]
                
                # Log any issues for analysis
                if metadata_issues or content_issues:
                    print(f"Processing issues for {benchmark_file}:")
                    for issue in metadata_issues + content_issues:
                        print(f"- {issue.component_type}: {issue.message}")
                
            except Exception as e:
                # If processing fails completely, log the failure
                print(f"Failed to process {benchmark_file}: {str(e)}")

    @pytest.mark.parametrize('benchmark_file', 
                           BenchmarkTestHelper().list_benchmark_pages())
    async def test_benchmark_performance(self,
                                      benchmark_file: Path,
                                      benchmark_helper: BenchmarkTestHelper,
                                      orchestrator):
        """Test processing performance on benchmark pages."""
        # Load benchmark page
        benchmark_data = await benchmark_helper.load_benchmark_page(benchmark_file)
        
        # Process and measure time
        start_time = datetime.utcnow()
        page = await orchestrator.process_page(
            benchmark_data['url'],
            benchmark_data['html']
        )
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Log performance metrics
        print(f"\nPerformance metrics for {benchmark_file}:")
        print(f"Total processing time: {processing_time:.2f}s")
        print(f"Metadata extraction time: {page.metrics.metadata_time:.2f}s")
        print(f"Content processing time: {page.metrics.processing_time:.2f}s")
        print(f"Keywords extracted: {page.metrics.keyword_count}")
        
        # Basic performance assertions
        assert processing_time < 30.0, "Processing took too long"
        assert page.metrics.keyword_count > 0, "No keywords extracted"