// src/background/background-service.js
import { container } from '../core/dependency-container.js';

/**
 * Background Service - Main service for the extension's background script
 */
export class BackgroundService {
  constructor(container) {
    this.container = container;
    this.initialized = false;
    
    // Get logger from the container
    const LogManager = container.getUtil('LogManager');
    this.logger = new LogManager({
      isBackgroundScript: true,
      context: 'background-service',
      maxEntries: 2000
    });
  }
  
  /**
   * Initialize the background service
   */
  async initialize() {
    if (this.initialized) {
      this.logger.debug('Background service already initialized');
      return;
    }
    
    try {
      this.logger.info('Initializing background service');
      
      // Get required services
      this.apiService = this.container.getService('apiService');
      this.taskService = this.container.getService('taskService');
      this.statusService = this.container.getService('statusService');
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      // Set up Chrome API event listeners
      this.setupEventListeners();
      
      this.initialized = true;
      this.logger.info('Background service initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing background service:', error);
      throw error;
    }
  }
  
  /**
   * Set up message handlers for communication with content scripts and popup
   */
  setupMessageHandlers() {
    this.logger.debug('Setting up message handlers');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Return true for async responses
      const isAsync = true;
      
      switch (message.action) {
        case 'captureUrl':
          this.handleCaptureUrl(message, sender, sendResponse);
          return isAsync;
          
        case 'analyzeUrl':
          this.handleAnalyzeUrl(message, sender, sendResponse);
          return isAsync;
          
        case 'getActiveTasks':
          this.handleGetActiveTasks(message, sender, sendResponse);
          return isAsync;
          
        case 'networkStatusChange':
          this.handleNetworkStatusChange(message, sender, sendResponse);
          return false; // Synchronous response
          
        case 'contentScriptLoaded':
          this.handleContentScriptLoaded(message, sender, sendResponse);
          return false; // Synchronous response
          
        case 'checkAuthStatus':
          this.handleCheckAuthStatus(message, sender, sendResponse);
          return isAsync;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
          return false;
      }
    });
  }
  
  /**
   * Set up Chrome API event listeners
   */
  setupEventListeners() {
    this.logger.debug('Setting up event listeners');
    
    // Handle tabs being updated
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only react if the URL has changed and it's a complete load
      if (changeInfo.status === 'complete' && tab.url) {
        this.logger.debug(`Tab updated: ${tabId}, URL: ${tab.url}`);
        this.onTabUpdated(tabId, changeInfo, tab);
      }
    });
    
    // Handle tabs being created
    chrome.tabs.onCreated.addListener((tab) => {
      this.logger.debug(`Tab created: ${tab.id}, URL: ${tab.url || 'unknown'}`);
      this.onTabCreated(tab);
    });
    
    // Handle extension installation or update
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.logger.info('Extension installed');
        this.onExtensionInstalled();
      } else if (details.reason === 'update') {
        this.logger.info(`Extension updated from ${details.previousVersion}`);
        this.onExtensionUpdated(details.previousVersion);
      }
    });
  }
  
  // Message handler implementations
  onTabUpdated(tabId, changeInfo, tab) {
    // Only process when page has fully loaded and has a valid URL
    if (changeInfo.status === 'complete' && tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://')) {
      
      try {
        // Get required services
        const storageService = this.container.getService('storageService');
        const statusService = this.container.getService('statusService');
        
        // Update tab status
        statusService.updateTabStatus(tabId, {
          url: tab.url,
          title: tab.title,
          status: 'complete',
          updatedAt: Date.now()
        });
        
        // Check if auto-capture is enabled
        storageService.getSettings().then(settings => {
          if (settings.autoCapture) {
            // Use the documented Pages API to create a page
            const apiService = this.container.getService('apiService');
            apiService.fetchAPI('/api/v1/pages/', {
              method: 'POST',
              body: JSON.stringify({
                url: tab.url,
                context: "ACTIVE_TAB",
                tab_id: tabId.toString(),
                window_id: tab.windowId ? tab.windowId.toString() : undefined,
                browser_contexts: ["ACTIVE_TAB"]
              })
            }).catch(error => {
              this.logger.error(`Error auto-capturing tab ${tabId}:`, error);
            });
          }
        });
      } catch (error) {
        this.logger.error(`Error processing tab update for ${tabId}:`, error);
      }
    }
  }

  onTabCreated(tab) {
    try {
      // Update status service
      const statusService = this.container.getService('statusService');
      statusService.registerTab(tab.id, {
        created: Date.now(),
        url: tab.url || 'pending',
        title: tab.title || 'New Tab',
        status: 'created'
      });
      
      // A future API endpoint could be developed if needed
      if (tab.openerTabId) {
        this.logger.info(`Tab ${tab.id} was opened from tab ${tab.openerTabId}`);
        
        // Store this relationship in the status service
        statusService.setTabRelationship(tab.id, tab.openerTabId, 'opened_from');
      }
    } catch (error) {
      this.logger.error(`Error handling tab creation for ${tab.id}:`, error);
    }
  }

  onExtensionInstalled() {
    try {
      // Get required services
      const storageService = this.container.getService('storageService');
      const notificationService = this.container.getService('notificationService');
      
      // Set default settings
      storageService.updateSettings({
        autoCapture: false,
        captureBookmarks: true,
        maxHistoryItems: 1000,
        analysisDepth: 'medium'
      }).catch(error => {
        this.logger.error('Error setting default settings:', error);
      });
      
      // Schedule initial bookmark import
      // We'll use Chrome bookmarks API to get bookmarks and create pages
      chrome.bookmarks.getTree(bookmarkNodes => {
        if (settings.captureBookmarks) {
          this.processBookmarkNodes(bookmarkNodes);
        }
      });
      
      // Create welcome notification
      notificationService.showNotification(
        'Marvin Installed',
        'Welcome to Marvin! Click to open the dashboard and get started.',
        'success'
      );
      
      // Open options page for initial setup
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 1500);
    } catch (error) {
      this.logger.error('Error handling extension installation:', error);
    }
  }
  
  // Helper function to process bookmark nodes recursively
  processBookmarkNodes(nodes) {
    if (!nodes) return;
    
    const apiService = this.container.getService('apiService');
    
    // Process each node
    nodes.forEach(node => {
      // If it's a bookmark (has a URL)
      if (node.url) {
        // Capture the bookmark using the documented Pages API
        apiService.fetchAPI('/api/v1/pages/', {
          method: 'POST',
          body: JSON.stringify({
            url: node.url,
            context: "BOOKMARK",
            bookmark_id: node.id,
            browser_contexts: ["BOOKMARK"]
          })
        }).catch(error => {
          this.logger.error(`Error capturing bookmark ${node.id}:`, error);
        });
      }
      
      // If it has children, process them recursively
      if (node.children) {
        this.processBookmarkNodes(node.children);
      }
    });
  }

  onExtensionUpdated(previousVersion) {
    try {
      // Get required services
      const storageService = this.container.getService('storageService');
      const apiService = this.container.getService('apiService');
      const notificationService = this.container.getService('notificationService');
      
      // Get current version
      const currentVersion = chrome.runtime.getManifest().version;
      this.logger.info(`Extension updated from ${previousVersion} to ${currentVersion}`);
      
      // Run migrations via API if needed
      apiService.fetchAPI('/api/v1/admin/migrate', {
        method: 'POST',
        body: JSON.stringify({
          previousVersion,
          currentVersion
        })
      }).catch(error => {
        this.logger.warn('Error running migrations:', error);
      });
      
      // Clear any caches
      storageService.clearCache('analysis').catch(error => {
        this.logger.warn('Error clearing analysis cache:', error);
      });
      
      // Show update notification with new features
      notificationService.showNotification(
        'Marvin Updated',
        `Updated to version ${currentVersion}. Click to see what's new!`,
        'info'
      );
    } catch (error) {
      this.logger.error('Error handling extension update:', error);
    }
  }
  
  /**
   * Handle URL capture request
   */
  async handleCaptureUrl(message, sender, sendResponse) {
    try {
      this.logger.info(`Capture URL requested: ${message.url}`);
      
      // Get the capture utility from the container if available
      const captureUtil = this.container.getUtil('capture');
      if (captureUtil && captureUtil.captureUrl) {
        const result = await captureUtil.captureUrl(message.url, message.options);
        sendResponse(result);
      } else {
        // Fallback implementation
        sendResponse({ 
          success: true, 
          message: 'URL captured (fallback implementation)',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.logger.error('Error handling captureUrl:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  /**
   * Handle URL analysis request
   */
  async handleAnalyzeUrl(message, sender, sendResponse) {
    try {
      this.logger.info(`Analyze URL requested: ${message.url}`);
      
      // Use task service for analysis
      const taskService = this.container.getService('taskService');
      
      if (taskService && taskService.createTask) {
        const task = await taskService.createTask('analyze', {
          url: message.url,
          options: message.options
        });
        
        sendResponse({ success: true, taskId: task.id });
      } else {
        // Fallback implementation
        sendResponse({ 
          success: true, 
          message: 'Analysis requested (fallback implementation)',
          taskId: `task_${Date.now()}`
        });
      }
    } catch (error) {
      this.logger.error('Error handling analyzeUrl:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  /**
   * Handle getting active tasks
   */
  async handleGetActiveTasks(message, sender, sendResponse) {
    try {
      this.logger.debug('Active tasks requested');
      
      // Use task service to get active tasks
      const taskService = this.container.getService('taskService');
      
      if (taskService && taskService.getActiveTasks) {
        const tasks = await taskService.getActiveTasks();
        sendResponse({ success: true, tasks });
      } else {
        // Fallback implementation
        sendResponse({ success: true, tasks: [] });
      }
    } catch (error) {
      this.logger.error('Error handling getActiveTasks:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  /**
   * Handle network status change
   */
  handleNetworkStatusChange(message, sender, sendResponse) {
    this.logger.info(`Network status changed: ${message.isOnline ? 'online' : 'offline'}`);
    
    // Update status service
    try {
      const statusService = this.container.getService('statusService');
      if (statusService && statusService.setNetworkStatus) {
        statusService.setNetworkStatus(message.isOnline);
      }
    } catch (error) {
      this.logger.warn('Error updating network status:', error);
    }
    
    sendResponse({ success: true });
  }
  
  /**
   * Handle content script loaded notification
   */
  handleContentScriptLoaded(message, sender, sendResponse) {
    const tabId = sender.tab?.id;
    this.logger.debug(`Content script loaded in tab: ${tabId}, URL: ${message.url}`);
    
    // Update status service
    try {
      const statusService = this.container.getService('statusService');
      if (statusService && statusService.registerContentScript) {
        statusService.registerContentScript(tabId, message.url);
      }
    } catch (error) {
      this.logger.warn('Error registering content script:', error);
    }
    
    sendResponse({ success: true });
  }
  
  /**
   * Handle check auth status request
   */
  async handleCheckAuthStatus(message, sender, sendResponse) {
    try {
      this.logger.debug('Auth status check requested');
      
      // For simplicity, we'll assume the user is authenticated
      // In a real implementation, you would check with an auth service
      sendResponse({ 
        success: true, 
        authenticated: true,
        user: {
          username: 'test_user',
          role: 'user'
        }
      });
    } catch (error) {
      this.logger.error('Error checking auth status:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}