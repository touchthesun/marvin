import asyncio
import urllib.parse
from test_harness.utils.helpers import wait_for_task_completion
from test_harness.scenarios.base import TestScenario

class PageCaptureScenario(TestScenario):
    """
    Tests the flow from browser extension to knowledge graph.
    
    This scenario validates that:
    1. The browser can capture page content
    2. The API can receive and process the page data
    3. The knowledge graph correctly stores the page and its relationships
    4. The content processing pipeline runs successfully
    """
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        self.logger.info("Setting up Page Capture scenario")
        
        # Clear existing data
        await self.components["neo4j"].clear_data()
        
        # Set up authentication
        self.auth_token = await self.components["api"].setup_test_auth()
        self.logger.info(f"Using auth token: {self.auth_token}")
    
    async def execute(self):
        """
        Execute the page capture scenario.
        
        Returns:
            List of result dictionaries, one per test URL
        """
        self.logger.info("Executing Page Capture scenario")
        results = []
        
        # Get test URLs from configuration
        test_urls = self.test_data.get("urls", [
            "https://example.com",
            "https://test.org/page1",
            "https://docs.python.org/3/tutorial/"
        ])
        
        for test_url in test_urls:
            self.logger.info(f"Testing page capture for: {test_url}")
            
            # 1. Simulate browser capturing the page
            browser_op = f"browser_capture_{len(results)}"
            with self.timed_operation(browser_op):
                browser_data = await self.components["browser"].capture_page(test_url)

            api_request_data = {
                "url": browser_data["url"],
                "title": browser_data.get("title", "Untitled"),
                "context": browser_data.get("context", "ACTIVE_TAB"),
                "tab_id": browser_data.get("tab_id"),
                "window_id": browser_data.get("window_id"),
                "browser_contexts": browser_data.get("browser_contexts", ["ACTIVE_TAB"])
            }
            
            # 2. Send to API with auth token
            api_op = f"api_create_page_{len(results)}"
            with self.timed_operation(api_op):
                api_response = await self.components["api"].send_request(
                    "POST", 
                    "/pages",  # Path will be resolved by the API service
                    api_request_data,  # Use the properly structured data
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
            
            # Wait briefly for async processing to start
            await asyncio.sleep(0.5)
            
            # 3. Get task status
            task_id = api_response.get("data", {}).get("task_id")
            
            if not task_id:
                self.logger.error(f"No task ID returned for {test_url}")
                results.append({
                    "url": test_url,
                    "browser_data": browser_data,
                    "api_response": api_response,
                    "success": False,
                    "error": "No task ID returned"
                })
                continue
            
            # 4. Poll task status until complete or timeout
            task_status  = await wait_for_task_completion(
                task_id, 
                max_wait=60
            )
            
            # 5. Query the Knowledge Graph for the captured page
            graph_op = f"graph_query_{len(results)}"
            with self.timed_operation(graph_op):
                graph_response = await self.components["api"].send_request(
                    "GET",
                    f"/graph/related/{urllib.parse.quote(test_url)}",  # No need to manually add prefix
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
            
            # 6. Collect results
            results.append({
                "url": test_url,
                "browser_data": browser_data,
                "api_response": api_response,
                "task_status": task_status,
                "graph_response": graph_response
            })
        
        return results
    
    # Instead use test_harnes.utils.helpers.wait_for_task_completion
    # async def _wait_for_task_completion(self, task_id, max_wait=5, interval=0.5):
    #     """
    #     Wait for a task to complete or reach processing state.
        
    #     Args:
    #         task_id: Task ID to check
    #         max_wait: Maximum wait time in seconds
    #         interval: Polling interval in seconds
            
    #     Returns:
    #         Final task status response
    #     """
    #     self.logger.info(f"Waiting for task {task_id} to complete")
        
    #     start_time = asyncio.get_event_loop().time()
    #     last_status = None
        
    #     while asyncio.get_event_loop().time() - start_time < max_wait:
    #         status_response = await self.components["api"].send_request(
    #             "GET",
    #             f"/analysis/status/{task_id}",  # No need to manually add prefix
    #             headers={"Authorization": f"Bearer {self.auth_token}"}
    #         )
            
    #         last_status = status_response
            
    #         if not status_response.get("success", False):
    #             self.logger.warning(f"Error checking task status: {status_response}")
    #             await asyncio.sleep(interval)
    #             continue
            
    #         status = status_response.get("data", {}).get("status")
            
    #         if status in ["completed", "error"]:
    #             self.logger.info(f"Task {task_id} finished with status: {status}")
    #             return status_response
            
    #         progress = status_response.get("data", {}).get("progress", 0)
    #         self.logger.debug(f"Task {task_id} in progress: {progress:.0%}")
            
    #         await asyncio.sleep(interval)
        
    #     self.logger.warning(f"Task {task_id} did not complete within {max_wait} seconds")
    #     return last_status
    
    async def validate(self, results):
        """
        Validate the scenario results.
        
        Args:
            results: List of result dictionaries from execute()
            
        Returns:
            List of assertions
        """
        self.logger.info("Validating Page Capture scenario results")
        assertions = []
        
        for i, result in enumerate(results):
            url = result["url"]
            
            # 1. Check API success
            assertions.append(self.create_assertion(
                f"api_success_{i}",
                result["api_response"].get("success", False) is True,
                f"API response for {url} should indicate success"
            ))
            
            # 2. Check task creation
            assertions.append(self.create_assertion(
                f"task_created_{i}",
                "task_id" in result["api_response"].get("data", {}),
                f"API should create a task for processing {url}"
            ))
            
            # 3. Check task completion
            task_status = result.get("task_status", {}).get("data", {}).get("status")
            assertions.append(self.create_assertion(
                f"task_completed_{i}",
                task_status in ["completed", "processing", "enqueued"],
                f"Task for {url} should be in a valid state (got: {task_status})"
            ))
            
            # 4. Check graph storage (nodes should exist)
            graph_data = result.get("graph_response", {}).get("data", {})
            has_nodes = len(graph_data.get("nodes", [])) > 0
            assertions.append(self.create_assertion(
                f"graph_storage_{i}",
                has_nodes,
                f"Knowledge graph should contain nodes for {url}"
            ))
            
            # 5. Check URL in graph response
            url_in_graph = False
            for node in graph_data.get("nodes", []):
                if node.get("url") == url:
                    url_in_graph = True
                    break
            
            assertions.append(self.create_assertion(
                f"url_in_graph_{i}",
                url_in_graph,
                f"URL {url} should be found in graph nodes"
            ))
        
        return assertions
    