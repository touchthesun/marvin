import os
import json
from pathlib import Path
from typing import Dict, Any, Optional

from core.utils.config import load_config as load_app_config
from core.utils.logger import get_logger

logger = get_logger(__name__)

def load_test_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load test harness configuration, combining application config with test-specific settings.
    
    Args:
        config_path: Path to the test config JSON file
        
    Returns:
        Dict containing the combined configuration
    """
    # First load the application config
    app_config = load_app_config()
    
    # Create default test config
    test_config = {
        "environment": "test",
        "log_level": app_config.get("logging_level", "INFO"),
        "use_docker": False,
        "use_real_api": False,
        "allow_real_requests": False,
        
        "neo4j": {
            "use_mock": True,
            "uri": app_config.get("neo4j_uri"),
            "username": app_config.get("neo4j_username"),
            "password": app_config.get("neo4j_password")
        },
        
        "api": {
            "base_url": "http://localhost:8000"
        },
        
        "llm": {
            "use_http_server": True,
            "responses_dir": "fixtures/llm_responses"
        },
        
        "browser": {
            "browser_state": "fixtures/browser_state.json"
        },
        
        "fixtures": {
            "dir": "fixtures",
            "pages_dir": "fixtures/pages",
            "graph_data": "fixtures/graph_data.json"
        },
        
        "scenarios": [
            "page_capture",
            "knowledge_query",
            "auth_provider"
        ],
        
        "reporting": {
            "generate_html": True,
            "report_dir": "reports",
            "report_template": "templates/report.html"
        }
    }
    
    # If a config path is provided, load and merge it
    if config_path:
        try:
            config_file = Path(config_path)
            if config_file.exists():
                logger.info(f"Loading test config from {config_path}")
                with open(config_file, 'r') as f:
                    file_config = json.load(f)
                    
                # Deep merge the configurations
                test_config = deep_merge(test_config, file_config)
            else:
                logger.warning(f"Config file {config_path} not found, using defaults")
        except Exception as e:
            logger.error(f"Error loading config file: {str(e)}")
    
    # Add test-specific overrides from environment variables
    if bool(load_app_config.get("TEST_ENVIRONMENT")):
        test_config["environment"] = load_app_config.get("TEST_ENVIRONMENT")
        
    if bool(load_app_config.get("TEST_LOG_LEVEL")):
        test_config["log_level"] = load_app_config.get("TEST_LOG_LEVEL")
    
    logger.info(f"Test harness configuration loaded for environment: {test_config['environment']}")
    return test_config

def deep_merge(source: Dict[str, Any], destination: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep merge two dictionaries, with values from destination overriding source.
    
    Args:
        source: Source dictionary
        destination: Destination dictionary with override values
        
    Returns:
        Merged dictionary
    """
    result = source.copy()
    
    for key, value in destination.items():
        if isinstance(value, dict) and key in result and isinstance(result[key], dict):
            # Recursively merge nested dicts
            result[key] = deep_merge(result[key], value)
        else:
            # Replace or add the value
            result[key] = value
            
    return result