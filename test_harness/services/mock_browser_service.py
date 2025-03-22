import os
import re
import json
import uuid
import time
import aiohttp
import traceback
from typing import Dict, Any, List, Optional

from test_harness.utils.paths import resolve_path
from core.utils.logger import get_logger
from test_harness.services.base_mock_service import BaseMockService

class BrowserSimulator(BaseMockService):
    """
    Simulates browser behavior for testing extensions.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the browser simulator.
        
        Args:
            config: Browser configuration
        """
        super().__init__(config)
        self.tabs = []
        self.bookmarks = []
        self.history = []
        self.settings = {}
        self.current_tab_id = None
        self.current_window_id = "1"
        
        self.logger.debug(f"BrowserSimulator initialized with config: {config}")
    
    async def initialize(self):
        """
        Initialize the browser simulator.
        
        Returns:
            Self for method chaining
        """
        await super().initialize()
        
        try:
            # Load test browser state if specified
            browser_state = self.config.get("browser_state")
            if browser_state:
                self.logger.info(f"Loading browser state from: {browser_state}")
                await self.load_browser_state(browser_state)
            else:
                self.logger.info("Initializing with empty browser state")
                self._init_empty_state()
            
            self.logger.info(f"Browser simulator initialized with {len(self.tabs)} tabs and {len(self.bookmarks)} bookmarks")
            return self
        except Exception as e:
            self.logger.error(f"Failed to initialize browser simulator: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
    async def shutdown(self):
        """Shut down the browser simulator."""
        self.logger.info("Shutting down browser simulator")
        self.logger.debug(f"Closing {len(self.tabs)} tabs and clearing state")
        await super().shutdown()
    
    def _init_empty_state(self):
        """Initialize with an empty browser state."""
        self.tabs = []
        self.bookmarks = []
        self.history = []
        self.settings = {
            "extension_enabled": True,
            "auto_capture": True,
            "user_preferences": {
                "theme": "light",
                "default_view": "list"
            }
        }
    
    async def load_browser_state(self, state_file: str):
        """
        Load a browser state from a file.
        
        Args:
            state_file: Path to the browser state JSON file
        """
        self.logger.info(f"Loading browser state from {state_file}")
        
        try:
            # Resolve the path to the state file
            resolved_path = resolve_path(state_file)
            self.logger.debug(f"Resolved path: {resolved_path}")
            
            with open(resolved_path, 'r') as f:
                state = json.load(f)
            
            self.tabs = state.get("tabs", [])
            self.bookmarks = state.get("bookmarks", [])
            self.history = state.get("history", [])
            self.windows = state.get("windows", [])
            self.settings = state.get("settings", {})
            
            self.logger.info(f"Loaded browser state with {len(self.tabs)} tabs, {len(self.bookmarks)} bookmarks")
        except FileNotFoundError:
            self.logger.error(f"Error loading browser state: [Errno 2] No such file or directory: '{state_file}'")
        except json.JSONDecodeError as e:
            self.logger.error(f"Error parsing browser state JSON: {str(e)}")
        except Exception as e:
            self.logger.error(f"Error loading browser state: {str(e)}")
    
    async def capture_page(self, url: str) -> Dict[str, Any]:
        """
        Simulate capturing a page from the browser.
        
        Args:
            url: Page URL
            
        Returns:
            Page data
        """
        self.logger.info(f"Capturing page: {url}")
        
        # Check if we already have this tab
        for tab in self.tabs:
            if tab["url"] == url:
                self.logger.info(f"Using existing tab for {url}")
                self.current_tab_id = tab["id"]
                self.current_window_id = tab.get("window_id", "1")
                
                return {
                    "url": url,
                    "title": tab.get("title", "Untitled"),
                    "content": tab.get("content", ""),
                    "context": "ACTIVE_TAB",
                    "tab_id": tab["id"],
                    "window_id": tab.get("window_id", "1"),
                    "browser_contexts": ["ACTIVE_TAB"]
                }
        
        # Otherwise, fetch the content
        self.logger.info(f"Fetching content for {url}")
        content = await self._fetch_content(url)
        
        # Create a new tab
        tab_id = f"tab_{uuid.uuid4().hex[:8]}"
        window_id = self.current_window_id
        
        tab = {
            "id": tab_id,
            "url": url,
            "title": content.get("title", "Untitled"),
            "content": content.get("content", ""),
            "window_id": window_id,
            "created_at": self._get_timestamp()
        }
        
        self.tabs.append(tab)
        self.current_tab_id = tab_id
        
        # Add to history
        self.history.append({
            "url": url,
            "title": content.get("title", "Untitled"),
            "visited_at": self._get_timestamp()
        })
        
        return {
            "url": url,
            "title": tab["title"],
            "content": tab["content"],
            "context": "ACTIVE_TAB",
            "tab_id": tab_id,
            "window_id": window_id,
            "browser_contexts": ["ACTIVE_TAB"]
        }
    
    async def _fetch_content(self, url: str) -> Dict[str, Any]:
        """
        Fetch content for a URL.
        
        Args:
            url: Page URL
            
        Returns:
            Page content dictionary
        """
        # Check if we have test fixtures for this URL
        fixtures_dir = self.config.get("fixtures_dir")
        if fixtures_dir:
            normalized_url = url.replace("https://", "").replace("http://", "").replace("/", "_")
            fixture_path = os.path.join(fixtures_dir, f"{normalized_url}.json")
            
            if os.path.exists(fixture_path):
                self.logger.info(f"Using fixture for {url}")
                with open(fixture_path, 'r') as f:
                    return json.load(f)
        
        # Check if we should make real requests
        if self.config.get("allow_real_requests", False):
            try:
                self.logger.info(f"Making real request to {url}")
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=10) as response:
                        if response.status == 200:
                            html = await response.text()
                            title = self._extract_title(html)
                            return {
                                "title": title,
                                "content": html
                            }
                        else:
                            self.logger.warning(f"Error fetching {url}: HTTP {response.status}")
            except Exception as e:
                self.logger.error(f"Error making real request to {url}: {str(e)}")
        
        # Fall back to a stub
        self.logger.info(f"Using stub content for {url}")
        return {
            "title": f"Test Page for {url}",
            "content": self._generate_stub_content(url)
        }
    
    def _extract_title(self, html: str) -> str:
        """
        Extract the title from HTML content.
        
        Args:
            html: HTML content
            
        Returns:
            Page title
        """
        match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1)
        return "Untitled"
    
    def _generate_stub_content(self, url: str) -> str:
        """
        Generate stub HTML content for a URL.
        
        Args:
            url: Page URL
            
        Returns:
            HTML content
        """
        domain = self._extract_domain(url)
        path = url.split('/')[-1] if '/' in url else ''
        
        return f"""<!DOCTYPE html>
<html>
<head>
    <title>Test Page for {url}</title>
    <meta name="description" content="This is a test page generated by the Marvin Test Harness">
    <meta property="og:title" content="Test Page for {url}">
    <meta property="og:description" content="Test page for {domain}">
</head>
<body>
    <header>
        <h1>Test Page for {domain}</h1>
        <nav>
            <ul>
                <li><a href="{domain}/home">Home</a></li>
                <li><a href="{domain}/about">About</a></li>
                <li><a href="{domain}/contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    
    <main>
        <h2>Welcome to {domain}</h2>
        <p>This is a stub page created for testing purposes. It simulates content that might be found at {url}.</p>
        
        <section>
            <h3>Features</h3>
            <ul>
                <li>Simulated content structure</li>
                <li>Basic metadata</li>
                <li>Sample links</li>
                <li>Placeholder text</li>
            </ul>
        </section>
        
        <section>
            <h3>Related Content</h3>
            <div class="related-links">
                <a href="{domain}/page1">Related Page 1</a>
                <a href="{domain}/page2">Related Page 2</a>
                <a href="https://example.com">External Link</a>
            </div>
        </section>
    </main>
    
    <footer>
        <p>&copy; {domain} - Test Page</p>
    </footer>
</body>
</html>"""
    
    def _extract_domain(self, url: str) -> str:
        """
        Extract domain from URL.
        
        Args:
            url: URL to process
            
        Returns:
            Domain string
        """
        domain_match = re.search(r'https?://([^/]+)', url)
        if domain_match:
            return domain_match.group(1)
        return url.split('/')[0]
    
    def _get_timestamp(self) -> float:
        """
        Get current timestamp.
        
        Returns:
            Current timestamp in seconds
        """
        return time.time()
    
    async def create_tab(self, url: str, window_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new browser tab.
        
        Args:
            url: Tab URL
            window_id: Optional window ID
            
        Returns:
            Tab data
        """
        self.logger.info(f"Creating new tab for {url}")
        
        # Use the current window if not specified
        if window_id is None:
            window_id = self.current_window_id
        
        # Fetch content
        content = await self._fetch_content(url)
        
        # Create tab
        tab_id = f"tab_{uuid.uuid4().hex[:8]}"
        tab = {
            "id": tab_id,
            "url": url,
            "title": content.get("title", "Untitled"),
            "content": content.get("content", ""),
            "window_id": window_id,
            "created_at": self._get_timestamp()
        }
        
        self.tabs.append(tab)
        self.current_tab_id = tab_id
        self.current_window_id = window_id
        
        # Add to history
        self.history.append({
            "url": url,
            "title": content.get("title", "Untitled"),
            "visited_at": self._get_timestamp()
        })
        
        return tab
    
    async def create_bookmark(self, url: str, title: Optional[str] = None, folder: str = "Bookmarks") -> Dict[str, Any]:
        """
        Create a new bookmark.
        
        Args:
            url: Bookmark URL
            title: Optional bookmark title
            folder: Bookmark folder
            
        Returns:
            Bookmark data
        """
        self.logger.info(f"Creating bookmark for {url}")
        
        # Get title if not provided
        if title is None:
            for tab in self.tabs:
                if tab["url"] == url:
                    title = tab.get("title", "Untitled")
                    break
            
            if title is None:
                # Try to fetch the page to get a title
                content = await self._fetch_content(url)
                title = content.get("title", "Untitled")
        
        # Create bookmark
        bookmark_id = f"bookmark_{uuid.uuid4().hex[:8]}"
        bookmark = {
            "id": bookmark_id,
            "url": url,
            "title": title,
            "folder": folder,
            "created_at": self._get_timestamp()
        }
        
        self.bookmarks.append(bookmark)
        
        return bookmark
    
    async def get_active_tab(self) -> Optional[Dict[str, Any]]:
        """
        Get the currently active tab.
        
        Returns:
            Active tab data or None
        """
        if not self.current_tab_id:
            return None
        
        for tab in self.tabs:
            if tab["id"] == self.current_tab_id:
                return tab
        
        return None
    
    async def get_all_tabs(self) -> List[Dict[str, Any]]:
        """
        Get all open tabs.
        
        Returns:
            List of tab data
        """
        return self.tabs
    
    async def get_all_bookmarks(self) -> List[Dict[str, Any]]:
        """
        Get all bookmarks.
        
        Returns:
            List of bookmark data
        """
        return self.bookmarks
    
    async def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get browsing history.
        
        Args:
            limit: Maximum number of history items to return
            
        Returns:
            List of history items
        """
        # Sort by visited_at in descending order
        sorted_history = sorted(
            self.history,
            key=lambda x: x.get("visited_at", 0),
            reverse=True
        )
        
        return sorted_history[:limit]
    
    async def close_tab(self, tab_id: str) -> bool:
        """
        Close a browser tab.
        
        Args:
            tab_id: Tab ID to close
            
        Returns:
            True if closed, False otherwise
        """
        for i, tab in enumerate(self.tabs):
            if tab["id"] == tab_id:
                self.tabs.pop(i)
                
                # Update current tab if needed
                if self.current_tab_id == tab_id:
                    self.current_tab_id = self.tabs[0]["id"] if self.tabs else None
                
                return True
        
        return False
    
    async def navigate(self, url: str, tab_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Navigate a tab to a new URL.
        
        Args:
            url: URL to navigate to
            tab_id: Optional tab ID, uses active tab if not specified
            
        Returns:
            Updated tab data
        """
        # Use active tab if not specified
        if tab_id is None:
            tab_id = self.current_tab_id
        
        if not tab_id:
            raise ValueError("No active tab to navigate")
        
        # Find the tab
        tab_index = None
        for i, tab in enumerate(self.tabs):
            if tab["id"] == tab_id:
                tab_index = i
                break
        
        if tab_index is None:
            raise ValueError(f"Tab {tab_id} not found")
        
        # Fetch content
        content = await self._fetch_content(url)
        
        # Update tab
        self.tabs[tab_index]["url"] = url
        self.tabs[tab_index]["title"] = content.get("title", "Untitled")
        self.tabs[tab_index]["content"] = content.get("content", "")
        
        # Add to history
        self.history.append({
            "url": url,
            "title": content.get("title", "Untitled"),
            "visited_at": self._get_timestamp()
        })
        
        return self.tabs[tab_index]
    
    async def update_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update browser settings.
        
        Args:
            settings: Settings to update
            
        Returns:
            Updated settings
        """
        # Merge with existing settings
        self.settings.update(settings)
        return self.settings
    
    async def save_state(self, file_path: str) -> bool:
        """
        Save the current browser state to a file.
        
        Args:
            file_path: Output file path
            
        Returns:
            True if saved, False otherwise
        """
        try:
            state = {
                "tabs": self.tabs,
                "bookmarks": self.bookmarks,
                "history": self.history,
                "settings": self.settings
            }
            
            with open(file_path, 'w') as f:
                json.dump(state, f, indent=2)
            
            self.logger.info(f"Browser state saved to {file_path}")
            return True
        except Exception as e:
            self.logger.error(f"Error saving browser state: {str(e)}")
            return False