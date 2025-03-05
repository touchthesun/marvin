import asyncio

from core.utils.logger import get_logger
from test_harness.scenarios.base import TestScenario
from test_harness.assertions import Assertion

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
        self.logger.info("Executing Knowledge Query scenario")
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
                # FIX 1: Remove the API prefix from the path - let the service handle it
                # FIX 2: Ensure the request data structure is correct
                query_data = {
                    "task_type": "QUERY",
                    "query": query["text"],
                    "relevant_urls": query.get("urls", [])
                }
                
                # Log the request data for debugging
                self.logger.debug(f"Sending agent query request with data: {query_data}")
                
                query_response = await self.components["api"].send_request(
                    "POST", 
                    "/agent/query",  # Remove prefix, let the service handle it 
                    query_data,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
            
            # 2. Get task ID
            task_id = query_response.get("data", {}).get("task_id")
            
            if not task_id:
                self.logger.error(f"No task ID returned for query '{query['text']}'")
                self.logger.error(f"Response: {query_response}")  # Added logging for debugging
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
        self.logger.info("Validating Knowledge Query scenario results")
        assertions = []
        
        for i, result in enumerate(results):
            query = result["query"]
            
            # 1. Check task creation
            assertions.append(self.create_assertion(
                f"task_created_{i}",
                "task_id" in result["query_response"].get("data", {}),
                f"Agent should create a task for query '{query['text']}'"
            ))
            
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
    
    async def _wait_for_task_completion(self, task_id, max_wait=10, interval=0.5):
        """
        Wait for a task to complete.
        
        Args:
            task_id: Task ID to track
            max_wait: Maximum wait time in seconds
            interval: Polling interval in seconds
            
        Returns:
            Final task status response
        """
        self.logger.info(f"Waiting for task {task_id} to complete")
        
        start_time = asyncio.get_event_loop().time()
        last_status = None
        
        while asyncio.get_event_loop().time() - start_time < max_wait:
            # FIX: Remove the API prefix from the path
            status_response = await self.components["api"].send_request(
                "GET",
                f"/agent/status/{task_id}",  # Remove prefix, let the service handle it
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
            
            last_status = status_response
            
            if not status_response.get("success", False):
                self.logger.warning(f"Error checking task status: {status_response}")
                await asyncio.sleep(interval)
                continue
            
            status = status_response.get("data", {}).get("status")
            
            if status in ["completed", "error"]:
                self.logger.info(f"Task {task_id} finished with status: {status}")
                return status_response
            
            progress = status_response.get("data", {}).get("progress", 0)
            self.logger.debug(f"Task {task_id} in progress: {progress:.0%}")
            
            await asyncio.sleep(interval)
        
        self.logger.warning(f"Task {task_id} did not complete within {max_wait} seconds")
        return last_status