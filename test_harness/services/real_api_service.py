import aiohttp
import json
from core.utils.logger import get_logger



class RealAPIService:
    """Real API service that connects to the actual FastAPI server."""
    
    def __init__(self, config):
        self.config = config
        self.logger = get_logger("test.api.real")
        self.base_url = config.get("base_url", "http://localhost:8000")
        self.api_v1_str = config.get("api_v1_str", "/api/v1")
        self.session = None
        self.auth_token = None
        
    async def initialize(self):
        """Initialize the API service and verify connectivity."""
        self.logger.info(f"Initializing real API service at {self.base_url}")
        
        # Create aiohttp session with longer timeouts and keepalive
        import aiohttp
        timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_connect=10, sock_read=30)
        self.session = aiohttp.ClientSession(timeout=timeout)
        
        # Check API health
        health_endpoint = self.config.get("health_endpoint", "/health")
        health_url = f"{self.base_url}{health_endpoint}"
        
        try:
            self.logger.info(f"Checking API health at {health_url}")
            async with self.session.get(health_url) as response:
                if response.status == 200:
                    # Try to parse JSON but handle case where it might not be JSON
                    try:
                        health_data = await response.json()
                        self.logger.info(f"API health check successful: {health_data.get('status', 'unknown')}")
                    except Exception:
                        text = await response.text()
                        self.logger.info(f"API health check returned non-JSON: {text}")
                else:
                    error_text = await response.text()
                    self.logger.error(f"API health check failed: {response.status} - {error_text}")
                    raise ConnectionError(f"API health check failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to connect to API: {str(e)}")
            raise
            
        # Setup test auth
        await self.setup_test_auth()
        
        # Check the availability of key endpoints we'll need
        endpoints = [
            ("GET", "llm/providers"),
            ("POST", "agent/query"),
            ("GET", "agent/status/{task_id}"),
            ("POST", "auth/providers")
        ]
        
        self.logger.info("Checking API endpoint availability")
        for method, path in endpoints:
            available = await self.check_endpoint_availability(method, path)
            self.logger.info(f"Endpoint {method} {path}: {'Available' if available else 'Not available'}")
        
        return self
        
    async def setup_test_auth(self):
        """Set up authentication for testing."""
        self.logger.info("Setting up test authentication")
        
        # Get admin token from config or generate one
        admin_token = self.config.get("admin_token", None)
        
        if not admin_token:
            self.logger.warning("No admin token provided, using default")
            admin_token = "test-admin-token"
            
        self.auth_token = admin_token
        self.logger.info("Test authentication configured")
        
        return self.auth_token
        
    async def send_request(self, method, path, data=None, headers=None):
        """Send a request to the API."""
        if not self.session:
            raise RuntimeError("API session not initialized")
            
        # Construct the full URL based on path
        if path.startswith('http://') or path.startswith('https://'):
            # Already a full URL
            full_url = path
        elif path.startswith('/'):
            # Absolute path starting with slash
            if path.startswith('/api/v1/'):
                # Already has the API prefix
                full_url = f"{self.base_url}{path}"
            else:
                # Add API prefix
                full_url = f"{self.base_url}{self.api_v1_str}{path}"
        else:
            # Relative path, append to base URL + API version prefix
            # e.g., "llm/providers" becomes "http://localhost:8000/api/v1/llm/providers"
            full_url = f"{self.base_url}{self.api_v1_str}/{path}"
        
        headers = headers or {}

        # Add content-type header if sending data
        if data and 'Content-Type' not in headers:
            headers['Content-Type'] = 'application/json'
        
        self.logger.info(f"Sending {method} request to {full_url}")
        if data:
            self.logger.debug(f"Request data: {data}")
            
        try:
            async with self.session.request(
                method, 
                full_url, 
                json=data, 
                headers=headers,
                raise_for_status=False  # Don't raise for HTTP errors
            ) as response:
                # Try to read response body
                try:
                    text = await response.text()
                except Exception as e:
                    self.logger.warning(f"Could not read response body: {str(e)}")
                    text = ""
                
                # Try to parse as JSON
                try:
                    if text.strip().startswith('{') or text.strip().startswith('['):
                        response_data = json.loads(text)
                    else:
                        response_data = {"success": False, "error": text, "status_code": response.status}
                except json.JSONDecodeError:
                    response_data = {"success": False, "error": text, "status_code": response.status}
                
                self.logger.debug(f"Response status: {response.status}, body: {text[:100]}...")
                
                # Add status to response data for easier error handling
                if isinstance(response_data, dict) and "status_code" not in response_data:
                    response_data["status_code"] = response.status
                
                if response.status >= 400:
                    error_msg = f"API request failed: {response.status}"
                    if isinstance(response_data, dict) and "error" in response_data:
                        error_msg += f" - {response_data['error']}"
                    self.logger.error(error_msg)
                
                return response_data
            
        except Exception as e:
            self.logger.error(f"Error sending request to API: {str(e)}")
            return {"success": False, "error": str(e), "status_code": 0}
            
    async def shutdown(self):
        """Clean up resources."""
        if self.session:
            self.logger.info("Shutting down API session")
            await self.session.close()
            self.session = None


    async def _verify_llm_providers(self):
        """Verify that LLM providers are available."""
        try:
            # Try requesting the providers endpoint
            providers_response = await self.send_request(
                "GET", 
                "llm/providers",
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
            
            # Check if we got a successful response
            if providers_response.get("success", False):
                providers = providers_response.get("data", {}).get("providers", [])
                self.logger.info(f"Available LLM providers: {providers}")
                
                if not providers:
                    self.logger.warning("No LLM providers available, some tests may fail")
            else:
                # We got a structured error response
                self.logger.warning(f"Failed to list providers: {providers_response.get('error')}")
                self.logger.warning("Continuing without provider verification")
        except Exception as e:
            # Handle errors gracefully
            self.logger.warning(f"Could not verify LLM providers (endpoint may not be implemented): {str(e)}")
            self.logger.warning("Continuing with tests assuming providers will be available")


    async def check_endpoint_availability(self, method, path):
        """Check if an endpoint is available by making an OPTIONS request."""
        try:
            # Construct URL
            if path.startswith('/'):
                full_url = f"{self.base_url}{path}"
            else:
                full_url = f"{self.base_url}{self.api_v1_str}/{path}"
            
            self.logger.info(f"Checking endpoint availability: {method} {full_url}")
            
            # Try OPTIONS request first to check if endpoint exists
            try:
                async with self.session.options(full_url, timeout=5) as response:
                    if response.status != 404:
                        self.logger.info(f"Endpoint {full_url} appears to exist (status: {response.status})")
                        return True
                    else:
                        self.logger.warning(f"Endpoint {full_url} not found (404)")
                        return False
            except Exception as e:
                self.logger.warning(f"OPTIONS request failed for {full_url}: {str(e)}")
                
            # If OPTIONS fails, try a direct request with an empty body
            try:
                headers = {"Authorization": f"Bearer {self.auth_token}"} if self.auth_token else {}
                async with self.session.request(
                    method, 
                    full_url, 
                    json={}, 
                    headers=headers,
                    raise_for_status=False
                ) as response:
                    if response.status != 404:
                        self.logger.info(f"Endpoint {full_url} appears to exist (status: {response.status})")
                        return True
                    else:
                        self.logger.warning(f"Endpoint {full_url} not found (404)")
                        return False
            except Exception as e:
                self.logger.warning(f"Request failed for {full_url}: {str(e)}")
                return False
        except Exception as e:
            self.logger.error(f"Error checking endpoint availability: {str(e)}")
            return False