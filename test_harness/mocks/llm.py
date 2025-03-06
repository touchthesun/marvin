import os
import json
import time
import asyncio
import traceback
from typing import Dict, Any, List
from aiohttp import web
from core.utils.logger import get_logger
from test_harness.utils.helpers import find_free_port
from test_harness.mocks.base import BaseMockService


class LLMMockService(BaseMockService):
    """
    Mock implementation of a LLM provider service.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the LLM mock service.
        
        Args:
            config: LLM service configuration
        """
        super().__init__(config)
        self.requests = []
        self.responses = {}
        self.app = None
        self.runner = None
        self.site = None
        self.port = None
        self.url = None
        
        self.logger.debug(f"LLMMockService initialized with config: {config}")
    
    async def initialize(self):
        """
        Initialize the LLM mock service.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        try:
            # Load mock responses
            self.logger.info("Loading mock LLM responses")
            await self._load_mock_responses()
            
            # Start HTTP server if configured
            if self.config.get("use_http_server", True):
                self.logger.info("Starting HTTP server for LLM mock")
                await self._start_server()
            else:
                self.logger.info("HTTP server disabled (use_http_server=False)")
            
            return self
        except Exception as e:
            self.logger.error(f"Failed to initialize LLM mock service: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    async def shutdown(self):
        """Shut down the LLM mock service."""
        self.logger.info("Shutting down LLM mock service")
        
        if self.site:
            self.logger.debug("Stopping site")
            await self.site.stop()
        
        if self.runner:
            self.logger.debug("Cleaning up runner")
            await self.runner.cleanup()
        
        self.logger.debug("LLM mock service shutdown complete")
        await super().shutdown()
    
    async def _start_server(self):
        """Start the HTTP server for the mock LLM service."""
        self.logger.info("Starting LLM mock HTTP server")
        
        self.app = web.Application()
        
        # Add routes
        self.app.router.add_post("/v1/chat/completions", self._handle_chat_completions)
        self.app.router.add_post("/v1/completions", self._handle_completions)
        self.app.router.add_post("/v1/embeddings", self._handle_embeddings)
        
        # Start server
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        
        # Find an available port
        self.port = find_free_port(8000, 9000)
        self.site = web.TCPSite(self.runner, 'localhost', self.port)
        await self.site.start()
        
        self.url = f"http://localhost:{self.port}"
        self.logger.info(f"LLM mock server running at {self.url}")
    
    async def _load_mock_responses(self):
        """Load mock responses from configuration or files."""
        self.logger.info("Loading LLM mock responses")
        
        # Default response
        self.responses = {
            "default": {
                "id": "chatcmpl-123",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "claude-3-opus-20240229",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "This is a default mock response from the test harness."
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "total_tokens": 30
                }
            }
        }
        
        # Add direct responses from config
        config_responses = self.config.get("responses", {})
        if config_responses:
            self.responses.update(config_responses)
        
        # Load responses from directory if specified
        responses_dir = self.config.get("responses_dir")
        if responses_dir and os.path.isdir(responses_dir):
            self.logger.info(f"Loading responses from directory: {responses_dir}")
            
            for file_name in os.listdir(responses_dir):
                if file_name.endswith('.json'):
                    file_path = os.path.join(responses_dir, file_name)
                    try:
                        with open(file_path, 'r') as f:
                            response_key = file_name.replace('.json', '')
                            self.responses[response_key] = json.load(f)
                            self.logger.debug(f"Loaded response: {response_key}")
                    except Exception as e:
                        self.logger.error(f"Error loading response file {file_path}: {str(e)}")
        
        self.logger.info(f"Loaded {len(self.responses)} mock responses")
    
    async def _handle_chat_completions(self, request):
        """
        Handle chat completions API request.
        
        Args:
            request: HTTP request
            
        Returns:
            JSON response
        """
        # Get request body
        body = await request.json()
        self.requests.append(body)
        
        # Find matching response based on content
        response_key = self._find_response_key(body)
        mock_response = self.responses.get(response_key, self.responses["default"])
        
        # Add current timestamp
        mock_response["created"] = int(time.time())
        
        # Log the response being used
        self.logger.debug(f"Using mock response: {response_key}")
        
        # Simulate some processing time
        await asyncio.sleep(0.5)
        
        return web.json_response(mock_response)
    
    async def _handle_completions(self, request):
        """
        Handle completions API request.
        
        Args:
            request: HTTP request
            
        Returns:
            JSON response
        """
        # Get request body
        body = await request.json()
        self.requests.append(body)
        
        # Create a completions-style response
        response_key = self._find_response_key(body)
        chat_response = self.responses.get(response_key, self.responses["default"])
        
        # Convert to completions format
        completions_response = {
            "id": f"cmpl-{uuid.uuid4().hex[:10]}",
            "object": "text_completion",
            "created": int(time.time()),
            "model": body.get("model", "gpt-3.5-turbo"),
            "choices": [
                {
                    "text": chat_response["choices"][0]["message"]["content"],
                    "index": 0,
                    "logprobs": None,
                    "finish_reason": "stop"
                }
            ],
            "usage": chat_response["usage"]
        }
        
        # Simulate some processing time
        await asyncio.sleep(0.3)
        
        return web.json_response(completions_response)
    


    async def _handle_embeddings(self, request):
        """
        Handle embeddings API request.
        
        Args:
            request: HTTP request
            
        Returns:
            JSON response
        """
        # Get request body
        body = await request.json()
        self.requests.append(body)
        
        # Create a mock embeddings response
        input_texts = body.get("input", [])
        if isinstance(input_texts, str):
            input_texts = [input_texts]
        
        # Generate mock embeddings
        import random
        
        embeddings = []
        for i, text in enumerate(input_texts):
            # Create deterministic but seemingly random embeddings
            random.seed(text)
            embedding = [random.uniform(-1, 1) for _ in range(1536)]
            
            embeddings.append({
                "object": "embedding",
                "embedding": embedding,
                "index": i
            })
        
        response = {
            "object": "list",
            "data": embeddings,
            "model": body.get("model", "text-embedding-ada-002"),
            "usage": {
                "prompt_tokens": sum(len(text.split()) for text in input_texts),
                "total_tokens": sum(len(text.split()) for text in input_texts)
            }
        }
        
        # Simulate some processing time
        await asyncio.sleep(0.2)
        
        return web.json_response(response)
    
    def _find_response_key(self, request):
        """
        Find the appropriate response key based on the request content.
        
        Args:
            request: Request data
            
        Returns:
            Response key string
        """
        # Check for messages in chat requests
        if "messages" in request and request["messages"]:
            # Get the last user message
            for message in reversed(request["messages"]):
                if message.get("role") == "user":
                    content = message.get("content", "").lower()
                    
                    # Check for keyword matches
                    for key in self.responses:
                        if key != "default" and key.lower() in content:
                            return key
                    
                    break
        
        # Check for prompt in completions requests
        elif "prompt" in request:
            prompt = request["prompt"].lower() if isinstance(request["prompt"], str) else ""
            
            # Check for keyword matches
            for key in self.responses:
                if key != "default" and key.lower() in prompt:
                    return key
        
        return "default"
    
    async def generate_response(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate a response for the given messages.
        
        Args:
            messages: List of message objects
            
        Returns:
            Response data
        """
        # Create a request object
        request = {
            "model": "claude-3-opus-20240229",
            "messages": messages
        }
        
        # Find matching response
        response_key = self._find_response_key(request)
        response = self.responses.get(response_key, self.responses["default"])
        
        # Log the request and response
        self.requests.append(request)
        self.logger.debug(f"Generated response using key: {response_key}")
        
        # Clone to avoid modifying the original
        import copy
        response_copy = copy.deepcopy(response)
        
        # Update created timestamp
        response_copy["created"] = int(time.time())
        
        return response_copy