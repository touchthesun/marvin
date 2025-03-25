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
        
        # Check for specific elements in your popup
        assertions.append(self.create_assertion(
            "popup_has_capture_button",
            popup_ui.get("has_capture_button", False),
            "Extension popup should have a capture button"
        ))
        
        assertions.append(self.create_assertion(
            "popup_has_dashboard_button",
            popup_ui.get("has_dashboard_button", False),
            "Extension popup should have a dashboard button"
        ))
        
        # 2. Validate page captures - we expect these to potentially fail 
        # until the API is fully connected
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
        
        # Check for specific dashboard elements
        if dashboard_ui.get("loaded", False):
            assertions.append(self.create_assertion(
                "dashboard_has_sidebar",
                dashboard_ui.get("has_sidebar", False),
                "Dashboard should have a sidebar navigation"
            ))
            
            assertions.append(self.create_assertion(
                "dashboard_has_main_content",
                dashboard_ui.get("has_main_content", False),
                "Dashboard should have main content area"
            ))
        
        # 4. Validate knowledge queries - we expect these to potentially fail
        # until the API is fully connected
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
                await self.browser_service.open_extension_popup()
            
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
            
            # Click the capture button (using your actual button ID)
            capture_success = await self.browser_service.click_extension_element('popup', '#capture-btn')
            
            if not capture_success:
                self.logger.warning("Failed to click capture button")
            else:
                self.logger.info("Successfully clicked capture button")
            
            # Wait for the capture operation to complete
            # The popup.js shows that the button text changes to "Capturing..." then "Captured!"
            try:
                # Wait for button text to change to "Capturing..."
                await self.browser_service.wait_for_condition(
                    'popup',
                    """() => {
                        const btn = document.querySelector('#capture-btn');
                        return btn && btn.textContent.includes('Capturing');
                    }""",
                    timeout=3000
                )
                
                self.logger.info("Capture in progress...")
                
                # Wait for button text to change to "Captured!" or back to original
                await self.browser_service.wait_for_condition(
                    'popup',
                    """() => {
                        const btn = document.querySelector('#capture-btn');
                        return btn && (btn.textContent.includes('Captured') || 
                            btn.textContent.includes('Capture Current Page'));
                    }""",
                    timeout=10000
                )
                
                self.logger.info("Capture operation completed")
            except Exception as e:
                self.logger.warning(f"Error waiting for capture status: {str(e)}")
            
            # Take a screenshot after capture
            after_screenshot_path = os.path.join(self.screenshot_dir, f"{self.test_run_id}_popup_after_capture.png")
            await self.browser_service.capture_screenshot('popup', after_screenshot_path)
            
            # Check if capture was successful by looking at button text
            button_text = await self.browser_service.get_element_text('popup', '#capture-btn')
            indicator_visible = button_text and ("Captured" in button_text or "Capture Current Page" in button_text)
            
            # Verify capture through API
            api_success = False
            if self.components.get("api"):
                # Wait a bit longer for the capture to complete
                await asyncio.sleep(3)
                
                # Query the API to check if the page was captured
                query_response = await self.components["api"].send_request(
                    "GET",
                    f"/api/v1/pages/?url={url}",
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                # Log the API response for debugging
                self.logger.debug(f"API response: {query_response}")
                
                # Check if the page was found
                api_success = (
                    query_response.get("success", False) and
                    len(query_response.get("data", {}).get("pages", [])) > 0
                )
                
                if api_success:
                    self.logger.info(f"API verification succeeded for {url}")
                else:
                    self.logger.warning(f"API verification failed for {url}")
            
            # Get extension logs
            extension_logs = await self.browser_service.get_logs()
            capture_logs = [log for log in extension_logs if "capture" in log.get("message", "").lower()]
            
            return {
                "url": url,
                "ui_success": capture_success and indicator_visible,
                "api_success": api_success,
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
            nav_panels = await self.browser_service.get_nav_panel_names('dashboard')
            self.logger.info(f"Found nav panels: {nav_panels}")
            try:
                # This needs to be done via the browser_service
                panel_elements = await self.browser_service.get_elements('dashboard', '.nav-item')
                for panel_element in panel_elements:
                    panel_name = await self.browser_service.get_attribute(panel_element, 'data-panel')
                    if panel_name:
                        nav_panels.append(panel_name)
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
    
    def _normalize_url(self, url):
        """Normalize a URL for use in filenames."""
        return url.replace('https://', '').replace('http://', '').replace('/', '_').replace('.', '_')
    
    