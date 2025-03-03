import socket
from typing import Dict, Any

from core.utils.logger import get_logger
from test_harness.mocks.api import RealAPIService
from test_harness.mocks.neo4j import DockerNeo4jService
from test_harness.mocks.neo4j import MockNeo4jService
from test_harness.mocks.browser import BrowserSimulator
from test_harness.mocks.llm import LLMMockService
from test_harness.mocks.api import MockAPIService

class TestEnvironmentManager:
    """
    Manages the test environment setup and teardown, including starting
    and stopping services needed for testing.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the environment manager.
        
        Args:
            config: Test configuration dictionary
        """
        self.config = config
        self.logger = get_logger("test.environment", config.get("log_level"))
        self.active_services = []
    
    async def setup_environment(self) -> Dict[str, Any]:
        """
        Set up the complete test environment.
        
        Returns:
            Dictionary of initialized service instances
        """
        self.logger.info("Setting up test environment")
        
        environment = {}
        
        try:
            # Start Neo4j test instance
            self.logger.info("Setting up Neo4j")
            neo4j = await self._start_neo4j()
            environment["neo4j"] = neo4j
            self.active_services.append(neo4j)
            
            # Start API server
            self.logger.info("Setting up API server")
            api_server = await self._start_api_server(neo4j)
            environment["api_server"] = api_server
            self.active_services.append(api_server)
            
            # Start LLM mock server
            self.logger.info("Setting up LLM mock")
            llm_mock = await self._start_llm_mock()
            environment["llm_mock"] = llm_mock
            self.active_services.append(llm_mock)
            
            # Set up browser simulator
            self.logger.info("Setting up browser simulator")
            browser_simulator = await self._start_browser_simulator()
            environment["browser_simulator"] = browser_simulator
            self.active_services.append(browser_simulator)
            
            self.logger.info("Test environment setup complete")
            return environment
            
        except Exception as e:
            self.logger.error(f"Environment setup failed: {str(e)}")
            # Clean up any services that were started
            await self.teardown_environment()
            raise
    
    async def teardown_environment(self):
        """
        Clean up the test environment by shutting down all services.
        """
        self.logger.info("Tearing down test environment")
        
        # Shutdown services in reverse order (dependencies first)
        for service in reversed(self.active_services):
            try:
                service_name = service.__class__.__name__
                self.logger.info(f"Shutting down {service_name}")
                await service.shutdown()
            except Exception as e:
                self.logger.warning(f"Error shutting down service {service_name}: {str(e)}")
        
        self.active_services = []
        self.logger.info("Environment teardown complete")
    
    async def _start_neo4j(self):
        """
        Start a Neo4j test instance.
        
        Returns:
            Neo4j service interface (mock or real)
        """
        neo4j_config = self.config.get("neo4j", {})
        
        if self.config.get("use_docker", False):
            return await DockerNeo4jService(neo4j_config).initialize()
        else:
            return await MockNeo4jService(neo4j_config).initialize()
    
    async def _start_api_server(self, neo4j):
        """
        Start the API server with test configuration.
        
        Args:
            neo4j: Neo4j service instance
            
        Returns:
            API service interface (mock or real)
        """
        api_config = self.config.get("api", {})
        
        # Set up server config with Neo4j connection info
        server_config = {
            "neo4j_uri": neo4j.uri,
            "neo4j_username": neo4j.username,
            "neo4j_password": neo4j.password,
            "environment": "test",
            "port": self._get_free_port()
        }
        
        if self.config.get("use_real_api", False):
            return await RealAPIService({**api_config, **server_config}).initialize()
        else:
            return await MockAPIService({**api_config, **server_config}).initialize()
    
    async def _start_llm_mock(self):
        """
        Start the LLM mock service.
        
        Returns:
            LLM mock service instance
        """
        llm_config = self.config.get("llm", {})
    
        return await LLMMockService(llm_config).initialize()
    
    async def _start_browser_simulator(self):
        """
        Set up the browser simulator.
        
        Returns:
            Browser simulator instance
        """
        browser_config = self.config.get("browser", {})
        
        return await BrowserSimulator(browser_config).initialize()
    
    def _get_free_port(self) -> int:
        """Find and return an available port number."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            return s.getsockname()[1]