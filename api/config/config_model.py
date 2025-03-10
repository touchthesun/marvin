from pydantic import BaseModel
from pydantic.dataclasses import dataclass
from typing import List, ClassVar
import os
from core.utils.config_model import BaseConfig, AppConfig

# Calculate paths relative to this file
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(ROOT_DIR, 'web', 'static')
TEMPLATES_DIR = os.path.join(ROOT_DIR, 'web', 'templates')

@dataclass
class ApiConfig(BaseConfig):
    """API Server specific configuration."""
    
    # Reference to core config
    core_config: ClassVar[AppConfig] = None
    
    # Static file settings
    static_dir: str = STATIC_DIR
    templates_dir: str = TEMPLATES_DIR
    static_url: str = "/static"
    
    # API settings
    api_v1_str: str = "/api/v1"
    project_name: str = "Marvin"
    debug: bool = True
    
    # Server settings
    host: str = "localhost"
    port: int = 8000
    reload: bool = True

    # Convert to Pydantic settings
    def to_pydantic_settings(self):
        """Convert to Pydantic settings format for FastAPI."""
        return ApiSettings(
            STATIC_DIR=self.static_dir,
            TEMPLATES_DIR=self.templates_dir,
            STATIC_URL=self.static_url,
            API_V1_STR=self.api_v1_str,
            PROJECT_NAME=self.project_name,
            DEBUG=self.debug,
            HOST=self.host,
            PORT=self.port,
            RELOAD=self.reload,
            # From base config
            BACKEND_CORS_ORIGINS=self.allowed_origins,
            SECRET_KEY=self.secret_key,
            ACCESS_TOKEN_EXPIRE_MINUTES=self.access_token_expire_minutes,
            JWT_ALGORITHM=self.jwt_algorithm,
            SECURE_COOKIES=self.secure_cookies,
            API_KEY_HEADER_NAME=self.api_key_header_name,
            RATE_LIMIT_REQUESTS=self.rate_limit_requests,
            RATE_LIMIT_WINDOW=self.rate_limit_window_seconds,
            # Database settings
            NEO4J_URI=self.neo4j_uri,
            NEO4J_USER=self.neo4j_username,
            NEO4J_PASSWORD=self.neo4j_password,
            # Logging
            LOGGING_LEVEL=self.logging_level
        )

# Maintain compatibility with the current FastAPI settings
class ApiSettings(BaseModel):
    """API Settings model compatible with FastAPI."""
    
    # Static file settings
    STATIC_DIR: str
    TEMPLATES_DIR: str
    STATIC_URL: str
    
    # API settings
    API_V1_STR: str
    PROJECT_NAME: str
    DEBUG: bool
    
    # Server settings
    HOST: str
    PORT: int
    RELOAD: bool
    
    # Security settings
    BACKEND_CORS_ORIGINS: List[str]
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    JWT_ALGORITHM: str
    SECURE_COOKIES: bool
    API_KEY_HEADER_NAME: str
    
    # Rate limiting
    RATE_LIMIT_REQUESTS: int
    RATE_LIMIT_WINDOW: int
    
    # Database settings
    NEO4J_URI: str
    NEO4J_USER: str
    NEO4J_PASSWORD: str
    
    # Logging
    LOGGING_LEVEL: str
    
    class Config:
        case_sensitive = True