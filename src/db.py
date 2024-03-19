import os
import logging
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Neo4jConnection:
    _driver = None

    @staticmethod
    def load_environment_variables():
        dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        load_status = load_dotenv(dotenv_path)
        
        if not load_status:
            logger.error('Failed to load the Neo4j connection file at: %s', dotenv_path)
            raise RuntimeError('Neo4j environment variables not loaded.')
        else:
            logger.info('Neo4j environment variables successfully loaded from: %s', dotenv_path)


    @staticmethod
    def get_driver():
        if Neo4jConnection._driver is None:
            # Load environment variables from the specified connection file
            Neo4jConnection.load_environment_variables()

            uri = os.getenv("NEO4J_URI")
            username = os.getenv("NEO4J_USERNAME")
            password = os.getenv("NEO4J_PASSWORD")

            if None in [uri, username, password]:
                logger.error('One or more Neo4j environment variables are missing.')
                raise RuntimeError('Missing Neo4j environment variables.')

            auth = (username, password)
            try:
                Neo4jConnection._driver = GraphDatabase.driver(uri, auth=auth)
                Neo4jConnection._driver.verify_connectivity()
                logger.info('Successfully connected to Neo4j.')
            except Exception as e:
                logger.error('Failed to connect to Neo4j: %s', e)
                raise

        return Neo4jConnection._driver


    @staticmethod
    def close_driver():
        if Neo4jConnection._driver is not None:
            Neo4jConnection._driver.close()
            Neo4jConnection._driver = None
            logger.info('Neo4j driver closed.')
