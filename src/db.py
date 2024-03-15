# db.py
from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

class Neo4jConnection:
    _driver = None

    @staticmethod
    def get_driver():
        if Neo4jConnection._driver is None:
            load_status = load_dotenv("NEO4J_CONNECTION_FILE")
            if not load_status:
                raise RuntimeError('Environment variables not loaded.')

            uri = os.getenv("NEO4J_URI")
            auth = (os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD"))
            Neo4jConnection._driver = GraphDatabase.driver(uri, auth=auth)
            try:
                Neo4jConnection._driver.verify_connectivity()
            except Exception as e:
                print(f"Failed to connect to Neo4j: {e}")
                raise

        return Neo4jConnection._driver

    @staticmethod
    def close_driver():
        if Neo4jConnection._driver is not None:
            Neo4jConnection._driver.close()
            Neo4jConnection._driver = None
