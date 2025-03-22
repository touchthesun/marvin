import os
import json
import copy
from typing import Dict, Any, Optional

from core.utils.config import load_config as load_app_config
from core.utils.logger import get_logger
from test_harness.config_model import TestConfig
from test_harness.utils.paths import resolve_path

logger = get_logger(__name__)

def load_test_config(
    config_path: Optional[str] = None, 
    credentials_file: Optional[str] = None
) -> TestConfig:
    """
    Load test harness configuration, combining application config with test-specific settings.
    
    Args:
        config_path: Path to the test config JSON file
        credentials_file: Path to credentials file containing sensitive information
        
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
                    
                env_credentials = _load_env_credentials()
                if env_credentials:
                    file_config = _process_value(file_config, env_credentials)
                    
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
    test_config.neo4j.update({
        "uri": test_config.neo4j_uri,
        "username": test_config.neo4j_username,
        "password": test_config.neo4j_password
    })
    
    # Apply environment variable placeholders
    _apply_env_vars(test_config)
    
    logger.info(f"Test harness configuration loaded for environment: {test_config.environment}")
    
    return test_config


def _process_credentials(config_data: Dict[str, Any], credentials_path: str) -> Dict[str, Any]:
    """
    Process credential placeholders in configuration.
    
    Args:
        config_data: Configuration dictionary
        credentials_path: Path to credentials file
        
    Returns:
        Updated configuration dictionary
    """
    # Try to load credentials file
    try:
        cred_path = resolve_path(credentials_path)
        if not os.path.exists(cred_path):
            logger.warning(f"Credentials file not found: {cred_path}")
            return config_data
            
        with open(cred_path, 'r') as f:
            credentials = json.load(f)
            
        logger.info(f"Loaded credentials from {cred_path}")
        
        # Process the entire config dictionary using the module-level function
        return _process_value(config_data, credentials)
        
    except Exception as e:
        logger.error(f"Error processing credentials: {str(e)}")
        return config_data
    
def _process_value(value, credentials):
    """
    Process credential placeholders in a value.
    
    Args:
        value: The value to process
        credentials: Dictionary containing credential values
        
    Returns:
        Processed value with credentials substituted
    """
    if isinstance(value, dict):
        return {k: _process_value(v, credentials) for k, v in value.items()}
    elif isinstance(value, list):
        return [_process_value(item, credentials) for item in value]
    elif isinstance(value, str) and value.startswith('${') and value.endswith('}'):
        cred_key = value[2:-1]
        if cred_key in credentials:
            return credentials[cred_key]
        else:
            logger.warning(f"Credential key not found: {cred_key}")
            return value
    else:
        return value


def _apply_env_vars(config: TestConfig) -> None:
    """
    Apply environment variable placeholders in configuration.
    
    Args:
        config: Configuration object to process
    """
    def process_dict(d):
        for key, value in d.items():
            if isinstance(value, dict):
                process_dict(value)
            elif isinstance(value, str) and value.startswith('$ENV:') and len(value) > 5:
                env_var = value[5:]
                if env_var in os.environ:
                    d[key] = os.environ[env_var]
                else:
                    logger.warning(f"Environment variable not found: {env_var}")
    
    # Process nested dictionaries in the config
    for field_name in ['neo4j', 'api', 'llm', 'browser', 'fixtures', 'reporting', 'agent']:
        if hasattr(config, field_name) and isinstance(getattr(config, field_name), dict):
            process_dict(getattr(config, field_name))

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

def _load_env_credentials():
    """Load credentials from .env file"""
    from dotenv import load_dotenv
    
    load_dotenv()  # Load .env file into environment variables
    
    # Create a dictionary of relevant credentials
    credentials = {
        "neo4j_username": os.getenv("NEO4J_USERNAME"),
        "neo4j_password": os.getenv("NEO4J_PASSWORD"),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),
        # Add other needed credentials
    }
    
    # Filter out None values
    return {k: v for k, v in credentials.items() if v is not None}