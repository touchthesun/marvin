import socket
import os
import traceback

from core.utils.logger import get_logger
from test_harness.config_model import TestConfig
from test_harness.services.mock_neo4j_service import MockNeo4jService
from test_harness.services.real_neo4j_svc import RealNeo4jService
from test_harness.services.real_llm_service import RealLLMService
from test_harness.services.mock_api_service import MockAPIService
from test_harness.services.real_api_service import RealAPIService
from test_harness.services.real_browser_service import RealBrowserService
from test_harness.services.real_llm_service import RealLLMService





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
        """Set up the complete test environment with improved error handling and diagnostics."""
        self.logger.info("Setting up test environment")
        
        environment = {}
        
        try:
            # Keep track of which components were started for better diagnostics
            started_components = []
            
            # Start Neo4j
            self.logger.info("Starting Neo4j service")
            try:
                neo4j = await self._start_neo4j()
                environment["neo4j"] = neo4j
                self.active_services.append(neo4j)
                started_components.append("neo4j")
                self.logger.info("Neo4j service started successfully")
            except Exception as e:
                self.logger.error(f"Failed to start Neo4j service: {str(e)}")
                raise
            
            # Start API server
            self.logger.info("Starting API service")
            try:
                api_server = await self._start_api_server(neo4j)
                environment["api"] = api_server
                self.active_services.append(api_server)
                started_components.append("api")
                self.logger.info("API service started successfully")
            except Exception as e:
                self.logger.error(f"Failed to start API service: {str(e)}")
                raise
            
            # Start LLM service
            self.logger.info("Starting LLM service")
            try:
                llm_service = await self._start_llm_service()
                if llm_service:
                    environment["llm"] = llm_service
                    self.active_services.append(llm_service)
                    started_components.append("llm")
                    self.logger.info("LLM service started successfully")
                else:
                    self.logger.warning("LLM service initialization returned None. Continuing without LLM service.")
                    environment["llm"] = None
            except Exception as e:
                self.logger.error(f"Error starting LLM service: {str(e)}")
                self.logger.warning("Continuing without LLM service due to initialization error")
                environment["llm"] = None
            
            # Set up browser service
            self.logger.info("Starting browser service")
            try:
                browser_service = await self._start_browser_service()
                environment["browser"] = browser_service
                self.active_services.append(browser_service)
                started_components.append("browser")
                self.logger.info("Browser service started successfully")
            except Exception as e:
                self.logger.error(f"Failed to start browser service: {str(e)}")
                raise
            
            # Log successful components
            self.logger.info(f"Environment setup completed successfully with components: {', '.join(started_components)}")
            
            # Log component types for debugging
            for name, component in environment.items():
                if component:
                    self.logger.info(f"Component '{name}' type: {type(component).__name__}")
                else:
                    self.logger.warning(f"Component '{name}' is None")
            
            return environment
            
        except Exception as e:
            self.logger.error(f"Environment setup failed: {str(e)}")
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
        """Start the LLM service with enhanced logging and error handling."""
        self.logger.info("Setting up LLM service")
        
        try:
            llm_config = self.config.get("llm", {})
            self.logger.debug(f"LLM config: {llm_config}")
            
            # Default to RealLLMService if not specified
            use_real_llm = self.config.get("use_real_llm", True)
            self.logger.info(f"Using {'real' if use_real_llm else 'mock'} LLM service")
            
            if use_real_llm:                
                # Get API base URL from API service if available
                api_base_url = None
                if hasattr(self, "api_service") and self.api_service:
                    api_base_url = self.api_service.base_url
                    self.logger.debug(f"Using API base URL from API service: {api_base_url}")
                else:
                    api_base_url = llm_config.get("api_base_url", "http://localhost:8000")
                    self.logger.debug(f"Using default API base URL: {api_base_url}")
                
                # Get API key
                api_key = llm_config.get("api_key", "test-api-key")
                self.logger.debug(f"Using API key: {api_key[:4]}{'*' * (len(api_key) - 4) if len(api_key) > 4 else '****'}")
                
                # Configure the service
                service_config = {
                    "api_base_url": api_base_url,
                    "api_key": api_key,
                    "default_provider": llm_config.get("default_provider", "anthropic"),
                    "default_model": llm_config.get("default_model", "claude-3-haiku-20240307")
                }
                
                self.logger.debug(f"Real LLM service configuration: {service_config}")
                
                # Create and initialize the service
                service = RealLLMService(service_config)
                self.logger.info("RealLLMService instance created")
                
                try:
                    initialized_service = await service.initialize()
                    self.logger.info("RealLLMService initialized successfully")
                    return initialized_service
                except Exception as init_error:
                    # Detailed error on initialization failure
                    self.logger.error(f"RealLLMService initialization failed: {str(init_error)}")
                    self.logger.error(f"Initialization error details: {type(init_error).__name__}")
                    import traceback
                    self.logger.error(f"Traceback: {traceback.format_exc()}")
                    
                    # Try to get more diagnostic information
                    try:
                        if hasattr(service, 'session') and service.session:
                            self.logger.info("Service has an active session, checking connection...")
                            # Try a simple request to diagnose connectivity
                            try:
                                async with service.session.get(f"{api_base_url}/health") as response:
                                    status = response.status
                                    text = await response.text()
                                    self.logger.info(f"Health check response: Status={status}, Body={text[:200]}")
                            except Exception as conn_error:
                                self.logger.error(f"API connection test failed: {str(conn_error)}")
                    except Exception as diag_error:
                        self.logger.error(f"Error during diagnostic checks: {str(diag_error)}")
                    
                    # Re-raise the original error
                    raise
            else:
                # Use mock LLM service
                self.logger.info("Creating MockLLMService")
                from test_harness.services.mock_llm_service import MockLLMService
                
                service = MockLLMService(llm_config)
                self.logger.info("MockLLMService instance created")
                
                try:
                    initialized_service = await service.initialize()
                    self.logger.info("MockLLMService initialized successfully")
                    return initialized_service
                except Exception as mock_error:
                    self.logger.error(f"MockLLMService initialization failed: {str(mock_error)}")
                    import traceback
                    self.logger.error(f"Traceback: {traceback.format_exc()}")
                    raise
                    
        except ImportError as import_error:
            # Special handling for import errors (common when modules are missing)
            self.logger.error(f"Import error initializing LLM service: {str(import_error)}")
            self.logger.error("This likely indicates a missing dependency or incorrect import path")
            
            # Try to provide helpful context about the import path
            import sys
            self.logger.error(f"Python path: {sys.path}")
            self.logger.error(f"Current working directory: {os.getcwd() if 'os' in sys.modules else 'Unknown'}")
            
            # Fallback to None with clear error message
            self.logger.warning("Returning None for LLM service due to import error")
            return None
            
        except Exception as e:
            # General error handling
            self.logger.error(f"Unexpected error initializing LLM service: {str(e)}")
            import traceback
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Provide system info that might be helpful
            import platform
            self.logger.error(f"System info: Python {platform.python_version()}, {platform.system()} {platform.release()}")
            
            # Fallback to None with clear error message
            self.logger.warning("Returning None for LLM service due to unexpected error")
            return None
        
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