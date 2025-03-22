import os
import asyncio
import uuid
import json
import time
import random
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator
from aiohttp import web

from core.utils.logger import get_logger
from core.utils.helpers import find_free_port
from test_harness.services.base_llm_service import LLMServiceInterface

class MockLLMService(LLMServiceInterface):
    """
    Mock LLM service for testing without real API calls.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize with configuration.
        
        Args:
            config: Service configuration
        """
        self.config = config
        self.logger = get_logger("test.llm.mock")
        
        # Mock data storage
        self.providers = []
        self.models = {}
        self.tasks = {}
        self.requests = []
        self.responses = {}
        
        # HTTP server components
        self.app = None
        self.runner = None
        self.site = None
        self.port = None
        self.url = None
        
        # Configure mock behavior
        self.response_delay = config.get("response_delay", 0.5)
        self.stream_chunk_delay = config.get("stream_chunk_delay", 0.1)
        
        self.logger.debug(f"MockLLMService initialized with config: {config}")
        
    async def initialize(self) -> 'MockLLMService':
        """Initialize the service with mock data."""
        await super().initialize()
        
        try:
            self.logger.info("Initializing mock LLM service")
            
            # Set up mock providers and models
            self.providers = [
                {"id": "anthropic", "name": "Anthropic", "status": "active"},
                {"id": "ollama", "name": "Ollama", "status": "active"},
                {"id": "openai", "name": "OpenAI", "status": "inactive"}
            ]
            
            self.models = {
                "anthropic": [
                    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "context_length": 200000},
                    {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet", "context_length": 200000}
                ],
                "ollama": [
                    {"id": "llama3", "name": "Llama 3", "context_length": 8192},
                    {"id": "mistral", "name": "Mistral", "context_length": 8192}
                ],
                "openai": [
                    {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "context_length": 16385},
                    {"id": "gpt-4", "name": "GPT-4", "context_length": 8192}
                ]
            }
            
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
    
    async def shutdown(self) -> None:
        """Clean up resources."""
        self.logger.info("Shutting down mock LLM service")
        
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
        await asyncio.sleep(self.response_delay)
        
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
        await asyncio.sleep(self.response_delay)
        
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
        await asyncio.sleep(self.response_delay)
        
        return web.json_response(response)
    
        # LLMServiceInterface implementation methods
    
    async def list_providers(self) -> List[Dict[str, Any]]:
        """List available LLM providers."""
        await asyncio.sleep(self.response_delay)
        return self.providers
    
    async def list_models(self, provider_id: str) -> List[Dict[str, Any]]:
        """List available models for a provider."""
        await asyncio.sleep(self.response_delay)
        
        if provider_id not in self.models:
            self.logger.warning(f"Unknown provider: {provider_id}")
            return []
            
        return self.models[provider_id]
    
    async def generate(self, 
                      provider_id: str = None,
                      model_id: str = None,
                      prompt: str = "",
                      system_prompt: Optional[str] = None,
                      temperature: float = 0.7,
                      max_tokens: int = 1000,
                      stream: bool = False,
                      **kwargs) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate text from the LLM."""
        provider_id = provider_id or "anthropic"
        model_id = model_id or "claude-3-haiku-20240307"
        
        # Create a request object for response matching
        request = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": system_prompt} if system_prompt else {},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        # Get mock response based on prompt or use default
        response_key = self._find_response_key(request)
        mock_response = self.responses.get(
            response_key, 
            self.responses.get("default", "This is a mock response from the test harness.")
        )
        
        # Extract the actual response text
        if isinstance(mock_response, dict) and "choices" in mock_response:
            response_text = mock_response["choices"][0]["message"]["content"]
        elif isinstance(mock_response, str):
            response_text = mock_response
        else:
            response_text = "Mock response format error"
        
        # Simulate processing delay
        await asyncio.sleep(self.response_delay)
        
        if not stream:
            # Return complete response
            yield {
                "model": model_id,
                "response": response_text,
                "tokens": {
                    "prompt": len(prompt) // 4,
                    "completion": len(response_text) // 4,
                    "total": (len(prompt) + len(response_text)) // 4
                }
            }
        else:
            # Stream response in chunks
            chunks = self._split_into_chunks(response_text)
            for i, chunk in enumerate(chunks):
                await asyncio.sleep(self.stream_chunk_delay)
                is_last = i == len(chunks) - 1
                yield {
                    "text": chunk,
                    "done": is_last
                }
    
    def _split_into_chunks(self, text: str, chunk_size: int = 20) -> List[str]:
        """Split text into chunks for streaming."""
        words = text.split()
        chunks = []
        current_chunk = []
        
        for word in words:
            current_chunk.append(word)
            if len(current_chunk) >= chunk_size:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        return chunks
    
    async def create_agent_task(self,
                               query: str,
                               task_type: str = "query",
                               relevant_urls: Optional[List[str]] = None,
                               provider_id: Optional[str] = None,
                               model_id: Optional[str] = None,
                               **kwargs) -> Dict[str, Any]:
        """Create an agent task."""
        task_id = str(uuid.uuid4())
        
        # Create task in mock storage
        self.tasks[task_id] = {
            "id": task_id,
            "query": query,
            "task_type": task_type,
            "status": "enqueued",
            "created_at": datetime.now().isoformat(),
            "progress": 0.0,
            "provider_id": provider_id,
            "model_id": model_id,
            "relevant_urls": relevant_urls or []
        }
        
    async def _process_mock_task(self, task_id: str):
        """Process a mock agent task with realistic delays and state changes."""
        task = self.tasks[task_id]
        
        try:
            # Update status to processing
            task["status"] = "processing"
            task["progress"] = 0.1
            await asyncio.sleep(0.5)  # Initial delay
            
            # Simulate content retrieval
            task["progress"] = 0.3
            await asyncio.sleep(0.7)  # Content retrieval delay
            
            # Get query data
            query = task["query"]
            task_type = task["task_type"]
            relevant_urls = task["relevant_urls"]
            
            # Simulate LLM processing
            task["progress"] = 0.6
            await asyncio.sleep(1.0)  # LLM processing delay
            
            # Get matching response based on query content
            response_key = "default"
            for key in self.responses:
                if key != "default" and key.lower() in query.lower():
                    response_key = key
                    break
                    
            # Get response text
            mock_response = self.responses.get(response_key, self.responses["default"])
            if isinstance(mock_response, dict) and "choices" in mock_response:
                response_text = mock_response["choices"][0]["message"]["content"]
            elif isinstance(mock_response, str):
                response_text = mock_response
            else:
                response_text = f"Mock response for query: {query}"
            
            # Generate sources based on relevant_urls or query content
            sources = []
            if relevant_urls:
                for url in relevant_urls:
                    sources.append({
                        "url": url,
                        "title": url.split("/")[-1],
                        "relevance_score": 0.95
                    })
            else:
                # Add some default sources based on query content
                if "architecture" in query.lower():
                    sources.append({
                        "url": "https://example.com/decisions.md",
                        "title": "Architectural Decisions",
                        "relevance_score": 0.95
                    })
                elif "component" in query.lower():
                    sources.append({
                        "url": "https://example.com/overview.md",
                        "title": "System Overview",
                        "relevance_score": 0.92
                    })
                elif "api" in query.lower():
                    sources.append({
                        "url": "https://example.com/api-docs.md",
                        "title": "API Documentation",
                        "relevance_score": 0.89
                    })
            
            # Final processing
            task["progress"] = 0.9
            await asyncio.sleep(0.5)  # Final processing delay
            
            # Update task with results
            task["status"] = "completed"
            task["completed_at"] = datetime.now().isoformat()
            task["progress"] = 1.0
            task["result"] = {
                "response": response_text,
                "sources": sources,
                "confidence_score": 0.87
            }
            
        except Exception as e:
            self.logger.error(f"Error processing mock task: {str(e)}")
            task["status"] = "error"
            task["error"] = str(e)
            task["progress"] = 0.0

    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of an agent task."""
        await asyncio.sleep(self.response_delay * 0.5)  # Shorter delay for status checks
        
        if task_id not in self.tasks:
            self.logger.warning(f"Task not found: {task_id}")
            return {
                "success": False,
                "error": {
                    "message": f"Task not found: {task_id}",
                    "code": "TASK_NOT_FOUND"
                }
            }
        
        task = self.tasks[task_id]
        
        # If task is enqueued, start processing it
        if task["status"] == "enqueued":
            # Start background task to simulate processing
            asyncio.create_task(self._process_mock_task(task_id))
        
        return {
            "success": True,
            "data": {
                "task_id": task_id,
                "status": task["status"],
                "progress": task.get("progress", 0.0),
                "created_at": task["created_at"],
                "completed_at": task.get("completed_at"),
                "result": task.get("result"),
                "error": task.get("error")
            }
        }