import os
import asyncio
from datetime import datetime

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
            "knowledge_query": []
        }
        
        # 1. Test extension popup UI
        self.logger.info("Testing extension popup UI")
        with self.timed_operation("popup_ui_test"):
            popup_result = await self._test_popup_ui()
            results["popup_ui"] = popup_result
        
        # 2. Test page capture via extension
        self.logger.info("Testing page capture via extension")
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
        
        # 4. Test knowledge queries
        self.logger.info("Testing knowledge queries")
        queries = self.test_data.get("test_queries", ["test query"])
        with self.timed_operation("knowledge_query_test"):
            for query in queries:
                self.logger.info(f"Testing query: {query}")
                query_result = await self._test_knowledge_query(query)
                results["knowledge_query"].append(query_result)
        
        return results
    
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
        
        # 4. Validate knowledge queries
        for query in results.get("knowledge_query", []):
            query_text = query.get("query", "unknown")
            assertions.append(self.create_assertion(
                f"query_success_{query_text.replace(' ', '_')}",
                query.get("success", False),
                f"Knowledge query for '{query_text}' should succeed"
            ))
        
        return assertions
    
    async def _test_popup_ui(self):
        """Test the extension popup UI."""
        self.logger.info("Opening extension popup")
        
        try:
            popup_page = await self.browser_service.open_extension_popup()
            
            # Wait for popup to load - adjust selector based on your extension's actual UI
            capture_button_selector = '#capture-button'
            await self.browser_service.wait_for_selector('popup', capture_button_selector, timeout=5000)
            
            # Check if essential elements exist
            has_capture_button = await self.browser_service.is_element_visible('popup', capture_button_selector)
            has_dashboard_link = await self.browser_service.is_element_visible('popup', '#dashboard-link')
            
            # Get status indicator text
            status_text = await self.browser_service.get_element_text('popup', '.status-text') or "No status"
            
            # Take a screenshot
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup.png")
            await self.browser_service.capture_screenshot('popup', screenshot_path)
            
            return {
                "loaded": True,
                "has_capture_button": has_capture_button,
                "has_dashboard_link": has_dashboard_link,
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
            
            # Open the extension popup if not already open
            if 'popup' not in self.browser_service.pages:
                await self.browser_service.open_extension_popup()
            
            # Click the capture button in the popup
            capture_success = await self.browser_service.click_extension_element('popup', '#capture-button')
            
            # Wait for the capture status indicator to appear/update
            # Adjust selector based on your extension's actual UI
            success_indicator = '.capture-success'
            indicator_visible = await self.browser_service.wait_for_selector(
                'popup', 
                success_indicator, 
                timeout=5000, 
                state="visible"
            )
            
            # Take a screenshot of the popup after capture
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_capture_{self._normalize_url(url)}.png")
            await self.browser_service.capture_screenshot('popup', screenshot_path)
            
            # Verify capture through API
            api_success = False
            if self.components.get("api"):
                # Wait a bit for the capture to complete
                await asyncio.sleep(2)
                
                # Query the API to check if the page was captured
                query_response = await self.components["api"].send_request(
                    "GET",
                    f"/api/v1/pages/?url={url}",
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                # Check if the page was found
                api_success = (
                    query_response.get("success", False) and
                    len(query_response.get("data", {}).get("pages", [])) > 0
                )
            
            # Get extension logs
            extension_logs = await self.browser_service.get_logs()
            capture_logs = [log for log in extension_logs if "capture" in log.get("message", "").lower()]
            
            return {
                "url": url,
                "ui_success": capture_success and indicator_visible,
                "api_success": api_success,
                "screenshot_path": screenshot_path,
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
            
            # Wait for dashboard to load - adjust selector based on your extension's actual UI
            dashboard_container = '.dashboard-container'
            await self.browser_service.wait_for_selector('dashboard', dashboard_container, timeout=10000)
            
            # Check if essential elements exist
            has_knowledge_tab = await self.browser_service.is_element_visible('dashboard', '#knowledge-tab')
            has_chat_tab = await self.browser_service.is_element_visible('dashboard', '#chat-tab')
            
            # Take a screenshot
            screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_dashboard.png")
            await self.browser_service.capture_screenshot('dashboard', screenshot_path)
            
            return {
                "loaded": True,
                "has_knowledge_tab": has_knowledge_tab,
                "has_chat_tab": has_chat_tab,
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
            
            # Navigate to knowledge tab if exists
            try:
                if await self.browser_service.is_element_visible('dashboard', '#knowledge-tab'):
                    await self.browser_service.click_extension_element('dashboard', '#knowledge-tab')
                    # Wait for tab to become active
                    await self.browser_service.wait_for_selector('dashboard', '.knowledge-tab-active', timeout=5000)
            except Exception as e:
                self.logger.warning(f"Could not navigate to knowledge tab: {str(e)}")
            
            # Find search input and enter query
            search_input = '#search-input'
            await self.browser_service.wait_for_selector('dashboard', search_input, timeout=5000)
            await self.browser_service.fill_form_field('dashboard', search_input, query)
            
            # Click search button or press Enter
            if await self.browser_service.is_element_visible('dashboard', '#search-button'):
                await self.browser_service.click_extension_element('dashboard', '#search-button')
            else:
                # Use the Playwright Page object directly for keyboard press
                dashboard_page = self.browser_service.pages['dashboard']
                await dashboard_page.keyboard.press('Enter')
            
            # Wait for results
            try:
                search_results = '.search-results'
                results_visible = await self.browser_service.wait_for_selector(
                    'dashboard', 
                    search_results, 
                    timeout=10000
                )
                
                # Check if results were found
                has_results = await self.browser_service.is_element_visible('dashboard', '.search-result-item')
                
                # Get result count
                dashboard_page = self.browser_service.pages['dashboard']
                result_count = await dashboard_page.evaluate('() => document.querySelectorAll(".search-result-item").length')
                
                # Take a screenshot
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
                self.logger.warning(f"Timeout waiting for search results: {str(e)}")
                
                # Take a screenshot anyway
                screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_search_timeout_{query.replace(' ', '_')}.png")
                await self.browser_service.capture_screenshot('dashboard', screenshot_path)
                
                return {
                    "query": query,
                    "success": False,
                    "error": "Timeout waiting for results",
                    "screenshot_path": screenshot_path
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
    
    def _normalize_url(self, url):
        """Normalize a URL for use in filenames."""
        return url.replace('https://', '').replace('http://', '').replace('/', '_').replace('.', '_')