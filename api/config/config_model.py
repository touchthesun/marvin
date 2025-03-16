from dataclasses import dataclass
import os
from core.utils.config_model import BaseConfig

# Calculate paths relative to this file
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(ROOT_DIR, 'web', 'static')
TEMPLATES_DIR = os.path.join(ROOT_DIR, 'web', 'templates')

@dataclass
class ApiConfig(BaseConfig):
    """API Server specific configuration that extends BaseConfig."""
    
    # API version
    version: str = "0.1.0"
    
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
    
    # Property accessors for compatibility with existing code
    @property
    def VERSION(self):
        return self.version
        
    @property
    def PROJECT_NAME(self):
        return self.project_name
        
    @property
    def API_V1_STR(self):
        return self.api_v1_str
        
    @property
    def DEBUG(self):
        return self.debug
        
    @property
    def BACKEND_CORS_ORIGINS(self):
        return self.allowed_origins
        
    @property
    def NEO4J_URI(self):
        return self.neo4j_uri
        
    @property
    def NEO4J_USER(self):
        return self.neo4j_username
        
    @property
    def NEO4J_PASSWORD(self):
        return self.neo4j_password
    
    @property
    def HOST(self):
        return self.host
        
    @property
    def PORT(self):
        return self.port
        
    @property
    def RELOAD(self):
        return self.reload