import re
import json
import uuid
import asyncio
import datetime
from typing import Dict, Any, Optional, Callable
from aiohttp import web
from core.utils.logger import get_logger
from test_harness.utils.helpers import find_free_port
from test_harness.mocks.neo4j import BaseMockService


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
        
    async def initialize(self):
        """
        Initialize the mock API service.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        # Set up routes
        self._setup_routes()
        
        # Start the HTTP server if configured
        if self.config.get("start_server", True):
            await self._start_server()
        
        return self
    
    async def _start_server(self):
        """Start the HTTP server."""
        self.logger.info(f"Starting mock API server on port {self.port}")
        
        self.app = web.Application()
        
        # Register routes with aiohttp
        for method, path_handlers in self.routes.items():
            for path_pattern, handler in path_handlers.items():
                # Convert path pattern to aiohttp compatible
                aiohttp_pattern = re.sub(r'{([^}]+)}', r'{\1}', path_pattern)
                
                # Add route
                self.app.router.add_route(method, aiohttp_pattern, handler)
        
        # Start server
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, 'localhost', self.port)
        await self.site.start()
        
        self.logger.info(f"Mock API server running at {self.base_url}")
    
    async def shutdown(self):
        """Shut down the mock API service."""
        self.logger.info("Shutting down mock API server")
        
        if self.site:
            await self.site.stop()
        
        if self.runner:
            await self.runner.cleanup()
        
        await super().shutdown()
    
    def _setup_routes(self):
        """Set up the mock API routes."""
        # Format: {method: {path: handler}}
        self.routes = {
            "GET": {
                "/api/v1/health": self._handle_health,
                "/api/v1/pages": self._handle_get_pages,
                "/api/v1/graph/related/{url}": self._handle_related_pages,
                "/api/v1/analysis/status/{task_id}": self._handle_analysis_status,
                "/api/v1/auth/providers": self._handle_list_providers,
                "/api/v1/auth/providers/{provider_id}": self._handle_get_provider,
                "/api/v1/auth/provider-types": self._handle_provider_types,
            },
            "POST": {
                "/api/v1/pages": self._handle_create_page,
                "/api/v1/analysis/analyze": self._handle_analyze_page,
                "/api/v1/agent/query": self._handle_agent_query,
                "/api/v1/auth/providers": self._handle_create_provider,
                "/api/v1/auth/validate": self._handle_validate_token,
                "/api/v1/llm/initialize": self._handle_llm_initialize,
            },
            "DELETE": {
                "/api/v1/auth/providers/{provider_id}": self._handle_delete_provider,
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
        self.logger.debug(f"Mock API request: {method} {path}")
        
        # Find the handler for this route
        handler = self._get_route_handler(method, path)
        
        if not handler:
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Route not found: {method} {path}"
                }
            }
        
        # Process the request
        try:
            if asyncio.iscoroutinefunction(handler):
                # For aiohttp handlers
                headers = headers or {}
                request = MockRequest(method, path, data, headers)
                response = await handler(request)
                
                if isinstance(response, web.Response):
                    # Convert aiohttp response to dict
                    body = response.body.decode('utf-8') if response.body else '{}'
                    return json.loads(body)
                return response
            else:
                # For direct function calls
                return await handler(data, headers)
                
        except Exception as e:
            self.logger.error(f"Error handling request: {str(e)}")
            return {
                "success": False,
                "error": {
                    "error_code": "INTERNAL_ERROR",
                    "message": f"Error processing request: {str(e)}"
                }
            }
    
    def _get_route_handler(self, method: str, path: str) -> Optional[Callable]:
        """
        Get the handler for a specific route.
        
        Args:
            method: HTTP method
            path: URL path
            
        Returns:
            Route handler or None
        """
        method_routes = self.routes.get(method, {})
        
        # First try exact match
        if path in method_routes:
            return method_routes[path]
        
        # Try pattern matching
        for route_pattern, handler in method_routes.items():
            # Skip exact matches
            if '{' not in route_pattern:
                continue
            
            # Convert route pattern to regex
            route_regex = '^' + re.sub(r'{([^}]+)}', r'(?P<\1>[^/]+)', route_pattern) + '$'
            match = re.match(route_regex, path)
            
            if match:
                # Return a wrapper that extracts path params
                async def handler_with_params(request_data, headers):
                    return await handler(request_data, headers, match.groupdict())
                return handler_with_params
        
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
        # Get URL from path parameter
        url = params.get("url") if params else None
        
        if not url:
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "URL parameter is required"
                }
            }
        
        # Find the page by URL or create mock data
        found_page = None
        for page in self.state["pages"].values():
            if page["url"] == url:
                found_page = page
                break
        
        # Create mock graph data
        nodes = []
        relationships = []
        
        if found_page:
            # Add the main page as a node
            nodes.append({
                "id": found_page["id"],
                "url": found_page["url"],
                "domain": found_page["domain"],
                "title": found_page.get("title", "Untitled"),
                "last_active": found_page.get("last_active"),
                "metadata": found_page.get("metadata", {})
            })
            
            # Add some related pages (up to 3)
            related_count = min(3, len(self.state["pages"]) - 1)
            related_pages = [p for p in self.state["pages"].values() if p["id"] != found_page["id"]][:related_count]
            
            for i, related in enumerate(related_pages):
                # Add node
                nodes.append({
                    "id": related["id"],
                    "url": related["url"],
                    "domain": related["domain"],
                    "title": related.get("title", "Untitled"),
                    "last_active": related.get("last_active"),
                    "metadata": related.get("metadata", {})
                })
                
                # Add relationship
                rel_id = f"r{i+1}"
                rel_type = ["LINKS_TO", "SIMILAR_TO", "RELATED_TO"][i % 3]
                relationships.append({
                    "id": rel_id,
                    "source_id": found_page["id"],
                    "target_id": related["id"],
                    "type": rel_type,
                    "strength": 0.5 + (0.1 * i),
                    "metadata": {
                        "created_at": datetime.datetime.now().isoformat()
                    }
                })
        else:
            # Create a mock main node
            main_id = str(uuid.uuid4())
            nodes.append({
                "id": main_id,
                "url": url,
                "domain": self._extract_domain(url),
                "title": f"Page at {url}",
                "last_active": datetime.datetime.now().isoformat(),
                "metadata": {}
            })
        
        return {
            "success": True,
            "data": {
                "nodes": nodes,
                "relationships": relationships
            },
            "metadata": {
                "timestamp": datetime.datetime.now().isoformat()
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
        # Get request data
        if isinstance(request, web.Request):
            data = await request.json()
        else:
            data = request
        
        # Validate
        if not isinstance(data, dict) or "query" not in data:
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
        
        # Add mock result
        query = task["query"]
        result = {
            "response": f"Here is a mock response to your query: '{query}'",
            "sources": []
        }
        
        # Add sources if we have pages
        if self.state["pages"]:
            sources = list(self.state["pages"].values())[:3]
            result["sources"] = [
                {
                    "url": source["url"],
                    "title": source.get("title", "Untitled"),
                    "relevance_score": 0.8 - (i * 0.1),
                    "context_used": "Sample context from the page",
                    "accessed_at": datetime.datetime.now().isoformat()
                }
                for i, source in enumerate(sources)
            ]
        
        task["result"] = result
    
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
        
        # Get request data
        if isinstance(request, web.Request):
            data = await request.json()
        else:
            data = request
        
        # Validate
        if not isinstance(data, dict) or "provider_id" not in data or "provider_type" not in data or "credentials" not in data:
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
        
        self.state["auth"]["providers"][provider_id] = {
            "provider_id": provider_id,
            "provider_type": data["provider_type"],
            "created": timestamp,
            "modified": timestamp,
            "size": len(json.dumps(data["credentials"]))
        }
        
        # Store credentials (in real implementation, these would be encrypted)
        self.state["auth"]["provider_credentials"] = self.state["auth"].get("provider_credentials", {})
        self.state["auth"]["provider_credentials"][provider_id] = data["credentials"]
        
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
        # Check auth
        token = self._get_auth_token(request) if isinstance(request, web.Request) else (headers or {}).get("Authorization", "").replace("Bearer ", "")
        if not self._validate_token(token):
            return {
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }
        
        # Get provider_id from path parameter
        provider_id = params.get("provider_id") if params else None
        
        if not provider_id:
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
        # Check auth
        token = self._get_auth_token(request) if isinstance(request, web.Request) else (headers or {}).get("Authorization", "").replace("Bearer ", "")
        if not self._validate_token(token):
            return {
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid or missing authentication token"
                }
            }
        
        # Get provider_id from path parameter
        provider_id = params.get("provider_id") if params else None
        
        if not provider_id:
            return {
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Provider ID is required"
                }
            }
        
        # Check provider exists
        if provider_id not in self.state["auth"]["providers"]:
            return {
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Provider {provider_id} not found"
                }
            }
        
        # Delete provider
        del self.state["auth"]["providers"][provider_id]
        
        # Delete credentials if they exist
        if "provider_credentials" in self.state["auth"] and provider_id in self.state["auth"]["provider_credentials"]:
            del self.state["auth"]["provider_credentials"][provider_id]
        
        return {
            "success": True,
            "data": None,
            "error": None,
            "metadata": {
                "timestamp": "N/A"
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
        # Get request data
        if isinstance(request, web.Request):
            data = await request.json()
        else:
            data = request
        
        # Validate
        if not isinstance(data, dict) or "session_token" not in data:
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "VALIDATION_ERROR",
                    "message": "Invalid data - session_token is required"
                }
            }, status=422)
        
        # Validate token
        token = data["session_token"]
        is_valid = self._validate_token(token)
        
        if not is_valid:
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "AUTHORIZATION_ERROR",
                    "message": "Invalid session token"
                }
            }, status=401)
        
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
        
        # Get request data
        if isinstance(request, web.Request):
            data = await request.json()
        else:
            data = request
        
        # Validate
        if not isinstance(data, dict) or "provider_id" not in data:
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
            return web.json_response({
                "success": False,
                "error": {
                    "error_code": "NOT_FOUND",
                    "message": f"Provider {provider_id} not found"
                }
            }, status=404)
        
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
    
    # Helper methods
    def _get_auth_token(self, request):
        """Extract the authentication token from a request."""
        if isinstance(request, web.Request):
            # For aiohttp requests
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                return auth_header[7:]
        elif isinstance(request, dict):
            # For direct function calls
            headers = request.get('headers', {})
            auth_header = headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                return auth_header[7:]
        
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
            return False
        
        # In test mode, we accept the configured admin token
        admin_token = self.state["auth"]["admin_token"]
        return token == admin_token
    
    def _extract_domain(self, url):
        """
        Extract domain from URL.
        
        Args:
            url: URL to process
            
        Returns:
            Domain string
        """
        import re
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

class MockRequest:
    """Simple request class for mocking aiohttp requests."""
    
    def __init__(self, method, path, data=None, headers=None):
        self.method = method
        self.path = path
        self.data = data
        self.headers = headers or {}
        
        # Parse query parameters
        import urllib.parse
        self.query = {}
        if '?' in path:
            query_string = path.split('?', 1)[1]
            self.query = dict(urllib.parse.parse_qsl(query_string))
        
    async def json(self):
        """Get request data as JSON."""
        return self.data