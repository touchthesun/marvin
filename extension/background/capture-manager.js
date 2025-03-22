// background/capture-manager.js

class CaptureManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.captureQueue = [];
    this.activeCaptureTabIds = new Set();
    this.captureHistory = [];
  }
  
  async initialize() {
    // Load settings and history
    const data = await chrome.storage.local.get(['captureSettings', 'captureHistory']);
    this.settings = data.captureSettings || {
      automaticCapture: true,
      minTimeOnPage: 10, // seconds
      excludedDomains: [],
      includedDomains: []
    };
    
    this.captureHistory = data.captureHistory || [];
    
    // Set up tab event listeners
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    
    console.log('Capture manager initialized');
  }
  
  async handleTabUpdated(tabId, changeInfo, tab) {
    // Only proceed if tab has completed loading
    if (changeInfo.status !== 'complete') return;
    
    // Check if this URL should be automatically captured
    if (this.settings.automaticCapture && this.shouldCaptureUrl(tab.url)) {
      // Start a timer for minimum time on page
      setTimeout(() => {
        // Verify tab still exists and is on same URL
        chrome.tabs.get(tabId, currentTab => {
          if (chrome.runtime.lastError) return; // Tab no longer exists
          
          if (currentTab.url === tab.url) {
            this.captureTab(tabId);
          }
        });
      }, this.settings.minTimeOnPage * 1000);
    }
  }
  
  handleTabRemoved(tabId) {
    // Remove tab from active captures if it was being processed
    this.activeCaptureTabIds.delete(tabId);
  }
  
  shouldCaptureUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Skip browser-specific pages
      if (urlObj.protocol === 'chrome:' || 
          urlObj.protocol === 'chrome-extension:' || 
          urlObj.protocol === 'about:') {
        return false;
      }
      
      const domain = urlObj.hostname;
      
      // Check excluded domains
      if (this.settings.excludedDomains.some(excluded => 
        domain === excluded || domain.endsWith(`.${excluded}`))) {
        return false;
      }
      
      // Check included domains (if specified)
      if (this.settings.includedDomains.length > 0) {
        return this.settings.includedDomains.some(included => 
          domain === included || domain.endsWith(`.${included}`));
      }
      
      // No exclusion or inclusion matched
      return true;
    } catch (e) {
      console.error('URL parsing error:', e);
      return false;
    }
  }
  
  async captureTab(tabId) {
    // Prevent duplicate captures
    if (this.activeCaptureTabIds.has(tabId)) return;
    
    this.activeCaptureTabIds.add(tabId);
    
    try {
      const tab = await chrome.tabs.get(tabId);
      
      // Request content extraction from the content script
      chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error('Content script error:', chrome.runtime.lastError);
          this.activeCaptureTabIds.delete(tabId);
          return;
        }
        
        if (response && response.content) {
          await this.processExtractedContent(tab, response.content, response.metadata);
        }
      });
      
      return { success: true, message: 'Capture initiated' };
    } catch (error) {
      console.error('Capture error:', error);
      this.activeCaptureTabIds.delete(tabId);
      return { success: false, error: error.message };
    }
  }
  
  async processExtractedContent(tab, content, metadata) {
    try {
      // Notify tab that capture is in progress
      chrome.tabs.sendMessage(tab.id, { 
        action: 'updateCaptureStatus', 
        status: 'capturing' 
      });
      
      // Prepare page data for API
      const pageData = {
        url: tab.url,
        title: tab.title,
        content: content,
        context: "ACTIVE_TAB",
        tab_id: tab.id.toString(),
        window_id: tab.windowId.toString(),
        bookmark_id: null,
        browser_contexts: ["ACTIVE_TAB"],
        metadata: metadata || {}
      };
      
      // Submit to API
      const response = await this.apiClient.post('/api/v1/pages/', pageData);
      
      // Track capture history
      if (response.success) {
        this.captureHistory.unshift({
          url: tab.url,
          title: tab.title,
          timestamp: Date.now(),
          taskId: response.data?.task_id,
          status: 'captured'
        });
        
        // Trim history to last 100 items
        if (this.captureHistory.length > 100) {
          this.captureHistory = this.captureHistory.slice(0, 100);
        }
        
        await chrome.storage.local.set({ captureHistory: this.captureHistory });
        
        // Notify tab of success
        chrome.tabs.sendMessage(tab.id, { 
          action: 'updateCaptureStatus', 
          status: 'success' 
        });
      } else {
        // Notify tab of error
        chrome.tabs.sendMessage(tab.id, { 
          action: 'updateCaptureStatus', 
          status: 'error' 
        });
      }
      
      this.activeCaptureTabIds.delete(tab.id);
      return response;
    } catch (error) {
      console.error('Processing error:', error);
      
      // Notify tab of error
      chrome.tabs.sendMessage(tab.id, { 
        action: 'updateCaptureStatus', 
        status: 'error' 
      });
      
      this.activeCaptureTabIds.delete(tab.id);
      return { success: false, error: error.message };
    }
  }
  
  // Methods for manual capture
  async captureCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        return this.captureTab(tab.id);
      }
      return { success: false, error: 'No active tab found' };
    } catch (error) {
      console.error('Error capturing current tab:', error);
      return { success: false, error: error.message };
    }
  }
  
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    return chrome.storage.local.set({ captureSettings: this.settings });
  }
}

export default CaptureManager;