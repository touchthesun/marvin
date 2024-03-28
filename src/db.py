import logging
from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

# Configure logging
logger = logging.getLogger(__name__)

class Neo4jConnection:
    _driver = None

    @classmethod
    def get_driver(cls):
        if cls._driver is None:
            if None in [NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD]:
                logger.error('One or more Neo4j environment variables are missing.')
                raise RuntimeError('Missing Neo4j environment variables.')

            try:
                cls._driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
                cls._driver.verify_connectivity()
                logger.info('Successfully connected to Neo4j.')
            except Exception as e:
                logger.error('Failed to connect to Neo4j: %s', e)
                raise
        return cls._driver

    @classmethod
    def close_driver(cls):
        if cls._driver is not None:
            cls._driver.close()
            cls._driver = None
            logger.info('Neo4j driver closed.')

    @classmethod
    def execute_query(cls, query, parameters=None):
        def _execute_tx(tx, query, parameters):
            result = tx.run(query, parameters)
            return [record for record in result]
        
        driver = cls.get_driver()
        with driver.session() as session:
            return session.write_transaction(_execute_tx, query, parameters)
