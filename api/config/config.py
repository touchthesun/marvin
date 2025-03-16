from functools import lru_cache
from api.config.config_model import ApiConfig
import os
from core.utils.config import load_config as load_core_config

# Calculate paths relative to this file for static and template directories
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(ROOT_DIR, 'web', 'static')
TEMPLATES_DIR = os.path.join(ROOT_DIR, 'web', 'templates')

@lru_cache()
def get_settings():
    """Get cached settings instance with values from the core configuration."""
    # Load the core configuration first
    core_config = load_core_config()
    
    # Create API config instance, inheriting values from core config
    api_config = ApiConfig(
        # Inherit core config values
        environment=core_config.environment,
        logging_level=core_config.logging_level,
        config_dir=core_config.config_dir,
        storage_path=core_config.storage_path,
        neo4j_uri=core_config.neo4j_uri,
        neo4j_username=core_config.neo4j_username,
        neo4j_password=core_config.neo4j_password,
        db_mode=core_config.db_mode,
        secret_key=core_config.secret_key,
        admin_token=core_config.admin_token,
        allowed_origins=core_config.allowed_origins,
        api_key_header_name=core_config.api_key_header_name,
        jwt_algorithm=core_config.jwt_algorithm,
        access_token_expire_minutes=core_config.access_token_expire_minutes,
        secure_cookies=core_config.secure_cookies,
        rate_limit_requests=core_config.rate_limit_requests,
        rate_limit_window_seconds=core_config.rate_limit_window_seconds,
        enable_metadata_comparison=core_config.enable_metadata_comparison,
        
        # API-specific settings, potentially overridden by environment variables
        version=os.getenv("MARVIN_API_VERSION", "0.1.0"),
        project_name=os.getenv("MARVIN_API_PROJECT_NAME", "Marvin"),
        debug=os.getenv("MARVIN_API_DEBUG", "True").lower() in ("true", "1", "t"),
        host=os.getenv("MARVIN_API_HOST", "localhost"),
        port=int(os.getenv("MARVIN_API_PORT", "8000")),
        reload=os.getenv("MARVIN_API_RELOAD", "True").lower() in ("true", "1", "t"),
        static_dir=os.getenv("MARVIN_API_STATIC_DIR", STATIC_DIR),
        templates_dir=os.getenv("MARVIN_API_TEMPLATES_DIR", TEMPLATES_DIR),
        static_url=os.getenv("MARVIN_API_STATIC_URL", "/static"),
        api_v1_str=os.getenv("MARVIN_API_V1_STR", "/api/v1")
    )
    
    return api_config

settings = get_settings()