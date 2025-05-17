import { LogManager } from '../utils/log-manager.js';

/**
 * Background Service - Main service for the extension's background script
 * Handles all message passing and delegation to appropriate services
 */
export class BackgroundService {
  constructor(container) {
    this.container = container;
    this.initialized = false;
    this.messageHandlers = new Map();
    
    // Get logger from the container
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
      
      // Get required services (will be available after ServiceRegistry initialization)
      this.initializeServices();
      
      // Register all message handlers
      this.registerMessageHandlers();
      
      // Set up Chrome API event listeners
      this.setupEventListeners();
      
      // Set up single message listener that routes to handlers
      this.setupMessageRouting();
      
      this.initialized = true;
      this.logger.info('Background service initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing background service:', error);
      throw error;
    }
  }
  
  /**
   * Initialize services with proper error handling
   */
  initializeServices() {
    try {
      // These services should already be registered and initialized
      this.apiService = this.container.getService('apiService');
      this.taskService = this.container.getService('taskService');
      this.statusService = this.container.getService('statusService');
      this.storageService = this.container.getService('storageService');
      this.notificationService = this.container.getService('notificationService');
    } catch (error) {
      this.logger.warn('Some services not available during initialization:', error);
      // Services will be lazily loaded when needed
    }
  }
  
  /**
   * Register all message handlers in a central map
   */
  registerMessageHandlers() {
    this.logger.debug('Registering message handlers');
    
    // Register all handlers with consistent naming
    this.messageHandlers.set('ping', this.handlePing.bind(this));
    this.messageHandlers.set('captureUrl', this.handleCaptureUrl.bind(this));
    this.messageHandlers.set('analyzeUrl', this.handleAnalyzeUrl.bind(this));
    this.messageHandlers.set('getActiveTasks', this.handleGetActiveTasks.bind(this));
    this.messageHandlers.set('cancelTask', this.handleCancelTask.bind(this));
    this.messageHandlers.set('retryTask', this.handleRetryTask.bind(this));
    this.messageHandlers.set('networkStatusChange', this.handleNetworkStatusChange.bind(this));
    this.messageHandlers.set('updateSettings', this.handleUpdateSettings.bind(this));
    this.messageHandlers.set('checkAuthStatus', this.handleCheckAuthStatus.bind(this));
    this.messageHandlers.set('contentScriptLoaded', this.handleContentScriptLoaded.bind(this));
    this.messageHandlers.set('getComponentStatus', this.handleGetComponentStatus.bind(this));
    this.messageHandlers.set('loadAndInitializePanel', this.handleLoadAndInitializePanel.bind(this));
    this.messageHandlers.set('login', this.handleLogin.bind(this));
    this.messageHandlers.set('logout', this.handleLogout.bind(this));
  }
  
  /**
   * Set up single message listener with routing
   */
  setupMessageRouting() {
    this.logger.debug('Setting up message routing');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Route message to appropriate handler
      return this.routeMessage(message, sender, sendResponse);
    });
  }
  
  /**
   * Route incoming message to appropriate handler
   * @param {Object} message - Incoming message
   * @param {Object} sender - Message sender info
   * @param {Function} sendResponse - Response callback
   * @returns {boolean} Whether to keep message port open
   */
  routeMessage(message, sender, sendResponse) {
    const handler = this.messageHandlers.get(message.action);
    
    if (!handler) {
      this.logger.warn(`Unknown action: ${message.action}`);
      sendResponse({ success: false, error: 'Unknown action', requestId: message.requestId });
      return false;
    }
    
    // Execute handler with error boundary
    return this.executeHandler(handler, message, sender, sendResponse);
  }
  
  /**
   * Execute handler with proper error handling
   * @param {Function} handler - Handler function
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information
   * @param {Function} sendResponse - Response callback
   * @returns {boolean} Whether to keep message port open
   */
  async executeHandler(handler, message, sender, sendResponse) {
    try {
      // Check if handler is async by checking if it returns a promise
      const result = handler(message, sender, sendResponse);
      
      if (result && typeof result.then === 'function') {
        // Async handler
        result.then(() => {
          // Handler should have called sendResponse
        }).catch(error => {
          this.logger.error(`Error in async handler for ${message.action}:`, error);
          sendResponse({ 
            success: false, 
            error: error.message,
            requestId: message.requestId 
          });
        });
        return true; // Keep port open for async response
      }
      
      // Sync handler - port is closed by handler
      return false;
    } catch (error) {
      this.logger.error(`Error in handler for ${message.action}:`, error);
      sendResponse({ 
        success: false, 
        error: error.message,
        requestId: message.requestId 
      });
      return false;
    }
  }
  
  // ========== MESSAGE HANDLERS ==========
  
  /**
   * Handle ping request
   */
  handlePing(message, sender, sendResponse) {
    this.logger.debug('Ping received');
    sendResponse({ 
      success: true, 
      timestamp: Date.now(),
      requestId: message.requestId
    });
  }
  
  /**
   * Handle URL capture request
   */
  async handleCaptureUrl(message, sender, sendResponse) {
    try {
      this.logger.info(`Capture URL requested: ${message.url}`);
      
      const taskService = this.container.getService('taskService');
      
      if (!taskService) {
        throw new Error('Task service not available');
      }
      
      // Create capture task
      const result = await taskService.createCaptureTask({
        url: message.url,
        ...message.options
      });
      
      sendResponse({
        success: true,
        data: result,
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error handling captureUrl:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle URL analysis request
   */
  async handleAnalyzeUrl(message, sender, sendResponse) {
    try {
      this.logger.info(`Analyze URL requested: ${message.url}`);
      
      const apiService = this.container.getService('apiService');
      
      if (!apiService) {
        throw new Error('API service not available');
      }
      
      // Call the API
      const response = await apiService.fetchAPI('/api/v1/analysis/analyze', {
        method: 'POST',
        body: JSON.stringify({
          url: message.url,
          options: message.options
        })
      });
      
      if (response.success) {
        sendResponse({
          success: true,
          taskId: response.data.task_id,
          status: response.data.status,
          requestId: message.requestId
        });
      } else {
        throw new Error(response.error?.message || 'Analysis request failed');
      }
    } catch (error) {
      this.logger.error('Error handling analyzeUrl:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle getting active tasks
   */
  async handleGetActiveTasks(message, sender, sendResponse) {
    try {
      this.logger.debug('Active tasks requested');
      
      const taskService = this.container.getService('taskService');
      
      if (!taskService) {
        throw new Error('Task service not available');
      }
      
      // Get active tasks
      const tasks = await taskService.getActiveTasks();
      
      sendResponse({ 
        success: true, 
        tasks,
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error handling getActiveTasks:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle cancel task request
   */
  async handleCancelTask(message, sender, sendResponse) {
    try {
      this.logger.info('Processing cancelTask request:', message.taskId);
      
      const taskService = this.container.getService('taskService');
      
      if (!taskService) {
        throw new Error('Task service not available');
      }
      
      // Cancel task
      const result = await taskService.cancelTask(message.taskId);
      
      sendResponse({
        success: true,
        taskId: message.taskId,
        status: 'cancelled',
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error processing cancelTask:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle retry task request
   */
  async handleRetryTask(message, sender, sendResponse) {
    try {
      this.logger.info('Processing retryTask request:', message.taskId);
      
      const taskService = this.container.getService('taskService');
      
      if (!taskService) {
        throw new Error('Task service not available');
      }
      
      // Retry task
      const result = await taskService.retryTask(message.taskId);
      
      sendResponse({
        success: true,
        taskId: message.taskId,
        status: 'retried',
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error processing retryTask:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle network status change
   */
  handleNetworkStatusChange(message, sender, sendResponse) {
    this.logger.info(`Network status changed: ${message.isOnline ? 'online' : 'offline'}`);
    
    try {
      const statusService = this.container.getService('statusService');
      if (statusService && statusService.setNetworkStatus) {
        statusService.setNetworkStatus(message.isOnline);
      }
    } catch (error) {
      this.logger.warn('Error updating network status:', error);
    }
    
    sendResponse({ 
      success: true,
      requestId: message.requestId
    });
  }
  
  /**
   * Handle update settings request
   */
  async handleUpdateSettings(message, sender, sendResponse) {
    try {
      this.logger.info('Processing updateSettings request');
      
      const storageService = this.container.getService('storageService');
      
      if (!storageService) {
        throw new Error('Storage service not available');
      }
      
      // Update settings
      await storageService.updateSettings(message.settings);
      
      sendResponse({
        success: true,
        message: 'Settings updated successfully',
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error processing updateSettings:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle content script loaded notification
   */
  handleContentScriptLoaded(message, sender, sendResponse) {
    const tabId = sender.tab?.id;
    this.logger.debug(`Content script loaded in tab: ${tabId}, URL: ${message.url}`);
    
    try {
      const statusService = this.container.getService('statusService');
      if (statusService && statusService.registerContentScript) {
        statusService.registerContentScript(tabId, message.url);
      }
    } catch (error) {
      this.logger.warn('Error registering content script:', error);
    }
    
    sendResponse({ 
      success: true,
      requestId: message.requestId
    });
  }
  
  /**
   * Handle check auth status request
   */
  async handleCheckAuthStatus(message, sender, sendResponse) {
    try {
      this.logger.debug('Auth status check requested');
      
      // For now, we'll assume the user is authenticated
      // In a real implementation, you would check with an auth service
      sendResponse({ 
        success: true, 
        authenticated: true,
        user: {
          username: 'test_user',
          role: 'user'
        },
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error checking auth status:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle get component status request
   */
  async handleGetComponentStatus(message, sender, sendResponse) {
    try {
      this.logger.debug('Component status requested');
      
      // Get status from dependency container (background-only info)
      const status = {
        // Container statistics
        componentCount: this.container.components.size,
        serviceCount: this.container.services.size,
        utilityCount: this.container.utils.size,
        serviceInstanceCount: this.container.serviceInstances.size,
        
        // Background script status
        backgroundInitialized: this.initialized,
        
        // Service availability
        services: {
          messageService: !!this.container.services.has('messageService'),
          apiService: !!this.container.services.has('apiService'),
          taskService: !!this.container.services.has('taskService'),
          storageService: !!this.container.services.has('storageService'),
          statusService: !!this.container.services.has('statusService'),
          notificationService: !!this.container.services.has('notificationService')
        },
        
        // System info
        manifestVersion: chrome.runtime.getManifest().manifest_version,
        extensionId: chrome.runtime.id,
        timestamp: Date.now()
      };
      
      this.logger.debug('Component status collected:', status);
      
      sendResponse({
        success: true,
        data: status,
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error getting component status:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle load and initialize panel request
   * Note: Panels are frontend concerns and should be handled by popup/dashboard
   */
  async handleLoadAndInitializePanel(message, sender, sendResponse) {
    this.logger.debug(`Panel initialization requested: ${message.panelName}`);
    
    // This is the correct architectural response
    sendResponse({
      success: false,
      error: 'Panel initialization should be handled by the dashboard or popup, not the background script. Background scripts manage services and business logic, while panels are UI components managed by frontend scripts.',
      suggestion: 'Use the component system in your popup/dashboard context instead.',
      requestId: message.requestId
    });
  }
  
  /**
   * Handle login request
   */
  async handleLogin(message, sender, sendResponse) {
    try {
      this.logger.info('Login requested');
      
      // Simulate login logic
      // In a real implementation, you would validate credentials
      
      sendResponse({
        success: true,
        authenticated: true,
        user: {
          username: message.username,
          role: 'user'
        },
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error processing login:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  /**
   * Handle logout request
   */
  async handleLogout(message, sender, sendResponse) {
    try {
      this.logger.info('Logout requested');
      
      // Simulate logout logic
      // In a real implementation, you would clear auth tokens
      
      sendResponse({
        success: true,
        authenticated: false,
        requestId: message.requestId
      });
    } catch (error) {
      this.logger.error('Error processing logout:', error);
      sendResponse({
        success: false,
        error: error.message,
        requestId: message.requestId
      });
    }
  }
  
  // ========== CHROME API EVENT HANDLERS ==========
  
  /**
   * Set up Chrome API event listeners
   */
  setupEventListeners() {
    this.logger.debug('Setting up event listeners');
    
    // Handle tabs being updated
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
  
  // Event handler implementations (keeping existing logic)
  onTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://')) {
      
      try {
        const storageService = this.container.getService('storageService');
        const statusService = this.container.getService('statusService');
        
        statusService.updateTabStatus(tabId, {
          url: tab.url,
          title: tab.title,
          status: 'complete',
          updatedAt: Date.now()
        });
        
        storageService.getSettings().then(settings => {
          if (settings.autoCapture) {
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
      const statusService = this.container.getService('statusService');
      statusService.registerTab(tab.id, {
        created: Date.now(),
        url: tab.url || 'pending',
        title: tab.title || 'New Tab',
        status: 'created'
      });
      
      if (tab.openerTabId) {
        this.logger.info(`Tab ${tab.id} was opened from tab ${tab.openerTabId}`);
        statusService.setTabRelationship(tab.id, tab.openerTabId, 'opened_from');
      }
    } catch (error) {
      this.logger.error(`Error handling tab creation for ${tab.id}:`, error);
    }
  }

  onExtensionInstalled() {
    try {
      const storageService = this.container.getService('storageService');
      const notificationService = this.container.getService('notificationService');
      
      storageService.updateSettings({
        autoCapture: false,
        captureBookmarks: true,
        maxHistoryItems: 1000,
        analysisDepth: 'medium'
      }).catch(error => {
        this.logger.error('Error setting default settings:', error);
      });
      
      chrome.bookmarks.getTree(bookmarkNodes => {
        if (settings.captureBookmarks) {
          this.processBookmarkNodes(bookmarkNodes);
        }
      });
      
      notificationService.showNotification(
        'Marvin Installed',
        'Welcome to Marvin! Click to open the dashboard and get started.',
        'success'
      );
      
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 1500);
    } catch (error) {
      this.logger.error('Error handling extension installation:', error);
    }
  }
  
  processBookmarkNodes(nodes) {
    if (!nodes) return;
    
    const apiService = this.container.getService('apiService');
    
    nodes.forEach(node => {
      if (node.url) {
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
      
      if (node.children) {
        this.processBookmarkNodes(node.children);
      }
    });
  }

  onExtensionUpdated(previousVersion) {
    try {
      const storageService = this.container.getService('storageService');
      const apiService = this.container.getService('apiService');
      const notificationService = this.container.getService('notificationService');
      
      const currentVersion = chrome.runtime.getManifest().version;
      this.logger.info(`Extension updated from ${previousVersion} to ${currentVersion}`);
      
      apiService.fetchAPI('/api/v1/admin/migrate', {
        method: 'POST',
        body: JSON.stringify({
          previousVersion,
          currentVersion
        })
      }).catch(error => {
        this.logger.warn('Error running migrations:', error);
      });
      
      storageService.clearCache('analysis').catch(error => {
        this.logger.warn('Error clearing analysis cache:', error);
      });
      
      notificationService.showNotification(
        'Marvin Updated',
        `Updated to version ${currentVersion}. Click to see what's new!`,
        'info'
      );
    } catch (error) {
      this.logger.error('Error handling extension update:', error);
    }
  }
}