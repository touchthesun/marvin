import os
import json
import asyncio
import re
import docker
from typing import Dict, Any, Optional

from core.utils.logger import get_logger
from test_harness.utils.helpers import wait_for_service, find_free_port

class BaseMockService:
    """Base class for all mock services."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the mock service.
        
        Args:
            config: Service configuration
        """
        self.config = config
        self.logger = get_logger(f"test.mock.{self.__class__.__name__}")
        
    async def initialize(self):
        """Initialize the service."""
        self.logger.info(f"Initializing {self.__class__.__name__}")
        return self
        
    async def shutdown(self):
        """Shutdown the service."""
        self.logger.info(f"Shutting down {self.__class__.__name__}")

class MockNeo4jService(BaseMockService):
    """
    Mock implementation of Neo4j for testing.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Neo4j mock.
        
        Args:
            config: Neo4j configuration
        """
        super().__init__(config)
        self.data = {
            "nodes": {},
            "relationships": []
        }
        self.uri = "mock://localhost:7687"
        self.username = "neo4j"
        self.password = "password"
    
    async def initialize(self):
        """
        Initialize the mock Neo4j service.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        # Load initial data if specified
        initial_data = self.config.get("initial_data")
        if initial_data:
            await self.load_test_data(initial_data)
            
        return self
    
    async def shutdown(self):
        """Shut down the mock Neo4j service."""
        await super().shutdown()
        self.clear_data()
    
    async def clear_data(self):
        """Clear all data in the mock database."""
        self.logger.info("Clearing mock Neo4j data")
        self.data = {
            "nodes": {},
            "relationships": []
        }
    
    async def load_test_data(self, data_file: str):
        """
        Load test data into the mock database.
        
        Args:
            data_file: Path to JSON data file
        """
        self.logger.info(f"Loading test data from {data_file}")
        
        try:
            with open(data_file, 'r') as f:
                test_data = json.load(f)
            
            self.data = test_data
            self.logger.info(
                f"Loaded {len(test_data.get('nodes', {}))} nodes and "
                f"{len(test_data.get('relationships', []))} relationships"
            )
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.error(f"Failed to load test data: {str(e)}")
    
    async def execute_query(self, query: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute a Cypher query against the mock database.
        
        Args:
            query: Cypher query string
            params: Query parameters
            
        Returns:
            Query results
        """
        self.logger.debug(f"Executing query: {query}")
        
        # Simple query interpreter for testing
        if "MATCH" in query and "RETURN" in query:
            return await self._handle_match_query(query, params)
        elif "CREATE" in query:
            return await self._handle_create_query(query, params)
        elif "DELETE" in query:
            return await self._handle_delete_query(query, params)
        elif "MERGE" in query:
            return await self._handle_merge_query(query, params)
        else:
            self.logger.warning(f"Unhandled query type: {query}")
            return {"results": [], "summary": {"counters": {}}}
    
    async def _handle_match_query(self, query: str, params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Handle MATCH queries with a simple parser.
        
        Args:
            query: Cypher query
            params: Query parameters
            
        Returns:
            Query results
        """
        self.logger.debug("Handling MATCH query")
        
        # Very basic implementation - just simulates returning some results
        # In a real implementation, this would actually parse the query
        results = []
        
        # Extract RETURN variables
        return_vars = re.search(r'RETURN\s+(.+?)(?:$|\s+(?:LIMIT|ORDER))', query)
        if return_vars:
            vars_str = return_vars.group(1).strip()
            # Split by comma, handling simple cases only
            vars_list = [v.strip() for v in vars_str.split(',')]
            
            # Handle LIMIT
            limit_match = re.search(r'LIMIT\s+(\d+)', query)
            limit = int(limit_match.group(1)) if limit_match else None
            
            # Create some sample results
            if "n" in vars_list:  # Node query
                results = [{"n": node} for node in list(self.data["nodes"].values())[:10]]
            elif "r" in vars_list:  # Relationship query
                results = [{"r": rel} for rel in self.data["relationships"][:10]]
            else:
                # Just return some sample data
                results = [{"result": f"Mock result {i}"} for i in range(5)]
            
            # Apply limit
            if limit is not None:
                results = results[:limit]
        
        return {
            "results": results,
            "summary": {
                "counters": {
                    "nodes_returned": len(results)
                }
            }
        }
    
    async def _handle_create_query(self, query: str, params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Handle CREATE queries.
        
        Args:
            query: Cypher query
            params: Query parameters
            
        Returns:
            Query results
        """
        self.logger.debug("Handling CREATE query")
        
        # Extract node creation pattern
        node_match = re.search(r'CREATE\s+\((\w+):(\w+)\s*({.+?})\)', query)
        if node_match:
            var_name = node_match.group(1)
            label = node_match.group(2)
            props_str = node_match.group(3)
            
            # Create a new node
            node_id = f"n{len(self.data['nodes']) + 1}"
            
            # Simple handling of properties - in reality we'd parse the properties
            # from the query or use the parameters
            properties = {}
            if params and f"{var_name}Props" in params:
                properties = params[f"{var_name}Props"]
            
            # Create node
            node = {
                "id": node_id,
                "labels": [label],
                "properties": properties
            }
            
            self.data["nodes"][node_id] = node
            
            return {
                "results": [],
                "summary": {
                    "counters": {
                        "nodes_created": 1
                    }
                }
            }
        
        # Handle relationship creation
        rel_match = re.search(r'CREATE\s+\(\w+\)-\[:(\w+)\]->\(\w+\)', query)
        if rel_match:
            rel_type = rel_match.group(1)
            
            # Create a new relationship
            rel_id = f"r{len(self.data['relationships']) + 1}"
            
            # In a real implementation, we'd extract the node references too
            start_node_id = list(self.data["nodes"].keys())[0] if self.data["nodes"] else "n1"
            end_node_id = list(self.data["nodes"].keys())[-1] if len(self.data["nodes"]) > 1 else "n1"
            
            rel = {
                "id": rel_id,
                "type": rel_type,
                "startNode": start_node_id,
                "endNode": end_node_id,
                "properties": {}
            }
            
            self.data["relationships"].append(rel)
            
            return {
                "results": [],
                "summary": {
                    "counters": {
                        "relationships_created": 1
                    }
                }
            }
        
        # Default response if no pattern matched
        return {
            "results": [],
            "summary": {
                "counters": {}
            }
        }
    
    async def _handle_delete_query(self, query: str, params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Handle DELETE queries.
        
        Args:
            query: Cypher query
            params: Query parameters
            
        Returns:
            Query results
        """
        self.logger.debug("Handling DELETE query")
        
        # In a real implementation, we'd parse the query to determine what to delete
        # For simplicity, let's just simulate deleting something
        
        # Delete a node if we have any
        node_count = 0
        if self.data["nodes"]:
            # Get first node key and delete it
            node_id = next(iter(self.data["nodes"]))
            del self.data["nodes"][node_id]
            node_count = 1
        
        return {
            "results": [],
            "summary": {
                "counters": {
                    "nodes_deleted": node_count
                }
            }
        }
    
    async def _handle_merge_query(self, query: str, params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Handle MERGE queries.
        
        Args:
            query: Cypher query
            params: Query parameters
            
        Returns:
            Query results
        """
        self.logger.debug("Handling MERGE query")
        
        # Simulate MERGE by creating a node if it doesn't exist
        created = False
        
        # Extract node pattern
        node_match = re.search(r'MERGE\s+\((\w+):(\w+)\s*({.+?})\)', query)
        if node_match:
            var_name = node_match.group(1)
            label = node_match.group(2)
            
            # Create a new node
            node_id = f"n{len(self.data['nodes']) + 1}"
            
            # Simple handling of properties
            properties = {}
            if params and f"{var_name}Props" in params:
                properties = params[f"{var_name}Props"]
            
            # Check if a similar node exists (very simplified)
            existing = False
            for node in self.data["nodes"].values():
                if label in node["labels"]:
                    # Check if properties match (simplified)
                    match = True
                    for key, value in properties.items():
                        if node["properties"].get(key) != value:
                            match = False
                            break
                    
                    if match:
                        existing = True
                        break
            
            if not existing:
                # Create node
                node = {
                    "id": node_id,
                    "labels": [label],
                    "properties": properties
                }
                
                self.data["nodes"][node_id] = node
                created = True
            
            return {
                "results": [],
                "summary": {
                    "counters": {
                        "nodes_created": 1 if created else 0
                    }
                }
            }
        
        # Default response
        return {
            "results": [],
            "summary": {
                "counters": {}
            }
        }

class DockerNeo4jService(BaseMockService):
    """
    Runs a real Neo4j instance in Docker for testing.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Docker Neo4j service.
        
        Args:
            config: Neo4j configuration
        """
        super().__init__(config)
        self.container = None
        self.uri = None
        self.username = "neo4j"
        self.password = "testpassword"
        self.bolt_port = None
        self.http_port = None
    
    async def initialize(self):
        """
        Start a Neo4j Docker container.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        try:
            # Import docker here to avoid dependency if not used
            import docker
            
            self.logger.info("Starting Neo4j Docker container")
            client = docker.from_env()
            
            # Find available ports
            self.bolt_port = find_free_port(7687, 7700)
            self.http_port = find_free_port(7474, 7500)
            
            # Set password from config
            self.password = self.config.get("password", "testpassword")
            
            # Start container
            self.container = client.containers.run(
                "neo4j:4.4",
                detach=True,
                environment={
                    "NEO4J_AUTH": f"{self.username}/{self.password}",
                    "NEO4J_ACCEPT_LICENSE_AGREEMENT": "yes"
                },
                ports={
                    '7687/tcp': self.bolt_port,
                    '7474/tcp': self.http_port
                }
            )
            
            self.uri = f"bolt://localhost:{self.bolt_port}"
            self.logger.info(f"Neo4j container started, available at {self.uri}")
            
            # Wait for Neo4j to be ready
            if not await wait_for_service('localhost', self.bolt_port):
                raise RuntimeError("Neo4j failed to start in the expected time")
            
            # Wait a bit more for Neo4j to initialize
            await asyncio.sleep(5)
            
            # Load test data if specified
            initial_data = self.config.get("initial_data")
            if initial_data:
                await self._load_test_data_to_container(initial_data)
            
            return self
            
        except Exception as e:
            self.logger.error(f"Failed to start Neo4j container: {str(e)}")
            
            # Clean up if container was started
            if hasattr(self, 'container') and self.container:
                try:
                    self.container.stop()
                    self.container.remove()
                except Exception as cleanup_error:
                    self.logger.error(f"Error cleaning up container: {str(cleanup_error)}")
            
            raise RuntimeError(f"Failed to initialize Docker Neo4j service: {str(e)}")
    
    async def shutdown(self):
        """Shut down the Neo4j Docker container."""
        await super().shutdown()
        
        if self.container:
            try:
                self.logger.info("Stopping Neo4j container")
                self.container.stop()
                self.container.remove()
                self.container = None
            except Exception as e:
                self.logger.error(f"Error stopping Neo4j container: {str(e)}")
    
    async def clear_data(self):
        """Clear all data in the Neo4j database."""
        self.logger.info("Clearing Neo4j data")
        
        # Execute MATCH (n) DETACH DELETE n in the container
        if self.container:
            try:
                # Use cypher-shell to execute the query
                cmd = [
                    "cypher-shell", 
                    "-a", f"bolt://localhost:7687", 
                    "-u", self.username, 
                    "-p", self.password, 
                    "-d", "neo4j",
                    "MATCH (n) DETACH DELETE n;"
                ]
                
                self.container.exec_run(cmd)
                
            except Exception as e:
                self.logger.error(f"Error clearing Neo4j data: {str(e)}")
    
    async def _load_test_data_to_container(self, data_file: str):
        """
        Load test data into the Neo4j container.
        
        Args:
            data_file: Path to Cypher script file
        """
        self.logger.info(f"Loading test data from {data_file}")
        
        try:
            # Check if data file exists
            if not os.path.exists(data_file):
                self.logger.error(f"Data file not found: {data_file}")
                return
            
            # Copy the data file to the container
            with open(data_file, 'r') as f:
                cypher_script = f.read()
            
            # Save script to a temp file
            temp_script = "/tmp/import.cypher"
            with open(temp_script, 'w') as f:
                f.write(cypher_script)
            
            client = docker.from_env()
            container = client.containers.get(self.container.id)
            
            # Execute cypher-shell to run the script
            cmd = [
                "cypher-shell", 
                "-a", f"bolt://localhost:7687", 
                "-u", self.username, 
                "-p", self.password, 
                "-f", "/tmp/import.cypher"
            ]
            
            exec_result = container.exec_run(cmd)
            if exec_result.exit_code != 0:
                self.logger.error(f"Error loading data: {exec_result.output.decode()}")
            else:
                self.logger.info("Test data loaded successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to load test data: {str(e)}")