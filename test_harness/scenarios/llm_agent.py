import time

from core.utils.logger import get_logger
from api.task_manager import TaskManager
from test_harness.scenarios.base import TestScenario
from test_harness.assertions import AssertionGroup



class LlmAgentScenario(TestScenario):
    """
    Tests the integration of the LLM agent with the knowledge graph:
    - Submit queries to the agent
    - Verify proper context retrieval from knowledge graph
    - Check response quality and source usage
    - Test different query types (simple query, research, summarization)
    """
    
    async def setup(self):
        """Set up the agent test prerequisite data."""
        self.logger = get_logger("LlmAgentScenario")
        self.logger.info("Setting up LLM agent scenario")
        
        # Get components
        self.api = self.components.get("api")
        self.neo4j = self.components.get("neo4j")
        self.llm_mock = self.components.get("llm")
        
        # Check if agent endpoints are available
        if hasattr(self.api, 'check_endpoint_availability'):
            agent_query_available = await self.api.check_endpoint_availability("POST", "agent/query")
            if not agent_query_available:
                self.logger.warning("Agent query endpoint is not available - test may fail")
        
        # Set up authentication
        self.auth_token = await self.api.setup_test_auth()
        
        # Load specific test documents into knowledge graph if needed
        if "graph_data" in self.test_data and self.test_data["graph_data"]:
            self.logger.info("Loading test data into knowledge graph")
            await self.neo4j.load_test_data(self.test_data["graph_data"])
        
        # Initialize results tracking
        self.results = {
            "success": True,
            "queries": [],
            "processed_queries": [],
            "failed_queries": [],
            "details": {}
        }
    
    async def execute(self):
        """Execute the LLM agent queries."""
        self.logger.info("Running LLM agent scenario")
        
        if not self.test_data.get("queries"):
            self.logger.warning("No queries specified in test data")
            return self.results
        
        self.logger.info(f"Processing {len(self.test_data['queries'])} agent queries")
        
        # Process each query
        for query_data in self.test_data["queries"]:
            query_id = query_data.get("id", f"query_{len(self.results['queries'])}")
            self.logger.info(f"Processing agent query {query_id}: {query_data.get('query', '')}")
            
            # Track this query
            self.results["queries"].append(query_id)
            
            # Process the query
            await self._process_agent_query(query_id, query_data)
        
        # Update overall success status
        self.results["success"] = len(self.results["failed_queries"]) == 0
        
        # Generate detailed report
        self.results["report"] = await self._generate_report()
        
        self.logger.info(f"LLM agent scenario completed: {len(self.results['processed_queries'])} successful, {len(self.results['failed_queries'])} failed")
        
        return self.results
    
    async def validate(self, results):
        """Validate the agent test results."""
        self.logger.info("Validating LLM agent test results")
        
        # Create assertion groups
        agent_assertions = AssertionGroup("agent_queries", "LLM Agent Query Tests")
        
        # Verify we processed at least one query successfully
        agent_assertions.create_and_add(
            "queries_processed",
            len(results["processed_queries"]) > 0,
            "At least one agent query should be processed successfully"
        )
        
        # Check detailed results for each successful query
        for query_id in results["processed_queries"]:
            detail = results["details"][query_id]
            query_data = next((q for q in self.test_data["queries"] if q.get("id") == query_id), {})
            
            # Task completed successfully
            agent_assertions.create_and_add(
                f"{query_id}_task_completion",
                detail.get("task_completed", False),
                f"Query task should complete successfully for {query_id}"
            )
            
            # Has response content
            agent_assertions.create_and_add(
                f"{query_id}_has_response",
                detail.get("has_response", False),
                f"Query should return a response for {query_id}"
            )
            
            # Check for expected content patterns if specified
            if "expected_content" in query_data:
                expected_content = query_data["expected_content"]
                response_content = detail.get("response_content", "").lower()
                
                # Handle different types of expected_content
                if isinstance(expected_content, list):
                    # Count how many expected items are found
                    found_items = [item.lower() for item in expected_content if item.lower() in response_content]
                    content_match = len(found_items) > 0
                    
                    # Create assertion with details
                    agent_assertions.create_and_add(
                        f"{query_id}_content_match",
                        content_match,
                        f"Found {len(found_items)}/{len(expected_content)} expected content items in response for {query_id}"
                    )
                    
                    # Add detail for each item
                    for item in expected_content:
                        item_found = item.lower() in response_content
                        agent_assertions.create_and_add(
                            f"{query_id}_content_{item.replace(' ', '_')}",
                            item_found,
                            f"Expected content '{item}' {'found' if item_found else 'not found'} in response"
                        )
                else:
                    # Single item check
                    content_found = expected_content.lower() in response_content
                    agent_assertions.create_and_add(
                        f"{query_id}_content_match",
                        content_found,
                        f"Expected content '{expected_content}' {'found' if content_found else 'not found'} in response"
                    )

            # Check for expected sources if specified
            if "expected_sources" in query_data:
                expected_sources = query_data["expected_sources"]
                sources = detail.get("sources", [])
                
                source_found = False
                for expected_source in expected_sources:
                    # More flexible matching - check if any source contains the expected_source
                    if any(expected_source in source for source in sources):
                        source_found = True
                        agent_assertions.create_and_add(
                            f"{query_id}_source_found",
                            source_found,
                            f"Response should include at least one expected source containing '{expected_source}'"
                        )
                        break
                
                if not source_found:
                    agent_assertions.create_and_add(
                        f"{query_id}_source_found",
                        False,
                        f"Response should include at least one source containing any of: {expected_sources}"
                    )
        
        # Return all assertions
        assertions = []
        assertions.extend(agent_assertions.assertions)
        return assertions
    
    async def _process_agent_query(self, query_id, query_data):
        """Process a single agent query."""
        start_time = time.time()
        
        try:
            # Extract query parameters
            query_text = query_data.get("query", "")
            query_type = query_data.get("task_type", "query").lower()
            relevant_urls = query_data.get("relevant_urls", [])
            provider_id = query_data.get("provider_id")
            model_id = query_data.get("model_id")
            
            # Prepare request data with specific provider and model
            request_data = {
                "query": query_text,
                "task_type": query_type,
                "relevant_urls": relevant_urls,
                "context": None,
                "constraints": None,
                "conversation_id": None,
                "provider_id": provider_id,
                "model_id": model_id 
            }
            
            # Log details about provider/model being used
            provider_info = f" using provider: {provider_id}" if provider_id else ""
            model_info = f" and model: {model_id}" if model_id else ""
            self.logger.info(f"Sending query to agent{provider_info}{model_info}: {query_text}")
            
            # Send query to agent
            query_response = await self.api.send_request(
                "POST",
                "/api/v1/agent/query",
                request_data,
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
            
            # Handle API error
            if not query_response.get("success", False):
                error_msg = query_response.get("error", "Unknown error")
                status_code = query_response.get("status_code", 0)
                self.logger.error(f"Failed to create agent task for {query_id}: {error_msg} (Status: {status_code})")
                self.results["failed_queries"].append(query_id)
                self.results["details"][query_id] = {
                    "status": "failed",
                    "error": error_msg,
                    "stage": "creation",
                    "status_code": status_code,
                    "processing_time": time.time() - start_time
                }
                return
            
            # Extract task ID
            task_id = query_response["data"]["task_id"]
            status_endpoint = query_response["data"].get("status_endpoint", "/api/v1/agent/status/")
            self.logger.info(f"Agent task created with ID: {task_id}")
            
            # Get max wait time from config or use default
            max_wait = self.config.get("agent", {}).get("max_wait_time", 60)
            
            # Wait for task completion
            try:
                task_result = await TaskManager.wait_for_task_completion(
                api_service=self.api,
                task_id=task_id,
                auth_token=self.auth_token,
                status_endpoint=status_endpoint,
                max_wait=max_wait,
                initial_interval=1.0
            )
            except ValueError as ve:
                self.logger.error(f"Invalid parameters: {str(ve)}")
                self.results["failed_queries"].append(query_id)
                self.results["details"][query_id] = {
                    "status": "failed",
                    "error": str(ve),
                    "stage": "processing",
                    "processing_time": time.time() - start_time
                }
                return
            except Exception as wait_error:
                self.logger.error(f"Error waiting for task completion: {str(wait_error)}")
                self.results["failed_queries"].append(query_id)
                self.results["details"][query_id] = {
                    "status": "failed",
                    "error": str(wait_error),
                    "stage": "processing",
                    "processing_time": time.time() - start_time
                }
                return
            
            # Check if task completed successfully
            task_completed = (
                task_result.get("success", False) and
                task_result.get("data", {}).get("status") == "completed"
            )
            
            if not task_completed:
                self.logger.error(f"Agent task did not complete successfully: {task_result}")
                self.results["failed_queries"].append(query_id)
                self.results["details"][query_id] = {
                    "status": "failed",
                    "error": task_result.get("data", {}).get("error", "Task did not complete"),
                    "stage": "execution",
                    "task_status": task_result.get("data", {}).get("status", "unknown"),
                    "processing_time": time.time() - start_time
                }
                return
            
            # Extract and check response
            result_data = task_result.get("data", {}).get("result", {})
            response_content = result_data.get("response", "")
            sources = result_data.get("sources", [])
            source_urls = [s.get("url", "") for s in sources]
            
            # Log response content for debugging
            self.logger.info(f"Response for {query_id}: {response_content[:200]}...")
            self.logger.info(f"Sources for {query_id}: {source_urls}")
            
            # Extract provider information if available
            provider_used = result_data.get("provider_id", "unknown")
            model_used = result_data.get("model", "unknown")
            
            # Record success with enhanced details
            processing_time = time.time() - start_time
            self.results["processed_queries"].append(query_id)
            self.results["details"][query_id] = {
                "status": "success",
                "task_id": task_id,
                "task_completed": True,
                "has_response": bool(response_content),
                "response_content": response_content,
                "sources": source_urls,
                "source_count": len(sources),
                "processing_time": processing_time,
                "provider_used": provider_used,
                "model_used": model_used,
                "full_result": result_data,  # Store complete result data
                "complete_task_result": task_result  # Store complete task result
            }
            
            self.logger.info(f"Successfully processed query {query_id} in {processing_time:.2f}s")
            
        except Exception as e:
            processing_time = time.time() - start_time
            self.logger.error(f"Error processing query {query_id}: {str(e)}", exc_info=True)
            self.results["failed_queries"].append(query_id)
            self.results["details"][query_id] = {
                "status": "error",
                "error": str(e),
                "processing_time": processing_time
            }
    
    async def _configure_llm_responses(self):
        """Configure LLM mock with the responses from test data."""
        try:
            responses_file = self.test_data["llm_responses"]
            
            # For LLMMockService that accepts configs directly
            if hasattr(self.llm_mock, "configure_responses"):
                await self.llm_mock.configure_responses(responses_file)
            # For older versions that don't have this method
            else:
                self.logger.warning("LLM mock service doesn't support dynamic configuration")
        except Exception as e:
            self.logger.error(f"Failed to configure LLM responses: {str(e)}")
    
    async def _generate_report(self):
        """Generate a detailed report of the agent test results."""
        report = {
            "summary": {
                "total_queries": len(self.results.get("queries", [])),
                "processed": len(self.results.get("processed_queries", [])),
                "failed": len(self.results.get("failed_queries", [])),
                "success_rate": f"{len(self.results.get('processed_queries', [])) / len(self.results.get('queries', [])) * 100:.1f}%" if self.results.get("queries") else "0%"
            },
            "query_details": {},
            "llm_providers": {}  # New section for provider details
        }
        
        # Track used providers
        providers_used = set()
        
        # Add successful queries
        for query_id in self.results.get("processed_queries", []):
            details = self.results.get("details", {}).get(query_id, {})
            
            # Extract query text
            query_text = next((q.get("query", "") for q in self.test_data["queries"] if q.get("id") == query_id), "")
            
            # Track provider
            provider_used = details.get("provider_used", "unknown")
            providers_used.add(provider_used)
            
            report["query_details"][query_id] = {
                "status": "success",
                "query": query_text,
                "processing_time": f"{details.get('processing_time', 0):.2f}s",
                "source_count": details.get("source_count", 0),
                "sources": details.get("sources", []),
                "provider": provider_used,
                "model": details.get("model_used", "unknown"),
                "response_snippet": details.get("response_content", "")[:200] + "..." if details.get("response_content") else "",
                "full_response_length": len(details.get("response_content", ""))
            }
        
        # Add failed queries
        for query_id in self.results.get("failed_queries", []):
            details = self.results.get("details", {}).get(query_id, {})
            
            # Extract query text
            query_text = next((q.get("query", "") for q in self.test_data["queries"] if q.get("id") == query_id), "")
            
            report["query_details"][query_id] = {
                "status": "failed",
                "query": query_text,
                "stage": details.get("stage", "unknown"),
                "error": details.get("error", "Unknown error"),
                "processing_time": f"{details.get('processing_time', 0):.2f}s"
            }
        
        # Add provider summary
        for provider_id in providers_used:
            provider_queries = [
                q_id for q_id in self.results.get("processed_queries", [])
                if self.results.get("details", {}).get(q_id, {}).get("provider_used") == provider_id
            ]
            
            report["llm_providers"][provider_id] = {
                "query_count": len(provider_queries),
                "queries": provider_queries
            }
        
        return report
    
    def _safe_url_for_name(self, url):
        """Convert URL to a safe string for use in assertion names."""
        return url.replace("https://", "").replace("http://", "").replace("/", "_").replace(".", "_")
    
