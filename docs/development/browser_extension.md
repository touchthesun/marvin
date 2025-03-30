# Browser Extension Testing

## Browser Extension Testing Strategy

The test harness now includes robust support for testing the Marvin browser extension in a real browser environment using a combination of Playwright and system Chrome. This enables automated testing of the extension's functionality, UI components, and integration with the backend services.

### Key Capabilities

1. **Real Browser Testing**: Launch and control an actual Chrome browser with the extension loaded
2. **Extension Detection**: Automatically detect extension IDs and background pages
3. **UI Interaction**: Interact with extension UI elements, click buttons, fill forms
4. **Screenshot Capture**: Take screenshots during tests for visual verification
5. **Browser Navigation**: Load test pages and verify extension functionality
6. **Error Handling**: Robust error handling and browser process management

### Browser Testing Components

The browser testing system consists of these key components:

1. **RealBrowserService**: Service for launching and interacting with Chrome
2. **BrowserExtensionScenario**: Test scenario for validating extension functionality
3. **Extension Fixtures**: Sample data for testing extension features

## RealBrowserService Implementation

The `RealBrowserService` implements browser control using Playwright with system Chrome. This approach was adopted after extensive testing revealed compatibility issues between Playwright's bundled Chromium and extension loading.

### Implementation Details

```python
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
        self.browser_context = None
        self.extension_id = None
        self.extension_targets = {}
        self.pages = {}
        
        # Extension config
        self.extension_path = config.get("extension_path")
        self.user_data_dir = config.get("user_data_dir")
        self.headless = config.get("headless", False)
        
        # Logging and debugging config
        self.capture_logs = config.get("capture_logs", True)
        self.log_buffer = []
        self.screenshot_dir = config.get("screenshot_dir", "screenshots")
        self.tracing_enabled = config.get("enable_tracing", False)
        
    async def initialize(self):
        """Initialize the service."""
        # Validate extension path
        if not self.extension_path or not os.path.exists(self.extension_path):
            raise FileNotFoundError(f"Extension path not found: {self.extension_path}")
        
        return self
    
    async def launch_browser(self):
        """Launch Chrome with the extension loaded."""
        extension_path = os.path.abspath(self.extension_path)
        
        # Create a unique user data directory
        # user_data_dir = self.user_data_dir
        # if not user_data_dir:
        #     user_data_dir = os.path.abspath('./test_harness/profiles')
        
        # unique_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        # user_data_dir = f"{user_data_dir}_{unique_id}"
        # user_data_dir = os.path.abspath(user_data_dir)
        # os.makedirs(user_data_dir, exist_ok=True)
        
        # Find system Chrome
        system_chrome = self._find_system_chrome()
        
        # Initialize Playwright
        if self.playwright is None:
            self.playwright = await async_playwright().start()
        
        # Prepare browser arguments
        browser_args = [
            f"--disable-extensions-except={extension_path}",
            f"--load-extension={extension_path}",
            "--no-first-run",
            "--no-default-browser-check"
        ]
        
        # Launch browser with persistent context
        launch_options = {
            "user_data_dir": user_data_dir,
            "headless": self.headless,
            "args": browser_args
        }
        
        # Use system Chrome if available
        if system_chrome:
            launch_options["executable_path"] = system_chrome
        
        # Launch the browser
        self.browser_context = await self.playwright.chromium.launch_persistent_context(**launch_options)
        
        # Wait for background page
        if len(self.browser_context.background_pages) == 0:
            try:
                background_page = await asyncio.wait_for(
                    self.browser_context.wait_for_event('backgroundpage'),
                    timeout=10.0
                )
                self.extension_targets['background'] = background_page
            except asyncio.TimeoutError:
                self.logger.warning("Timeout waiting for background page")
        elif len(self.browser_context.background_pages) > 0:
            self.extension_targets['background'] = self.browser_context.background_pages[0]
        
        # Detect extension ID
        await self._detect_extension_id()
        
        return self.browser_context
    
    def _find_system_chrome(self):
        """Find the system Chrome executable."""
        chrome_paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser"
        ]
        
        for path in chrome_paths:
            if os.path.exists(path):
                self.logger.info(f"Found system Chrome at: {path}")
                return path
        
        return None
    
    async def _detect_extension_id(self):
        """Detect the extension ID after browser launch."""
        if not self.browser_context:
            raise RuntimeError("Browser not launched or context not active")
        
        # Check background pages
        for bg_page in self.browser_context.background_pages:
            if 'chrome-extension://' in bg_page.url:
                url_parts = bg_page.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.extension_targets['background'] = bg_page
                    return
        
        # Check service workers
        for sw in self.browser_context.service_workers:
            if 'chrome-extension://' in sw.url:
                url_parts = sw.url.split('/')
                if len(url_parts) > 2:
                    self.extension_id = url_parts[2]
                    self.extension_targets['service_worker'] = sw
                    return
        
        # If we get here, we couldn't find an extension ID
        raise RuntimeError("Failed to detect extension ID")
    
    async def open_extension_popup(self):
        """Open the extension popup page."""
        if not self.extension_id:
            raise RuntimeError("Extension ID not detected, cannot open popup")
        
        popup_url = f"chrome-extension://{self.extension_id}/popup.html"
        
        # Create a new page and navigate to popup URL
        popup_page = await self.browser_context.new_page()
        await popup_page.goto(popup_url, wait_until="domcontentloaded")
        
        # Store in pages dictionary
        self.pages['popup'] = popup_page
        
        # Take screenshot for debugging
        await self._take_screenshot(popup_page, "popup")
        
        return popup_page
    
    async def open_extension_dashboard(self):
        """Open the extension dashboard page."""
        if not self.extension_id:
            raise RuntimeError("Extension ID not detected")
        
        dashboard_url = f"chrome-extension://{self.extension_id}/dashboard.html"
        
        # Create a new page and navigate to dashboard URL
        dashboard_page = await self.browser_context.new_page()
        await dashboard_page.goto(dashboard_url, wait_until="domcontentloaded")
        
        # Store in pages dictionary
        self.pages['dashboard'] = dashboard_page
        
        # Take screenshot for debugging
        await self._take_screenshot(dashboard_page, "dashboard")
        
        return dashboard_page
    
    async def _take_screenshot(self, page, name):
        """Take a screenshot of a page."""
        screenshot_path = os.path.join(
            self.screenshot_dir,
            f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        )
        os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
        await page.screenshot(path=screenshot_path)
        return screenshot_path
    
    async def click_element(self, page_name, selector, timeout=5000):
        """Click an element on a page."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.click(selector, timeout=timeout)
            return True
        except Exception as e:
            self.logger.error(f"Error clicking element: {str(e)}")
            return False
    
    async def fill_form_field(self, page_name, selector, value, timeout=5000):
        """Fill a form field on a page."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return False
        
        try:
            await page.fill(selector, value, timeout=timeout)
            return True
        except Exception as e:
            self.logger.error(f"Error filling form field: {str(e)}")
            return False
    
    async def get_element_text(self, page_name, selector, timeout=5000):
        """Get the text content of an element."""
        page = self.pages.get(page_name)
        if not page:
            self.logger.error(f"Page not found: {page_name}")
            return None
        
        try:
            element = await page.wait_for_selector(selector, timeout=timeout)
            if not element:
                return None
            
            return await element.text_content()
        except Exception as e:
            self.logger.error(f"Error getting element text: {str(e)}")
            return None
    
    async def shutdown(self):
        """Close the browser and clean up resources."""
        try:
            # Close all pages first
            for page_name, page in list(self.pages.items()):
                try:
                    await page.close()
                except Exception:
                    pass
            
            # Close browser context
            if self.browser_context:
                await self.browser_context.close()
            
            # Stop playwright
            if self.playwright:
                await self.playwright.stop()
            
            return True
        except Exception as e:
            self.logger.error(f"Error during shutdown: {str(e)}")
            return False
```

## Browser Extension Scenario

The `BrowserExtensionScenario` implements a test scenario for validating the extension's functionality:

```python
class BrowserExtensionScenario(TestScenario):
    """Test scenario for browser extension functionality."""
    
    async def setup(self):
        """Set up the test environment."""
        self.logger.info("Setting up browser extension scenario")
        
        # Get browser service
        self.browser_service = self.components.get("browser")
        if not self.browser_service:
            raise RuntimeError("Browser service not available")
        
        # Get API service for backend calls
        self.api_service = self.components.get("api")
        if not self.api_service:
            raise RuntimeError("API service not available")
        
        # Launch the browser with extension
        await self.browser_service.launch_browser()
        
        # Set up authentication token
        if hasattr(self.api_service, "setup_test_auth"):
            self.auth_token = await self.api_service.setup_test_auth()
    
    async def execute(self):
        """Execute the test scenario."""
        results = {}
        
        # Open extension popup
        popup_page = await self.browser_service.open_extension_popup()
        results["popup_opened"] = popup_page is not None
        
        # Verify UI elements
        login_button_visible = await self.browser_service.is_element_visible("popup", "#login-button")
        results["login_button_visible"] = login_button_visible
        
        # Test popup functionality
        if login_button_visible:
            clicked = await self.browser_service.click_element("popup", "#login-button")
            results["login_button_clicked"] = clicked
        
        # Open test page and interact with extension
        page, page_id = await self.browser_service.open_test_page("https://example.com")
        results["test_page_opened"] = page is not None
        
        # Wait for extension content script to initialize
        await asyncio.sleep(2)
        
        # Capture content
        capture_button_visible = await self.browser_service.is_element_visible(page_id, "#marvin-capture-button")
        results["capture_button_visible"] = capture_button_visible
        
        if capture_button_visible:
            clicked = await self.browser_service.click_element(page_id, "#marvin-capture-button")
            results["capture_button_clicked"] = clicked
            
            # Wait for capture to complete
            await asyncio.sleep(2)
            
            # Verify status message
            status_text = await self.browser_service.get_element_text(page_id, "#marvin-status-message")
            results["capture_status"] = status_text
        
        # Open dashboard
        dashboard_page = await self.browser_service.open_extension_dashboard()
        results["dashboard_opened"] = dashboard_page is not None
        
        # Check dashboard components
        if dashboard_page:
            nav_visible = await self.browser_service.is_element_visible("dashboard", "nav")
            results["dashboard_nav_visible"] = nav_visible
            
            content_visible = await self.browser_service.is_element_visible("dashboard", "#content-area")
            results["dashboard_content_visible"] = content_visible
        
        return results
    
    async def validate(self, results):
        """Validate the test results."""
        assertions = []
        
        # Check popup opened successfully
        assertions.append(self.create_assertion(
            "popup_opened",
            results.get("popup_opened", False),
            "Extension popup should open successfully"
        ))
        
        # Check dashboard opened successfully
        assertions.append(self.create_assertion(
            "dashboard_opened",
            results.get("dashboard_opened", False),
            "Extension dashboard should open successfully"
        ))
        
        # Check test page interaction
        assertions.append(self.create_assertion(
            "test_page_opened",
            results.get("test_page_opened", False),
            "Test page should open successfully"
        ))
        
        # Add more assertions based on results
        
        return assertions
    
    async def teardown(self):
        """Clean up resources."""
        if hasattr(self, "browser_service"):
            await self.browser_service.shutdown()
```

## Browser Testing Lessons Learned

During the implementation of the browser extension testing, several important lessons were learned:

### Playwright and Extension Compatibility

1. **Chrome vs. Chromium**: Playwright's bundled Chromium had issues loading and initializing extensions, particularly with service workers in Manifest V3 extensions. Using the system Chrome installation resolved these issues.

2. **SEGV Crashes**: We encountered consistent segmentation faults (SEGV_ACCERR) when attempting to load the extension with Playwright's bundled Chromium. This appears to be related to how Chromium interacts with the extension code, particularly service workers.

3. **Browser Arguments**: The specific browser arguments used are critical for proper extension loading. Extra arguments can cause instability, while missing critical arguments can prevent extensions from loading correctly.

### Extension Testing Best Practices

1. **Fresh Profile**: Always use a fresh user data directory for each test run to avoid state contamination.

2. **Extension ID Detection**: Automatically detecting the extension ID is essential since it's dynamically assigned.

3. **Timeouts and Retry Logic**: Add timeouts and retry logic for extension detection and operations, as extension loading times can vary.

4. **Screenshot Captures**: Taking screenshots at key points in the test flow provides valuable debugging information.

### Chrome Debugging Flag Reference

These browser arguments were found to be most reliable for extension testing:

```python
browser_args = [
    f"--disable-extensions-except={extension_path}",  # Only load our extension
    f"--load-extension={extension_path}",            # Load the extension
    "--no-first-run",                                # Skip first run dialogs
    "--no-default-browser-check"                     # Skip default browser check
]
```

Adding too many flags can cause instability or unexpected behavior. Use additional flags only when necessary.

## Integrating with the Test Harness

To use the browser extension testing in your test harness:

1. **Configuration File**:

```json
{
  "browser": {
    "use_real_browser": true,
    "extension_path": "./extension/dist",
    "user_data_dir": "./test_profiles",
    "headless": false,
    "screenshot_dir": "./test_screenshots"
  }
}
```

2. **Command Line**:

```bash
python -m test_harness \
  --scenario browser_extension \
  --use-real-browser \
  --browser-extension-path ./extension/dist \
  --browser-headless=false
```

The test harness handles launching Chrome with the extension loaded, executing a series of interactions, and validating the extension's functionality.

## Future Enhancements

1. **Cross-Browser Testing**: Extend support to Firefox and other browsers
2. **Parallel Testing**: Support running tests in multiple browser instances
3. **Visual Regression Testing**: Compare screenshots to detect UI changes
4. **Network Interception**: Mock API responses for isolated testing
5. **Performance Metrics**: Collect extension performance metrics