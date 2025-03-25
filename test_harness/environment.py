import socket
import os
import traceback

from core.utils.logger import get_logger
from test_harness.config_model import TestConfig
from test_harness.services.mock_neo4j_service import MockNeo4jService
from test_harness.services.real_neo4j_svc import RealNeo4jService
from test_harness.services.mock_browser_service import BrowserSimulator
from test_harness.services.mock_llm_service import MockLLMService
from test_harness.services.real_llm_service import RealLLMService
from test_harness.services.mock_api_service import MockAPIService
from test_harness.services.real_api_service import RealAPIService
from test_harness.services.real_browser_service import RealBrowserService




class TestEnvironmentManager:
    """
    Manages the test environment setup and teardown, including starting
    and stopping services needed for testing.
    """
    
    def __init__(self, config: TestConfig):
        """Initialize the environment manager."""
        self.config = config
        self.logger = get_logger("test.environment", config.logging_level)
        self.logger.info("Initializing test environment manager")
        self.active_services = []
        
        # Log configuration details
        self.logger.debug(f"Environment mode: {self.config.environment}")
        self.logger.debug(f"Use real API: {self.config.use_real_api}")
        
        neo4j_config = self.config.neo4j
        self.logger.debug(f"Neo4j configuration: use_real={neo4j_config.get('use_real', False)}")
    
    async def setup_environment(self):
        """Set up the complete test environment."""
        self.logger.info("Setting up test environment")
        
        environment = {}
        
        try:
            # Start Neo4j test instance
            neo4j = await self._start_neo4j()
            environment["neo4j"] = neo4j
            self.active_services.append(neo4j)
            
            # Start API server
            api_server = await self._start_api_server(neo4j)
            environment["api"] = api_server
            self.active_services.append(api_server)
            
            # Set up browser simulator or real browser service
            browser_service = await self._start_browser_service()
            environment["browser"] = browser_service
            self.active_services.append(browser_service)
            
            # Start LLM mock server (if needed)
            # llm_mock = await self._start_llm_mock()
            # environment["llm"] = llm_mock
            # self.active_services.append(llm_mock)
            
            self.logger.info("Test environment setup complete")
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
        """Start a Neo4j instance based on configuration."""
        neo4j_config = self.config.neo4j
        self.logger.debug(f"Starting Neo4j with config: {neo4j_config}")
        
        # Check if we should use real Neo4j
        if neo4j_config.get("use_real", False):
            self.logger.info("Using real Neo4j service")
            service = RealNeo4jService(neo4j_config)
        else:
            self.logger.info("Using mock Neo4j service")
            service = MockNeo4jService(neo4j_config)
        
        try:
            initialized_service = await service.initialize()
            self.logger.debug(f"Neo4j service initialized")
            
            # Apply schema if configured
            if "schema_script" in neo4j_config and neo4j_config["schema_script"]:
                self.logger.info(f"Applying schema from {neo4j_config['schema_script']}")
                await initialized_service.apply_schema(neo4j_config["schema_script"])
            
            # Clear data if configured
            if neo4j_config.get("clear_on_start", False):
                self.logger.info("Clearing existing data")
                await initialized_service.clear_data()
            
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
        
        # Merge with API config
        combined_config = {**api_config, **server_config}
    
        try:
            if self.config.get("use_real_api", False):
                self.logger.info("Using real API service")
                
                # Check if we need to configure the real API server with LLM credentials
                if self.config.get("llm", {}).get("use_real", False):
                    self.logger.info("Configuring API server with real LLM provider")
                
                service = RealAPIService(combined_config)
                self.logger.debug("RealAPIService created")
            else:
                self.logger.info("Using mock API service")
                service = MockAPIService(combined_config)
                self.logger.debug("MockAPIService created")
            
            self.logger.debug("Initializing API service")
            initialized_service = await service.initialize()
            self.logger.debug("API service initialized")
            
            # If using real API with real LLM, configure the LLM provider
            if self.config.get("use_real_api", False) and self.config.get("llm", {}).get("use_real", False):
                await self._configure_llm_provider(initialized_service)
            
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize API service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise



    async def _start_llm_service(self):
        """Start an LLM service based on configuration."""
        llm_config = self.config.get("llm", {})
        self.logger.info(f"Starting LLM service with config: {llm_config}")
        
        # Check if we should use real LLM
        if llm_config.get("use_real", False):
            self.logger.info("Using real LLM service")
            # Add more detailed provider config
            if "provider" in llm_config:
                provider_config = llm_config["provider"]
                self.logger.info(f"Using provider: {provider_config.get('provider_type', 'unknown')}")
                service = RealLLMService(llm_config)
            else:
                self.logger.warning("No provider configuration found for real LLM, using default")
                service = RealLLMService(llm_config)
        else:
            self.logger.info("Using mock LLM service")
            service = MockLLMService(llm_config)
        
        try:
            initialized_service = await service.initialize()
            self.logger.debug(f"LLM service initialized: {type(initialized_service).__name__}")
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize LLM service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
        
    async def _start_browser_service(self):
        """
        Set up the browser service (either simulator or real).
        
        Returns:
            Browser service instance
        """
        browser_config = self.config.get("browser", {})
        self.logger.debug(f"Starting browser service with config: {browser_config}")
        
        # Check if we should use a real browser
        use_real = browser_config.get("use_real", False) or self.config.get("use_real_browser", False)
        
        try:
            if use_real:
                self.logger.info("Using real browser service")
                from test_harness.services.real_browser_service import RealBrowserService
                service = RealBrowserService(browser_config)
            else:
                self.logger.info("Using mock browser simulator")
                from test_harness.services.mock_browser_service import BrowserSimulator
                service = BrowserSimulator(browser_config)
            
            self.logger.debug(f"Created browser service: {service.__class__.__name__}")
            
            self.logger.debug("Initializing browser service")
            initialized_service = await service.initialize()
            
            self.logger.info(f"Browser service initialized: {initialized_service.__class__.__name__}")
            return initialized_service
        except Exception as e:
            self.logger.error(f"Failed to initialize browser service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    def _get_free_port(self) -> int:
        """Find and return an available port number."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            port = s.getsockname()[1]
            self.logger.debug(f"Found free port: {port}")
            return port
            
    async def _configure_llm_provider(self, api_service):
        """Configure the LLM provider in the API server."""
        self.logger.info("Configuring LLM provider in API server")
        
        llm_config = self.config.get("llm", {})
        provider_config = llm_config.get("provider", {})
        
        if not provider_config:
            self.logger.warning("No provider configuration found")
            return
        
        provider_id = provider_config.get("provider_id", "default")
        provider_type = provider_config.get("provider_type", "anthropic")
        credentials = provider_config.get("credentials", {})

        self.logger.info(f"Provider {provider_id} of type {provider_type} should be configured in the API directly")
        self.logger.info("Skipping API-based provider configuration as endpoints may not be implemented")
        self.logger.info("Please ensure the LLM provider is configured in your API server configuration")
            
        # Create provider in auth system
        auth_request = {
            "provider_id": provider_id,
            "provider_type": provider_type,
            "credentials": credentials
        }
        
        self.logger.info(f"Creating provider {provider_id} of type {provider_type}")
        
        try:
            # Use the auth endpoint to register the provider
            response = await api_service.send_request(
                "POST",
                "/api/v1/auth/providers",
                data=auth_request,
                headers={"Authorization": f"Bearer {api_service.auth_token}"}
            )
            
            if response.get("success", False):
                self.logger.info(f"Provider {provider_id} created successfully")
                
                # Verify the provider by checking for available models
                models_response = await api_service.send_request(
                    "POST",
                    "/llm/models",
                    data={"provider_id": provider_id},
                    headers={"Authorization": f"Bearer {api_service.auth_token}"}
                )
                
                if models_response.get("success", False):
                    models = models_response.get("data", {}).get("models", [])
                    self.logger.info(f"Available models for {provider_id}: {models}")
                else:
                    self.logger.warning(f"Could not list models for {provider_id}: {models_response.get('error')}")
            else:
                self.logger.error(f"Failed to create provider: {response.get('error')}")
        except Exception as e:
            self.logger.error(f"Error configuring LLM provider: {str(e)}")
            raise

    async def _setup_anthropic_credentials(self, api_service):
        """Set up Anthropic credentials in the storage system."""
        self.logger.info("Setting up Anthropic credentials for testing")
        
        # Get credentials from config
        llm_config = self.config.get("llm", {})
        provider_config = llm_config.get("provider", {})
        credentials = provider_config.get("credentials", {})
        
        if not credentials or "api_key" not in credentials:
            self.logger.error("Missing Anthropic API key in configuration")
            return False
        
        # Use a provider ID that the system already recognizes
        provider_id = "anthropic"  # Use the standard provider ID
        
        # Format credentials properly
        anthropic_credentials = {
            "provider_type": "anthropic",
            "api_key": credentials["api_key"],
            "api_base": credentials.get("api_base", "https://api.anthropic.com/v1"),
            "model": provider_config.get("model", "claude-3-opus-20240229")
        }
        
        # Store credentials directly in the secure storage
        try:
            # Use the dev_auth_provider for direct storage
            from core.infrastructure.auth.providers.dev_auth_provider import DevAuthProvider
            import os
            
            # Get the storage path from environment or default
            storage_path = os.environ.get("MARVIN_CONFIG_DIR", "./config")
            dev_auth = DevAuthProvider(storage_path)
            
            # Store the credentials
            await dev_auth.store_credentials(
                "test-token",
                provider_id,
                anthropic_credentials
            )
            
            self.logger.info(f"Successfully configured Anthropic credentials for provider_id: {provider_id}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to configure Anthropic credentials: {str(e)}")
            return False