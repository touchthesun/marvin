from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from core.utils.config_model import BaseConfig

@dataclass
class ContentWorkflowConfig:
    """Configuration for content workflow tests."""
    urls: List[str] = field(default_factory=list)
    url_file: Optional[str] = None
    expected_results: Optional[str] = None
    max_wait_time: int = 60  # seconds
    batch_size: int = 5


@dataclass
class TestConfig(BaseConfig):
    """Test harness specific configuration."""
    
    # Test environment settings
    environment: str = "test"  # Override base default
    use_real_api: bool = False
    allow_real_requests: bool = False
    
    # Neo4j test settings
    neo4j: Dict[str, Any] = field(default_factory=lambda: {
        "use_real": False,
        "use_test_schema": True,
        "schema_script": None,
        "test_database": "marvin_test"
    })
    
    # API test settings
    api: Dict[str, Any] = field(default_factory=lambda: {
        "base_url": "http://localhost:8000",
        "api_v1_str": "/api/v1",
        "health_endpoint": "/health"
    })
    
    # LLM test settings
    llm: Dict[str, Any] = field(default_factory=lambda: {
        "use_real": False,
        "use_http_server": True,
        "responses_dir": "fixtures/llm_responses",
        "provider": {
            "provider_type": "anthropic",
            "provider_id": "anthropic-test",
            "model": "claude-3-opus-20240229"
        }
    })
    
    # Browser test settings
    browser: Dict[str, Any] = field(default_factory=lambda: {
        "browser_state": "fixtures/test/browser_state.json"
    })
    
    # Test fixtures
    fixtures: Dict[str, Any] = field(default_factory=lambda: {
        "dir": "test_harness/fixtures",
        "pages_dir": "test_harness/fixtures/pages",
        "graph_data": "test_harness/fixtures/graph_data.json"
    })
    
    # Test scenarios
    scenarios: List[str] = field(default_factory=lambda: [
        "page_capture",
        "knowledge_query",
        "auth_provider",
        "llm_agent"
    ])
    
    # Reporting
    reporting: Dict[str, Any] = field(default_factory=lambda: {
        "generate_html": True,
        "report_dir": "test_harness/reports",
        "report_template": "templates/report.html"
    })

    # Content workflow config
    content_workflow: ContentWorkflowConfig = field(default_factory=ContentWorkflowConfig)

    # Agent test settings
    agent: Dict[str, Any] = field(default_factory=lambda: {
        "max_wait_time": 60,  # seconds
        "mock_response_dir": "test_harness/fixtures/agent_responses"
    })