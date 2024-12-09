import logging
from typing import Dict, List, Optional
from datetime import datetime
from neo4j import GraphDatabase
from utils.config import load_config


# Config
config = load_config()
NEO4J_URI = config["neo4j_uri"]
NEO4J_USERNAME = config ["neo4j_username"]
NEO4J_PASSWORD = config ["neo4j_password"]

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
        

class GraphManager:
    """Manages knowledge graph operations using Neo4j"""
    
    @staticmethod
    def create_site(url: str, name: str, description: Optional[str] = None) -> Dict:
        try:
            logger.info(f"Creating/updating site node for URL: {url}")
            query = """
            MERGE (s:Site {url: $url})
            SET s.name = $name,
                s.description = $description,
                s.last_crawled = datetime()
            RETURN s
            """
            parameters = {
                "url": url,
                "name": name,
                "description": description
            }
            result = Neo4jConnection.execute_query(query, parameters)
            if result:
                logger.debug(f"Successfully created/updated site: {url}")
                return result[0]['s']
            logger.warning(f"No result returned for site creation: {url}")
            return None
        except Exception as e:
            logger.error(f"Error creating site {url}: {str(e)}")
            raise

    @staticmethod
    def create_page(url: str, title: str, content_summary: str, site_url: str, metadata: Dict) -> Dict:
        try:
            logger.info(f"Creating/updating page node for URL: {url}")
            query = """
            MATCH (site:Site {url: $site_url})
            MERGE (p:Page {url: $url})
            SET p.title = $title,
                p.content_summary = $content_summary,
                p.last_accessed = datetime(),
                p.metadata = $metadata
            MERGE (site)-[:CONTAINS]->(p)
            RETURN p
            """
            parameters = {
                "url": url,
                "title": title,
                "content_summary": content_summary,
                "site_url": site_url,
                "metadata": metadata
            }
            result = Neo4jConnection.execute_query(query, parameters)
            if result:
                logger.debug(f"Successfully created/updated page: {url}")
                return result[0]['p']
            logger.warning(f"No result returned for page creation: {url}")
            return None
        except Exception as e:
            logger.error(f"Error creating page {url}: {str(e)}")
            raise

    @staticmethod
    def create_relationship(source_id: str, target_id: str, relationship_type: str, 
                          strength: float, evidence: str) -> Dict:
        try:
            logger.info(f"Creating relationship {relationship_type} between nodes {source_id} and {target_id}")
            query = """
            MATCH (source), (target)
            WHERE ID(source) = $source_id AND ID(target) = $target_id
            MERGE (source)-[r:$relationship_type]->(target)
            SET r.strength = $strength,
                r.evidence = $evidence,
                r.created_at = datetime()
            RETURN r
            """
            parameters = {
                "source_id": source_id,
                "target_id": target_id,
                "relationship_type": relationship_type,
                "strength": strength,
                "evidence": evidence
            }
            result = Neo4jConnection.execute_query(query, parameters)
            if result:
                logger.debug(f"Successfully created relationship: {relationship_type}")
                return result[0]['r']
            logger.warning(f"No result returned for relationship creation between {source_id} and {target_id}")
            return None
        except Exception as e:
            logger.error(f"Error creating relationship: {str(e)}")
            raise

    @staticmethod
    def get_page_by_url(url: str) -> Optional[Dict]:
        try:
            logger.info(f"Fetching page with URL: {url}")
            query = """
            MATCH (p:Page {url: $url})
            RETURN p
            """
            result = Neo4jConnection.execute_query(query, {"url": url})
            if result:
                logger.debug(f"Successfully retrieved page: {url}")
                return result[0]['p']
            logger.debug(f"No page found for URL: {url}")
            return None
        except Exception as e:
            logger.error(f"Error fetching page {url}: {str(e)}")
            raise

    @staticmethod
    def update_page_access(url: str) -> None:
        try:
            logger.info(f"Updating last_accessed for page: {url}")
            query = """
            MATCH (p:Page {url: $url})
            SET p.last_accessed = datetime()
            """
            Neo4jConnection.execute_query(query, {"url": url})
            logger.debug(f"Successfully updated last_accessed for page: {url}")
        except Exception as e:
            logger.error(f"Error updating page access {url}: {str(e)}")
            raise

    @staticmethod
    def get_related_pages(url: str, limit: int = 10) -> List[Dict]:
        try:
            logger.info(f"Fetching related pages for URL: {url} (limit: {limit})")
            query = """
            MATCH (p:Page {url: $url})-[r]-(related:Page)
            RETURN related, TYPE(r) as relationship_type, r.strength as strength
            ORDER BY r.strength DESC
            LIMIT $limit
            """
            parameters = {
                "url": url,
                "limit": limit
            }
            result = Neo4jConnection.execute_query(query, parameters)
            logger.debug(f"Found {len(result)} related pages for: {url}")
            return result
        except Exception as e:
            logger.error(f"Error fetching related pages for {url}: {str(e)}")
            raise

    @staticmethod
    def search_graph(query_params: Dict, node_type: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """
        Search the knowledge graph using flexible parameters
        
        Args:
            query_params: Dict of property:value pairs to search for
            node_type: Optional node label to restrict search (e.g., 'Page', 'Site')
            limit: Maximum number of results to return
        """
        try:
            logger.info(f"Searching graph with params: {query_params}, type: {node_type}")
            
            # Build dynamic query based on parameters
            where_clauses = []
            parameters = {"limit": limit}
            
            for key, value in query_params.items():
                param_key = f"param_{key}"
                # Handle different types of searches
                if isinstance(value, str) and '%' in value:
                    where_clauses.append(f"n.{key} =~ ${param_key}")  # Regex match
                else:
                    where_clauses.append(f"n.{key} = ${param_key}")
                parameters[param_key] = value

            # Construct full query
            node_label = f":{node_type}" if node_type else ""
            where_clause = " AND ".join(where_clauses) if where_clauses else "true"
            
            query = f"""
            MATCH (n{node_label})
            WHERE {where_clause}
            RETURN n
            LIMIT $limit
            """
            
            result = Neo4jConnection.execute_query(query, parameters)
            logger.debug(f"Search returned {len(result)} results")
            return [record['n'] for record in result]
        
        except Exception as e:
            logger.error(f"Error searching graph: {str(e)}")
            raise

    @staticmethod
    def update_node(node_id: str, properties: Dict) -> Dict:
        """
        Update properties of an existing node
        
        Args:
            node_id: Internal Neo4j ID of the node
            properties: Dictionary of properties to update
        """
        try:
            logger.info(f"Updating node {node_id} with properties: {properties}")
            
            # Build dynamic SET clause
            set_clauses = []
            parameters = {"node_id": node_id}
            
            for key, value in properties.items():
                param_key = f"param_{key}"
                set_clauses.append(f"n.{key} = ${param_key}")
                parameters[param_key] = value
            
            query = f"""
            MATCH (n)
            WHERE ID(n) = $node_id
            SET {', '.join(set_clauses)}
            RETURN n
            """
            
            result = Neo4jConnection.execute_query(query, parameters)
            if result:
                logger.debug(f"Successfully updated node: {node_id}")
                return result[0]['n']
            logger.warning(f"No node found for ID: {node_id}")
            return None
        
        except Exception as e:
            logger.error(f"Error updating node {node_id}: {str(e)}")
            raise

    @staticmethod
    def update_relationship(source_id: str, target_id: str, relationship_type: str, 
                        properties: Dict) -> Dict:
        """
        Update properties of an existing relationship
        
        Args:
            source_id: ID of source node
            target_id: ID of target node
            relationship_type: Type of relationship to update
            properties: Dictionary of properties to update
        """
        try:
            logger.info(f"Updating relationship {relationship_type} between {source_id} and {target_id}")
            
            # Build dynamic SET clause
            set_clauses = []
            parameters = {
                "source_id": source_id,
                "target_id": target_id,
                "relationship_type": relationship_type
            }
            
            for key, value in properties.items():
                param_key = f"param_{key}"
                set_clauses.append(f"r.{key} = ${param_key}")
                parameters[param_key] = value
            
            query = f"""
            MATCH (source)-[r:{relationship_type}]->(target)
            WHERE ID(source) = $source_id AND ID(target) = $target_id
            SET {', '.join(set_clauses)}
            RETURN r
            """
            
            result = Neo4jConnection.execute_query(query, parameters)
            if result:
                logger.debug(f"Successfully updated relationship: {relationship_type}")
                return result[0]['r']
            logger.warning(f"No relationship found between {source_id} and {target_id}")
            return None
        
        except Exception as e:
            logger.error(f"Error updating relationship: {str(e)}")
            raise