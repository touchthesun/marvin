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

        # Ensure API configuration exists
        if "api" not in config:
            config["api"] = {}
        
        # Apply defaults
        for key, value in DEFAULT_API_CONFIG.items():
            if key not in config["api"]:
                config["api"][key] = value

        super().__init__(config)
        self.uri = f"http://localhost:{config.get('port', 8000)}"
        self.admin_token = config.get("admin_token", "test-admin-token")
        self.api_process = None
        self.session = None
        
        self.logger.debug(f"RealAPIService initialized with URI: {self.uri}")
    
    async def initialize(self):
        """
        Initialize the real API service.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        try:
            # Create a session for API requests
            self.logger.info(f"Initializing connection to real API at {self.uri}")
            self.session = aiohttp.ClientSession()
            
            # Check if we need to start the API server
            if self.config.get("start_api_server", False):
                await self._start_api_server()
            else:
                # Verify API is reachable
                self.logger.info("Checking if API server is already running")
                try:
                    # Use the proper health endpoint path from your API
                    async with self.session.get(f"{self.uri}/health", timeout=5) as response:
                        if response.status == 200:
                            self.logger.info("API server is running and reachable")
                            health_data = await response.json()
                            self.logger.debug(f"Health check response: {health_data}")
                        else:
                            self.logger.warning(f"API server returned unexpected status: {response.status}")
                except Exception as e:
                    self.logger.error(f"API server is not reachable: {str(e)}")
                    raise RuntimeError(f"API server at {self.uri} is not reachable")
            
            return self
        except Exception as e:
            self.logger.error(f"Failed to initialize real API service: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # Clean up any resources
            if self.session:
                await self.session.close()
            
            if self.api_process:
                self._stop_api_server()
            
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