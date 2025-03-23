from typing import Dict, Any
import os
import asyncio
import json
from datetime import datetime

from playwright.async_api import async_playwright

from core.utils.logger import get_logger
from test_harness.services.base_mock_service import BaseMockService

class RealBrowserService:
    """
    Service for interacting with a real browser and the Marvin extension.
    Provides methods to launch the browser, interact with the extension UI,
    and validate extension behavior.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the real browser service.
        
        Args:
            config: Browser configuration options
        """
        self.config = config
        self.logger = get_logger("test.real_browser", config.get("log_level", "INFO"))
        self.logger.info("Initializing RealBrowserService")
        
        # Browser state
        self.playwright = None
        self.browser_context = None
        self.extension_id = None
        self.extension_targets = {}
        self.pages = {}
        
        # Extension config
        self.extension_path = config.get("extension_path")
        self.user_data_dir = config.get("user_data_dir")
        self.headless = config.get("headless", False)
        
        # Selectors for extension elements
        self.selectors = config.get("selectors", {})
        
        # Log capture configuration
        self.capture_logs = config.get("capture_logs", True)
        self.log_buffer = []

        # Screenshots directory
        self.screenshot_dir = config.get("screenshot_dir", "screenshots")
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
        # Traces directory
        self.trace_dir = config.get("trace_dir", "traces")
        os.makedirs(self.trace_dir, exist_ok=True)
        
    async def initialize(self):
        """
        Initialize the browser service. This doesn't launch the browser yet,
        as that's done when needed by specific tests.
        
        Returns:
            The initialized service
        """
        self.logger.info("Initializing browser service")
        
        # Validate required configuration
        if not self.extension_path:
            raise ValueError("Extension path not specified in configuration")
        
        # Check if extension path exists
        if not os.path.exists(self.extension_path):
            self.logger.error(f"Extension path does not exist: {self.extension_path}")
            raise FileNotFoundError(f"Extension path not found: {self.extension_path}")
        
        self.logger.info(f"RealBrowserService initialized with extension: {self.extension_path}")
        return self
    
    async def launch_browser(self):
        """Launch the browser with the extension loaded."""
        self.logger.info("Launching browser with extension")
        
        # Initialize Playwright
        self.playwright = await async_playwright().start()
        
        # Choose browser type (chromium for extension testing)
        browser_type = self.playwright.chromium
        
        # Set up launch arguments
        context_options = {
            'headless': self.headless,
            'args': [
                f'--disable-extensions-except={self.extension_path}',
                f'--load-extension={self.extension_path}',
                '--no-sandbox',
            ]
        }
        
        # Add user data directory if specified
        if self.user_data_dir:
            if not os.path.exists(self.user_data_dir):
                os.makedirs(self.user_data_dir, exist_ok=True)
            # For persistent context, user_data_dir is required as the first argument
        else:
            # Create a temporary user data directory
            temp_dir = os.path.join(os.getcwd(), "browser_profiles", f"profile_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            os.makedirs(temp_dir, exist_ok=True)
            self.user_data_dir = temp_dir
            self.logger.info(f"Created temporary user data directory: {self.user_data_dir}")
        
        # Launch browser with persistent context
        self.browser_context = await browser_type.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            **context_options
        )
        
        # Allow some time for extension to initialize
        await asyncio.sleep(1)
        
        # Detect the extension ID
        await self._detect_extension_id()
        
        # Set up log capture
        if self.capture_logs:
            await self._setup_log_capture()
        
        self.logger.info(f"Browser launched with extension ID: {self.extension_id}")
        return self.browser_context
    
    async def _detect_extension_id(self):
        """Detect the extension ID after browser launch."""
        if not self.browser_context:
            raise RuntimeError("Browser not launched yet")
        
        # Get all background pages and service workers
        background_pages = self.browser_context.background_pages
        service_workers = self.browser_context.service_workers
        
        # Check background pages first
        for bg_page in background_pages:
            if 'marvin' in bg_page.url.lower():
                # Extract extension ID from URL
                url_parts = bg_page.url.split('/')
                if len(url_parts) > 2 and 'chrome-extension:' in url_parts[0]:
                    self.extension_id = url_parts[2]
                    self.extension_targets['background'] = bg_page
                    self.logger.debug(f"Detected extension ID from background page: {self.extension_id}")
                    return
        
        # Check service workers if not found in background pages
        for sw in service_workers:
            if 'marvin' in sw.url.lower():
                url_parts = sw.url.split('/')
                if len(url_parts) > 2 and 'chrome-extension:' in url_parts[0]:
                    self.extension_id = url_parts[2]
                    self.extension_targets['service_worker'] = sw
                    self.logger.debug(f"Detected extension ID from service worker: {self.extension_id}")
                    return
        
        # If not found in background pages or service workers, check regular pages
        for page in self.browser_context.pages:
            if 'chrome-extension://' in page.url and 'marvin' in page.url.lower():
                url_parts = page.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.logger.debug(f"Detected extension ID from page: {self.extension_id}")
                    return
                    
        self.logger.error("Could not detect extension ID; extension may not be loaded correctly")
        raise RuntimeError("Failed to detect extension ID")
    

    async def _setup_log_capture(self):
        """Set up console log capture."""
        if not self.browser_context:
            raise RuntimeError("Browser not launched yet")
        
        # Create a monitor page for console logging
        self.monitor_page = await self.browser_context.new_page()
        
        # Set up console event listeners
        self.monitor_page.on("console", self._handle_console_log)
        self.monitor_page.on("pageerror", self._handle_page_error)
        
        # Also add listeners to any existing pages
        for name, page in self.pages.items():
            page.on("console", self._handle_console_log)
            page.on("pageerror", self._handle_page_error)
        
        self.logger.debug("Set up log capture")

    def _handle_console_log(self, msg):
        """Handle console message events."""
        log_type = msg.type
        text = msg.text
        
        # Add to log buffer
        log_entry = {
            'timestamp': datetime.now().timestamp(),
            'type': log_type,
            'message': text,
            'location': str(msg.location) if hasattr(msg, 'location') else None
        }
        self.log_buffer.append(log_entry)
        
        # Log to our logger
        log_method = getattr(
            self.logger, 
            log_type if log_type in ['debug', 'info', 'warning', 'error'] else 'info'
        )
        log_method(f"Browser console [{log_type}]: {text}")

    def _handle_page_error(self, error):
        """Handle page error events."""
        # Add to log buffer
        log_entry = {
            'timestamp': datetime.now().timestamp(),
            'type': 'error',
            'message': str(error),
            'stack': getattr(error, 'stack', None)
        }
        self.log_buffer.append(log_entry)
        
        # Log to our logger
        self.logger.error(f"Browser page error: {error}")
    
    async def open_extension_popup(self):
        """
        Open the extension popup page.
        
        Returns:
            The popup page
        """
        if not self.browser_context or not self.extension_id:
            raise RuntimeError("Browser not launched or extension ID not detected")
        
        popup_url = f"chrome-extension://{self.extension_id}/popup.html"
        
        # Create a new page
        popup_page = await self.browser_context.new_page()
        
        # Navigate to popup URL
        try:
            await popup_page.goto(popup_url, wait_until="domcontentloaded")
            
            # Set up console logging for this page
            popup_page.on("console", self._handle_console_log)
            popup_page.on("pageerror", self._handle_page_error)
            
            # Store in pages dictionary
            self.pages['popup'] = popup_page
            
            self.logger.info(f"Opened extension popup at {popup_url}")
            return popup_page
        except Exception as e:
            self.logger.error(f"Error opening extension popup: {str(e)}")
            await popup_page.close()
            raise
    
    async def open_extension_dashboard(self):
        """
        Open the extension dashboard page.
        
        Returns:
            The dashboard page
        """
        if not self.browser_context or not self.extension_id:
            raise RuntimeError("Browser not launched or extension ID not detected")
        
        dashboard_url = f"chrome-extension://{self.extension_id}/dashboard.html"
        
        # Create a new page
        dashboard_page = await self.browser_context.new_page()
        
        # Navigate to dashboard URL
        try:
            await dashboard_page.goto(dashboard_url, wait_until="domcontentloaded")
            
            # Set up console logging for this page
            dashboard_page.on("console", self._handle_console_log)
            dashboard_page.on("pageerror", self._handle_page_error)
            
            # Store in pages dictionary
            self.pages['dashboard'] = dashboard_page
            
            self.logger.info(f"Opened extension dashboard at {dashboard_url}")
            return dashboard_page
        except Exception as e:
            self.logger.error(f"Error opening extension dashboard: {str(e)}")
            await dashboard_page.close()
            raise
    
    async def open_test_page(self, url):
        """
        Open a test page in the browser.
        
        Args:
            url: The URL to navigate to
            
        Returns:
            Tuple of (page object, page_id)
        """
        if not self.browser_context:
            raise RuntimeError("Browser not launched")
        
        # Create a new page
        page = await self.browser_context.new_page()
        
        try:
            # Navigate to URL
            await page.goto(url, wait_until="domcontentloaded")
            
            # Set up console logging for this page
            page.on("console", self._handle_console_log)
            page.on("pageerror", self._handle_page_error)
            
            # Generate a page ID
            page_id = f"page_{len(self.pages) + 1}"
            
            # Store in pages dictionary
            self.pages[page_id] = page
            
            self.logger.info(f"Opened test page at {url}")
            return page, page_id
        except Exception as e:
            self.logger.error(f"Error opening test page: {str(e)}")
            await page.close()
            raise
    
    async def click_extension_element(self, page_name, selector, timeout=5000):
        """
        Click an element in the extension UI.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            
        Returns:
            True if the click was successful
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            # Playwright automatically waits for the element to be ready
            await page.click(selector, timeout=timeout)
            self.logger.debug(f"Clicked element {selector} on {page_name}")
            return True
        except Exception as e:
            self.logger.error(f"Error clicking element {selector} on {page_name}: {str(e)}")
            return False
        
    async def fill_form_field(self, page_name, selector, value, timeout=5000):
        """
        Fill a form field in the extension UI.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the input field
            value: The value to fill in the field
            timeout: Timeout in milliseconds
            
        Returns:
            True if the field was filled successfully
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            # Wait for the element and fill it
            await page.fill(selector, value, timeout=timeout)
            self.logger.debug(f"Filled field {selector} with '{value}' on {page_name}")
            return True
        except Exception as e:
            self.logger.error(f"Error filling field {selector} on {page_name}: {str(e)}")
            return False
        
    async def get_element_text(self, page_name, selector, timeout=5000):
        """
        Get the text content of an element.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            
        Returns:
            The text content of the element, or None if not found
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return None
        
        try:
            # Wait for the element and get its text content
            element = await page.wait_for_selector(selector, timeout=timeout)
            if not element:
                return None
            
            text = await element.text_content()
            return text
        except Exception as e:
            self.logger.error(f"Error getting text from {selector} on {page_name}: {str(e)}")
            return None
        
    async def is_element_visible(self, page_name, selector, timeout=5000):
        """
        Check if an element is visible.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            
        Returns:
            True if the element is visible, False otherwise
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            # Check if the element is visible
            is_visible = await page.is_visible(selector, timeout=timeout)
            return is_visible
        except Exception as e:
            self.logger.error(f"Error checking visibility of {selector} on {page_name}: {str(e)}")
            return False
        
    async def start_tracing(self, name="browser_trace"):
        """
        Start recording a trace of browser activity.
        
        Args:
            name: Base name for the trace file
            
        Returns:
            True if tracing was started successfully
        """
        if not self.browser_context:
            self.logger.error("Browser not launched, cannot start tracing")
            return False
            
        try:
            # Create trace directory if it doesn't exist
            os.makedirs(self.trace_dir, exist_ok=True)
            
            # Generate trace file path
            trace_path = os.path.join(
                self.trace_dir, 
                f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            )
            
            # Start tracing
            await self.browser_context.tracing.start(
                screenshots=True,
                snapshots=True,
                sources=True,
                name=name
            )
            
            # Store trace path for later
            self.current_trace_path = trace_path
            
            self.logger.info(f"Started browser tracing")
            return True
        except Exception as e:
            self.logger.error(f"Error starting tracing: {str(e)}")
            return False
            
    async def stop_tracing(self):
        """
        Stop tracing and save the trace file.
        
        Returns:
            Path to the trace file or None if there was an error
        """
        if not self.browser_context:
            return None
            
        try:
            # Stop tracing and save to the file
            await self.browser_context.tracing.stop(path=self.current_trace_path)
            
            self.logger.info(f"Saved browser trace to {self.current_trace_path}")
            return self.current_trace_path
        except Exception as e:
            self.logger.error(f"Error stopping tracing: {str(e)}")
            return None
        
    async def capture_screenshot(self, page_name, path=None):
        """
        Capture a screenshot of a page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            path: Optional path to save the screenshot
            
        Returns:
            Path to the screenshot file or None if there was an error
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return None
        
        try:
            # Generate path if not provided
            if not path:
                os.makedirs(self.screenshot_dir, exist_ok=True)
                path = os.path.join(
                    self.screenshot_dir,
                    f"{page_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Capture screenshot
            await page.screenshot(path=path)
            
            self.logger.debug(f"Captured screenshot of {page_name} to {path}")
            return path
        except Exception as e:
            self.logger.error(f"Error capturing screenshot: {str(e)}")
            return None
        
    async def get_element_properties(self, page_name, selector, timeout=5000):
        """
        Get properties of an element.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            
        Returns:
            Dictionary of element properties
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return {}
        
        try:
            # Wait for element to exist
            element = await page.wait_for_selector(selector, timeout=timeout)
            if not element:
                return {}
                
            # Get element properties using JavaScript
            properties = await element.evaluate("""element => {
                const props = {
                    innerText: element.innerText,
                    innerHTML: element.innerHTML,
                    outerHTML: element.outerHTML,
                    className: element.className,
                    id: element.id,
                    tagName: element.tagName,
                    isVisible: !!(
                        element.offsetWidth || 
                        element.offsetHeight || 
                        element.getClientRects().length
                    ),
                    attributes: {}
                };
                
                // Get computed styles
                const styles = window.getComputedStyle(element);
                props.styles = {
                    display: styles.display,
                    visibility: styles.visibility,
                    opacity: styles.opacity,
                    backgroundColor: styles.backgroundColor,
                    color: styles.color
                };
                
                // Get all attributes
                for (const attr of element.attributes) {
                    props.attributes[attr.name] = attr.value;
                }
                
                // Get bounding client rect
                const rect = element.getBoundingClientRect();
                props.rect = {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left
                };
                
                return props;
            }""")
            
            return properties
        except Exception as e:
            self.logger.error(f"Error getting element properties: {str(e)}")
            return {}
    
    async def get_extension_state(self):
        """
        Get the current state of the extension.
        
        This evaluates JavaScript in the extension background page to retrieve its state.
        
        Returns:
            Dictionary containing extension state
        """
        bg_page = self.extension_targets.get('background')
        if not bg_page:
            self.logger.error("Extension background page not found")
            return {}
        
        try:
            # Evaluate JavaScript in the background page to get the state
            state_json = await bg_page.evaluate("""() => {
                // Try to find state in common extension patterns
                const state = window.marvinState || 
                              window.appState || 
                              window.__APP_STATE__ || 
                              {};
                
                return JSON.stringify(state);
            }""")
            
            try:
                state = json.loads(state_json)
                return state
            except json.JSONDecodeError:
                self.logger.error(f"Error parsing extension state: {state_json}")
                return {}
                
        except Exception as e:
            self.logger.error(f"Error getting extension state: {str(e)}")
            return {}
    
    async def get_logs(self):
        """
        Get the captured logs from the browser and extension.
        
        Returns:
            List of log entries
        """
        return self.log_buffer
    
    async def capture_screenshot(self, page_name, path):
        """
        Capture a screenshot of a page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            path: The path to save the screenshot
            
        Returns:
            True if the screenshot was captured successfully
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Capture screenshot
            await page.screenshot({'path': path})
            
            self.logger.debug(f"Captured screenshot of {page_name} to {path}")
            return True
        except Exception as e:
            self.logger.error(f"Error capturing screenshot: {str(e)}")
            return False
    
    async def wait_for_selector(self, page_name, selector, timeout=5000, state="visible"):
        """
        Wait for an element to appear on the page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            state: The state to wait for ('attached', 'detached', 'visible', 'hidden')
            
        Returns:
            True if the element appeared, False if timed out
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.wait_for_selector(selector, timeout=timeout, state=state)
            return True
        except Exception as e:
            self.logger.error(f"Timed out waiting for selector {selector} on {page_name}: {str(e)}")
            return False
    
    async def wait_for_navigation(self, page_name, timeout=5000, wait_until="load"):
        """
        Wait for navigation to complete.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            timeout: Timeout in milliseconds
            wait_until: When to consider navigation complete
            
        Returns:
            True if navigation completed, False if timed out
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.wait_for_load_state(wait_until, timeout=timeout)
            return True
        except Exception as e:
            self.logger.error(f"Timed out waiting for navigation on {page_name}: {str(e)}")
            return False
    
    async def reload_page(self, page_name, wait_until="load"):
        """
        Reload a page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            wait_until: When to consider navigation complete
            
        Returns:
            True if reload succeeded, False otherwise
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.reload(wait_until=wait_until)
            self.logger.debug(f"Reloaded page {page_name}")
            return True
        except Exception as e:
            self.logger.error(f"Error reloading page {page_name}: {str(e)}")
            return False
    
    async def shutdown(self):
        """Close the browser and clean up resources."""
        self.logger.info("Shutting down browser service")
        
        # Stop tracing if active
        if hasattr(self, 'current_trace_path') and self.browser_context:
            try:
                await self.stop_tracing()
            except Exception as e:
                self.logger.error(f"Error stopping tracing during shutdown: {str(e)}")
        
        # Close browser context if open
        if self.browser_context:
            try:
                await self.browser_context.close()
                self.browser_context = None
            except Exception as e:
                self.logger.error(f"Error closing browser context: {str(e)}")
        
        # Stop Playwright if initialized
        if self.playwright:
            try:
                await self.playwright.stop()
                self.playwright = None
            except Exception as e:
                self.logger.error(f"Error stopping Playwright: {str(e)}")
        
        # Clear state
        self.extension_id = None
        self.extension_targets = {}
        self.pages = {}
        self.log_buffer = []
        
        self.logger.info("Browser service shutdown complete")
        return True