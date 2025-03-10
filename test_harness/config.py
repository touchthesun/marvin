import os
import json
import copy
from typing import Dict, Any, Optional

from core.utils.config import load_config as load_app_config
from core.utils.logger import get_logger
from test_harness.config_model import TestConfig
from test_harness.utils.paths import resolve_path

logger = get_logger(__name__)

def load_test_config(config_path: Optional[str] = None) -> TestConfig:
    """
    Load test harness configuration, combining application config with test-specific settings.
    
    Args:
        config_path: Path to the test config JSON file
        
    Returns:
        TestConfig object containing the combined configuration
    """
    # First load the application config
    app_config = load_app_config()
    
    # Create basic test config inheriting base settings from app config
    test_config = TestConfig(
        # Inherit base settings from app config
        environment="test",
        logging_level=app_config.logging_level,
        config_dir=app_config.config_dir,
        storage_path=app_config.storage_path,
        
        # Use real Neo4j connection settings
        neo4j_uri=app_config.neo4j_uri,
        neo4j_username=app_config.neo4j_username,
        neo4j_password=app_config.neo4j_password,
        db_mode=app_config.db_mode,
        
        # Security settings
        secret_key=app_config.secret_key,
        admin_token=app_config.admin_token,
    )
    
    # If a config path is provided, load and merge it
    if config_path:
        try:
            # Use the resolve_path utility to find the config file
            try:
                config_file = resolve_path(config_path)
                logger.info(f"Loading test config from {config_file}")
                
                with open(config_file, 'r') as f:
                    file_config = json.load(f)
                    
                # Update test config from file
                test_config = _update_from_dict(test_config, file_config)
                
            except FileNotFoundError:
                logger.warning(f"Config file {config_path} not found, using defaults")
        except Exception as e:
            logger.error(f"Error loading config file: {str(e)}")
    
    # Apply environment variable overrides
    if os.getenv("TEST_ENVIRONMENT"):
        test_config.environment = os.getenv("TEST_ENVIRONMENT")
        
    if os.getenv("TEST_LOG_LEVEL"):
        test_config.logging_level = os.getenv("TEST_LOG_LEVEL")
    
    if os.getenv("API_V1_STR"):
        test_config.api["api_v1_str"] = os.getenv("API_V1_STR")
    
    # Update neo4j details in the test_config.neo4j dict
    if test_config.neo4j.get("use_real", False):
        test_config.neo4j.update({
            "uri": test_config.neo4j_uri,
            "username": test_config.neo4j_username,
            "password": test_config.neo4j_password
        })
    
    logger.info(f"Test harness configuration loaded for environment: {test_config.environment}")
    
    return test_config

def _update_from_dict(config: TestConfig, data: Dict[str, Any]) -> TestConfig:
    """Update config dataclass from a dictionary."""
    config_copy = copy.deepcopy(config)
    
    # Handle nested dictionaries
    for key, value in data.items():
        if hasattr(config_copy, key):
            if isinstance(value, dict) and isinstance(getattr(config_copy, key), dict):
                # Merge dictionaries
                current_dict = getattr(config_copy, key)
                current_dict.update(value)
                setattr(config_copy, key, current_dict)
            else:
                # Direct assignment
                setattr(config_copy, key, value)
                
    return config_copy