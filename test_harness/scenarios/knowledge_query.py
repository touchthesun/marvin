import asyncio
import json

from core.utils.logger import get_logger
from test_harness.scenarios.base import TestScenario
from test_harness.assertions import Assertion
from test_harness.utils.paths import resolve_api_path

class KnowledgeQueryScenario(TestScenario):
    """
    Tests the flow from LLM agent to knowledge graph and back.
    
    This scenario validates that:
    1. The agent can query the knowledge graph
    2. The query task is processed correctly
    3. Relevant sources are retrieved from the knowledge graph
    4. The LLM generates an appropriate response
    """
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        self.logger.info("Setting up Knowledge Query scenario")
        
        # Set up authentication
        self.auth_token = await self.components["api"].setup_test_auth()
        self.admin_token = self.components["api"].get_admin_token()
        
        self.logger.info(f"Using auth_token: {self.auth_token}")
        self.logger.info(f"Using admin_token: {self.admin_token}")
        
        # Load test knowledge graph data if specified
        graph_data = self.test_data.get("graph_data")
        if graph_data:
            await self.components["neo4j"].load_test_data(graph_data)
        else:
            # Add some test pages to the graph
            self.logger.info("Adding test pages to the graph")
            test_pages = [
                "https://example.com/knowledge-test",
                "https://test.org/research-paper",
                "https://docs.python.org/3/tutorial/introduction.html"
            ]
            
            for url in test_pages:
                # Capture page to add to graph
                browser_data = await self.components["browser"].capture_page(url)
                
                # Send to API
                api_response = await self.components["api"].send_request(
                    "POST", 
                    "/api/v1/pages", 
                    browser_data,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                self.logger.debug(f"Added page {url} to graph, response: {api_response}")
            
            # Wait for page processing to complete
            self.logger.info("Waiting for page processing to complete")
            await asyncio.sleep(2)
        
    async def execute(self):
        """
        Execute the knowledge query scenario.
        
        Returns:
            List of result dictionaries, one per test query
        """
        self.logger.info("=" * 40)
        self.logger.info("Executing Knowledge Query scenario")
        self.logger.info("=" * 40)
        results = []
        
        # Get test queries from configuration
        test_queries = self.test_data.get("queries", [
            {
                "text": "What information do we have about Python?",
                "expected_sources": ["docs.python.org"]
            },
            {
                "text": "Summarize the key points from our research",
                "expected_sources": ["test.org/research-paper"]
            }
        ])
        
        for query in test_queries:
            self.logger.info(f"Testing query: {query['text']}")
            
            # 1. Send query to API
            query_op = f"agent_query_{len(results)}"
            with self.timed_operation(query_op):
                # Make sure we're sending the correct data structure
                query_data = {
                    "task_type": "QUERY",
                    "query": query["text"],
                    "relevant_urls": query.get("urls", []),
                    "conversation_id": None,  # Optional field
                    "context": {}  # Empty context dictionary
                }

                self.logger.info(f"Sending query data: {json.dumps(query_data)}")
                
                # Log the exact data we're sending
                self.logger.info(f"Sending query data: {json.dumps(query_data)}")
                
                self.logger.debug(f"Sending query data: {json.dumps(query_data)}")
                query_response = await self.components["api"].send_request(
                    "POST", 
                    resolve_api_path("/agent/query", self.config),  # Use the utility
                    query_data,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                self.logger.debug(f"Received query response: {json.dumps(query_response)}")
            
            # 2. Get task ID
            task_id = query_response.get("data", {}).get("task_id")
            
            if not task_id:
                self.logger.error(f"No task ID returned for query '{query['text']}'")
                self.logger.error(f"Response: {query_response}")
                results.append({
                    "query": query,
                    "query_response": query_response,
                    "success": False,
                    "error": "No task ID returned"
                })
                continue
            
            # 3. Track the task until completion
            task_result = await self._wait_for_task_completion(task_id)
            
            # 4. Collect results
            results.append({
                "query": query,
                "query_response": query_response,
                "task_result": task_result
            })
        
        return results

    async def validate(self, results):
        """
        Validate the scenario results.
        
        Args:
            results: List of result dictionaries from execute()
            
        Returns:
            List of assertions
        """
        self.logger.info("=" * 40)
        self.logger.info("Validating Knowledge Query scenario results")
        self.logger.info("=" * 40)
        assertions = []
        
        for i, result in enumerate(results):
            query = result["query"]
            
            # 1. Check task creation
            if not isinstance(result.get("query_response"), dict):
                assertions.append(self.create_assertion(
                    f"valid_query_response_{i}",
                    False,
                    f"Query response for '{query['text']}' should be a dictionary"
                ))
                continue
            
            # Check task creation
            has_task_id = "task_id" in result.get("query_response", {}).get("data", {})
            assertions.append(self.create_assertion(
                f"task_created_{i}",
                has_task_id,
                f"Agent should create a task for query '{query['text']}'"
            ))
            
            if not has_task_id:
                # Skip further checks if no task ID
                continue

            # 2. Check task completion
            task_status = result.get("task_result", {}).get("data", {}).get("status")
            assertions.append(self.create_assertion(
                f"task_completed_{i}",
                task_status == "completed",
                f"Query task should complete successfully (status: {task_status})"
            ))
            
            # 3. Check response content
            task_data = result.get("task_result", {}).get("data", {})
            task_result = task_data.get("result", {})
            
            has_response = "response" in task_result
            assertions.append(self.create_assertion(
                f"response_generated_{i}",
                has_response,
                f"Response should be generated for '{query['text']}'"
            ))
            
            # 4. Check sources (if expected)
            if "expected_sources" in query:
                sources = task_result.get("sources", [])
                source_urls = [source.get("url", "") for source in sources]
                
                for expected_source in query["expected_sources"]:
                    found = any(expected_source in url for url in source_urls)
                    assertions.append(self.create_assertion(
                        f"source_{i}_{expected_source}",
                        found,
                        f"Response should include source containing '{expected_source}'"
                    ))
        
        return assertions


    async def _wait_for_task_completion(self, task_id, max_wait=5, interval=1):
        """
        Wait for a task to complete.
        
        Args:
            task_id: Task ID to track
            max_wait: Maximum wait time in seconds
            interval: Polling interval in seconds
            
        Returns:
            Final task status response
        """
        self.logger.info(f"Waiting for task {task_id} to complete (timeout: {max_wait}s)")
        
        start_time = asyncio.get_event_loop().time()
        last_status = None
        attempts = 0
        
        while asyncio.get_event_loop().time() - start_time < max_wait:
            attempts += 1
            try:
                status_path = resolve_api_path(f"/agent/status/{task_id}", self.config)
                self.logger.info(f"Checking status (attempt {attempts}): GET {status_path}")
                self.logger.info(f"Task ID: '{task_id}'")
                
                status_response = await self.components["api"].send_request(
                    "GET",
                    status_path,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                last_status = status_response
                
                if not status_response.get("success", False):
                    self.logger.warning(f"Error response (attempt {attempts}): {json.dumps(status_response)}")
                    await asyncio.sleep(interval)
                    continue
                
                status = status_response.get("data", {}).get("status")
                self.logger.debug(f"Task status (attempt {attempts}): {status}")
                
                if status in ["completed", "error"]:
                    self.logger.info(f"Task {task_id} finished with status: {status} after {attempts} attempts")
                    return status_response
                
                progress = status_response.get("data", {}).get("progress", 0)
                self.logger.debug(f"Task {task_id} in progress: {progress:.0%}")
                
            except Exception as e:
                self.logger.warning(f"Exception checking task status (attempt {attempts}): {str(e)}")
                if last_status is None:
                    last_status = {"success": False, "error": {"message": str(e)}}
            
            # Increase interval slightly with each retry (up to 3 seconds)
            interval = min(interval * 1.2, 3)
            await asyncio.sleep(interval)
        
        self.logger.warning(f"Task {task_id} did not complete within {max_wait} seconds after {attempts} attempts")
        return last_status