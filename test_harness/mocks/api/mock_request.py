import json
import asyncio
import traceback
import datetime
import time
import subprocess
import sys
import os
import aiohttp
from typing import Dict, Any, Optional
from test_harness.utils.paths import resolve_api_path
from test_harness.mocks.mock_neo4j_service import BaseMockService



class MockRequest:
    """Simple request class for mocking aiohttp requests."""
    
    def __init__(self, method, path, data=None, headers=None):
        from core.utils.logger import get_logger
        self.logger = get_logger("test.mock.MockRequest")
        
        self.method = method
        self.path = path
        self.data = data
        self.headers = headers or {}
        
        # Log for debugging
        self.logger.debug(f"MockRequest created: {method} {path}")
        if data:
            try:
                self.logger.debug(f"With data: {json.dumps(data)[:200]}...")
            except:
                self.logger.debug(f"With data (non-JSON): {str(data)[:200]}...")
        
        if headers:
            self.logger.debug(f"With headers: {headers}")
        
        # Parse query parameters
        import urllib.parse
        self.query = {}
        if '?' in path:
            query_string = path.split('?', 1)[1]
            self.query = dict(urllib.parse.parse_qsl(query_string))
        
    async def json(self):
        """Get request data as JSON."""
        return self.data
    
    def __str__(self):
        """String representation for debugging."""
        return f"MockRequest({self.method} {self.path}, data={self.data}, headers={self.headers})"
    

class RealAPIService(BaseMockService):
    """
    Connector to the real Marvin API service for testing.
    This allows testing against the actual FastAPI implementation.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the real API service connector.
        
        Args:
            config: API configuration with connection details
        """
        super().__init__(config)
        
        # Get API config
        api_config = config.get("api", {})
        
        # Get the base URL - either from config or construct from host/port
        self.base_url = api_config.get("base_url", "http://localhost:8000")
        
        # Extract port from base_url if not explicitly provided
        if "port" not in api_config and "://" in self.base_url:
            from urllib.parse import urlparse
            parsed_url = urlparse(self.base_url)
            if parsed_url.port:
                api_config["port"] = parsed_url.port
            else:
                # Default ports based on scheme
                api_config["port"] = 443 if parsed_url.scheme == "https" else 80
        
        # Override base_url if port is explicitly provided
        explicit_port = api_config.get("port")
        if explicit_port:
            from urllib.parse import urlparse, urlunparse
            parsed_url = urlparse(self.base_url)
            if parsed_url.port != explicit_port:
                # Reconstruct URL with new port
                netloc = parsed_url.netloc.split(':')[0] + f":{explicit_port}"
                parts = list(parsed_url)
                parts[1] = netloc
                self.base_url = urlunparse(tuple(parts))
        
        self.admin_token = config.get("admin_token", "test-admin-token")
        self.api_process = None
        self.session = None
        
        # Get API path prefix
        self.api_prefix = api_config.get("api_v1_str", "/api/v1")
        
        self.logger.info(f"RealAPIService initialized with URL: {self.base_url}")
    
    async def initialize(self):
        """Initialize the real API service."""
        await super().initialize()
        
        try:
            # Create a session for API requests
            self.logger.info(f"Initializing connection to real API at {self.base_url}")
            self.session = aiohttp.ClientSession()
            
            # Check if the API server is running
            health_endpoint = self.config.get("api", {}).get("health_endpoint", "/health")
            max_attempts = 3
            retry_delay = 1
            
            for attempt in range(max_attempts):
                try:
                    health_url = f"{self.base_url}{health_endpoint}"
                    self.logger.info(f"Checking if API server is reachable at {health_url} (attempt {attempt+1}/{max_attempts})")
                    
                    async with self.session.get(health_url, timeout=5) as response:
                        if 200 <= response.status < 300:
                            try:
                                health_data = await response.json()
                                self.logger.info(f"API server is running and reachable: {health_data}")
                            except:
                                # If not JSON, just log the status
                                self.logger.info(f"API server is running and reachable (status: {response.status})")
                            return self
                        else:
                            self.logger.warning(f"API server returned unexpected status: {response.status}")
                except Exception as e:
                    self.logger.warning(f"API connection attempt {attempt+1} failed: {str(e)}")
                    if attempt < max_attempts - 1:
                        self.logger.info(f"Retrying in {retry_delay} seconds...")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
            
            # If we get here, we couldn't connect
            self.logger.error(f"Could not connect to API server at {self.base_url} after {max_attempts} attempts")
            raise RuntimeError(f"API server at {self.base_url} is not reachable")
                
        except Exception as e:
            self.logger.error(f"Failed to initialize real API service: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # Clean up any resources
            if self.session:
                await self.session.close()
                self.session = None
            
            raise
    
    async def _start_api_server(self):
        """Start the actual API server as a subprocess."""
        self.logger.info("Starting real API server")
        
        # Get the project root directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(current_dir, '..', '..', '..'))
        
        # Prepare environment variables
        env = os.environ.copy()
        env.update({
            "ENVIRONMENT": "test",
            "NEO4J_URI": self.config["neo4j_uri"],
            "NEO4J_USERNAME": self.config["neo4j_username"],
            "NEO4J_PASSWORD": self.config["neo4j_password"],
            "PORT": str(self.config["port"]),
            "ADMIN_TOKEN": self.admin_token,
            # Additional environment variables needed by your app
            "SECRET_KEY": env.get("SECRET_KEY", "test-secret-key"),
            "API_V1_STR": "{/api/v1}",
            "PROJECT_NAME": "Marvin API (Test)",
            "DEBUG": "true"
        })
        
        # Start the API server using your application's structure
        self.logger.debug(f"Starting API server from directory: {project_root}")
        try:
            # Use uvicorn to start your FastAPI app
            self.api_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", 
                 f"--port={self.config['port']}", "--reload"],
                cwd=project_root,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            self.logger.info(f"API server process started with PID {self.api_process.pid}")
            
            # Wait for the server to start
            self.logger.info("Waiting for API server to be ready")
            start_time = time.time()
            max_wait = 30  # seconds
            
            while time.time() - start_time < max_wait:
                try:
                    # Use the proper health endpoint path
                    async with self.session.get(f"{self.uri}/health", timeout=1) as response:
                        if response.status == 200:
                            self.logger.info("API server is ready")
                            return
                except:
                    # Continue waiting
                    await asyncio.sleep(1)
                    
                    # Check for process errors
                    if self.api_process.poll() is not None:
                        stderr = self.api_process.stderr.read().decode('utf-8') if self.api_process.stderr else "No error output"
                        self.logger.error(f"API server process terminated unexpectedly: {stderr}")
                        raise RuntimeError(f"API server process terminated: {stderr}")
                
                await asyncio.sleep(1)
            
            # If we get here, the server didn't start in time
            stderr = self.api_process.stderr.read().decode('utf-8') if self.api_process.stderr else "No error output"
            self.logger.error(f"API server failed to start within the expected time: {stderr}")
            self._stop_api_server()
            raise RuntimeError("API server failed to start within the expected time")
            
        except Exception as e:
            self.logger.error(f"Failed to start API server: {str(e)}")
            if self.api_process:
                self._stop_api_server()
            raise
    
    def _stop_api_server(self):
        """Stop the API server subprocess."""
        if self.api_process:
            self.logger.info(f"Stopping API server (PID {self.api_process.pid})")
            try:
                self.api_process.terminate()
                self.api_process.wait(timeout=5)
                self.logger.info("API server stopped successfully")
            except Exception as e:
                self.logger.warning(f"Error stopping API server: {str(e)}")
                try:
                    self.api_process.kill()
                    self.logger.info("API server forcefully killed")
                except:
                    self.logger.error("Failed to kill API server process")
            
            self.api_process = None
    
    async def shutdown(self):
        """Shut down the real API service connector."""
        self.logger.info("Shutting down real API service connector")
        
        # Close HTTP session
        if self.session:
            self.logger.debug("Closing HTTP session")
            await self.session.close()
            self.session = None
        
        # Stop API server if we started it
        if self.api_process:
            self._stop_api_server()
        
        await super().shutdown()
    
    async def send_request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None, 
                        headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Send a request to the real API.
        
        Args:
            method: HTTP method
            path: URL path
            data: Request data
            headers: Request headers
                
        Returns:
            Response data
        """
        # Ensure path starts with the correct API prefix
        if not path.startswith(self.api_prefix) and not path.startswith('/'):
            path = f"{self.api_prefix}/{path}"
        elif not path.startswith(self.api_prefix) and not path.startswith(self.api_prefix[1:]):
            path = f"{self.api_prefix}{path}"
        
        url = f"{self.base_url}{path}"
        headers = headers or {}
        
        self.logger.debug(f"Sending {method} request to {url}")

        resolved_path = resolve_api_path(path, self.config)
        
        if resolved_path != path:
            self.logger.debug(f"Real API request: {method} {path} (resolved to {resolved_path})")
        else:
            self.logger.debug(f"Real API request: {method} {path}")
        
        if not self.session:
            raise RuntimeError("HTTP session not initialized")
        
        url = f"{self.uri}{resolved_path}"
        headers = headers or {}
        
        # Ensure JSON content type for requests with data
        if data and 'Content-Type' not in headers:
            headers['Content-Type'] = 'application/json'
        
        # Prepare request
        try:
            async with self.session.request(method, url, json=data, headers=headers) as response:
                # Get response data
                status = response.status
                try:
                    response_data = await response.json()
                    self.logger.debug(f"Response from {resolved_path}: status={status}")
                except:
                    text = await response.text()
                    self.logger.warning(f"Failed to parse JSON response from {resolved_path}: {text}")
                    response_data = {"success": False, "error": {"message": f"Invalid JSON response: {text}"}}
                
                # Add proper APIResponse wrapper if it's not already there
                if "success" not in response_data:
                    success = 200 <= status < 300
                    response_data = {
                        "success": success,
                        "data": response_data if success else None,
                        "error": None if success else {"message": "Request failed", "status": status},
                        "metadata": {"timestamp": datetime.datetime.now().isoformat()}
                    }
                
                return response_data
        except Exception as e:
            self.logger.error(f"Error sending request to {resolved_path}: {str(e)}")
            return {
                "success": False,
                "error": {
                    "error_code": "REQUEST_FAILED",
                    "message": f"Request failed: {str(e)}"
                }
            }
        
    async def setup_test_auth(self):
        """
        Set up authentication for testing.
        
        Returns:
            Admin token for use in tests
        """
        self.logger.info("Setting up test authentication with admin token")
        return self.admin_token
    
    @property
    def uri(self):
        """Alias for base_url for compatibility with MockAPIService."""
        return self.base_url