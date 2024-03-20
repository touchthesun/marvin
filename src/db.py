import logging
from neo4j import GraphDatabase

from config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Neo4jConnection:
    _driver = None

    @staticmethod
    def get_driver():
        if Neo4jConnection._driver is None:

            uri = NEO4J_URI
            username = NEO4J_USERNAME
            password = NEO4J_PASSWORD

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
