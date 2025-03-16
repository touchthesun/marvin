import pytest
import asyncio
from datetime import datetime
from typing import Dict, List
from bs4 import BeautifulSoup

from core.domain.content.pipeline import (
    PipelineOrchestrator,
    ComponentType,
    ProcessingStage,
    ProcessingEvent
)
from core.content.page import Page, PageStatus, BrowserContext
from core.content.metadata import MetadataExtractor, MetadataConfig
from core.content.processor import ContentProcessor, ContentProcessorConfig
from core.utils.logger import get_logger

# Test Data
SAMPLE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test Page</title>
    <meta name="description" content="Test description">
    <meta name="author" content="Test Author">
    <script type="application/ld+json">
    {
        "@type": "Article",
        "headline": "Test Article",
        "author": "Test Author",
        "datePublished": "2024-01-19"
    }
    </script>
</head>
<body>
    <article>
        <h1>Test Article</h1>
        <p>This is a test article with some keywords like artificial intelligence and machine learning.</p>
        <p>It also mentions important concepts like neural networks and deep learning.</p>
    </article>
</body>
</html>
"""

class TestPipelineOrchestrator:
    """Integration tests for the complete pipeline flow."""
    
    @pytest.fixture
    async def orchestrator(self):
        """Create a pipeline orchestrator with test configuration."""
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

    async def test_complete_pipeline_flow(self, orchestrator, events):
        """Test the complete pipeline flow from HTML to processed page."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        # Process test page
        url = "http://test.com/article"
        page = await orchestrator.process_page(url, SAMPLE_HTML)
        
        # Verify page state
        assert page.status == PageStatus.ACTIVE
        assert page.url == url
        
        # Verify metadata extraction
        assert page.metadata.get('title') == "Test Article"
        assert page.metadata.get('author') == "Test Author"
        assert page.metadata.get('quality', {}).get('score', 0) > 0.5
        
        # Verify content processing
        assert len(page.keywords) > 0
        assert page.metrics.keyword_count > 0
        assert page.metrics.processing_time > 0
        
        # Verify event flow
        stages = [event.stage for event in events_list]
        assert ProcessingStage.INITIALIZE in stages
        assert ProcessingStage.METADATA in stages
        assert ProcessingStage.CONTENT in stages
        assert ProcessingStage.COMPLETE in stages

    async def test_pipeline_error_handling(self, orchestrator, events):
        """Test pipeline error handling with invalid input."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        # Process invalid HTML
        url = "http://test.com/invalid"
        invalid_html = "<not>valid</html>"
        
        with pytest.raises(Exception):
            page = await orchestrator.process_page(url, invalid_html)
        
        # Verify error events
        error_events = [
            event for event in events_list 
            if event.stage == ProcessingStage.ERROR
        ]
        assert len(error_events) > 0

    async def test_component_sequence(self, orchestrator, events):
        """Test that components execute in correct sequence."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        # Process test page
        url = "http://test.com/sequence"
        page = await orchestrator.process_page(url, SAMPLE_HTML)
        
        # Verify sequence
        component_sequence = [
            (event.stage, event.component_type) 
            for event in events_list 
            if event.stage not in (ProcessingStage.INITIALIZE, ProcessingStage.COMPLETE)
        ]
        
        # Metadata should come before content processing
        metadata_idx = next(
            i for i, (stage, comp_type) in enumerate(component_sequence)
            if comp_type == ComponentType.METADATA
        )
        content_idx = next(
            i for i, (stage, comp_type) in enumerate(component_sequence)
            if comp_type == ComponentType.CONTENT
        )
        
        assert metadata_idx < content_idx

    async def test_state_transitions(self, orchestrator, events):
        """Test page state transitions through pipeline."""
        events_list, event_handler = events
        orchestrator.register_event_handler(event_handler)
        
        # Process test page
        url = "http://test.com/states"
        page = await orchestrator.process_page(url, SAMPLE_HTML)
        
        # Get state transitions
        states = []
        for event in events_list:
            if hasattr(event.metadata, 'page_status'):
                states.append(event.metadata['page_status'])
        
        # Verify transitions
        assert PageStatus.DISCOVERED in states
        assert PageStatus.PROCESSING in states
        assert states[-1] == PageStatus.ACTIVE  # Final state

    async def test_quality_metrics(self, orchestrator):
        """Test quality metrics through pipeline."""
        # Process test page
        url = "http://test.com/metrics"
        page = await orchestrator.process_page(url, SAMPLE_HTML)
        
        # Verify metadata quality
        assert 'quality' in page.metadata
        assert page.metadata.custom_metadata['quality']['score'] > 0
        
        # Verify content quality
        assert page.metrics.quality_score > 0
        assert hasattr(page.metrics, 'keyword_count')
        assert hasattr(page.metrics, 'processing_time')