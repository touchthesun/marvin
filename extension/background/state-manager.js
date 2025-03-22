// background/state-manager.js

class StateManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.lastSyncTime = 0;
    this.syncIntervalId = null;
    this.currentState = {
      tabs: [],
      windows: [],
      bookmarks: []
    };
  }
  
  async initialize() {
    // Load settings from storage
    const data = await chrome.storage.local.get(['stateSettings', 'lastSyncTime']);
    this.settings = data.stateSettings || {
      syncEnabled: true,
      syncInterval: 60000, // 1 minute
      syncBookmarks: true
    };
    
    this.lastSyncTime = data.lastSyncTime || 0;
    
    // Set up tab and window listeners
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.windows.onCreated.addListener(this.handleWindowCreated.bind(this));
    chrome.windows.onRemoved.addListener(this.handleWindowRemoved.bind(this));
    
    if (this.settings.syncBookmarks) {
      chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
      chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
      chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
    }
    
    // Start periodic sync
    if (this.settings.syncEnabled) {
      this.startPeriodicSync();
    }
    
    console.log('State manager initialized');
  }
  
  // Event handlers for tabs
  handleTabCreated(tab) {
    this.scheduleSync();
  }
  
  handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      this.scheduleSync();
    }
  }
  
  handleTabRemoved(tabId, removeInfo) {
    this.scheduleSync();
  }
  
  // Event handlers for windows
  handleWindowCreated(window) {
    this.scheduleSync();
  }
  
  handleWindowRemoved(windowId) {
    this.scheduleSync();
  }
  
  // Event handlers for bookmarks
  handleBookmarkCreated(id, bookmark) {
    this.scheduleSync();
  }
  
  handleBookmarkChanged(id, changeInfo) {
    this.scheduleSync();
  }
  
  handleBookmarkRemoved(id, removeInfo) {
    this.scheduleSync();
  }
  
  // Schedule a sync after state changes
  scheduleSync() {
    if (!this.settings.syncEnabled) return;
    
    // Debounce syncs to prevent too many calls
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncState();
    }, 2000); // Wait 2 seconds after last change
  }
  
  // Start periodic sync
  startPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    
    this.syncIntervalId = setInterval(() => {
      this.syncState();
    }, this.settings.syncInterval);
    
    // Perform initial sync
    this.syncState();
  }
  
  // Stop periodic sync
  stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }
  
  // Get current browser state
  async getBrowserState() {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    // Get all windows
    const windows = await chrome.windows.getAll({});
    
    // Get active tab for each window
    const windowStates = [];
    for (const window of windows) {
      const activeTabs = await chrome.tabs.query({ active: true, windowId: window.id });
      windowStates.push({
        id: window.id.toString(),
        focused: window.focused,
        activeTabId: activeTabs[0]?.id.toString()
      });
    }
    
    // Get bookmarks if enabled
    let bookmarks = [];
    if (this.settings.syncBookmarks) {
      const bookmarkTree = await chrome.bookmarks.getTree();
      bookmarks = this.flattenBookmarks(bookmarkTree);
    }
    
    return {
      tabs: tabs.map(tab => ({
        id: tab.id.toString(),
        windowId: tab.windowId.toString(),
        active: tab.active,
        url: tab.url,
        title: tab.title
      })),
      windows: windowStates,
      bookmarks: bookmarks
    };
  }
  
  // Flatten bookmark tree into array
  flattenBookmarks(bookmarkItems) {
    const bookmarks = [];
    
    function processBookmarkNode(node) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title,
          url: node.url,
          dateAdded: node.dateAdded
        });
      }
      
      if (node.children) {
        for (const child of node.children) {
          processBookmarkNode(child);
        }
      }
    }
    
    for (const node of bookmarkItems) {
      processBookmarkNode(node);
    }
    
    return bookmarks;
  }
  
  // Sync browser state with server
  async syncState() {
    try {
      const currentState = await this.getBrowserState();
      
      // Compare with last state to detect changes
      const hasChanged = this.hasStateChanged(currentState);
      
      if (hasChanged || Date.now() - this.lastSyncTime > this.settings.syncInterval) {
        // Send state to API
        const response = await this.apiClient.post('/api/v1/browser/sync', currentState);
        
        if (response.success) {
          this.currentState = currentState;
          this.lastSyncTime = Date.now();
          await chrome.storage.local.set({ lastSyncTime: this.lastSyncTime });
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('State sync error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Check if state has changed significantly
  hasStateChanged(newState) {
    // Check if tab count has changed
    if (newState.tabs.length !== this.currentState.tabs.length) {
      return true;
    }
    
    // Check if active tab has changed in any window
    for (const window of newState.windows) {
      const oldWindow = this.currentState.windows.find(w => w.id === window.id);
      if (!oldWindow || oldWindow.activeTabId !== window.activeTabId) {
        return true;
      }
    }
    
    // Check for new or changed bookmarks (simple count check)
    if (newState.bookmarks.length !== this.currentState.bookmarks.length) {
      return true;
    }
    
    return false;
  }
  
  // Update sync settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Update sync behavior based on new settings
    if (this.settings.syncEnabled) {
      // Restart sync with new interval if needed
      this.stopPeriodicSync();
      this.startPeriodicSync();
    } else {
      this.stopPeriodicSync();
    }
    
    return chrome.storage.local.set({ stateSettings: this.settings });
  }
}

export default StateManager;