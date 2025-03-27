import os
import asyncio
import json
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple, Union

from playwright.async_api import async_playwright, BrowserContext, Page, ElementHandle

from core.utils.logger import get_logger

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
            config: Browser configuration options including extension path,
                   user data directory, headless mode, and other settings
        """
        self.config = config
        self.logger = get_logger("test.real_browser", config.get("log_level", "INFO"))
        self.logger.info("Initializing RealBrowserService")
        
        # Browser state
        self.playwright = None
        self.browser_context: Optional[BrowserContext] = None
        self.extension_id: Optional[str] = None
        self.extension_targets: Dict[str, Union[Page, Any]] = {}
        self.pages: Dict[str, Page] = {}
        
        # Extension config
        self.extension_path = config.get("extension_path")
        self.user_data_dir = config.get("user_data_dir")
        self.headless = config.get("headless", False)
        
        # Selectors for extension elements
        self.selectors = config.get("selectors", {})
        
        # Log capture configuration
        self.capture_logs = config.get("capture_logs", True)
        self.log_buffer: List[Dict[str, Any]] = []
        
        # Screenshots directory
        self.screenshot_dir = config.get("screenshot_dir", "screenshots")
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
        # Tracing
        self.trace_dir = config.get("trace_dir", "traces")
        os.makedirs(self.trace_dir, exist_ok=True)
        self.tracing_enabled = config.get("enable_tracing", False)
        self.current_trace_path: Optional[str] = None
        
    async def initialize(self) -> 'RealBrowserService':
        """
        Initialize the browser service. This doesn't launch the browser yet,
        as that's done when needed by specific tests.
        
        Returns:
            The initialized service for method chaining
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
    
    async def launch_browser(self) -> BrowserContext:
        """
        Launch the browser with the extension loaded.
        
        Returns:
            The browser context with the extension loaded
        """
        self.logger.info(f"Launching browser with extension: {self.extension_path}")
        
        # Make paths absolute
        extension_path = os.path.abspath(self.extension_path)
        self.logger.info(f"Using absolute extension path: {extension_path}")
        
        # Validate extension
        if not os.path.exists(extension_path):
            raise FileNotFoundError(f"Extension path not found: {extension_path}")
        
        # Create user data dir with unique name
        user_data_dir = self.user_data_dir
        if not user_data_dir:
            user_data_dir = os.path.abspath('./browser_test_profile')
        
        # Ensure directory exists and is clean
        if os.path.exists(user_data_dir):
            self.logger.info(f"Cleaning existing user data directory: {user_data_dir}")
            try:
                # Remove only the contents, not the directory itself
                for item in os.listdir(user_data_dir):
                    item_path = os.path.join(user_data_dir, item)
                    if os.path.isfile(item_path):
                        os.unlink(item_path)
                    elif os.path.isdir(item_path):
                        import shutil
                        shutil.rmtree(item_path)
            except Exception as e:
                self.logger.warning(f"Error cleaning user data directory: {str(e)}")

        # Ensure directory exists
        os.makedirs(user_data_dir, exist_ok=True)
        self.logger.info(f"Using user data directory: {user_data_dir}")
        
        # Find system Chrome
        chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if not os.path.exists(chrome_path):
            raise FileNotFoundError(f"System Chrome not found at: {chrome_path}")
        
        self.logger.info(f"Using system Chrome at: {chrome_path}")

        # Start Playwright with system Chrome
        try:
            if self.playwright is None:
                self.logger.info("Initializing Playwright")
                self.playwright = await async_playwright().start()
            
            # Prepare launch options
            browser_args = [
                f"--disable-extensions-except={extension_path}",
                f"--load-extension={extension_path}",
                "--no-first-run",
                "--no-default-browser-check"
            ]
            
            launch_options = {
                "user_data_dir": user_data_dir,
                "headless": self.headless,
                "args": browser_args
            }
            
            # Use system Chrome if available
            if chrome_path:
                launch_options["executable_path"] = chrome_path
            
            # Launch persistent browser context
            self.logger.info("Launching persistent browser context...")
            self.browser_context = await self.playwright.chromium.launch_persistent_context(**launch_options)
                
            # Wait for background page (if extension has one)
            if len(self.browser_context.background_pages) == 0:
                self.logger.info("Waiting for extension background page...")
                try:
                    # Set a timeout for the wait_for_event
                    background_page = await asyncio.wait_for(
                        self.browser_context.wait_for_event('backgroundpage'),
                        timeout=10.0  # 10-second timeout
                    )
                    self.extension_targets['background'] = background_page
                    self.logger.info("Background page loaded")
                except asyncio.TimeoutError:
                    self.logger.warning("Timeout waiting for background page")
            else:
                background_page = self.browser_context.background_pages[0]
                self.extension_targets['background'] = background_page
                self.logger.info("Background page already available")
            
            # Create a new page to test browser functionality
            self.logger.info("Creating initial page")
            page = await self.browser_context.new_page()
            await page.goto("about:blank")
            self.pages['initial'] = page
            
            # Set up log capture
            if self.capture_logs:
                await self._setup_log_capture()
            
            # Attempt to detect extension ID
            await self._detect_extension_id()
            
            self.logger.info(f"Successfully launched browser with extension ID: {self.extension_id}")
            return self.browser_context
            
        except Exception as e:
            self.logger.error(f"Error during browser launch: {str(e)}")
            
            # Capture screenshots and clean up
            await self._capture_error_screenshots()
            await self._cleanup_browser_resources()
            
            # Re-raise the exception
            raise

    async def _cleanup_browser_resources(self) -> None:
        """
        Clean up browser resources safely.
        
        This method ensures that all pages and browser contexts are properly closed
        and Playwright is stopped, even if errors occur during cleanup.
        """
        self.logger.info("Cleaning up browser resources...")
        
        # Save trace if enabled
        if self.tracing_enabled and self.current_trace_path and self._is_browser_context_active():
            try:
                await self.browser_context.tracing.stop(path=self.current_trace_path)
                self.logger.info(f"Saved browser trace to {self.current_trace_path}")
            except Exception as e:
                self.logger.warning(f"Failed to save browser trace: {str(e)}")
        
        # Close all pages first
        for page_name, page in list(self.pages.items()):
            try:
                await page.close()
                del self.pages[page_name]
            except Exception:
                pass  # Ignore errors during cleanup
        
        # Close browser context
        if self._is_browser_context_active():
            try:
                await self.browser_context.close()
            except Exception:
                pass  # Ignore errors during cleanup
            
        self.browser_context = None
        
        # Close playwright
        if self.playwright:
            try:
                await self.playwright.stop()
            except Exception:
                pass  # Ignore errors during cleanup
            
        self.playwright = None
        self.logger.info("Browser resources cleanup completed")

    def _is_browser_context_active(self) -> bool:
        """
        Check if the browser context is still active.
        
        Returns:
            True if the context is active, False otherwise
        """
        if not self.browser_context:
            return False
            
        try:
            # Check if we can access pages property (will throw if context is closed)
            _ = self.browser_context.pages
            return True
        except Exception:
            return False
        
    async def _capture_error_screenshots(self) -> None:
        """
        Capture screenshots of all pages for error debugging.
        
        This is automatically called when errors occur to help diagnose issues.
        """
        if not self._is_browser_context_active():
            return
            
        try:
            for page_name, page in self.pages.items():
                try:
                    screenshot_path = os.path.join(
                        self.screenshot_dir,
                        f"error_{page_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                    )
                    await page.screenshot(path=screenshot_path)
                    self.logger.info(f"Captured error screenshot for {page_name}: {screenshot_path}")
                except Exception as e:
                    self.logger.warning(f"Failed to capture screenshot for {page_name}: {str(e)}")
        except Exception as e:
            self.logger.warning(f"Error capturing error screenshots: {str(e)}")
    

    async def _detect_extension_id(self) -> None:
        """
        Detect the extension ID after browser launch.
        
        This method tries several approaches to find the extension ID:
        1. Checking background pages
        2. Checking service workers
        3. Checking all pages for extension URLs
        4. Extracting IDs from the extensions page
        
        Raises:
            RuntimeError: If the extension ID cannot be detected
        """
        if not self._is_browser_context_active():
            raise RuntimeError("Browser not launched or context not active")
        
        self.logger.info("Attempting to detect extension ID...")
        
        # 1. Check background pages
        self.logger.debug(f"Checking {len(self.browser_context.background_pages)} background pages")
        for bg_page in self.browser_context.background_pages:
            self.logger.debug(f"Examining background page: {bg_page.url}")
            if 'chrome-extension://' in bg_page.url:
                url_parts = bg_page.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.extension_targets['background'] = bg_page
                    self.logger.info(f"Detected extension ID from background page: {self.extension_id}")
                    return
        
        # 2. Check service workers
        self.logger.debug(f"Checking {len(self.browser_context.service_workers)} service workers")
        for sw in self.browser_context.service_workers:
            self.logger.debug(f"Examining service worker: {sw.url}")
            if 'chrome-extension://' in sw.url:
                url_parts = sw.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.extension_targets['service_worker'] = sw
                    self.logger.info(f"Detected extension ID from service worker: {self.extension_id}")
                    return
        
        # 3. Check all pages
        self.logger.debug(f"Checking {len(self.browser_context.pages)} regular pages")
        for page in self.browser_context.pages:
            self.logger.debug(f"Examining page: {page.url}")
            if 'chrome-extension://' in page.url:
                url_parts = page.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.logger.info(f"Detected extension ID from regular page: {self.extension_id}")
                    return
        
        # 4. If we have an extensions page, try to extract IDs from it
        if 'extensions' in self.pages:
            try:
                extension_ids = await self.pages['extensions'].evaluate('''() => {
                    const extensionItems = document.querySelectorAll('extensions-item');
                    return Array.from(extensionItems).map(item => {
                        return {
                            id: item.getAttribute('id'),
                            name: item.querySelector('.name')?.textContent.trim() || "Unknown",
                            enabled: !item.querySelector('.enable-toggle')?.hasAttribute('disabled')
                        };
                    });
                }''')
                
                if extension_ids and len(extension_ids) > 0:
                    self.logger.info(f"Found {len(extension_ids)} extensions:")
                    for ext in extension_ids:
                        self.logger.info(f"  - {ext['name']} (ID: {ext['id']}, Enabled: {ext.get('enabled', False)})")
                        
                    # Try to find our extension by checking if any are enabled
                    for ext in extension_ids:
                        if ext.get('enabled', False):
                            self.extension_id = ext['id']
                            self.logger.info(f"Using enabled extension: {ext['name']} with ID: {self.extension_id}")
                            return
                else:
                    self.logger.warning("No extensions found on extensions page")
                
            except Exception as e:
                self.logger.warning(f"Error extracting extension IDs from extensions page: {str(e)}")
        
        # If we get here, we couldn't find an extension ID
        self.logger.error("Could not detect extension ID; extension may not be loaded correctly")
        self.logger.error("Please check: 1) Extension is built correctly, 2) manifest.json is valid, 3) Background script/service worker exists")
        raise RuntimeError("Failed to detect extension ID")

    async def _setup_log_capture(self) -> None:
        """
        Set up console log capture for browser and extension.
        
        This registers event listeners on all pages to capture console logs and errors.
        """
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
        
        self.logger.debug("Log capture set up successfully")

    def _handle_console_log(self, msg) -> None:
        """
        Handle console message events from browser pages.
        
        Args:
            msg: Console message object from Playwright
        """
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


    def _handle_page_error(self, error) -> None:
        """
        Handle page error events from browser pages.
        
        Args:
            error: Error object from Playwright
        """
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
    
    async def open_extension_popup(self) -> Page:
        """
        Open the extension popup page.
        
        Returns:
            The popup page object
            
        Raises:
            RuntimeError: If the browser is not launched or extension ID is not detected
            Exception: If there's an error opening the popup
        """
        if not self._is_browser_context_active():
            raise RuntimeError("Browser not launched or context not active")
        
        if not self.extension_id:
            self.logger.error("Extension ID not detected, cannot open popup")
            raise RuntimeError("Extension ID not detected, cannot open popup")
        
        popup_url = f"chrome-extension://{self.extension_id}/popup/popup.html"
        self.logger.info(f"Opening extension popup at {popup_url}")
        
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
            
            # Take screenshot for debugging
            screenshot_path = os.path.join(
                self.screenshot_dir,
                f"popup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            )
            await popup_page.screenshot(path=screenshot_path)
            self.logger.info(f"Captured popup screenshot to {screenshot_path}")
            
            self.logger.info(f"Successfully opened extension popup")
            return popup_page
        except Exception as e:
            self.logger.error(f"Error opening extension popup: {str(e)}")
            
            # Try to take a screenshot of what we got
            try:
                screenshot_path = os.path.join(
                    self.screenshot_dir,
                    f"popup_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await popup_page.screenshot(path=screenshot_path)
                self.logger.info(f"Captured error screenshot to {screenshot_path}")
            except:
                pass
                
            await popup_page.close()
            raise
    
    async def open_extension_dashboard(self) -> Page:
        """
        Open the extension dashboard page.
        
        Returns:
            The dashboard page object
            
        Raises:
            RuntimeError: If the browser is not launched or extension ID is not detected
            Exception: If there's an error opening the dashboard
        """
        if not self._is_browser_context_active() or not self.extension_id:
            raise RuntimeError("Browser not launched or extension ID not detected")
        
        dashboard_url = f"chrome-extension://{self.extension_id}/dashboard/dashboard.html"
        self.logger.info(f"Opening extension dashboard at {dashboard_url}")
        
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
            
            # Take screenshot for debugging
            screenshot_path = os.path.join(
                self.screenshot_dir,
                f"dashboard_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            )
            await dashboard_page.screenshot(path=screenshot_path)
            self.logger.info(f"Captured dashboard screenshot to {screenshot_path}")
            
            self.logger.info(f"Successfully opened extension dashboard")
            return dashboard_page
        except Exception as e:
            self.logger.error(f"Error opening extension dashboard: {str(e)}")
            
            # Try to take a screenshot
            try:
                screenshot_path = os.path.join(
                    self.screenshot_dir,
                    f"dashboard_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await dashboard_page.screenshot(path=screenshot_path)
                self.logger.info(f"Captured error screenshot to {screenshot_path}")
            except:
                pass
                
            await dashboard_page.close()
            raise
    
    async def open_test_page(self, url: str) -> Tuple[Page, str]:
        """
        Open a test page in the browser.
        
        Args:
            url: The URL to navigate to
            
        Returns:
            Tuple of (page object, page_id)
            
        Raises:
            RuntimeError: If the browser is not launched
            Exception: If there's an error opening the page
        """
        if not self._is_browser_context_active():
            raise RuntimeError("Browser not launched or context not active")
        
        # Create a new page
        page = await self.browser_context.new_page()
        
        try:
            # Navigate to URL
            self.logger.info(f"Navigating to test page: {url}")
            await page.goto(url, wait_until="domcontentloaded")
            
            # Set up console logging for this page
            page.on("console", self._handle_console_log)
            page.on("pageerror", self._handle_page_error)
            
            # Generate a page ID
            page_id = f"page_{len(self.pages) + 1}"
            
            # Store in pages dictionary
            self.pages[page_id] = page
            
            self.logger.info(f"Successfully opened test page at {url} (page ID: {page_id})")
            return page, page_id
        except Exception as e:
            self.logger.error(f"Error opening test page {url}: {str(e)}")
            
            # Try to take a screenshot
            try:
                screenshot_path = os.path.join(
                    self.screenshot_dir,
                    f"page_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await page.screenshot(path=screenshot_path)
                self.logger.info(f"Captured error screenshot to {screenshot_path}")
            except:
                pass
                
            await page.close()
            raise
    
    async def click_extension_element(self, page_name: str, selector: str, timeout: int = 5000) -> bool:
        """
        Click an element in the extension UI.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the element
            timeout: Timeout in milliseconds
            
        Returns:
            True if the click was successful, False otherwise
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            self.logger.info(f"Clicking element '{selector}' on page '{page_name}'")
            # Playwright automatically waits for the element to be ready
            await page.click(selector, timeout=timeout)
            self.logger.info(f"Successfully clicked element '{selector}' on page '{page_name}'")
            return True
        except Exception as e:
            self.logger.error(f"Error clicking element '{selector}' on page '{page_name}': {str(e)}")
            return False
        
    async def fill_form_field(self, page_name: str, selector: str, value: str, timeout: int = 5000) -> bool:
        """
        Fill a form field in the extension UI.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: The CSS selector for the input field
            value: The value to fill in the field
            timeout: Timeout in milliseconds
            
        Returns:
            True if the field was filled successfully, False otherwise
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            self.logger.info(f"Filling field '{selector}' on page '{page_name}' with value: {value}")
            # Wait for the element and fill it
            await page.fill(selector, value, timeout=timeout)
            self.logger.info(f"Successfully filled field '{selector}' on page '{page_name}'")
            return True
        except Exception as e:
            self.logger.error(f"Error filling field '{selector}' on page '{page_name}': {str(e)}")
            return False
        
    async def get_element_text(self, page_name: str, selector: str, timeout: int = 5000) -> Optional[str]:
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
            self.logger.debug(f"Getting text from element '{selector}' on page '{page_name}'")
            # Wait for the element and get its text content
            element = await page.wait_for_selector(selector, timeout=timeout)
            if not element:
                self.logger.warning(f"Element '{selector}' not found on page '{page_name}'")
                return None
            
            text = await element.text_content()
            self.logger.debug(f"Element '{selector}' text: {text}")
            return text
        except Exception as e:
            self.logger.error(f"Error getting text from element '{selector}' on page '{page_name}': {str(e)}")
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
    
    async def get_logs(self, page_name=None):
        """
        Get the captured logs from the browser and extension.
        
        Args:
            page_name: Optional name of the page to filter logs for
            
        Returns:
            List of log entries
        """
        if page_name:
            # Filter logs for the specified page
            return [log for log in self.log_buffer if log.get('page') == page_name]
        return self.log_buffer
    
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
        

    async def get_element(self, page_name, selector):
        """Get all elements matching a selector."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return []
        
        try:
            return await page.querySelectorAll(selector)
        except Exception as e:
            self.logger.error(f"Error getting elements '{selector}' on {page_name}: {str(e)}")
            return []

    async def get_attribute(self, element, attr_name):
        """Get an attribute from an element."""
        try:
            return await element.getAttribute(attr_name)
        except Exception as e:
            self.logger.error(f"Error getting attribute '{attr_name}': {str(e)}")
            return None

    async def evaluate_js(self, page_name, js_code):
        """Evaluate JavaScript code on the page."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return None
        
        try:
            return await page.evaluate(js_code)
        except Exception as e:
            self.logger.error(f"Error evaluating JS on {page_name}: {str(e)}")
            return None

    async def press_key(self, page_name, key):
        """Press a key on the page."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.keyboard.press(key)
            return True
        except Exception as e:
            self.logger.error(f"Error pressing key '{key}' on {page_name}: {str(e)}")
            return False
        
    async def login_to_extension(self, username="test", password="test123"):
        """
        Login to the extension using the provided credentials.
        
        Args:
            username: Login username (default: "test")
            password: Login password (default: "test123")
            
        Returns:
            True if login was successful, False otherwise
        """
        self.logger.info(f"Attempting to login with username: {username}")
        
        try:
            # Ensure popup is open
            if 'popup' not in self.pages:
                await self.open_extension_popup()
            
            # Check if login form is visible
            login_form_visible = await self.is_element_visible('popup', '#login-form')
            
            if not login_form_visible:
                # Check if already logged in
                user_info_visible = await self.is_element_visible('popup', '#user-info')
                if user_info_visible:
                    self.logger.info("Already logged in, no login needed")
                    return True
                    
                # Try to make login form visible (might be hidden by default)
                login_btn_visible = await self.is_element_visible('popup', '#login-btn')
                if login_btn_visible:
                    await self.click_extension_element('popup', '#login-btn')
                    # Wait for login form to appear
                    login_form_visible = await self.wait_for_selector('popup', '#login-form', timeout=3000)
            
            if login_form_visible:
                # Fill login form
                await self.fill_form_field('popup', '#username', username)
                await self.fill_form_field('popup', '#password', password)
                
                # Take a screenshot before submitting
                screenshot_path = os.path.join(
                    self.screenshot_dir, 
                    f"login_form_filled_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await self.capture_screenshot('popup', screenshot_path)
                
                # Submit the form
                submit_success = await self.click_extension_element('popup', '#auth-form button[type="submit"]')
                if not submit_success:
                    # Try alternate method - look for a login button
                    submit_success = await self.click_extension_element('popup', '.btn-primary')
                
                if not submit_success:
                    self.logger.warning("Could not find login submit button")
                    return False
                
                # Wait for login process to complete
                await asyncio.sleep(1)
                
                # Check if login was successful by looking for user-info or checking if buttons are enabled
                user_info_visible = await self.is_element_visible('popup', '#user-info')
                capture_btn_disabled = await self.get_element_property('popup', '#capture-btn', 'disabled')
                
                login_success = user_info_visible or not capture_btn_disabled
                
                # Take a post-login screenshot
                screenshot_path = os.path.join(
                    self.screenshot_dir, 
                    f"post_login_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await self.capture_screenshot('popup', screenshot_path)
                
                if login_success:
                    self.logger.info("Login successful")
                    return True
                else:
                    self.logger.warning("Login form submitted but login appears unsuccessful")
                    return False
            else:
                # Check if we're already logged in
                capture_btn_disabled = await self.get_element_property('popup', '#capture-btn', 'disabled')
                if capture_btn_disabled is False:
                    self.logger.info("Already logged in (buttons are enabled)")
                    return True
                
                self.logger.warning("Login form not found and not already logged in")
                return False
        except Exception as e:
            self.logger.error(f"Error during login: {str(e)}")
            
            # Take an error screenshot
            try:
                screenshot_path = os.path.join(
                    self.screenshot_dir, 
                    f"login_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                )
                await self.capture_screenshot('popup', screenshot_path)
            except:
                pass
                
            return False
        
    async def get_element_property(self, page_name, selector, property_name):
        """
        Get a property value from an element.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            selector: CSS selector for the element
            property_name: The name of the property to get
            
        Returns:
            The property value, or None if not found
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return None
        
        try:
            # First wait for the element to exist
            element = await page.wait_for_selector(selector, timeout=3000)
            if not element:
                self.logger.warning(f"Element not found: {selector}")
                return None
                
            # Get the property value
            property_value = await element.get_property(property_name)
            if property_value:
                return await property_value.json_value()
            return None
        except Exception as e:
            self.logger.error(f"Error getting property '{property_name}' for element '{selector}' on {page_name}: {str(e)}")
            return None
        
    async def get_nav_panel_names(self, page_name):
        """Get the names of navigation panels in dashboard."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return []
        
        try:
            # Use evaluate to run JavaScript in the page context
            panel_names = await page.evaluate('''() => {
                const navItems = document.querySelectorAll('.nav-item');
                return Array.from(navItems)
                    .map(item => item.getAttribute('data-panel'))
                    .filter(panel => panel);
            }''')
            return panel_names
        except Exception as e:
            self.logger.error(f"Error getting nav panel names: {str(e)}")
            return []
        
    async def wait_for_condition(self, page_name, check_function, max_attempts=30, delay=200):
        """
        Wait for a condition to be true by polling.
        This avoids CSP issues with wait_for_function.
        
        Args:
            page_name: The name of the page
            check_function: An async function that returns True when condition is met
            max_attempts: Maximum number of polling attempts
            delay: Milliseconds to wait between attempts
            
        Returns:
            True if condition was met, False if timed out
        """
        for attempt in range(max_attempts):
            try:
                if await check_function():
                    return True
            except Exception as e:
                self.logger.debug(f"Polling attempt {attempt+1} failed: {str(e)}")
            
            await asyncio.sleep(delay / 1000)  # Convert to seconds
        
        return False
    
    async def enable_console_capture(self, page_name):
        """
        Enable enhanced console logging for a specific page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
        
        Returns:
            True if enabled successfully, False otherwise
        """
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            # Filter log buffer for this page
            self.log_buffer = [log for log in self.log_buffer if log.get('page') != page_name]
            
            # Console logging is already enabled by default, just note this was called
            self.logger.info(f"Enhanced console capture enabled for {page_name}")
            return True
        except Exception as e:
            self.logger.error(f"Error enabling console capture: {str(e)}")
            return False

    async def get_console_logs(self, page_name):
        """
        Get console logs for a specific page.
        
        Args:
            page_name: The name of the page ('popup', 'dashboard', etc.)
            
        Returns:
            List of console log entries
        """
        # Filter logs for the specified page
        return [log for log in self.log_buffer if log.get('page') == page_name]
        
    
    async def shutdown(self) -> bool:
        """
        Close the browser and clean up resources.
        
        Returns:
            True if shutdown completed successfully
        """
        self.logger.info("Shutting down browser service")
        await self._cleanup_browser_resources()
        self.logger.info("Browser service shutdown complete")
        return True
    
    async def __aenter__(self) -> 'RealBrowserService':
        """Support for async context manager."""
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        """
        Clean up resources when used as a context manager.
        
        Returns:
            False to propagate exceptions
        """
        await self.shutdown()
        return False 