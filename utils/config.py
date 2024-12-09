import os
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path)

def load_config():
    """
    Loads and returns the application configuration based on environment variables.
    """
    config = {
        "logging_level": os.getenv("LOGGING_LEVEL"),
        "enable_metadata_comparison": os.getenv("ENABLE_METADATA_COMPARISON", "False").lower() in ("true", "1", "t"),
        "openai_api_key": os.getenv('OPENAI_API_KEY'),
        "anthropic_api_key": os.getenv('ANTHROPIC_API_KEY'),
        "max_tokens": os.getenv('OPENAI_MAX_TOKENS'),
        "db_mode": os.getenv('DB_MODE', 'LOCAL'),
        "streamlit_mode": os.getenv('STREAMLIT_MODE', 'TERMINAL'),
        "neo4j_uri": os.getenv('NEO4J_URI_LOCAL') if os.getenv('DB_MODE') == 'LOCAL' else os.getenv('NEO4J_URI_REMOTE'),
        "neo4j_username": os.getenv('NEO4J_USERNAME_LOCAL') if os.getenv('DB_MODE') == 'LOCAL' else os.getenv('NEO4J_USERNAME_REMOTE'),
        "neo4j_password": os.getenv('NEO4J_PASSWORD_LOCAL') if os.getenv('DB_MODE') == 'LOCAL' else os.getenv('NEO4J_PASSWORD_REMOTE'),
        "model_name": os.getenv('MODEL_NAME'),
        "serpapi_api_key": os.getenv('SERP_API_KEY'),
        "tavily_api_key": os.getenv('TAVILY_API_KEY')
    }
    return config