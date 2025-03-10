from dataclasses import dataclass, field
from typing import List, Dict, Any
from core.utils.config_model import BaseConfig

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
        "use_http_server": True,
        "responses_dir": "fixtures/llm_responses"
    })
    
    # Browser test settings
    browser: Dict[str, Any] = field(default_factory=lambda: {
        "browser_state": "fixtures/browser_state.json"
    })
    
    # Test fixtures
    fixtures: Dict[str, Any] = field(default_factory=lambda: {
        "dir": "fixtures",
        "pages_dir": "fixtures/pages",
        "graph_data": "fixtures/graph_data.json"
    })
    
    # Test scenarios
    scenarios: List[str] = field(default_factory=lambda: [
        "page_capture",
        "knowledge_query",
        "auth_provider"
    ])
    
    # Reporting
    reporting: Dict[str, Any] = field(default_factory=lambda: {
        "generate_html": True,
        "report_dir": "reports",
        "report_template": "templates/report.html"
    })