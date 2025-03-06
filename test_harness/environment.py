import socket
from typing import Dict, Any
import traceback

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
        self.logger.info("Initializing test environment manager")
        self.active_services = []
        
        # Log configuration details
        self.logger.debug(f"Environment mode: {self.config.get('environment', 'test')}")
        self.logger.debug(f"Use Docker: {self.config.get('use_docker', False)}")
        self.logger.debug(f"Use real API: {self.config.get('use_real_api', False)}")
        
        neo4j_config = self.config.get("neo4j", {})
        self.logger.debug(f"Neo4j configuration: use_mock={neo4j_config.get('use_mock', True)}")
    
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
            self.logger.debug(f"Neo4j service started: {neo4j.__class__.__name__}")
            environment["neo4j"] = neo4j
            self.active_services.append(neo4j)
            
            # Start API server
            self.logger.info("Setting up API server")
            api_server = await self._start_api_server(neo4j)
            self.logger.debug(f"API service started: {api_server.__class__.__name__}")
            environment["api_server"] = api_server
            self.active_services.append(api_server)
            
            # Start LLM mock server
            self.logger.info("Setting up LLM mock")
            llm_mock = await self._start_llm_mock()
            self.logger.debug(f"LLM mock service started: {llm_mock.__class__.__name__}")
            environment["llm_mock"] = llm_mock
            self.active_services.append(llm_mock)
            
            # Set up browser simulator
            self.logger.info("Setting up browser simulator")
            browser_simulator = await self._start_browser_simulator()
            self.logger.debug(f"Browser simulator started: {browser_simulator.__class__.__name__}")
            environment["browser_simulator"] = browser_simulator
            self.active_services.append(browser_simulator)
            
            self.logger.info("Test environment setup complete with services:")
            for i, service in enumerate(self.active_services):
                self.logger.info(f"  {i+1}. {service.__class__.__name__}")
                
            return environment
            
        except Exception as e:
            self.logger.error(f"Environment setup failed: {str(e)}")
            self.logger.error(traceback.format_exc())
            # Clean up any services that were started
            await self.teardown_environment()
            raise
    
    async def teardown_environment(self):
        """
        Clean up the test environment by shutting down all services.
        """
        self.logger.info(f"Tearing down test environment with {len(self.active_services)} active services")
        
        # Shutdown services in reverse order (dependencies first)
        for i, service in enumerate(reversed(self.active_services)):
            try:
                service_name = service.__class__.__name__
                self.logger.info(f"Shutting down {service_name} ({len(self.active_services)-i}/{len(self.active_services)})")
                await service.shutdown()
                self.logger.debug(f"Service {service_name} shutdown completed")
            except Exception as e:
                self.logger.error(f"Error shutting down service {service_name}: {str(e)}")
                self.logger.error(traceback.format_exc())
        
        self.active_services = []
        self.logger.info("Environment teardown complete")
    
    async def _start_neo4j(self):
        """
        Start a Neo4j test instance.
        
        Returns:
            Neo4j service interface (mock or real)
        """
        neo4j_config = self.config.get("neo4j", {})
        self.logger.debug(f"Starting Neo4j with config: {neo4j_config}")
        
        if self.config.get("use_docker", False):
            self.logger.info("Using Docker Neo4j service")
            service = DockerNeo4jService(neo4j_config)
            self.logger.debug("DockerNeo4jService created")
        else:
            # Use mock Neo4j implementation
            self.logger.info("Using mock Neo4j service")
            service = MockNeo4jService(neo4j_config)
            self.logger.debug("MockNeo4jService created")
        
        try:
            self.logger.debug("Initializing Neo4j service")
            initialized_service = await service.initialize()
            self.logger.debug(f"Neo4j service initialized: {initialized_service.uri}")
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize Neo4j service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    async def _start_api_server(self, neo4j):
        """
        Start the API server with test configuration.
        
        Args:
            neo4j: Neo4j service instance
            
        Returns:
            API service interface (mock or real)
        """
        api_config = self.config.get("api", {})
        self.logger.debug(f"Starting API server with config: {api_config}")
        
        # Set up server config with Neo4j connection info
        free_port = self._get_free_port()
        self.logger.debug(f"Found free port for API server: {free_port}")
        
        server_config = {
            "neo4j_uri": neo4j.uri,
            "neo4j_username": neo4j.username,
            "neo4j_password": neo4j.password,
            "environment": "test",
            "port": free_port
        }
        
        self.logger.debug(f"API server config: {server_config}")
        
        try:
            if self.config.get("use_real_api", False):
                self.logger.info("Using real API service")
                service = RealAPIService({**api_config, **server_config})
                self.logger.debug("RealAPIService created")
            else:
                self.logger.info("Using mock API service")
                service = MockAPIService({**api_config, **server_config})
                self.logger.debug("MockAPIService created")
            
            self.logger.debug("Initializing API service")
            initialized_service = await service.initialize()
            self.logger.debug(f"API service initialized on port {free_port}")
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize API service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    async def _start_llm_mock(self):
        """
        Start the LLM mock service.
        
        Returns:
            LLM mock service instance
        """
        llm_config = self.config.get("llm", {})
        self.logger.debug(f"Starting LLM mock with config: {llm_config}")
        
        try:
            service = LLMMockService(llm_config)
            self.logger.debug("LLMMockService created")
            
            self.logger.debug("Initializing LLM mock service")
            initialized_service = await service.initialize()
            
            # Log endpoint if available
            if hasattr(initialized_service, "url"):
                self.logger.debug(f"LLM mock service initialized at {initialized_service.url}")
            else:
                self.logger.debug("LLM mock service initialized")
                
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize LLM mock service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    async def _start_browser_simulator(self):
        """
        Set up the browser simulator.
        
        Returns:
            Browser simulator instance
        """
        browser_config = self.config.get("browser", {})
        self.logger.debug(f"Starting browser simulator with config: {browser_config}")
        
        try:

            service = BrowserSimulator(browser_config)
            self.logger.debug("BrowserSimulator created")
            
            self.logger.debug("Initializing browser simulator")
            initialized_service = await service.initialize()
            
            # Log browser state
            tabs_count = len(getattr(initialized_service, "tabs", []))
            bookmarks_count = len(getattr(initialized_service, "bookmarks", []))
            self.logger.debug(f"Browser simulator initialized with {tabs_count} tabs and {bookmarks_count} bookmarks")
            
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize browser simulator: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    def _get_free_port(self) -> int:
        """Find and return an available port number."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            port = s.getsockname()[1]
            self.logger.debug(f"Found free port: {port}")
            return port