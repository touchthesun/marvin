import re
import json
import uuid
import asyncio
import traceback
import datetime
import time
import urllib.parse
from typing import Dict, Any, Optional, Callable
from aiohttp import web
from test_harness.utils.paths import resolve_api_path
from test_harness.utils.helpers import find_free_port
from test_harness.mocks.mock_neo4j_service import BaseMockService
from test_harness.mocks.api.mock_request import MockRequest


# Default configuration
DEFAULT_API_CONFIG = {
    "api_v1_str": "/api/v1",
    "health_endpoint": "/health",
    "base_url": "http://localhost:8000",
    "port": 8000
}

class MockAPIService(BaseMockService):
    """
    Mock implementation of the Marvin API server.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the API mock.
        
        Args:
            config: API configuration
        """
        super().__init__(config)
        
        # Ensure API configuration is properly set up
        if "api" not in self.config:
            self.config["api"] = {}
        
        # Set default API prefix if not specified
        if "api_v1_str" not in self.config["api"]:
            self.config["api"]["api_v1_str"] = "/api/v1"
        
        self.api_prefix = self.config["api"]["api_v1_str"]
        self.logger.debug(f"Using API prefix: {self.api_prefix}")
        
        self.routes = {}
        self.state = {
            "pages": {},
            "tasks": {},
            "graph": {},
            "auth": {
                "admin_token": self.config.get("admin_token", "test-admin-token"),
                "providers": {}
            }
        }
        self.port = self.config.get("port", find_free_port(8000, 9000))
        self.base_url = f"http://localhost:{self.port}"
        self.app = None
        self.runner = None
        self.site = None

        self.logger.debug(f"MockAPIService initialized with base URL: {self.base_url}")
        self.logger.debug(f"Admin token: {self.state['auth']['admin_token']}")
        
    async def initialize(self):
        """
        Initialize the mock API service.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        # Set up routes
        self._setup_routes()
        self.logger.debug(f"Set up routes for HTTP methods: {', '.join(self.routes.keys())}")
        
        # Start the HTTP server if configured
        if self.config.get("start_server", True):
            self.logger.info("Starting HTTP server")
            await self._start_server()
            self.logger.info(f"HTTP server started at {self.base_url}")
        else:
            self.logger.info("HTTP server not started (disabled in config)")
        
        return self
    
    async def _start_server(self):
        """Start the HTTP server."""
        self.logger.info(f"Starting mock API server on port {self.port}")
        
        try:
            self.app = web.Application()
            
            # Register routes with aiohttp
            route_count = 0
            for method, path_handlers in self.routes.items():
                for path_pattern, handler in path_handlers.items():
                    # Convert path pattern to aiohttp compatible
                    # Replace {param} with {param:.*} to allow any characters
                    aiohttp_pattern = re.sub(r'{([^}]+)}', r'{\1:.*}', path_pattern)
                    
                    # Create a wrapper handler that extracts path parameters
                    async def create_handler(original_handler, pattern):
                        async def wrapped_handler(request):
                            # Extract path parameters
                            params = {}
                            pattern_parts = pattern.split('/')
                            path_parts = request.path.split('/')
                            
                            for i, (pattern_part, path_part) in enumerate(zip(pattern_parts, path_parts)):
                                if pattern_part.startswith('{') and pattern_part.endswith('}'):
                                    # This is a parameter
                                    param_name = pattern_part[1:-1]
                                    params[param_name] = path_part
                            
                            # Extract request data
                            try:
                                data = await request.json()
                            except:
                                data = None
                            
                            # Call the original handler
                            result = await original_handler(data, dict(request.headers), params)
                            
                            # Convert result to response
                            if isinstance(result, web.Response):
                                return result
                            else:
                                return web.json_response(result)
                        
                        return wrapped_handler
                    
                    # Add route with the wrapper handler
                    handler_wrapper = await create_handler(handler, path_pattern)
                    self.app.router.add_route(method, aiohttp_pattern, handler_wrapper)
                    route_count += 1
                    self.logger.debug(f"Added route: {method} {aiohttp_pattern}")
            
            self.logger.info(f"Registered {route_count} routes")
            
            # Start server
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            self.site = web.TCPSite(self.runner, 'localhost', self.port)
            await self.site.start()
            
            self.logger.info(f"Mock API server running at {self.base_url}")
        except Exception as e:
            self.logger.error(f"Failed to start API server: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    

    async def shutdown(self):
        """Shut down the mock API service."""
        self.logger.info("Shutting down mock API server")
        
        if self.site:
            self.logger.debug("Stopping site")
            await self.site.stop()
        
        if self.runner:
            self.logger.debug("Cleaning up runner")
            await self.runner.cleanup()
        
        self.logger.debug("API server shutdown complete")
        await super().shutdown()
    
    def _setup_routes(self):
        """Set up the mock API routes."""
        self.logger.debug("Setting up API routes")

        # Get API prefix from config
        api_prefix = self.config.get("api", {}).get("api_v1_str", "/api/v1")
        self.logger.debug(f"Using API prefix: {api_prefix}")
        
        # Format: {method: {path: handler}}
        self.routes = {
            "GET": {
                "/health": self._handle_health,
                f"{api_prefix}/pages": self._handle_get_pages,
                f"{api_prefix}/graph/related/{{url}}": self._handle_related_pages,
                f"{api_prefix}/analysis/status/{{task_id}}": self._handle_analysis_status,
                f"{api_prefix}/auth/providers": self._handle_list_providers,
                f"{api_prefix}/auth/providers/{{provider_id}}": self._handle_get_provider,
                f"{api_prefix}/auth/provider-types": self._handle_provider_types,
                f"{api_prefix}/agent/status/{{task_id}}": self._handle_agent_status,
                f"{api_prefix}/agent/status/{{task_id}}": self._handle_agent_status,
            },
            "POST": {
                f"{api_prefix}/pages": self._handle_create_page,
                f"{api_prefix}/analysis/analyze": self._handle_analyze_page,
                f"{api_prefix}/agent/query": self._handle_agent_query,
                f"{api_prefix}/auth/providers": self._handle_create_provider,
                f"{api_prefix}/auth/validate": self._handle_validate_token,
                f"{api_prefix}/llm/initialize": self._handle_llm_initialize,
                f"{api_prefix}/agent/query": self._handle_agent_query
            },
            "DELETE": {
                f"{api_prefix}/auth/providers/{{provider_id}}": self._handle_delete_provider,
            }
        }
        
        # Log route counts
        total_routes = sum(len(routes) for routes in self.routes.values())
        self.logger.debug(f"Set up {total_routes} API routes")
        
        for method, routes in self.routes.items():
            self.logger.debug(f"  {method}: {len(routes)} routes")
            # Log each route for debugging
            for path in routes:
                self.logger.debug(f"{path}")
    
    async def _handle_agent_status(self, data, headers=None, path_params=None):
        """Handle agent status request."""
        # Extract task_id from params or request
        task_id = None
        
        # Try to get from path_params
        if path_params and 'task_id' in path_params:
            task_id = path_params['task_id']
            self.logger.info(f"Task ID from path_params: {task_id}")
        # Try to get from request attribute (set by our wrapper)
        elif hasattr(data, 'task_id'):
            task_id = data.task_id
            self.logger.info(f"Task ID from request.task_id: {task_id}")
        # Try to get from request path
        elif hasattr(data, 'path'):
            # Try to extract from path
            path = data.path
            self.logger.info(f"Extracting task_id from path: {path}")
            
            # Extract using regex
            match = re.search(r'/agent/status/([^/]+)', path)
            if match:
                task_id = match.group(1)
                self.logger.info(f"Task ID extracted from path: {task_id}")
        
        self.logger.info(f"_handle_agent_status called with task_id: {task_id}")
        
        if not task_id:
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Missing task_id parameter"
                }
            }
        
        # Check if task exists in our mock state
        if task_id not in self.state.get("tasks", {}):
            # Create a "completed" task for testing purposes
            self.logger.info(f"Creating mock completed task for {task_id}")
            self.state.setdefault("tasks", {})[task_id] = {
                "task_id": task_id,
                "status": "completed",
                "progress": 1.0,
                "started_at": time.time() - 60,  # 1 minute ago
                "completed_at": time.time(),
                "result": {
                    "response": f"This is a mock response for task {task_id}",
                    "sources": [
                        {
                            "url": "https://docs.python.org/3/tutorial/introduction.html",
                            "title": "Python Introduction",
                            "relevance_score": 0.95
                        },
                        {
                            "url": "https://test.org/research-paper",
                            "title": "Research Paper",
                            "relevance_score": 0.75
                        }
                    ],
                    "confidence_score": 0.85
                }
            }
        
        task = self.state["tasks"].get(task_id)
        
        self.logger.info(f"Returning status for task {task_id}: {task['status']}")
        
        return {
            "success": True,
            "data": task,
            "error": None,
            "metadata": {
                "timestamp": time.time()
            }
        }

    async def send_request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None, 
                        headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Send a request to the mock API.
        
        Args:
            method: HTTP method
            path: URL path
            data: Request data
            headers: Request headers
                
        Returns:
            Response data
        """
        # Resolve the path using the utility function
        resolved_path = resolve_api_path(path, self.config)
        
        if resolved_path != path:
            self.logger.debug(f"Mock API request: {method} {path} (resolved to {resolved_path})")
        else:
            self.logger.debug(f"Mock API request: {method} {path}")
        
        if data:
            try:
                self.logger.debug(f"Request data: {json.dumps(data)[:300]}...")  # Truncate for readability
            except:
                self.logger.debug(f"Request data (non-JSON): {str(data)[:300]}...")
        
        if headers:
            self.logger.debug(f"Request headers: {headers}")
        
        # Find the handler for this route
        handler = self._get_route_handler(method, resolved_path)
        
        if not handler:
            self.logger.warning(f"Route not found: {method} {resolved_path}")
            # Log available routes for debugging
            self.logger.debug(f"Available routes for {method}:")
            for route in self.routes.get(method, {}):
                self.logger.debug(f"  - {route}")
                
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Route not found: {method} {resolved_path}"
                }
            }
        
        # Process the request
        try:
            self.logger.debug(f"Executing handler for {method} {resolved_path}")

            # Create a mock request object
            headers = headers or {}
            mock_request = MockRequest(method, resolved_path, data, headers)
            
            # Use the mock request for all handler types
            response = await handler(mock_request)
            
            # Handle response conversion if needed
            if isinstance(response, web.Response):
                # Convert aiohttp response to dict
                body = response.body.decode('utf-8') if response.body else '{}'
                try:
                    result = json.loads(body)
                    self.logger.info(f"Converted web.Response to dict. Status: {response.status}")
                    return result
                except json.JSONDecodeError as e:
                    self.logger.error(f"Failed to decode JSON response: {e}")
                    return {
                        "success": False,
                        "error": {
                            "error_code": "RESPONSE_ERROR",
                            "message": f"Invalid JSON response: {body[:100]}..."
                        }
                    }
            
            self.logger.info(f"Handler returned response of type: {type(response).__name__}")
            return response
                
        except Exception as e:
            self.logger.error(f"Error handling request: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": {
                    "error_code": "INTERNAL_ERROR",
                    "message": f"Error processing request: {str(e)}"
                }
            }
    
    def _create_handler_wrapper(self, handler, params):
        """
        Create a wrapper for a handler function that includes path parameters.
        
        Args:
            handler: Original handler function
            params: Path parameters to pass to the handler
            
        Returns:
            Wrapped handler function
        """
        async def wrapper(request):
            # Check handler signature to see if it accepts 'params'
            import inspect
            handler_signature = inspect.signature(handler)
            handler_params = list(handler_signature.parameters.keys())
            
            self.logger.debug(f"Handler params: {handler_params}")
            
            # If the handler doesn't accept 'params', attach the parameters to the request
            if 'params' not in handler_params:
                # For MockRequest objects
                if isinstance(request, MockRequest):
                    for key, value in params.items():
                        setattr(request, key, value)
                # For dictionary-like requests
                elif isinstance(request, dict):
                    for key, value in params.items():
                        request[key] = value
                
                # Call without params
                return await handler(request, headers=getattr(request, 'headers', None))
            else:
                # Call with params
                return await handler(request, headers=getattr(request, 'headers', None), params=params)
        
        return wrapper

    def _get_route_handler(self, method: str, path: str) -> Optional[Callable]:
        """Get the handler for a specific route."""
        method_routes = self.routes.get(method, {})
        
        self.logger.info(f"Looking for handler for: {method} {path}")
        
        # First try exact match
        if path in method_routes:
            self.logger.info(f"Found exact match for {method} {path}")
            return method_routes[path]
        
        # Try pattern matching
        for route_pattern, handler in method_routes.items():
            # Skip exact matches
            if '{' not in route_pattern:
                continue
            
            # Handle graph/related/{url} specially due to URL encoding challenges
            if '/graph/related/' in route_pattern:
                pattern_prefix = route_pattern.split('{')[0]
                if path.startswith(pattern_prefix):
                    url_param = path[len(pattern_prefix):]
                    params = {'url': url_param}
                    self.logger.info(f"URL parameter match for {path} with pattern {route_pattern}")
                    self.logger.info(f"Extracted URL parameter: {url_param}")
                    return self._create_handler_wrapper(handler, params)
            
            # For other parameterized routes
            regex_pattern = route_pattern
            for param_name in re.findall(r'{([^}]+)}', route_pattern):
                regex_pattern = regex_pattern.replace(f"{{{param_name}}}", f"(?P<{param_name}>[^/]+)")
            
            regex_pattern = f"^{regex_pattern}$"
            
            try:
                match = re.match(regex_pattern, path)
                if match:
                    params = match.groupdict()
                    self.logger.info(f"Matched '{path}' with pattern '{route_pattern}'")
                    self.logger.info(f"Extracted parameters: {params}")
                    return self._create_handler_wrapper(handler, params)
            except Exception as e:
                self.logger.warning(f"Error matching path {path} with pattern {regex_pattern}: {str(e)}")
        
        self.logger.warning(f"No handler found for {method} {path}")
        return None
    
    
    # Health endpoint
    async def _handle_health(self, request):
        """Handle health check request."""
        return web.json_response({
            "status": "healthy",
            "version": "0.1.0",
            "environment": "test",
            "services": {
                "pipeline": "running",
                "database": "running",
                "schema": "initialized"
            }
        })
    
    # Page endpoints
    async def _handle_get_pages(self, request):
        """Handle GET pages request."""
        # Get query parameters
        query = {}
        if hasattr(request, 'query'):
            query = dict(request.query)
        
        # Filter pages
        pages = list(self.state["pages"].values())
        
        # Apply filters
        if "context" in query:
            pages = [p for p in pages if query["context"] in p.get("browser_contexts", [])]
        
        if "status" in query:
            pages = [p for p in pages if p.get("status") == query["status"]]
        
        if "domain" in query:
            pages = [p for p in pages if query["domain"] in p.get("url", "")]
        
        return web.json_response({
            "success": True,
            "data": {
                "pages": pages,
                "total_count": len(pages),
                "success_count": len(pages),
                "error_count": 0
            },
            "metadata": {
                "timestamp": datetime.datetime.now().isoformat()
            }
        })
    
    async def _handle_create_page(self, request):
        """Handle page creation request."""
        # Get request data
        data = None

        # Debug logging
        self.logger.info(f"_handle_create_page received request of type: {type(request).__name__}")
    

        if isinstance(request, web.Request):
            self.logger.info("Extracting data from aiohttp Request")
            try:
                data = await request.json()
                self.logger.debug("Data extracted from aiohttp Request")
            except Exception as e:
                self.logger.error(f"Failed to extract JSON from aiohttp request: {str(e)}")
        elif isinstance(request, MockRequest):
            self.logger.info("Extracting data from MockRequest")
            data = request.data
        elif isinstance(request, dict):
            self.logger.info("Request is already a dict")
            data = request
        else:
            self.logger.error(f"Unsupported request type: {type(request).__name__}")
            data = None


        # Log the data structure
        if data is None:
            self.logger.error("Failed to extract data from request")
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Failed to extract data from request"
                }
            }
        # Log the actual data received
        self.logger.info(f"Request data: {json.dumps(data) if data else 'None'}")
        
        # Validate
        if not isinstance(data, dict):
            self.logger.error("Request data is not a dictionary")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid page data - request data must be a dictionary"
                }
            }, status=422)
        
        # Validate URL
        if "url" not in data:
            self.logger.error("Missing required field: url")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid page data - url is required"
                }
            }, status=422)
        
        # Create page record
        page_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now().isoformat()
        
        page = {
            "id": page_id,
            "url": data["url"],
            "domain": self._extract_domain(data["url"]),
            "status": "discovered",
            "discovered_at": timestamp,
            "title": data.get("title", "Untitled"),
            "metadata": {},
            "keywords": {},
            "relationships": [],
            "browser_contexts": data.get("browser_contexts", ["ACTIVE_TAB"]),
            "tab_id": data.get("tab_id"),
            "window_id": data.get("window_id"),
            "bookmark_id": data.get("bookmark_id"),
            "last_active": timestamp
        }
        
        # Store page
        self.state["pages"][page_id] = page
        
        # Create processing task
        task_id = str(uuid.uuid4())
        self.state["tasks"][task_id] = {
            "id": task_id,
            "page_id": page_id,
            "status": "enqueued",
            "progress": 0.0,
            "started_at": timestamp,
            "message": "Task enqueued"
        }
        
        # Schedule task processing (simulate async processing)
        asyncio.create_task(self._process_page_task(task_id))
        
        return web.json_response({
            "success": True,
            "data": {
                "page_id": page_id,
                "task_id": task_id,
                "status": "enqueued"
            },
            "metadata": {
                "timestamp": timestamp
            }
        }, status=201)
    
    async def _process_page_task(self, task_id: str):
        """
        Simulate page processing in the background.
        
        Args:
            task_id: Task ID to process
        """
        if task_id not in self.state["tasks"]:
            return
        
        task = self.state["tasks"][task_id]
        page_id = task["page_id"]
        
        # Update task to processing
        task["status"] = "processing"
        task["progress"] = 0.2
        task["message"] = "Processing page content"
        
        # Wait a bit to simulate processing
        await asyncio.sleep(1.0)
        
        # Update progress
        task["progress"] = 0.5
        task["message"] = "Extracting metadata"
        
        # Wait more
        await asyncio.sleep(0.5)
        
        # Update progress
        task["progress"] = 0.8
        task["message"] = "Creating graph relationships"
        
        # Wait more
        await asyncio.sleep(0.5)
        
        # Complete the task
        task["status"] = "completed"
        task["progress"] = 1.0
        task["completed_at"] = datetime.datetime.now().isoformat()
        task["message"] = "Processing complete"
        
        # Update page
        if page_id in self.state["pages"]:
            page = self.state["pages"][page_id]
            page["status"] = "processed"
            page["processed_at"] = datetime.datetime.now().isoformat()
            
            # Add some fake data
            page["keywords"] = {
                "keyword1": 0.8,
                "keyword2": 0.7,
                "keyword3": 0.5
            }
            
            page["metadata"] = {
                "title": page.get("title", "Untitled"),
                "description": "Sample description",
                "language": "en"
            }
    
    # Graph endpoints
    async def _handle_related_pages(self, request, headers=None, params=None):
        """Handle related pages request."""
        self.logger.info(f"_handle_related_pages called with params: {params}")
        
        # Get URL from path parameter
        url = None
        
        if params and "url" in params:
            url = params["url"]
            # URL may be URL-encoded, so decode it
            try:
                url = urllib.parse.unquote(url)
                self.logger.info(f"Decoded URL parameter: {url}")
            except Exception as e:
                self.logger.warning(f"Failed to decode URL parameter: {str(e)}")
        else:
            self.logger.warning("URL parameter not found in request params")
            self.logger.debug(f"Available params: {params}")
                
        if not url:
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "URL parameter is required"
                }
            }
        
        # Create mock graph response with the URL node
        nodes = [{
            "id": str(uuid.uuid4()),
            "url": url,
            "domain": self._extract_domain(url),
            "title": f"Page at {url}",
            "last_active": datetime.datetime.now().isoformat(),
            "metadata": {}
        }]
        
        # Add a couple related nodes
        related_urls = [
            "https://example.com/related",
            "https://docs.python.org/3/tutorial/",
            "https://test.org/research-paper"
        ]
        
        relationships = []
        for i, related_url in enumerate(related_urls):
            node_id = str(uuid.uuid4())
            nodes.append({
                "id": node_id,
                "url": related_url,
                "domain": self._extract_domain(related_url),
                "title": f"Related to {url}",
                "last_active": datetime.datetime.now().isoformat(),
                "metadata": {}
            })
            
            rel_type = ["LINKS_TO", "SIMILAR_TO", "RELATED_TO"][i % 3]
            relationships.append({
                "id": f"r{i}",
                "source_id": nodes[0]["id"],
                "target_id": node_id,
                "type": rel_type,
                "strength": 0.5 + (0.1 * i)
            })
        
        self.logger.info(f"Returning graph data with {len(nodes)} nodes and {len(relationships)} relationships")
        
        return {
            "success": True,
            "data": {
                "nodes": nodes,
                "relationships": relationships
            }
        }
        
    # Analysis endpoints
    async def _handle_analyze_page(self, request):
            """Handle page analysis request."""
            # Get request data
            if isinstance(request, web.Request):
                data = await request.json()
            else:
                data = request
            
            # Validate
            if not isinstance(data, dict) or "url" not in data:
                return web.json_response({
                    "success": False,
                    "error": {
                        "error_code": "VALIDATION_ERROR",
                        "message": "Invalid data - url is required"
                    }
                }, status=422)
            
            # Create task
            task_id = str(uuid.uuid4())
            timestamp = datetime.datetime.now().isoformat()
        
            self.state["tasks"][task_id] = {
                "id": task_id,
                "url": data["url"],
                "status": "enqueued",
                "progress": 0.0,
                "started_at": timestamp,
                "message": "Analysis task enqueued"
            }
            
            # Schedule task processing
            asyncio.create_task(self._process_analysis_task(task_id))
            
            return web.json_response({
                "success": True,
                "data": {
                    "task_id": task_id,
                    "status": "enqueued",
                    "progress": 0.0,
                    "message": "Task successfully enqueued"
                }
            })
    
    async def _handle_analysis_status(self, request, headers=None, params=None):
        """Handle analysis status request."""
        # Get task_id from path parameter
        task_id = params.get("task_id") if params else None
        
        if not task_id:
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Task ID is required"
                }
            }
        
        # Get task
        task = self.state["tasks"].get(task_id)
        if not task:
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Task {task_id} not found"
                }
            }
        
        return {
            "success": True,
            "data": {
                "task_id": task_id,
                "status": task["status"],
                "progress": task["progress"],
                "message": task["message"],
                "started_at": task.get("started_at"),
                "completed_at": task.get("completed_at")
            }
        }
    
    async def _process_analysis_task(self, task_id: str):
        """
        Simulate analysis task processing.
        
        Args:
            task_id: Task ID to process
        """
        if task_id not in self.state["tasks"]:
            return
        
        task = self.state["tasks"][task_id]
        
        # Update task to processing
        task["status"] = "processing"
        task["progress"] = 0.2
        task["message"] = "Downloading content"
        
        # Wait a bit to simulate processing
        await asyncio.sleep(1.0)
        
        # Update progress
        task["progress"] = 0.5
        task["message"] = "Analyzing content"
        
        # Wait more
        await asyncio.sleep(1.0)
        
        # Update progress
        task["progress"] = 0.8
        task["message"] = "Storing results"
        
        # Wait more
        await asyncio.sleep(0.5)
        
        # Complete the task
        task["status"] = "completed"
        task["progress"] = 1.0
        task["completed_at"] = datetime.datetime.now().isoformat()
        task["message"] = "Analysis complete"
        
        # Store page record if it doesn't exist
        url = task["url"]
        found = False
        
        for page in self.state["pages"].values():
            if page["url"] == url:
                found = True
                # Update page status
                page["status"] = "processed"
                page["processed_at"] = datetime.datetime.now().isoformat()
                break
        
        if not found:
            # Create new page record
            page_id = str(uuid.uuid4())
            timestamp = datetime.datetime.now().isoformat()
            
            self.state["pages"][page_id] = {
                "id": page_id,
                "url": url,
                "domain": self._extract_domain(url),
                "status": "processed",
                "discovered_at": timestamp,
                "processed_at": timestamp,
                "title": f"Page at {url}",
                "metadata": {
                    "title": f"Page at {url}",
                    "description": "Sample description",
                    "language": "en"
                },
                "keywords": {
                    "keyword1": 0.8,
                    "keyword2": 0.7,
                    "keyword3": 0.5
                },
                "relationships": [],
                "browser_contexts": ["API"],
                "last_active": timestamp
            }
    
    # Agent endpoints
    async def _handle_agent_query(self, request):
        """Handle agent query request."""
        # Enhanced debugging
        self.logger.info(f"_handle_agent_query called with request type: {type(request).__name__}")
        
        # Get request data
        data = None
        
        if isinstance(request, web.Request):
            try:
                data = await request.json()
                self.logger.info("Data extracted from web.Request")
            except Exception as e:
                self.logger.error(f"Failed to extract JSON from web.Request: {str(e)}")
        elif hasattr(request, 'data'):
            data = request.data
            self.logger.info(f"Data extracted from request.data attribute: {data}")
        elif hasattr(request, 'json') and callable(request.json):
            try:
                data = await request.json()
                self.logger.info("Data extracted using request.json() method")
            except Exception as e:
                self.logger.error(f"Failed to call request.json(): {str(e)}")
        elif isinstance(request, dict):
            data = request
            self.logger.info("Using request dict as data")
        
        # Log the data structure for debugging
        if data:
            self.logger.info(f"Agent query data: {json.dumps(data)[:300]}...")
            if isinstance(data, dict):
                self.logger.info(f"Data keys: {list(data.keys())}")
        else:
            self.logger.warning("No data extracted from request")
        
        # Validate
        if not isinstance(data, dict):
            self.logger.error(f"Data is not a dictionary: {type(data).__name__}")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid data format - expected dictionary"
                }
            }, status=422)
        
        if "query" not in data:
            self.logger.error(f"Missing required field 'query'. Available fields: {list(data.keys())}")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid data - query is required"
                }
            }, status=422)
        
        # Create task
        task_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now().isoformat()
        
        self.state["tasks"][task_id] = {
            "id": task_id,
            "query": data["query"],
            "task_type": data.get("task_type", "QUERY"),
            "status": "enqueued",
            "progress": 0.0,
            "started_at": timestamp,
            "message": "Agent task enqueued"
        }
        
        # Log task creation for debugging
        self.logger.info(f"Created task {task_id} for query: {data['query']}")
        
        # Schedule task processing
        asyncio.create_task(self._process_agent_task(task_id))
        
        return web.json_response({
            "success": True,
            "data": {
                "task_id": task_id,
                "status": "enqueued",
                "progress": 0.0,
                "message": "Task successfully enqueued"
            }
        })
    
    async def _process_agent_task(self, task_id: str):
        """
        Simulate agent task processing.
        
        Args:
            task_id: Task ID to process
        """
        if task_id not in self.state["tasks"]:
            return
        
        task = self.state["tasks"][task_id]
        query = task.get("query", "")

        # Update task to processing
        task["status"] = "processing"
        task["progress"] = 0.2
        task["message"] = "Retrieving context"
        
        # Wait a bit to simulate processing
        await asyncio.sleep(1.0)
        
        # Update progress
        task["progress"] = 0.5
        task["message"] = "Generating response"
        
        # Wait more
        await asyncio.sleep(1.5)
        
        # Update progress
        task["progress"] = 0.8
        task["message"] = "Finalizing results"
        
        # Wait more
        await asyncio.sleep(0.5)
        
        # Complete the task
        task["status"] = "completed"
        task["progress"] = 1.0
        task["completed_at"] = datetime.datetime.now().isoformat()
        task["message"] = "Processing complete"
        
        # Generate sources based on the query
        sources = [
            {
                "url": "https://example.com",
                "title": "Example Domain",
                "relevance_score": 0.8,
                "context_used": "Sample context from the page",
                "accessed_at": datetime.datetime.now().isoformat()
            }
        ]
        
        # Always add the research paper URL for the second query
        if "research" in query.lower():
            sources.append({
                "url": "https://test.org/research-paper",
                "title": "Research Paper",
                "relevance_score": 0.85,
                "context_used": "Sample context from the research paper",
                "accessed_at": datetime.datetime.now().isoformat()
            })
        else:
            sources.append({
                "url": "https://test.org/page1",
                "title": "Test Page 1",
                "relevance_score": 0.7,
                "context_used": "Sample context from the page",
                "accessed_at": datetime.datetime.now().isoformat()
            })
            
        # Always include Python docs for all queries
        sources.append({
            "url": "https://docs.python.org/3/tutorial/",
            "title": "Python Tutorial",
            "relevance_score": 0.6,
            "context_used": "Sample context from the page",
            "accessed_at": datetime.datetime.now().isoformat()
        })
        
        # Add mock result with all needed sources
        task["result"] = {
            "response": f"Here is a mock response to your query: '{query}'",
            "sources": sources
        }
        
        self.logger.info(f"Task {task_id} completed with sources: {', '.join(s['url'] for s in sources)}")
    
    # Auth endpoints
    async def _handle_list_providers(self, request):
        """Handle listing of providers request."""
        # Check auth
        token = self._get_auth_token(request)
        if not self._validate_token(token):
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }, status=401)
        
        return web.json_response({
            "success": True,
            "data": self.state["auth"]["providers"],
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        })
    
    async def _handle_create_provider(self, request):
        """Handle provider creation request."""
        # Enhanced logging for request debugging
        self.logger.debug(f"_handle_create_provider called with request type: {type(request).__name__}")
        
        # Check auth token
        token = self._get_auth_token(request)
        self.logger.debug(f"Extracted auth token: {token[:10] + '...' if token else 'None'}")
        
        if not self._validate_token(token):
            self.logger.warning(f"Invalid or missing token: {token}")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }, status=401)
        
        # Get request data based on request type
        data = None
        if isinstance(request, web.Request):
            try:
                data = await request.json()
                self.logger.debug(f"Extracted data from web.Request")
            except Exception as e:
                self.logger.error(f"Failed to extract JSON from web.Request: {str(e)}")
        elif hasattr(request, 'data'):
            # Handle MockRequest objects
            data = request.data
            self.logger.debug(f"Extracted data from request.data attribute")
        elif hasattr(request, 'json') and callable(request.json):
            try:
                data = await request.json()
                self.logger.debug(f"Extracted data using request.json() method")
            except Exception as e:
                self.logger.error(f"Failed to call request.json(): {str(e)}")
        else:
            # Fallback to using the request itself
            data = request
            self.logger.debug(f"Using request as data")
        
        # Log extracted data
        if data:
            try:
                self.logger.debug(f"Provider creation data: {json.dumps(data)[:200]}...")
            except:
                self.logger.debug(f"Provider creation data (non-JSON): {str(data)[:200]}...")
        
        # Validate data structure
        if not isinstance(data, dict) or "provider_id" not in data or "provider_type" not in data or "credentials" not in data:
            missing = []
            if isinstance(data, dict):
                for field in ["provider_id", "provider_type", "credentials"]:
                    if field not in data:
                        missing.append(field)
                self.logger.warning(f"Missing required fields: {', '.join(missing)}")
                self.logger.debug(f"Available fields: {list(data.keys())}")
            else:
                self.logger.warning(f"Data is not a dictionary: {type(data).__name__}")
            
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid provider data - provider_id, provider_type, and credentials are required"
                }
            }, status=422)
        
        # Create provider record
        provider_id = data["provider_id"]
        timestamp = time.time()
        
        self.logger.info(f"Creating provider {provider_id} of type {data['provider_type']}")
        
        # Initialize providers if not exists
        if "providers" not in self.state["auth"]:
            self.state["auth"]["providers"] = {}

        self.state["auth"]["providers"][provider_id] = {
            "provider_id": provider_id,
            "provider_type": data["provider_type"],
            "created": timestamp,
            "modified": timestamp,
            "size": len(json.dumps(data["credentials"]))
        }

        if "provider_credentials" not in self.state["auth"]:
            self.state["auth"]["provider_credentials"] = {}
        
        # Store credentials (in real implementation, these would be encrypted)
        self.state["auth"]["provider_credentials"] = self.state["auth"].get("provider_credentials", {})
        self.state["auth"]["provider_credentials"][provider_id] = data["credentials"]
        
        # Debug state after creation
        self.logger.info(f"Provider {provider_id} created successfully")
        self.logger.info(f"Current providers in state: {list(self.state['auth']['providers'].keys())}")
        self.logger.info(f"Provider {provider_id} exists in state: {provider_id in self.state['auth']['providers']}")
                
        return web.json_response({
            "success": True,
            "data": {
                "provider_id": provider_id
            },
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        }, status=201)
    
    async def _handle_get_provider(self, request, headers=None, params=None):
        """Handle get provider details request."""
        # Log request information for debugging
        self.logger.info(f"_handle_get_provider called with request type: {type(request).__name__}")
        if headers:
            self.logger.info(f"Direct headers provided: {headers}")
        
        if hasattr(request, 'headers'):
            self.logger.info(f"Request headers: {request.headers}")
        
        if params:
            self.logger.info(f"Path params: {params}")
        
        # Check auth
        token = self._get_auth_token(request)
        self.logger.info(f"Extracted auth token: {token[:10] + '...' if token else 'None'}")
        
        if not self._validate_token(token):
            self.logger.warning(f"Invalid or missing token in _handle_get_provider")
            return {
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }
        
        # Get provider_id from path parameter
        provider_id = None
        if params and "provider_id" in params:
            provider_id = params["provider_id"]
            self.logger.info(f"Extracted provider_id from params: {provider_id}")
        elif isinstance(request, dict) and "provider_id" in request:
            provider_id = request["provider_id"]
            self.logger.info(f"Extracted provider_id from request dict: {provider_id}")
        elif hasattr(request, 'match_info') and "provider_id" in request.match_info:
            provider_id = request.match_info["provider_id"]
            self.logger.info(f"Extracted provider_id from match_info: {provider_id}")
        
        if not provider_id:
            self.logger.warning("No provider_id found in request")
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Provider ID is required"
                }
            }
        
        # Get provider
        provider = self.state["auth"]["providers"].get(provider_id)
        if not provider:
            self.logger.warning(f"Provider {provider_id} not found")
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Provider {provider_id} not found"
                }
            }
        
        # Get credentials
        credentials = self.state["auth"].get("provider_credentials", {}).get(provider_id, {})
        
        # Return provider details without actual credentials
        self.logger.info(f"Found provider {provider_id}, returning details")
        return {
            "success": True,
            "data": {
                "provider_id": provider["provider_id"],
                "provider_type": provider["provider_type"],
                "metadata": {
                    "created_at": provider["created"],
                    "updated_at": provider["modified"]
                },
                "credential_keys": list(credentials.keys())
            },
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        }
        
    async def _handle_delete_provider(self, request, headers=None, params=None):
        """Handle delete provider request."""
        # Enhanced debugging
        self.logger.info("=" * 60)
        self.logger.info(f"_handle_delete_provider called with:")
        self.logger.info(f"  Request type: {type(request).__name__}")
        self.logger.info(f"  Headers: {headers}")
        self.logger.info(f"  Params: {params}")
        self.logger.info("-" * 40)

        # Also try to get headers from request
        req_headers = getattr(request, 'headers', None)
        self.logger.info(f"  Request headers: {req_headers}")
        self.logger.info(f"  Params: {params}")

        # Try both sources for token
        direct_token = None
        if headers and "Authorization" in headers:
            direct_token = headers["Authorization"].replace("Bearer ", "")
            self.logger.info(f"  Direct token: {direct_token[:10] if direct_token else 'None'}")

        # Normal token extraction
        token = self._get_auth_token(request)
        self.logger.info(f"  Extracted token: {token[:10] if token else 'None'}")
        
        # Use either token source
        final_token = direct_token or token
        self.logger.info(f"  Final token: {final_token[:10] if final_token else 'None'}")
        
        # Log the full state of auth providers before deletion
        self.logger.info(f"Auth providers before deletion: {list(self.state['auth']['providers'].keys())}")
        self.logger.info("-" * 40)
        # Check auth
        # token = self._get_auth_token(request) if isinstance(request, web.Request) else (headers or {}).get("Authorization", "").replace("Bearer ", "")
        if not self._validate_token(final_token):
            return {
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }
        
        # Get provider_id from path parameter
        provider_id = params.get("provider_id") if params else None
        self.logger.info(f"Provider ID to delete: {provider_id}")
        
        if not provider_id:
            self.logger.warning("No provider_id found in request parameters")
            # Try to extract from request path if it's a web.Request
            if isinstance(request, web.Request) and hasattr(request, 'match_info'):
                provider_id = request.match_info.get('provider_id')
                self.logger.info(f"Extracted provider_id from match_info: {provider_id}")
            # Try to extract from MockRequest path
            elif hasattr(request, 'path'):
                path = request.path
                self.logger.info(f"Attempting to extract provider_id from path: {path}")
                # Parse the path manually
                parts = path.split('/')
                if len(parts) > 0:
                    potential_id = parts[-1]  # Last part of path
                    self.logger.info(f"Potential provider_id from path: {potential_id}")
                    provider_id = potential_id
            
            if not provider_id:
                self.logger.error("Could not extract provider_id from any source")
                return {
                    "success": False,
                    "error": {
                        "error_code": "VALIDATION_ERROR",
                        "message": "Provider ID is required"
                    }
                }
            
        # Check provider exists
        provider_exists = provider_id in self.state["auth"]["providers"]
        self.logger.info(f"Provider '{provider_id}' exists in state: {provider_exists}")
        
        if not provider_exists:
            self.logger.warning(f"Provider {provider_id} not found in state")
            self.logger.info(f"Available providers: {list(self.state['auth']['providers'].keys())}")
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Provider {provider_id} not found"
                }
            }
        
        self.logger.info(f"Current auth state before deletion: {json.dumps(self.state['auth'])}")
        self.logger.info(f"Provider to delete: {provider_id}")
        self.logger.info(f"Provider exists in state: {provider_id in self.state['auth']['providers']}")
        # Try to delete the provider
        try:
            del self.state["auth"]["providers"][provider_id]
            self.logger.info(f"Provider {provider_id} deleted from state")
            
            # Check if deletion was successful
            provider_deleted = provider_id not in self.state["auth"]["providers"]
            self.logger.info(f"Deletion successful: {provider_deleted}")
            
            # Delete credentials if they exist
            if "provider_credentials" in self.state["auth"] and provider_id in self.state["auth"]["provider_credentials"]:
                del self.state["auth"]["provider_credentials"][provider_id]
                self.logger.info(f"Provider credentials also deleted")
            
            # Log the state after deletion
            self.logger.info(f"Auth providers after deletion: {list(self.state['auth']['providers'].keys())}")
            
            return {
                "success": True,
                "data": None,
                "error": None,
                "metadata": {
                    "timestamp": "N/A"
                }
            }
        except Exception as e:
            self.logger.error(f"Exception during provider deletion: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            return {
                "success": False,
                "error": {
                    "error_code": "INTERNAL_ERROR",
                    "message": f"Error removing provider: {str(e)}"
                }
            }
    
    async def _handle_provider_types(self, request):
        """Handle provider types request."""
        return web.json_response({
            "success": True,
            "data": {
                "local": "LocalAuthProvider",
                "anthropic": "AnthropicAuthProvider",
                "ollama": "OllamaAuthProvider"
            },
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        })
    
    async def _handle_validate_token(self, request):
        """Handle token validation request."""
        # Log request type for debugging
        self.logger.info(f"_handle_validate_token called with request type: {type(request).__name__}")
        
        # Get request data
        data = None
        
        if isinstance(request, web.Request):
            try:
                data = await request.json()
                self.logger.info("Data extracted from web.Request")
            except Exception as e:
                self.logger.error(f"Failed to extract JSON from web.Request: {str(e)}")
        elif hasattr(request, 'data'):
            data = request.data
            self.logger.info(f"Data extracted from request.data attribute")
        elif hasattr(request, 'json') and callable(request.json):
            try:
                data = await request.json()
                self.logger.info("Data extracted using request.json() method")
            except Exception as e:
                self.logger.error(f"Failed to call request.json(): {str(e)}")
        elif isinstance(request, dict):
            data = request
            self.logger.info("Using request dict as data")
        
        # Log the data for debugging
        if data:
            self.logger.info(f"Validate token request data: {data}")
        else:
            self.logger.warning("No data extracted from request")
        
        # Validate
        if not isinstance(data, dict) or "session_token" not in data:
            self.logger.warning(f"Invalid data format or missing session_token field. Data keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid data - session_token is required"
                }
            }, status=422)
        
        # Validate token
        token = data["session_token"]
        self.logger.info(f"Validating token: {token[:10]}...")
        is_valid = self._validate_token(token)
        
        if not is_valid:
            self.logger.warning(f"Invalid session token: {token[:10]}...")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid session token"
                }
            }, status=401)
        
        self.logger.info("Session token validated successfully")
        return web.json_response({
            "success": True,
            "data": None,
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        })
    
    async def _handle_llm_initialize(self, request):
        """Handle LLM initialization request."""
        # Enhanced debugging
        self.logger.info(f"_handle_llm_initialize called with request type: {type(request).__name__}")
        
        # Check auth
        token = self._get_auth_token(request)
        self.logger.info(f"Extracted auth token: {token[:10] + '...' if token else 'None'}")
        
        if not self._validate_token(token):
            self.logger.warning("Invalid or missing token")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }, status=401)
        
        # Get request data
        data = None
        
        if isinstance(request, web.Request):
            try:
                data = await request.json()
                self.logger.info("Data extracted from web.Request")
            except Exception as e:
                self.logger.error(f"Failed to extract JSON from web.Request: {str(e)}")
        elif hasattr(request, 'data'):
            data = request.data
            self.logger.info(f"Data extracted from request.data")
        elif hasattr(request, 'json') and callable(request.json):
            try:
                data = await request.json()
                self.logger.info("Data extracted using request.json() method")
            except Exception as e:
                self.logger.error(f"Failed to call request.json(): {str(e)}")
        elif isinstance(request, dict):
            data = request
            self.logger.info("Using request dict as data")
        
        # Log the data for debugging
        if data:
            self.logger.info(f"Initialize LLM request data: {data}")
        else:
            self.logger.warning("No data extracted from request")
        
        # Validate
        if not isinstance(data, dict) or "provider_id" not in data:
            self.logger.warning(f"Invalid data format or missing provider_id. Data keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid data - provider_id is required"
                }
            }, status=422)
        
        # Check provider exists
        provider_id = data["provider_id"]
        if provider_id not in self.state["auth"]["providers"]:
            self.logger.warning(f"Provider {provider_id} not found")
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Provider {provider_id} not found"
                }
            }, status=404)
        
        self.logger.info(f"Initialized LLM with provider {provider_id}")
        return web.json_response({
            "success": True,
            "data": {
                "provider_id": provider_id,
                "status": "initialized",
                "model": "mock-model"
            },
            "error": None,
            "metadata": {
                "timestamp": "N/A"
            }
        })
    
    def _get_auth_token(self, request):
        """Extract the authentication token from a request."""
        # Log request type for debugging
        self.logger.info(f"[TOKEN DEBUG] Extracting auth token from: {type(request).__name__}")
        
        auth_header = None
        
        if isinstance(request, MockRequest):
            # For MockRequest objects
            self.logger.info(f"[TOKEN DEBUG] MockRequest headers: {request.headers}")
            auth_header = request.headers.get('Authorization', '')
        elif isinstance(request, web.Request):
            # For aiohttp requests
            self.logger.info(f"[TOKEN DEBUG] web.Request headers: {dict(request.headers)}")
            auth_header = request.headers.get('Authorization', '')
        elif isinstance(request, dict):
            if 'headers' in request and isinstance(request['headers'], dict):
                # For requests with headers dict
                self.logger.info(f"[TOKEN DEBUG] Request dict headers: {request['headers']}")
                auth_header = request['headers'].get('Authorization', '')
            else:
                # Try direct access for compatibility
                self.logger.info(f"[TOKEN DEBUG] Request dict keys: {list(request.keys())}")
                auth_header = request.get('Authorization', '')

        self.logger.info(f"[TOKEN DEBUG] Extracted auth_header: {auth_header}")

        # Extract token from Bearer format
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]
            self.logger.info(f"[TOKEN DEBUG] Extracted token: {token[:10]}...")
            return token
        
        # Log if we couldn't find a token
        if auth_header:
            self.logger.warning(f"[TOKEN DEBUG] No Bearer token in auth header: {auth_header[:20] if auth_header else 'None'}")
        else:
            self.logger.warning("No auth header found for validation")
        
        return None

    def _validate_token(self, token):
        """
        Validate an authentication token.
        
        Args:
            token: Token to validate
                
        Returns:
            True if valid, False otherwise
        """
        if not token:
            self.logger.warning("No token provided for validation")
            return False
        
        # In test mode, we accept the configured admin token
        admin_token = self.config.get("admin_token", "test-admin-token")
        
        if token == admin_token:
            return True
        
        # Additional token validation logic could be added here
        
        self.logger.warning(f"Invalid token provided: {token[:5]}...")
        return False
    
    def _extract_domain(self, url):
        """
        Extract domain from URL.
        
        Args:
            url: URL to process
            
        Returns:
            Domain string
        """

        domain_match = re.search(r'https?://([^/]+)', url)
        if domain_match:
            return domain_match.group(1)
        return "unknown"
    
    # API methods for test scenarios
    async def setup_test_auth(self):
        """
        Set up authentication for testing.
        
        Returns:
            Admin token for use in tests
        """
        return self.state["auth"]["admin_token"]
    
    def get_admin_token(self):
        """
        Get the admin token for testing.
        
        Returns:
            Admin token string
        """
        return self.state["auth"]["admin_token"]
    
    async def reset_auth_state(self):
        """Reset the authentication state."""
        self.state["auth"]["providers"] = {}
        self.state["auth"]["provider_credentials"] = {}