import os
from dotenv import load_dotenv
from pathlib import Path
from functools import lru_cache

from core.utils.config_model import AppConfig

@lru_cache
def load_config() -> AppConfig:
    """Load application configuration from environment variables."""
    # Load environment variables
    root_dir = Path(__file__).parent.parent.parent
    env_path = root_dir / '.env'
    template_path = root_dir / '.env.template'
    
    if env_path.exists():
        load_dotenv(env_path, override=True)
    elif template_path.exists():
        load_dotenv(template_path)
    
    # Create config instance
    config = AppConfig(
        environment=os.getenv("ENVIRONMENT", "development"),
        config_dir=os.getenv("CONFIG_DIR", "./config"),
        storage_path=os.getenv("STORAGE_PATH", "./storage"),
        logging_level=os.getenv("LOGGING_LEVEL"),
        enable_metadata_comparison=os.getenv("ENABLE_METADATA_COMPARISON", "False").lower() in ("true", "1", "t"),
        
        # Database settings
        db_mode=os.getenv('DB_MODE', 'LOCAL'),
        neo4j_uri=_get_neo4j_uri(),
        neo4j_username=_get_neo4j_username(),
        neo4j_password=_get_neo4j_password(),
        
        # API keys
        openai_api_key=os.getenv('OPENAI_API_KEY'),
        anthropic_api_key=os.getenv('ANTHROPIC_API_KEY'),
        serpapi_api_key=os.getenv('SERP_API_KEY'),
        tavily_api_key=os.getenv('TAVILY_API_KEY'),
        
        # Model settings
        model_name=os.getenv('MODEL_NAME'),
        max_tokens=int(os.getenv('OPENAI_MAX_TOKENS')) if os.getenv('OPENAI_MAX_TOKENS') else None,
        
        # UI settings
        streamlit_mode=os.getenv('STREAMLIT_MODE', 'TERMINAL'),
        
        # Security settings
        secret_key=os.getenv('SECRET_KEY', 'development_key_change_in_production'),
        admin_token=os.getenv('ADMIN_TOKEN', 'development_key_change_in_production'),
        access_token_expire_minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440')),
        jwt_algorithm=os.getenv('JWT_ALGORITHM', 'HS256'),
        secure_cookies=os.getenv('SECURE_COOKIES', 'False').lower() in ('true', '1', 't'),
        encryption_key=os.getenv('ENCRYPTION_KEY'),
        
        # API Security
        allowed_origins=os.getenv('ALLOWED_ORIGINS', 'chrome-extension://*,http://localhost:8000').split(','),
        api_key_header_name=os.getenv('API_KEY_HEADER_NAME', 'X-API-Key'),
        
        # Rate Limiting
        rate_limit_requests=int(os.getenv('RATE_LIMIT_REQUESTS', '100')),
        rate_limit_window_seconds=int(os.getenv('RATE_LIMIT_WINDOW_SECONDS', '3600')),
    )
    
    return config

def _get_neo4j_uri():
    """Get Neo4j URI based on DB mode."""
    db_mode = os.getenv('DB_MODE', 'LOCAL')
    if db_mode == 'LOCAL':
        return os.getenv('NEO4J_URI_LOCAL')
    return os.getenv('NEO4J_URI_REMOTE', os.getenv('NEO4J_URI_LOCAL'))

def _get_neo4j_username():
    """Get Neo4j username based on DB mode."""
    db_mode = os.getenv('DB_MODE', 'LOCAL')
    if db_mode == 'LOCAL':
        return os.getenv('NEO4J_USERNAME_LOCAL')
    return os.getenv('NEO4J_USERNAME_REMOTE', os.getenv('NEO4J_USERNAME_LOCAL'))

def _get_neo4j_password():
    """Get Neo4j password based on DB mode."""
    db_mode = os.getenv('DB_MODE', 'LOCAL')
    if db_mode == 'LOCAL':
        return os.getenv('NEO4J_PASSWORD_LOCAL')
    return os.getenv('NEO4J_PASSWORD_REMOTE', os.getenv('NEO4J_PASSWORD_LOCAL'))