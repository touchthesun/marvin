from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional

@dataclass
class BaseConfig:
    """Base configuration shared by all application components."""
    
    # Environment settings
    environment: str = "development"
    logging_level: str = "INFO"
    config_dir: str = "./config"
    storage_path: str = "./storage"
    
    # Neo4j connection settings
    neo4j_uri: Optional[str] = None
    neo4j_username: Optional[str] = None
    neo4j_password: Optional[str] = None
    
    # Database mode
    db_mode: str = "LOCAL"
    
    # Security settings
    secret_key: str = "development_key_change_in_production"
    admin_token: str = "development_key_change_in_production"
    allowed_origins: List[str] = field(default_factory=lambda: ["chrome-extension://*", "http://localhost:8000"])
    
    # API settings
    api_key_header_name: str = "X-API-Key"
    
    # JWT settings
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    secure_cookies: bool = False
    
    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window_seconds: int = 3600
    
    # Other shared settings
    enable_metadata_comparison: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary."""
        return asdict(self)
    
    def get(self, key, default=None):
        """Dictionary-like get method for backward compatibility."""
        return getattr(self, key, default)
    
    def __getitem__(self, key):
        """Dictionary-like access for backward compatibility."""
        return getattr(self, key)
    
    def __contains__(self, key):
        """Support for 'in' operator."""
        try:
            return hasattr(self, key)
        except:
            return False


@dataclass
class AppConfig(BaseConfig):
    """Application-specific configuration."""
    
    # API keys
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    serpapi_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None
    
    # Model settings
    model_name: Optional[str] = None
    max_tokens: Optional[int] = None
    
    # UI settings
    streamlit_mode: str = "TERMINAL"
    
    # Encryption
    encryption_key: Optional[str] = None