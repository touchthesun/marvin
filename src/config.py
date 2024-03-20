import os
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path)

# Neo4j Database configurations
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# OpenAI API Key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Logging Config
LOGGING_LEVEL = os.getenv("LOGGING_LEVEL")