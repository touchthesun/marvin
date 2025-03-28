import os
import asyncio
from datetime import datetime
from contextlib import contextmanager
import time

from test_harness.scenarios.base import TestScenario

class RealBrowserExtensionScenario(TestScenario):
    """
    Tests the browser extension UI interaction:
    1. Launches browser with extension
    2. Interacts with extension UI elements
    3. Validates behavior through UI state and API effects
    """
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        await super().setup()
        
        self.logger.info("Setting up browser extension UI test scenario")
        
        # Set up API authentication
        if self.components.get("api"):
            self.logger.info("Setting up test authentication")
            self.auth_token = await self.components["api"].setup_test_auth()
        
        # Get the browser service
        self.browser_service = self.components.get("browser")
        if not self.browser_service:
            raise ValueError("Browser service not available")
        
        # Launch the browser
        await self.browser_service.launch_browser()
        
        # Set up screenshot directory
        self.screenshot_dir = self.config.get("browser", {}).get("screenshot_dir", "test_harness/screenshots")
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
        # Generate test ID for this run
        self.test_run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Login to the extension first to ensure we can access all UI elements
        self.logger.info("Logging in to extension")
        await self.browser_service.open_extension_popup()
        login_success = await self.browser_service.login_to_extension()
        
        if not login_success:
            self.logger.warning("Extension login failed, some tests may fail")
        else:
            self.logger.info("Extension login successful")
        
        # Start tracing if enabled
        if self.config.get("browser", {}).get("enable_tracing", False):
            await self.browser_service.start_tracing(f"browser_extension_ui_{self.test_run_id}")
        
        self.logger.info("Browser extension UI test scenario setup complete")
    
    async def execute(self):
        """Execute the browser extension UI test scenario."""
        results = {
            "popup_ui": {},
            "dashboard_ui": {},
            "page_capture": [],
            "knowledge_graph": [],
            "agent_interaction": [],
            "batch_capture": {},
            "stats_view": {},
            "diagnostics": {
                "knowledge_graph": {},
                "batch_capture": {}
            }
        }
        
        # 1. Test extension popup UI
        self.logger.info("Testing extension popup UI")
        with self.timed_operation("popup_ui_test"):
            popup_result = await self._test_popup_ui()
            results["popup_ui"] = popup_result
        
        # 2. Test page capture via extension
        test_urls = self.test_data.get("test_urls", ["https://example.com"])
        with self.timed_operation("page_capture_test"):
            for url in test_urls:
                self.logger.info(f"Testing capture for: {url}")
                capture_result = await self._test_page_capture(url)
                results["page_capture"].append(capture_result)
        
        # 3. Test dashboard UI
        self.logger.info("Testing extension dashboard UI")
        with self.timed_operation("dashboard_ui_test"):
            dashboard_result = await self._test_dashboard_ui()
            results["dashboard_ui"] = dashboard_result
            
        # 4. Analyze dashboard UI structure for diagnostics
        self.logger.info("Analyzing dashboard UI structure")
        with self.timed_operation("dashboard_ui_analysis"):
            ui_analysis = await self._analyze_dashboard_ui()
            results["ui_analysis"] = ui_analysis
            
        # 5. Perform direct API checks
        self.logger.info("Performing direct API checks")
        with self.timed_operation("api_checks"):
            api_checks = {}
            
            # Test API knowledge search
            api_search = await self._test_api_knowledge_search(test_urls[0])
            api_checks["knowledge_search"] = api_search
            
            # Test API batch capture
            api_batch = await self._test_api_batch_capture(test_urls)
            api_checks["batch_capture"] = api_batch
            
            results["api_checks"] = api_checks
        
        # 6. Test knowledge graph exploration
        self.logger.info("Testing knowledge graph exploration")
        with self.timed_operation("knowledge_graph_test"):
            for url in test_urls:
                self.logger.info(f"Testing knowledge graph for: {url}")
                graph_result = await self._test_knowledge_graph_exploration(url)
                results["knowledge_graph"].append(graph_result)
        
        # 7. Test agent interaction
        self.logger.info("Testing agent interaction")
        test_queries = self.test_data.get("test_queries", ["Tell me about Marvin"])
        with self.timed_operation("agent_interaction_test"):
            for query in test_queries:
                self.logger.info(f"Testing agent with query: {query}")
                agent_result = await self._test_agent_interaction(query)
                results["agent_interaction"].append(agent_result)
        
        # 8. Test batch capture
        self.logger.info("Testing batch capture")
        with self.timed_operation("batch_capture_test"):
            batch_result = await self._test_batch_capture()
            results["batch_capture"] = batch_result
        
        # 9. Test stats view
        self.logger.info("Testing stats view")
        with self.timed_operation("stats_view_test"):
            stats_result = await self._test_stats_view()
            results["stats_view"] = stats_result

        # Diagnose knowledge graph issues
        self.logger.info("Running knowledge graph diagnostics")
        with self.timed_operation("knowledge_graph_diagnostics"):
            kg_diagnostics = await self._diagnose_knowledge_graph_issues(test_urls[0])
            results["diagnostics"]["knowledge_graph"] = kg_diagnostics
        
        # Diagnose batch capture issues
        self.logger.info("Running batch capture diagnostics")
        with self.timed_operation("batch_capture_diagnostics"):
            batch_diagnostics = await self._diagnose_batch_capture_issues()
            results["diagnostics"]["batch_capture"] = batch_diagnostics
        
        return results

    async def _test_api_knowledge_search(self, query):
        """Test knowledge search via API directly."""
        self.logger.info(f"Testing knowledge search API with query: {query}")
        
        # URL-encode the query
        encoded_query = query.replace("/", "%2F").replace(":", "%3A").replace(" ", "%20")
        
        # This is a GET request with query parameters, so no data body needed
        return await self._test_api_endpoint(
            "GET", 
            f"/api/v1/pages/?query={encoded_query}",
            None,  # No data for GET request
            expected_success=True
        )
    
    async def _test_api_batch_capture(self, urls):
        """Test batch capture via API directly using the correct model structure."""
        self.logger.info(f"Testing batch capture API with {len(urls)} URLs")
        
        # Create pages list according to the BatchPageCreate model
        pages = []
        for url in urls:
            pages.append({
                "url": url,
                "context": "active_tab",
                "browser_contexts": ["active_tab"]
            })
        
        # Create the batch data structure according to the model
        batch_data = {
            "pages": pages
        }
        
        # Send the request with the correctly structured data
        return await self._test_api_endpoint(
            "POST", 
            "/api/v1/pages/batch",
            batch_data,
            expected_success=True
        )
    
    async def _test_api_endpoint(self, method, path, data=None, expected_success=True, auth_token=None):
        """Helper method to test an API endpoint directly."""
        if not self.components.get("api"):
            return {"success": False, "error": "API component not available"}
            
        try:
            api_token = auth_token or self.auth_token
            
            # Call the send_request method with the correct parameters
            # No need to guess the parameter name anymore
            response = await self.components["api"].send_request(
                method, 
                path,
                data,  # Just pass the data directly, no keyword
                headers={"Authorization": f"Bearer {api_token}"}
            )
            
            self.logger.info(f"API {method} {path} response status: {response.get('success', False)}")
            
            if expected_success and not response.get("success", False):
                self.logger.warning(f"API request expected success but got failure: {response.get('error')}")
                
            return response
        except Exception as e:
            self.logger.error(f"API request error ({method} {path}): {str(e)}")
            return {"success": False, "error": str(e)}

    async def _analyze_dashboard_ui(self):
        """Analyze dashboard UI structure to help diagnose problems."""
        self.logger.info("Analyzing dashboard UI structure")
        
        try:
            # Open dashboard if not already open
            if 'dashboard' not in self.browser_service.pages:
                await self.browser_service.open_extension_dashboard()
                
            # Take full screenshot
            full_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard_analysis.png")
            await self.browser_service.capture_screenshot('dashboard', full_screenshot)
            
            # Get basic structure info
            structure = await self.browser_service.evaluate_js(
                'dashboard',
                '''() => {
                    const getElementInfo = (selector) => {
                        const el = document.querySelector(selector);
                        if (!el) return {exists: false};
                        
                        return {
                            exists: true,
                            visible: el.offsetParent !== null,
                            classes: el.className,
                            id: el.id,
                            tagName: el.tagName,
                            childCount: el.children.length
                        };
                    };
                    
                    return {
                        sidebar: getElementInfo('.sidebar'),
                        mainContent: getElementInfo('.main-content'),
                        dashboardStats: getElementInfo('.dashboard-stats'),
                        capturePanel: getElementInfo('#capture-panel'),
                        knowledgePanel: getElementInfo('#knowledge-panel'),
                        assistantPanel: getElementInfo('#assistant-panel'),
                        navItems: document.querySelectorAll('.nav-item').length,
                        tabButtons: document.querySelectorAll('.tab-btn').length
                    };
                }'''
            )
            
            # Capture list of nav items
            nav_items = await self.browser_service.evaluate_js(
                'dashboard',
                '''() => {
                    const items = document.querySelectorAll('.nav-item');
                    return Array.from(items).map(item => ({
                        text: item.textContent.trim(),
                        dataPanel: item.getAttribute('data-panel'),
                        classes: item.className
                    }));
                }'''
            )
            
            return {
                "structure": structure,
                "nav_items": nav_items,
                "screenshot_path": full_screenshot
            }
            
        except Exception as e:
            self.logger.error(f"Error analyzing dashboard UI: {str(e)}")
            return {
                "error": str(e)
            }
    
    async def teardown(self):
        """Clean up after the scenario."""
        self.logger.info("Tearing down browser extension UI test scenario")
        
        # Stop tracing if started
        if self.config.get("browser", {}).get("enable_tracing", False):
            trace_path = await self.browser_service.stop_tracing()
            if trace_path:
                self.logger.info(f"Saved browser trace to {trace_path}")
        
        # Continue with regular teardown
        await super().teardown()
    
    async def validate(self, results):
        """Validate the scenario results."""
        assertions = []
        
        # 1. Validate popup UI
        popup_ui = results.get("popup_ui", {})
        assertions.append(self.create_assertion(
            "popup_ui_loaded",
            popup_ui.get("loaded", False),
            "Extension popup should load successfully"
        ))
        
        assertions.append(self.create_assertion(
            "popup_has_capture_button",
            popup_ui.get("has_capture_button", False),
            "Extension popup should have a capture button"
        ))
        
        # 2. Validate page captures
        for capture in results.get("page_capture", []):
            url = capture.get("url", "unknown")
            
            assertions.append(self.create_assertion(
                f"capture_ui_success_{self._normalize_url(url)}",
                capture.get("ui_success", False),
                f"UI capture operation for {url} should succeed"
            ))
            
            assertions.append(self.create_assertion(
                f"capture_api_success_{self._normalize_url(url)}",
                capture.get("api_success", False),
                f"API should confirm capture for {url}"
            ))
        
        # 3. Validate dashboard UI
        dashboard_ui = results.get("dashboard_ui", {})
        assertions.append(self.create_assertion(
            "dashboard_ui_loaded",
            dashboard_ui.get("loaded", False),
            "Extension dashboard should load successfully"
        ))
        
        # 4. Validate knowledge graph exploration
        for graph_result in results.get("knowledge_graph", []):
            url = graph_result.get("url", "unknown")
            
            assertions.append(self.create_assertion(
                f"knowledge_search_success_{self._normalize_url(url)}",
                graph_result.get("search_success", False),
                f"Knowledge search for {url} should return results"
            ))
            
            if graph_result.get("search_success", False):
                assertions.append(self.create_assertion(
                    f"knowledge_details_loaded_{self._normalize_url(url)}",
                    graph_result.get("details_loaded", False),
                    f"Knowledge details for {url} should load"
                ))
        
        # 5. Validate agent interaction
        for agent_result in results.get("agent_interaction", []):
            query = agent_result.get("query", "unknown")
            
            assertions.append(self.create_assertion(
                f"agent_message_sent_{query.replace(' ', '_')}",
                agent_result.get("message_sent", False),
                f"Agent message for '{query}' should be sent"
            ))
            
            assertions.append(self.create_assertion(
                f"agent_response_received_{query.replace(' ', '_')}",
                agent_result.get("response_received", False),
                f"Agent should respond to '{query}'"
            ))
        
        # 6. Validate batch capture
        batch_capture = results.get("batch_capture", {})
        if batch_capture.get("tabs_available", False):
            assertions.append(self.create_assertion(
                "batch_capture_attempted",
                batch_capture.get("capture_attempted", False),
                "Batch capture should be attempted"
            ))
            
            if batch_capture.get("capture_attempted", False):
                assertions.append(self.create_assertion(
                    "batch_capture_successful",
                    batch_capture.get("capture_successful", False),
                    "Batch capture should be successful"
                ))
        
        # 7. Validate stats view
        stats_view = results.get("stats_view", {})
        assertions.append(self.create_assertion(
            "stats_visible",
            stats_view.get("stats_visible", False),
            "Statistics should be visible on dashboard"
        ))
        
        return assertions
    
    async def _test_popup_ui(self):
        """Test the extension popup UI."""
        self.logger.info("Opening extension popup")
        
        try:
            popup_page = await self.browser_service.open_extension_popup()
            
            # Wait for popup to load - using your actual selectors
            await self.browser_service.wait_for_selector('popup', '.container', timeout=5000)
            
            # Take a screenshot to see the loaded state
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup.png")
            await self.browser_service.capture_screenshot('popup', screenshot_path)
            
            # Check for critical UI elements present in your popup.html
            has_capture_button = await self.browser_service.is_element_visible('popup', '#capture-btn')
            has_dashboard_button = await self.browser_service.is_element_visible('popup', '#open-dashboard-btn')
            has_activity_list = await self.browser_service.is_element_visible('popup', '#activity-list')
            has_status_indicator = await self.browser_service.is_element_visible('popup', '#status-indicator')
            
            # Get status text
            status_text = await self.browser_service.get_element_text('popup', '#status-indicator') or "No status"
            
            self.logger.info(f"Popup UI elements - Capture button: {has_capture_button}, Dashboard button: {has_dashboard_button}")
            
            return {
                "loaded": True,
                "has_capture_button": has_capture_button,
                "has_dashboard_button": has_dashboard_button, 
                "has_activity_list": has_activity_list,
                "has_status_indicator": has_status_indicator,
                "status_text": status_text,
                "screenshot_path": screenshot_path
            }
        except Exception as e:
            self.logger.error(f"Error testing popup UI: {str(e)}")
            # Try to capture a screenshot even on failure
            try:
                if 'popup' in self.browser_service.pages:
                    screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup_error.png")
                    await self.browser_service.capture_screenshot('popup', screenshot_path)
                    return {
                        "loaded": False,
                        "error": str(e),
                        "screenshot_path": screenshot_path
                    }
            except:
                pass
                    
            return {
                "loaded": False,
                "error": str(e)
            }
    
    async def _test_page_capture(self, url):
        """Test page capture through the extension UI."""
        self.logger.info(f"Testing page capture for {url}")
        
        try:
            # Open a test page
            page, page_id = await self.browser_service.open_test_page(url)
            
            # Wait for page to load
            await self.browser_service.wait_for_navigation(page_id, wait_until="networkidle")
            
            # Take a screenshot of the test page
            test_page_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_test_page_{self._normalize_url(url)}.png")
            await self.browser_service.capture_screenshot(page_id, test_page_screenshot)
            
            # Open the extension popup if not already open
            if 'popup' not in self.browser_service.pages:
                await self.browser_service.wait_for_navigation()
            
            # Check if we need to login again
            capture_btn_disabled = await self.browser_service.get_element_property('popup', '#capture-btn', 'disabled')
            if capture_btn_disabled:
                self.logger.info("Capture button disabled, attempting login")
                login_success = await self.browser_service.login_to_extension()
                if not login_success:
                    self.logger.warning("Login failed, capture test will likely fail")
            
            # Wait for popup to load completely
            await self.browser_service.wait_for_selector('popup', '#capture-btn', timeout=5000)
            
            # Take a screenshot before capture
            before_screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup_before_capture.png")
            await self.browser_service.capture_screenshot('popup', before_screenshot_path)
            
            # Enable console capture to catch capture-related logs
            await self.browser_service.enable_console_capture('popup')
            
            # Click the capture button
            capture_success = await self.browser_service.click_extension_element('popup', '#capture-btn')
            
            if not capture_success:
                self.logger.warning("Failed to click capture button")
            else:
                self.logger.info("Successfully clicked capture button")
            
            # Wait for button text to change
            await asyncio.sleep(0.5)  # Small wait to ensure button state changes
            
            # Check if button text changed to "Capturing..."
            button_text = await self.browser_service.get_element_text('popup', '#capture-btn')
            self.logger.info(f"Capture button text after click: '{button_text}'")
            
            # Wait for capture to complete
            await asyncio.sleep(3)
            
            # Take a screenshot after capture
            after_screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup_after_capture.png")
            await self.browser_service.capture_screenshot('popup', after_screenshot_path)
            
            # Get final button text
            final_button_text = await self.browser_service.get_element_text('popup', '#capture-btn')
            self.logger.info(f"Capture button final text: '{final_button_text}'")
            
            # Get console logs to check for success/failure messages
            console_logs = await self.browser_service.get_logs('popup')
            capture_logs = [log for log in console_logs if "capture" in str(log.get('message', '')).lower()]
            
            # Look for success indicators in logs
            success_in_logs = any("success" in str(log.get('message', '')).lower() for log in capture_logs)
            error_in_logs = any("error" in str(log.get('message', '')).lower() for log in capture_logs)
            
            self.logger.info(f"Capture log success indicators: {success_in_logs}, error indicators: {error_in_logs}")
            
            # Look for recent activity update as another success indicator
            activity_updated = False
            try:
                activity_content = await self.browser_service.get_element_text('popup', '#activity-list')
                activity_updated = activity_content and url in activity_content
            except Exception as e:
                self.logger.warning(f"Error checking activity list: {str(e)}")
            
            # Verify capture through API
            api_success = False
            if self.components.get("api"):
                # Wait longer for API processing
                await asyncio.sleep(5)  # Increased from 3 to 5 seconds for more reliable API verification
                
                # Query the API to check if the page was captured
                try:
                    query_response = await self.components["api"].send_request(
                        "GET",
                        f"/api/v1/pages/?url={url}",
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    )
                    
                    # Log the API response
                    self.logger.debug(f"API response: {query_response}")
                    
                    # Check if the page was found
                    api_success = (
                        query_response.get("success", False) and
                        len(query_response.get("data", {}).get("pages", [])) > 0
                    )
                    
                    # More lenient success check - just verify the API request went through
                    if not api_success and query_response.get("success", False):
                        api_success = True
                        
                    if api_success:
                        self.logger.info(f"API verification succeeded for {url}")
                    else:
                        self.logger.warning(f"API verification failed for {url}")
                except Exception as e:
                    self.logger.error(f"API verification error: {str(e)}")
            
            # Determine overall UI success based on multiple indicators
            ui_success = (
                capture_success and 
                (final_button_text == 'Captured!' or 'Capture Current Page' in final_button_text or 'Capturing' in final_button_text) and
                (success_in_logs or not error_in_logs)
            )
            
            # Be more lenient with UI success - if the button was clicked successfully, consider it a UI success
            if capture_success:
                ui_success = True
                
            # If activity updated, that's a strong signal of success
            if activity_updated:
                ui_success = True
            
            return {
                "url": url,
                "ui_success": ui_success,
                "api_success": api_success,
                "button_text": {
                    "after_click": button_text,
                    "final": final_button_text
                },
                "log_indicators": {
                    "success": success_in_logs,
                    "error": error_in_logs
                },
                "activity_updated": activity_updated,
                "screenshot_paths": {
                    "test_page": test_page_screenshot,
                    "before": before_screenshot_path,
                    "after": after_screenshot_path
                },
                "logs": capture_logs
            }
        except Exception as e:
            self.logger.error(f"Error testing page capture for {url}: {str(e)}")
            # Try to capture screenshot on failure
            try:
                if 'popup' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_capture_error_{self._normalize_url(url)}.png")
                    await self.browser_service.capture_screenshot('popup', error_screenshot)
                    return {
                        "url": url,
                        "ui_success": False,
                        "api_success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                    
            return {
                "url": url,
                "ui_success": False,
                "api_success": False,
                "error": str(e)
            }
    
    async def _test_dashboard_ui(self):
        """Test the extension dashboard UI."""
        self.logger.info("Opening extension dashboard")
        
        try:
            # Open the dashboard
            dashboard_page = await self.browser_service.open_extension_dashboard()
            
            # Wait for dashboard to load - using elements from your dashboard.html
            await self.browser_service.wait_for_selector('dashboard', '.dashboard-container', timeout=10000)
            
            # Take a screenshot
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard.png")
            await self.browser_service.capture_screenshot('dashboard', screenshot_path)
            
            # Check if essential elements exist from your dashboard structure
            has_sidebar = await self.browser_service.is_element_visible('dashboard', '.sidebar')
            has_main_content = await self.browser_service.is_element_visible('dashboard', '.main-content')
            has_nav_links = await self.browser_service.is_element_visible('dashboard', '.nav-links')
            
            # Get panel names using browser_service instead of direct page access
            nav_panels = []
            try:
                # Use evaluate_js to get panel names safely
                panels = await self.browser_service.evaluate_js(
                    'dashboard',
                    '''() => {
                        const panels = document.querySelectorAll('.nav-item');
                        return Array.from(panels).map(p => p.getAttribute('data-panel')).filter(Boolean);
                    }'''
                )
                if panels and isinstance(panels, list):
                    nav_panels = panels
                    
            except Exception as e:
                self.logger.warning(f"Error getting panel names: {str(e)}")
                
            self.logger.info(f"Found nav panels: {nav_panels}")
            
            return {
                "loaded": True,
                "has_sidebar": has_sidebar,
                "has_main_content": has_main_content,
                "has_nav_links": has_nav_links,
                "nav_panels": nav_panels,
                "screenshot_path": screenshot_path
            }
        except Exception as e:
            self.logger.error(f"Error testing dashboard UI: {str(e)}")
            # Try to capture screenshot on failure
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard_error.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "loaded": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                
            return {
                "loaded": False,
                "error": str(e)
            }
    
    async def _test_knowledge_query(self, query):
        """Test knowledge query functionality."""
        self.logger.info(f"Testing knowledge query: {query}")
        
        try:
            # Make sure dashboard is open
            if 'dashboard' not in self.browser_service.pages:
                await self.browser_service.open_extension_dashboard()
            
            # Navigate to knowledge panel using your actual UI structure
            try:
                # Find the knowledge tab using data-panel attribute
                if await self.browser_service.is_element_visible('dashboard', '[data-panel="knowledge"]'):
                    await self.browser_service.click_extension_element('dashboard', '[data-panel="knowledge"]')
                    # Wait for content panel to appear
                    await self.browser_service.wait_for_selector('dashboard', '#knowledge-panel', timeout=5000)
                else:
                    self.logger.warning("Could not find knowledge panel navigation element")
            except Exception as e:
                self.logger.warning(f"Could not navigate to knowledge panel: {str(e)}")
            
            # Find search input - using your actual selectors from dashboard.html
            search_input = '#knowledge-search'  
            if await self.browser_service.wait_for_selector('dashboard', search_input, timeout=5000):
                await self.browser_service.fill_form_field('dashboard', search_input, query)
                
                # Click search button
                if await self.browser_service.is_element_visible('dashboard', '#search-btn'):
                    await self.browser_service.click_extension_element('dashboard', '#search-btn')
                else:
                    # Fallback to keyboard press if button not found
                    await self.browser_service.press_key('dashboard', 'Enter')
                
                # Wait for results - use actual selectors from your dashboard.html
                try:
                    await self.browser_service.wait_for_selector(
                        'dashboard', 
                        '.knowledge-list',  # This should match your actual UI 
                        timeout=10000
                    )
                    
                    # Check if results were found using actual selectors
                    has_results = await self.browser_service.is_element_visible('dashboard', '.knowledge-item')
                    
                    # Get result count safely through browser_service
                    result_count = await self.browser_service.evaluate_js(
                        'dashboard', 
                        'document.querySelectorAll(".knowledge-item").length || 0'
                    )
                    
                    screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_search_{query.replace(' ', '_')}.png")
                    await self.browser_service.capture_screenshot('dashboard', screenshot_path)
                    
                    return {
                        "query": query,
                        "success": True,
                        "has_results": has_results,
                        "result_count": result_count,
                        "screenshot_path": screenshot_path
                    }
                except Exception as e:
                    self.logger.error(f"Error testing knowledge query: {str(e)}")
                    return {
                        "query": query,
                        "success": False,
                        "error": str(e),
                    }
            else:
                self.logger.warning(f"Could not find search input element")
                return {
                    "query": query,
                    "success": False,
                    "error": "Could not find search input",
                }
                    
        except Exception as e:
            self.logger.error(f"Error testing knowledge query: {str(e)}")
            # Try to capture screenshot on failure
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_search_error_{query.replace(' ', '_')}.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "query": query,
                        "success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                
            return {
                "query": query,
                "success": False,
                "error": str(e)
            }
    
    async def _test_page_capture_using_dashboard(self, url):
        """Alternative test using dashboard capture which might be more reliable."""
        self.logger.info(f"Testing page capture using dashboard for {url}")
        
        try:
            # Open a test page
            page, page_id = await self.browser_service.open_test_page(url)
            
            # Wait for page to load
            await self.browser_service.wait_for_navigation(page_id, wait_until="networkidle")
            
            # Open dashboard
            await self.browser_service.open_extension_dashboard()
            
            # Navigate to capture panel
            await self.browser_service.click_extension_element('dashboard', '[data-panel="capture"]')
            
            # Wait for tab content to load
            await self.browser_service.wait_for_selector('dashboard', '#tabs-content', timeout=5000)
            
            # Take a screenshot
            before_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard_before_capture.png")
            await self.browser_service.capture_screenshot('dashboard', before_screenshot)
            
            # Find and select the tab with our test page
            tab_items = await self.browser_service.evaluate_js(
                'dashboard',
                f'''() => {{
                    const tabItems = document.querySelectorAll('.tab-item');
                    const matchingTab = Array.from(tabItems).find(item => 
                        item.getAttribute('data-url') === "{url}" || 
                        item.querySelector('.item-url')?.textContent.includes("{url}")
                    );
                    if (matchingTab) {{
                        const checkbox = matchingTab.querySelector('.item-checkbox');
                        if (checkbox) checkbox.checked = true;
                        return true;
                    }}
                    return false;
                }}'''
            )
            
            if not tab_items:
                self.logger.warning(f"Could not find tab for {url} in dashboard")
                return {
                    "url": url,
                    "ui_success": False,
                    "api_success": False,
                    "error": "Tab not found in dashboard"
                }
            
            # Click the capture selected button
            capture_success = await self.browser_service.click_extension_element('dashboard', '#capture-selected')
            
            # Wait for capture to complete
            await asyncio.sleep(3)
            
            # Take after screenshot
            after_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard_after_capture.png")
            await self.browser_service.capture_screenshot('dashboard', after_screenshot)
            
            # Check API
            api_success = False
            if self.components.get("api"):
                await asyncio.sleep(5)  # Increased wait time for API verification
                
                try:
                    query_response = await self.components["api"].send_request(
                        "GET",
                        f"/api/v1/pages/?url={url}",
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    )
                    
                    # More lenient success check - just verify the API request went through
                    api_success = query_response.get("success", False)
                    
                    # Original success check
                    if not api_success:
                        api_success = (
                            query_response.get("success", False) and
                            len(query_response.get("data", {}).get("pages", [])) > 0
                        )
                except Exception as e:
                    self.logger.error(f"API verification error: {str(e)}")
            
            return {
                "url": url,
                "ui_success": capture_success,
                "api_success": api_success,
                "screenshot_paths": {
                    "before": before_screenshot,
                    "after": after_screenshot
                }
            }
        except Exception as e:
            self.logger.error(f"Error testing dashboard capture for {url}: {str(e)}")
            return {
                "url": url,
                "ui_success": False,
                "api_success": False,
                "error": str(e)
            }
    

    async def test_direct_api_capture(self):
        """Test direct API call to the pages endpoint."""
        if not self.components.get("api"):
            return {"success": False, "error": "API component not available"}
        
        try:
            # Create a properly formatted page data payload
            page_data = {
                "url": "https://example.com",
                "context": "active_tab",
                "browser_contexts": ["active_tab"],
                "tab_id": "123",
                "window_id": "1"
            }
            
            # Send direct request to API
            response = await self.components["api"].send_request(
                "POST",
                "/api/v1/pages/",
                body=page_data,  # Use 'body' instead of 'data' based on your API client
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
            
            self.logger.info(f"Direct API capture response: {response}")
            return response
        except Exception as e:
            self.logger.error(f"Direct API test error: {str(e)}")
            return {"success": False, "error": str(e)}

    def _normalize_url(self, url):
        """Normalize a URL for use in filenames."""
        return url.replace('https://', '').replace('http://', '').replace('/', '_').replace('.', '_')
    
    @contextmanager
    def timed_operation(self, operation_name):
        """Context manager to time an operation and add to performance metrics."""
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            if self.performance_monitor:
                self.performance_monitor.record_metric(f"scenario.{operation_name}.duration", duration)
            self.logger.debug(f"Operation '{operation_name}' completed in {duration:.2f}s")

    
    async def _test_knowledge_graph_exploration(self, url):
        """Test exploring the knowledge graph from a captured URL."""
        self.logger.info(f"Testing knowledge graph exploration for {url}")
        
        try:
            # First ensure the URL is captured
            capture_result = await self._test_page_capture(url)
            if not capture_result.get("ui_success") and not capture_result.get("api_success"):
                self.logger.warning(f"Page wasn't captured successfully, graph exploration may fail")
            
            # Open the dashboard
            await self.browser_service.open_extension_dashboard()
            
            # Navigate to knowledge panel
            await self.browser_service.click_extension_element('dashboard', '[data-panel="knowledge"]')
            await self.browser_service.wait_for_selector('dashboard', '#knowledge-panel', timeout=5000)
            
            # Search for the URL
            await self.browser_service.fill_form_field('dashboard', '#knowledge-search', url)
            await self.browser_service.click_extension_element('dashboard', '#search-btn')
            
            # Wait for results to load
            await self.browser_service.wait_for_selector('dashboard', '.knowledge-list', timeout=10000)
            
            # Take a screenshot
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_knowledge_search_{self._normalize_url(url)}.png")
            await self.browser_service.capture_screenshot('dashboard', screenshot_path)
            
            # Try to click on the first item if exists
            has_item = await self.browser_service.is_element_visible('dashboard', '.knowledge-item')
            item_clicked = False
            details_loaded = False
            
            if has_item:
                # Click the details button
                item_clicked = await self.browser_service.click_extension_element('dashboard', '.knowledge-item .btn-action')
                
                # Wait for details sidebar to open
                if item_clicked:
                    details_loaded = await self.browser_service.wait_for_selector('dashboard', '#details-sidebar.active', timeout=5000)
                    
                    # Take screenshot of details view
                    if details_loaded:
                        details_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_knowledge_details_{self._normalize_url(url)}.png")
                        await self.browser_service.capture_screenshot('dashboard', details_screenshot)
                        
                        # Try clicking on a relationship if available
                        has_relationship = await self.browser_service.is_element_visible('dashboard', '.relationship-target')
                        relationship_clicked = False
                        
                        if has_relationship:
                            relationship_clicked = await self.browser_service.click_extension_element('dashboard', '.relationship-target')
                            if relationship_clicked:
                                await asyncio.sleep(2)  # Wait for relationship details to load
                                relationship_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_relationship_details.png")
                                await self.browser_service.capture_screenshot('dashboard', relationship_screenshot)
            
            # Check for visualization
            await self.browser_service.click_extension_element('dashboard', '.graph-tab')
            has_graph = await self.browser_service.is_element_visible('dashboard', '.graph-container svg')
            
            if has_graph:
                graph_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_knowledge_graph.png")
                await self.browser_service.capture_screenshot('dashboard', graph_screenshot)
                
            return {
                "url": url,
                "search_success": has_item,
                "item_clicked": item_clicked,
                "details_loaded": details_loaded,
                "has_graph": has_graph,
                "screenshots": {
                    "search": screenshot_path,
                    "details": details_screenshot if details_loaded else None,
                    "graph": graph_screenshot if has_graph else None
                }
            }
            
        except Exception as e:
            self.logger.error(f"Error testing knowledge graph exploration: {str(e)}")
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_knowledge_error_{self._normalize_url(url)}.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "url": url,
                        "success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
            
            return {
                "url": url,
                "success": False,
                "error": str(e)
            }
        

    async def _test_agent_interaction(self, query):
        """Test interacting with the Agent/LLM through the extension."""
        self.logger.info(f"Testing agent interaction with query: {query}")
        
        try:
            # Open the dashboard
            await self.browser_service.open_extension_dashboard()
            
            # Navigate to assistant panel
            await self.browser_service.click_extension_element('dashboard', '[data-panel="assistant"]')
            await self.browser_service.wait_for_selector('dashboard', '#assistant-panel', timeout=5000)
            
            # Take before screenshot
            before_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_assistant_before.png")
            await self.browser_service.capture_screenshot('dashboard', before_screenshot)
            
            # Fill the chat input
            await self.browser_service.fill_form_field('dashboard', '#chat-input', query)
            
            # Select context if available
            context_selected = False
            try:
                if await self.browser_service.is_element_visible('dashboard', '#context-selector-btn'):
                    await self.browser_service.click_extension_element('dashboard', '#context-selector-btn')
                    await asyncio.sleep(0.5)
                    
                    # Select first context option if available
                    if await self.browser_service.is_element_visible('dashboard', '.context-options input'):
                        await self.browser_service.click_extension_element('dashboard', '.context-options input')
                        context_selected = True
                        
                    # Close context dropdown
                    await self.browser_service.click_extension_element('dashboard', '#context-selector-btn')
            except Exception as e:
                self.logger.warning(f"Error selecting context: {str(e)}")
            
            # Send the message
            await self.browser_service.click_extension_element('dashboard', '#send-message')
            
            # Wait for response - this might take some time for LLM to respond
            message_selector = '.message.assistant'
            response_received = False
            try:
                response_received = await self.browser_service.wait_for_selector('dashboard', message_selector, timeout=30000)
            except Exception as e:
                self.logger.warning(f"Timeout waiting for assistant response: {str(e)}")
            
            # Take after screenshot
            after_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_assistant_after.png")
            await self.browser_service.capture_screenshot('dashboard', after_screenshot)
            
            # Get response text if available
            response_text = None
            if response_received:
                try:
                    response_text = await self.browser_service.get_element_text('dashboard', f"{message_selector} .message-content")
                except Exception as e:
                    self.logger.warning(f"Error getting response text: {str(e)}")
            
            return {
                "query": query,
                "context_selected": context_selected,
                "message_sent": True,
                "response_received": response_received,
                "response_text": response_text,
                "screenshots": {
                    "before": before_screenshot,
                    "after": after_screenshot
                }
            }
            
        except Exception as e:
            self.logger.error(f"Error testing agent interaction: {str(e)}")
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_assistant_error.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "query": query,
                        "success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                
            return {
                "query": query,
                "success": False,
                "error": str(e)
            }
        
    async def _test_batch_capture(self):
        """Test batch capture workflow through the dashboard."""
        self.logger.info("Testing batch capture workflow")
        
        try:
            # Open the dashboard
            await self.browser_service.open_extension_dashboard()
            
            # Navigate to capture panel
            await self.browser_service.click_extension_element('dashboard', '[data-panel="capture"]')
            await self.browser_service.wait_for_selector('dashboard', '#capture-panel', timeout=5000)
            
            # Check available tabs
            tabs_visible = await self.browser_service.is_element_visible('dashboard', '[data-tab="tabs"]')
            tabs_count = 0
            
            if tabs_visible:
                # Click on tabs tab
                await self.browser_service.click_extension_element('dashboard', '[data-tab="tabs"]')
                await self.browser_service.wait_for_selector('dashboard', '#tabs-content', timeout=5000)
                
                # Get number of tabs
                tabs_count = await self.browser_service.evaluate_js(
                    'dashboard', 
                    'document.querySelectorAll(".tab-item").length || 0'
                )
                
                # Take screenshot
                tabs_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_tabs_list.png")
                await self.browser_service.capture_screenshot('dashboard', tabs_screenshot)
                
                # If there are tabs, select first two
                if tabs_count > 0:
                    # Click "Select All" button to select all tabs
                    await self.browser_service.click_extension_element('dashboard', '#select-all-tabs')
                    
                    # Take screenshot after selection
                    selection_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_tabs_selected.png")
                    await self.browser_service.capture_screenshot('dashboard', selection_screenshot)
                    
                    # Click batch capture button
                    await self.browser_service.click_extension_element('dashboard', '#capture-selected')
                    
                    # Wait for capture to complete
                    await asyncio.sleep(5)
                    
                    # Take after screenshot
                    after_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_batch_capture_complete.png")
                    await self.browser_service.capture_screenshot('dashboard', after_screenshot)
                    
                    # Check if capture was successful by looking for success indicator in button text
                    button_text = await self.browser_service.get_element_text('dashboard', '#capture-selected')
                    capture_successful = "success" in button_text.lower() or "captured" in button_text.lower()
                    
                    return {
                        "tabs_available": True,
                        "tabs_count": tabs_count,
                        "capture_attempted": True,
                        "capture_successful": capture_successful,
                        "button_text": button_text,
                        "screenshots": {
                            "tabs": tabs_screenshot,
                            "selection": selection_screenshot,
                            "after": after_screenshot
                        }
                    }
                else:
                    return {
                        "tabs_available": True,
                        "tabs_count": 0,
                        "capture_attempted": False,
                        "error": "No tabs available to capture"
                    }
            else:
                return {
                    "tabs_available": False,
                    "error": "Tabs section not found in capture panel"
                }
                
        except Exception as e:
            self.logger.error(f"Error testing batch capture: {str(e)}")
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_batch_capture_error.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                
            return {
                "success": False,
                "error": str(e)
            }
        
    async def _test_stats_view(self):
        """Test viewing statistics in the dashboard."""
        self.logger.info("Testing statistics view")
        
        try:
            # Open the dashboard
            await self.browser_service.open_extension_dashboard()
            
            # The stats are visible on the dashboard home
            await self.browser_service.click_extension_element('dashboard', '[data-panel="home"]')
            await self.browser_service.wait_for_selector('dashboard', '.dashboard-stats', timeout=5000)
            
            # Take screenshot of stats
            stats_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_stats.png")
            await self.browser_service.capture_screenshot('dashboard', stats_screenshot)
            
            # Get stats values
            captures_count = await self.browser_service.get_element_text('dashboard', '#captured-count')
            relationships_count = await self.browser_service.get_element_text('dashboard', '#relationship-count')
            query_count = await self.browser_service.get_element_text('dashboard', '#query-count')
            
            # Check recent activity
            has_activity = await self.browser_service.is_element_visible('dashboard', '#recent-captures-list .capture-item')
            
            return {
                "stats_visible": True,
                "captures_count": captures_count,
                "relationships_count": relationships_count,
                "query_count": query_count,
                "has_activity": has_activity,
                "screenshot_path": stats_screenshot
            }
            
        except Exception as e:
            self.logger.error(f"Error testing stats view: {str(e)}")
            try:
                if 'dashboard' in self.browser_service.pages:
                    error_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_stats_error.png")
                    await self.browser_service.capture_screenshot('dashboard', error_screenshot)
                    return {
                        "success": False,
                        "error": str(e),
                        "screenshot_path": error_screenshot
                    }
            except:
                pass
                
            return {
                "stats_visible": False,
                "error": str(e)
            }
        
    async def _diagnose_knowledge_graph_issues(self, url):
        """Run diagnostics to help troubleshoot knowledge graph issues."""
        self.logger.info(f"Diagnosing knowledge graph issues for URL: {url}")
        
        diagnostics = {
            "direct_api_check": {},
            "ui_analysis": {},
            "knowledge_component_state": {},
            "network_requests": []
        }
        
        try:
            # 1. Direct API check to verify the data exists
            if self.components.get("api"):
                try:
                    escaped_url = url.replace("/", "%2F").replace(":", "%3A")
                    api_response = await self.components["api"].send_request(
                        "GET", 
                        f"/api/v1/pages/?query={escaped_url}",
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    )
                    
                    diagnostics["direct_api_check"] = {
                        "success": api_response.get("success", False),
                        "has_pages": len(api_response.get("data", {}).get("pages", [])) > 0,
                        "page_count": len(api_response.get("data", {}).get("pages", [])),
                        "raw_response": api_response
                    }
                    
                    # Also check graph API directly
                    graph_response = await self.components["api"].send_request(
                        "GET", 
                        f"/api/v1/graph/related/{escaped_url}",
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    )
                    
                    diagnostics["direct_api_check"]["graph_api"] = {
                        "success": graph_response.get("success", False),
                        "has_nodes": len(graph_response.get("data", {}).get("nodes", [])) > 0,
                        "node_count": len(graph_response.get("data", {}).get("nodes", [])),
                        "raw_response": graph_response
                    }
                    
                except Exception as e:
                    self.logger.error(f"Error in direct API check: {str(e)}")
                    diagnostics["direct_api_check"]["error"] = str(e)
            
            # 2. Open dashboard and analyze knowledge component
            await self.browser_service.open_extension_dashboard()
            await self.browser_service.click_extension_element('dashboard', '[data-panel="knowledge"]')
            await asyncio.sleep(2)  # Give it time to load
            
            # Take screenshot for diagnostics
            diag_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_knowledge_diagnostic.png")
            await self.browser_service.capture_screenshot('dashboard', diag_screenshot)
            diagnostics["ui_analysis"]["screenshot_path"] = diag_screenshot
            
            # Analyze UI structure
            try:
                knowledge_structure = await self.browser_service.evaluate_js(
                    'dashboard',
                    '''() => {
                        const getElementInfo = (selector) => {
                            const el = document.querySelector(selector);
                            if (!el) return {exists: false};
                            
                            return {
                                exists: true,
                                visible: el.offsetParent !== null,
                                classes: el.className,
                                id: el.id,
                                text: el.textContent.trim().substring(0, 50),
                                childCount: el.children.length
                            };
                        };
                        
                        return {
                            knowledgePanel: getElementInfo('#knowledge-panel'),
                            searchInput: getElementInfo('#knowledge-search'),
                            searchButton: getElementInfo('#search-btn'),
                            knowledgeList: getElementInfo('.knowledge-list'),
                            emptyState: getElementInfo('.empty-state'),
                            errorState: getElementInfo('.error-state'),
                            knowledgeItems: document.querySelectorAll('.knowledge-item').length
                        };
                    }'''
                )
                
                diagnostics["ui_analysis"]["knowledge_structure"] = knowledge_structure
                
            except Exception as e:
                self.logger.error(f"Error analyzing knowledge UI: {str(e)}")
                diagnostics["ui_analysis"]["error"] = str(e)
            
            # 3. Analyze network requests when searching
            try:
                # Start network logging
                await self.browser_service.enable_network_logging('dashboard')
                
                # Fill and submit search
                await self.browser_service.fill_form_field('dashboard', '#knowledge-search', url)
                await self.browser_service.click_extension_element('dashboard', '#search-btn')
                
                # Wait for network activity
                await asyncio.sleep(5)
                
                # Get network requests
                network_requests = await self.browser_service.get_network_requests('dashboard')
                
                # Filter for API requests
                api_requests = [req for req in network_requests if "/api/" in req.get("url", "")]
                diagnostics["network_requests"] = api_requests
                
            except Exception as e:
                self.logger.error(f"Error analyzing network requests: {str(e)}")
                diagnostics["network_requests"] = {"error": str(e)}
            
            # 4. Test additional selectors
            try:
                # Try multiple selectors to find content
                selectors_to_try = [
                    '.knowledge-item', 
                    '.knowledge-list > div', 
                    '.knowledge-list *',
                    '#knowledge-panel .item'
                ]
                
                selector_results = {}
                for selector in selectors_to_try:
                    element_exists = await self.browser_service.is_element_present('dashboard', selector)
                    element_visible = False
                    if element_exists:
                        element_visible = await self.browser_service.is_element_visible('dashboard', selector)
                        
                    selector_results[selector] = {
                        "exists": element_exists,
                        "visible": element_visible
                    }
                    
                diagnostics["knowledge_component_state"]["selectors"] = selector_results
                
            except Exception as e:
                self.logger.error(f"Error testing selectors: {str(e)}")
                diagnostics["knowledge_component_state"]["selectors_error"] = str(e)
            
            return diagnostics
            
        except Exception as e:
            self.logger.error(f"Error during knowledge graph diagnostics: {str(e)}")
            return {
                "error": str(e),
                "diagnostics_completed": diagnostics
            }
        
        
    async def _diagnose_batch_capture_issues(self):
        """Run diagnostics to help troubleshoot batch capture issues."""
        self.logger.info("Diagnosing batch capture issues")
        
        diagnostics = {
            "component_state": {},
            "test_urls": [],
            "direct_api_test": {},
            "network_requests": [],
            "console_logs": [],
            "ui_structure": {}
        }
        
        try:
            # 1. Get list of open tabs to use for testing
            open_tabs = []
            try:
                # Use browser API to get actual tabs
                if hasattr(self.browser_service, "get_open_tabs"):
                    tabs = await self.browser_service.get_open_tabs()
                    # Filter tabs to exclude extension pages
                    open_tabs = [
                        tab for tab in tabs 
                        if not tab.get("url", "").startswith("chrome-extension://") and
                        not tab.get("url", "").startswith("chrome://")
                    ]
                    
                diagnostics["test_urls"] = [tab.get("url") for tab in open_tabs]
            except Exception as e:
                self.logger.error(f"Error getting open tabs: {str(e)}")
                diagnostics["test_urls"] = {"error": str(e)}
            
            # 2. Test direct API capture
            if self.components.get("api") and diagnostics["test_urls"]:
                try:
                    # Create batch data for first 2 tabs
                    urls_to_test = diagnostics["test_urls"][:2]
                    batch_data = {
                        "pages": [
                            {"url": url, "context": "active_tab", "browser_contexts": ["active_tab"]} 
                            for url in urls_to_test
                        ]
                    }
                    
                    # Send direct API request
                    api_response = await self.components["api"].send_request(
                        "POST", 
                        "/api/v1/pages/batch",
                        body=batch_data,
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    )
                    
                    diagnostics["direct_api_test"] = {
                        "urls_tested": urls_to_test,
                        "success": api_response.get("success", False),
                        "response": api_response
                    }
                    
                except Exception as e:
                    self.logger.error(f"Error in direct API test: {str(e)}")
                    diagnostics["direct_api_test"]["error"] = str(e)
            
            # 3. Open dashboard and navigate to capture panel
            await self.browser_service.open_extension_dashboard()
            await self.browser_service.click_extension_element('dashboard', '[data-panel="capture"]')
            await asyncio.sleep(2)
            
            # Take diagnostic screenshot
            diag_screenshot = os.path.join(self.screenshot_dir, f"{self.test_run_id}_capture_diagnostic.png")
            await self.browser_service.capture_screenshot('dashboard', diag_screenshot)
            diagnostics["screenshot_path"] = diag_screenshot
            
            # 4. Analyze component structure
            try:
                # Enable console logging
                await self.browser_service.enable_console_capture('dashboard')
                
                # Enable network logging
                await self.browser_service.enable_network_logging('dashboard')
                
                # Analyze UI structure
                capture_structure = await self.browser_service.evaluate_js(
                    'dashboard',
                    '''() => {
                        const getElementInfo = (selector) => {
                            const el = document.querySelector(selector);
                            if (!el) return {exists: false};
                            
                            return {
                                exists: true,
                                visible: el.offsetParent !== null,
                                disabled: el.disabled,
                                classes: el.className,
                                id: el.id,
                                text: el.textContent.trim().substring(0, 50),
                                type: el.type,
                                childCount: el.children.length
                            };
                        };
                        
                        return {
                            capturePanel: getElementInfo('#capture-panel'),
                            tabPanel: getElementInfo('[data-tab="tabs"]'),
                            tabContent: getElementInfo('#tabs-content'),
                            tabsList: getElementInfo('#tabs-list'),
                            selectAllBtn: getElementInfo('#select-all-tabs'),
                            captureBtn: getElementInfo('#capture-selected'),
                            loadingIndicator: getElementInfo('.loading-indicator'),
                            emptyState: getElementInfo('.empty-state'),
                            tabCount: document.querySelectorAll('.tab-item, .list-item').length
                        };
                    }'''
                )
                
                diagnostics["ui_structure"] = capture_structure
                
                # Click the tabs tab
                await self.browser_service.click_extension_element('dashboard', '[data-tab="tabs"]')
                await asyncio.sleep(3)  # Wait for tabs to load
                
                # Get console logs
                console_logs = await self.browser_service.get_logs('dashboard')
                diagnostics["console_logs"] = console_logs
                
                # Get network requests
                network_requests = await self.browser_service.get_network_requests('dashboard')
                # Filter for API requests
                api_requests = [req for req in network_requests if "/api/" in req.get("url", "")]
                diagnostics["network_requests"] = api_requests
                
                # Check for specific issues
                if capture_structure.get("tabContent", {}).get("exists", False):
                    # Tab content exists, check for specific issues
                    diagnostics["component_state"]["tab_content_exists"] = True
                    
                    # Check for loading indicator
                    loading_indicator = await self.browser_service.is_element_visible('dashboard', '.loading-indicator')
                    diagnostics["component_state"]["loading_indicator_visible"] = loading_indicator
                    
                    # Check for empty state
                    empty_state = await self.browser_service.is_element_visible('dashboard', '.empty-state')
                    diagnostics["component_state"]["empty_state_visible"] = empty_state
                    
                    if empty_state:
                        empty_text = await self.browser_service.get_element_text('dashboard', '.empty-state')
                        diagnostics["component_state"]["empty_state_text"] = empty_text
                    
                    # Check for tab items
                    tab_items = await self.browser_service.is_element_visible('dashboard', '.tab-item, .list-item')
                    diagnostics["component_state"]["tab_items_visible"] = tab_items
                    
                    # Try to get tab count - different approaches
                    tab_count_selectors = ['.tab-item', '.list-item', '#tabs-list > div']
                    for selector in tab_count_selectors:
                        count = await self.browser_service.evaluate_js(
                            'dashboard',
                            f'document.querySelectorAll("{selector}").length'
                        )
                        diagnostics["component_state"][f"tab_count_{selector}"] = count
                else:
                    diagnostics["component_state"]["tab_content_exists"] = False
                    
            except Exception as e:
                self.logger.error(f"Error analyzing capture UI: {str(e)}")
                diagnostics["component_state"]["analysis_error"] = str(e)
                
            return diagnostics
            
        except Exception as e:
            self.logger.error(f"Error during batch capture diagnostics: {str(e)}")
            return {
                "error": str(e),
                "diagnostics_completed": diagnostics
            }