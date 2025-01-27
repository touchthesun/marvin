import os
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(dotenv_path)

def load_config():
    """
    Loads and returns the application configuration based on environment variables.
    """
    config = {
        # Existing settings
        "logging_level": os.getenv("LOGGING_LEVEL"),
        "enable_metadata_comparison": os.getenv("ENABLE_METADATA_COMPARISON", "False").lower() in ("true", "1", "t"),
        "openai_api_key": os.getenv('OPENAI_API_KEY'),
        "anthropic_api_key": os.getenv('ANTHROPIC_API_KEY'),
        "max_tokens": os.getenv('OPENAI_MAX_TOKENS'),
        "db_mode": os.getenv('DB_MODE', 'LOCAL'),
        "streamlit_mode": os.getenv('STREAMLIT_MODE', 'TERMINAL'),
        "neo4j_uri": (os.getenv('NEO4J_URI_LOCAL') if os.getenv('DB_MODE', 'LOCAL') == 'LOCAL' 
                        else os.getenv('NEO4J_URI_REMOTE', os.getenv('NEO4J_URI_LOCAL'))),
        "neo4j_username": (os.getenv('NEO4J_USERNAME_LOCAL') if os.getenv('DB_MODE', 'LOCAL') == 'LOCAL'
                        else os.getenv('NEO4J_USERNAME_REMOTE', os.getenv('NEO4J_USERNAME_LOCAL'))),
        "neo4j_password": (os.getenv('NEO4J_PASSWORD_LOCAL') if os.getenv('DB_MODE', 'LOCAL') == 'LOCAL'
                        else os.getenv('NEO4J_PASSWORD_REMOTE', os.getenv('NEO4J_PASSWORD_LOCAL'))),
        "model_name": os.getenv('MODEL_NAME'),
        "serpapi_api_key": os.getenv('SERP_API_KEY'),
        "tavily_api_key": os.getenv('TAVILY_API_KEY'),

        # Security settings
        "secret_key": os.getenv('SECRET_KEY', 'development_key_change_in_production'),
        "access_token_expire_minutes": int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440')),  # 24 hours default
        "encryption_key": os.getenv('ENCRYPTION_KEY'),
        "jwt_algorithm": os.getenv('JWT_ALGORITHM', 'HS256'),
        "secure_cookies": os.getenv('SECURE_COOKIES', 'False').lower() in ('true', '1', 't'),
        
        # API Security
        "allowed_origins": os.getenv('ALLOWED_ORIGINS', 'chrome-extension://*,http://localhost,http://localhost:8000,http://localhost:3000').split(','),
        "api_key_header_name": os.getenv('API_KEY_HEADER_NAME', 'X-API-Key'),
        
        # Rate Limiting
        "rate_limit_requests": int(os.getenv('RATE_LIMIT_REQUESTS', '100')),
        "rate_limit_window_seconds": int(os.getenv('RATE_LIMIT_WINDOW_SECONDS', '3600'))
    }

    return config