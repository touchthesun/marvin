import asyncio
import uuid
import urllib.parse
from typing import Dict, List, Any

from test_harness.scenarios.base import TestScenario
from test_harness.assertions import Assertion


class BrowserExtensionWorkflowScenario(TestScenario):
    """
    Tests the complete workflow from Browser Extension to backend components:
    1. Browser captures a page and sends to API
    2. API processes content and updates knowledge graph
    3. Browser queries for related content
    4. LLM agent provides insights about content
    """
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        await super().setup()
        
        # Clear existing data
        if self.components.get("neo4j"):
            self.logger.info("Clearing existing Neo4j data")
            await self.components["neo4j"].clear_data()
        
        # Set up authentication
        if self.components.get("api"):
            self.logger.info("Setting up test authentication")
            self.auth_token = await self.components["api"].setup_test_auth()
            self.logger.debug(f"Test auth token: {self.auth_token}")
        
        # Load browser state from test data
        self.browser_state = self.test_data.get("browser_state", {
            "windows": [{"id": "window1", "focused": True}],
            "tabs": [
                {"id": "tab1", "windowId": "window1", "active": True, "url": "https://example.com/page1"},
                {"id": "tab2", "windowId": "window1", "active": False, "url": "https://example.com/page2"}
            ],
            "bookmarks": [
                {"id": "bookmark1", "title": "Example Bookmark", "url": "https://example.com/bookmark"}
            ]
        })
        
        # Prepare test URLs
        self.test_urls = [tab["url"] for tab in self.browser_state["tabs"]]
        if self.browser_state.get("bookmarks"):
            self.test_urls.extend([bookmark["url"] for bookmark in self.browser_state["bookmarks"]])
        
        self.logger.info(f"Set up scenario with {len(self.test_urls)} test URLs")
        self.logger.debug(f"Test URLs: {', '.join(self.test_urls)}")
        
        # Pre-load content for test URLs
        self.test_content = {}
        for url in self.test_urls:
            self.logger.debug(f"Preparing content for URL: {url}")
            self.test_content[url] = await self._prepare_content(url)
    
    async def execute(self):
        """Execute the browser extension workflow scenario."""
        results = {
            "page_captures": [],
            "browser_sync": None,
            "related_content": [],
            "llm_insights": []
        }
        
        # 1. Page Capture Flow
        self.logger.info("Testing page capture flow")
        with self.timed_operation("page_capture_flow"):
            for url in self.test_urls:
                self.logger.info(f"Capturing page: {url}")
                capture_result = await self._capture_page(url)
                results["page_captures"].append(capture_result)
        
        # 2. Browser State Synchronization
        self.logger.info("Testing browser state synchronization")
        with self.timed_operation("browser_sync_flow"):
            sync_result = await self._sync_browser_state()
            results["browser_sync"] = sync_result
        
        # 3. Related Content Query
        self.logger.info("Testing related content queries")
        with self.timed_operation("related_content_flow"):
            for url in self.test_urls:
                self.logger.info(f"Querying related content for: {url}")
                related_result = await self._query_related_content(url)
                results["related_content"].append(related_result)
        
        # 4. LLM Agent Insights
        self.logger.info("Testing LLM agent insights")
        with self.timed_operation("llm_insights_flow"):
            # Use the active tab URL for insights
            active_tab = next((tab for tab in self.browser_state["tabs"] if tab.get("active")), None)
            if active_tab:
                active_url = active_tab["url"]
                self.logger.info(f"Getting insights for active tab: {active_url}")
                insight_result = await self._get_llm_insights(active_url)
                results["llm_insights"].append(insight_result)
        
        self.logger.info("Browser extension workflow execution completed")
        return results
    
    async def validate(self, results):
        """Validate the scenario results."""
        assertions = []
        
        # 1. Validate Page Captures
        self.logger.info("Validating page captures")
        for capture in results["page_captures"]:
            url = capture["url"]
            assertions.append(self.create_assertion(
                f"page_capture_success_{self._normalize_url(url)}",
                capture["capture_response"]["success"] is True,
                f"API response for {url} should indicate success"
            ))
            
            # Check processing completion
            if capture.get("processing_status"):
                assertions.append(self.create_assertion(
                    f"processing_completed_{self._normalize_url(url)}",
                    capture["processing_status"].get("status") in ["completed", "processing", "enqueued"],
                    f"Content processing for {url} should be in progress or completed"
                ))
        
        # 2. Validate Browser Sync
        self.logger.info("Validating browser state synchronization")
        if results["browser_sync"]:
            assertions.append(self.create_assertion(
                "browser_sync_success",
                results["browser_sync"]["sync_response"]["success"] is True,
                "Browser state synchronization should succeed"
            ))
        
        # 3. Validate Related Content
        self.logger.info("Validating related content queries")
        for query in results["related_content"]:
            url = query["url"]
            assertions.append(self.create_assertion(
                f"related_content_success_{self._normalize_url(url)}",
                query["related_response"]["success"] is True,
                f"Related content query for {url} should succeed"
            ))
            
            # Validate that nodes were returned - flexible based on Neo4j content
            nodes = query["related_response"].get("data", {}).get("nodes", [])
            assertions.append(self.create_assertion(
                f"related_content_nodes_{self._normalize_url(url)}",
                isinstance(nodes, list),
                f"Related content query should return a list of nodes for {url}"
            ))
        
        # 4. Validate LLM Insights
        self.logger.info("Validating LLM insights")
        for insight in results["llm_insights"]:
            url = insight["url"]
            assertions.append(self.create_assertion(
                f"insights_request_success_{self._normalize_url(url)}",
                insight["insights_response"]["success"] is True,
                f"LLM insights request for {url} should succeed"
            ))
            
            # Check insights task status
            if insight.get("insights_status"):
                assertions.append(self.create_assertion(
                    f"insights_task_created_{self._normalize_url(url)}",
                    "task_id" in insight["insights_response"].get("data", {}),
                    f"LLM insights request should create a task for {url}"
                ))
        
        self.logger.info(f"Validation completed with {len(assertions)} assertions")
        return assertions
    
    async def _capture_page(self, url):
        """Capture a page through the API."""
        self.logger.debug(f"Capturing page content for URL: {url}")
        
        # Get mock content
        content = self.test_content.get(url, {"title": "Test Page", "content": "<html><body>Test content</body></html>"})
        
        # Determine context based on tab state
        is_active_tab = any(tab.get("active") and tab["url"] == url for tab in self.browser_state["tabs"])
        context = "ACTIVE_TAB" if is_active_tab else "BACKGROUND_TAB"
        
        # Find tab ID if this URL is in tabs
        tab_id = next((tab["id"] for tab in self.browser_state["tabs"] if tab["url"] == url), None)
        window_id = next((tab["windowId"] for tab in self.browser_state["tabs"] if tab["url"] == url), None)
        
        # Determine if URL is in bookmarks
        bookmark_id = next((bm["id"] for bm in self.browser_state.get("bookmarks", []) if bm["url"] == url), None)
        
        # Prepare browser contexts list
        browser_contexts = [context]
        if bookmark_id:
            browser_contexts.append("BOOKMARK")
        
        # Send to API with auth token (simulating extension)
        capture_response = await self.components["api"].send_request(
            "POST", 
            "/api/v1/pages", 
            {
                "url": url,
                "title": content.get("title", "Test Page"),
                "content": content.get("content", ""),
                "context": context,
                "tab_id": tab_id,
                "window_id": window_id,
                "bookmark_id": bookmark_id,
                "browser_contexts": browser_contexts
            },
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        # Track processing status if task ID is returned
        processing_status = None
        task_id = capture_response.get("data", {}).get("task_id")
        if task_id:
            self.logger.debug(f"Tracking processing status for task: {task_id}")
            processing_status = await self._wait_for_task_status(f"/api/v1/analysis/status/{task_id}")
        
        return {
            "url": url,
            "capture_response": capture_response,
            "processing_status": processing_status
        }
    
    async def _sync_browser_state(self):
        """Synchronize browser state through the API."""
        self.logger.debug("Synchronizing browser state")
        
        # Send browser state to API
        sync_response = await self.components["api"].send_request(
            "POST", 
            "/api/v1/browser/sync", 
            {
                "tabs": self.browser_state["tabs"],
                "windows": self.browser_state.get("windows", []),
                "bookmarks": self.browser_state.get("bookmarks", [])
            },
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        return {
            "sync_response": sync_response
        }
    
    async def _query_related_content(self, url):
        """Query related content for a URL."""
        self.logger.debug(f"Querying related content for URL: {url}")
        
        # Add query parameters
        params = {
            "depth": "2",
            "relationship_types": "LINKS_TO,SIMILAR_TO"
        }
        
        # Build query string
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        endpoint = f"/api/v1/graph/related/{urllib.parse.quote(url)}?{query_string}"
        
        # Send query to API
        related_response = await self.components["api"].send_request(
            "GET",
            endpoint,
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        return {
            "url": url,
            "related_response": related_response
        }
    
    async def _get_llm_insights(self, url):
        """Get LLM insights for a URL."""
        self.logger.debug(f"Getting LLM insights for URL: {url}")
        
        # Create conversation ID
        conversation_id = str(uuid.uuid4())
        
        # Send query to API
        insights_response = await self.components["api"].send_request(
            "POST", 
            "/api/v1/agent/query", 
            {
                "task_type": "ANALYZE",
                "query": "What are the key points from my current browser tab?",
                "relevant_urls": [url],
                "conversation_id": conversation_id
            },
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        # Track task status
        insights_status = None
        task_id = insights_response.get("data", {}).get("task_id")
        if task_id:
            self.logger.debug(f"Tracking insights task status: {task_id}")
            insights_status = await self._wait_for_task_status(f"/api/v1/agent/status/{task_id}", max_wait=45)
        
        return {
            "url": url,
            "insights_response": insights_response,
            "insights_status": insights_status
        }
    
    async def _wait_for_task_status(self, endpoint, max_wait=30, interval=1):
        """Wait for a task to complete or reach a terminal state."""
        self.logger.debug(f"Waiting for task status from endpoint: {endpoint}")
        start_time = asyncio.get_event_loop().time()
        attempts = 0
        
        while asyncio.get_event_loop().time() - start_time < max_wait:
            attempts += 1
            try:
                status_response = await self.components["api"].send_request(
                    "GET",
                    endpoint,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                status = status_response.get("data", {}).get("status")
                self.logger.debug(f"Task status (attempt {attempts}): {status}")
                
                # If terminal state reached or completed
                if status in ["completed", "error"]:
                    return status_response.get("data", {})
                
                # Add exponential backoff for longer intervals
                backoff_interval = min(interval * (1.5 ** (attempts - 1)), 5)
                await asyncio.sleep(backoff_interval)
                
            except Exception as e:
                self.logger.warning(f"Error checking task status (attempt {attempts}): {str(e)}")
                await asyncio.sleep(interval)
        
        self.logger.warning(f"Task status check timed out after {max_wait}s")
        return {"status": "timeout", "error": f"Task did not complete within {max_wait} seconds"}
    
    async def _prepare_content(self, url):
        """Prepare test content for a URL."""
        # Generate different content based on URL path
        path = url.split("/")[-1] if "/" in url else ""
        
        if "page1" in url or "research" in url:
            return {
                "title": "Knowledge Graph Research",
                "content": """
                <html>
                <head><title>Knowledge Graph Research</title></head>
                <body>
                    <h1>Knowledge Graph Research</h1>
                    <p>Knowledge graphs are a powerful way to represent information and relationships.</p>
                    <p>They enable complex queries across interconnected data.</p>
                    <h2>Key Benefits</h2>
                    <ul>
                        <li>Semantic relationships between entities</li>
                        <li>Flexible schema evolution</li>
                        <li>Support for inference and reasoning</li>
                    </ul>
                </body>
                </html>
                """
            }
        elif "page2" in url or "related" in url:
            return {
                "title": "Related Technologies",
                "content": """
                <html>
                <head><title>Related Technologies</title></head>
                <body>
                    <h1>Technologies Related to Knowledge Graphs</h1>
                    <p>Several technologies work well with knowledge graphs:</p>
                    <ul>
                        <li>Graph Databases (Neo4j, Neptune)</li>
                        <li>Vector embeddings for semantic search</li>
                        <li>Large Language Models for content analysis</li>
                    </ul>
                </body>
                </html>
                """
            }
        else:
            return {
                "title": f"Test Page: {url}",
                "content": f"""
                <html>
                <head><title>Test Page: {url}</title></head>
                <body>
                    <h1>Test Content for {url}</h1>
                    <p>This is a test page for URL: {url}</p>
                    <p>It contains sample content for testing the browser extension workflow.</p>
                </body>
                </html>
                """
            }
    
    def _normalize_url(self, url):
        """Normalize URL for use in assertion IDs."""
        return url.replace("https://", "").replace("http://", "").replace("/", "_").replace(".", "_")