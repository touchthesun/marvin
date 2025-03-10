from functools import lru_cache
from core.utils.config import load_config
from pydantic_settings import BaseSettings
from typing import List
import os

# Load core configuration
CORE_CONFIG = load_config()

# Calculate paths relative to this file
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(ROOT_DIR, 'web', 'static')
TEMPLATES_DIR = os.path.join(ROOT_DIR, 'web', 'templates')

class Settings(BaseSettings):
    """API Server Configuration Settings
    
    Uses core configuration while maintaining FastAPI compatibility.
    All sensitive settings are managed in core config.
    """
    
    # Static File Settings
    STATIC_DIR: str = STATIC_DIR
    TEMPLATES_DIR: str = TEMPLATES_DIR
    STATIC_URL: str = "/static"

    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Marvin"
    DEBUG: bool = True
    
    # Server Settings
    HOST: str = "localhost"
    PORT: int = 8000
    RELOAD: bool = True
    
    # Import security settings from core config
    BACKEND_CORS_ORIGINS: List[str] = CORE_CONFIG.allowed_origins
    SECRET_KEY: str = CORE_CONFIG.secret_key
    ACCESS_TOKEN_EXPIRE_MINUTES: int = CORE_CONFIG.access_token_expire_minutes
    JWT_ALGORITHM: str = CORE_CONFIG.jwt_algorithm
    SECURE_COOKIES: bool = CORE_CONFIG.secure_cookies
    API_KEY_HEADER_NAME: str = CORE_CONFIG.api_key_header_name
    RATE_LIMIT_REQUESTS: int = CORE_CONFIG.rate_limit_requests
    RATE_LIMIT_WINDOW: int = CORE_CONFIG.rate_limit_window_seconds
    
    # Database settings from core config
    NEO4J_URI: str = CORE_CONFIG.neo4j_uri
    NEO4J_USER: str = CORE_CONFIG.neo4j_username
    NEO4J_PASSWORD: str = CORE_CONFIG.neo4j_password
    
    # Logging configuration
    LOGGING_LEVEL: str = CORE_CONFIG.logging_level
    
    class Config:
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

# Export settings instance
settings = get_settings()