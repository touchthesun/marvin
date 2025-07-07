// src/components/panels/capture/capture-panel.js
import { LogManager } from '../../../utils/log-manager.js'; 
import { container } from '../../../core/dependency-container.js';
import { TabsCapture } from './tabs-capture.js';
import { BookmarksCapture } from './bookmarks-capture.js';
import { HistoryCapture } from './history-capture.js';

/**
 * Capture Panel Component
 * Manages the capture of browser tabs, bookmarks, and history items
 */
const CapturePanel = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Store component instances
  _tabsCapture: null,
  _bookmarksCapture: null,
  _historyCapture: null,
  
  /**
   * Initialize the capture panel
   * @returns {Promise<boolean>} Success state
   */
  async initCapturePanel() {
    // Create logger directly 
    const logger = new LogManager({
      context: 'capture-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    // Get notificationService with error handling
    let notificationService;
    try {
      notificationService = container.getService('notificationService');
    } catch (error) {
      logger.warn('NotificationService not available:', error);
      notificationService = {
        showNotification: (message, type) => console.log(`[Notification ${type}]:`, message),
        updateNotificationProgress: () => {}
      };
    }
    
    logger.info('Initializing capture panel');
    
    try {
      // Only initialize if not already initialized
      if (this.initialized) {
        logger.debug('Capture panel already initialized');
        return true;
      }
      
      // Initialize capture components
      this._tabsCapture = TabsCapture;
      this._bookmarksCapture = BookmarksCapture;
      this._historyCapture = HistoryCapture;
      
      // Set up tab loading
      this.setupTabButtons(logger);
      
      // Set up capture button
      this.setupCaptureSelectedButton(logger);
      
      // Load initial data based on active tab
      this.loadInitialData(logger);
      
      this.initialized = true;
      logger.info('Capture panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing capture panel:', error);
      notificationService.showNotification('Error initializing capture panel: ' + error.message, 'error');
      return false;
    }
  },
  
  /**
   * Set up tab buttons for different capture types
   * @param {LogManager} logger - Logger instance
   */
  setupTabButtons(logger) {
    logger.debug('Setting up tab buttons');
    
    try {
      const tabsTabBtn = document.querySelector('[data-tab="tabs"]');
      const bookmarksTabBtn = document.querySelector('[data-tab="bookmarks"]');
      const historyTabBtn = document.querySelector('[data-tab="history"]');
      
      if (tabsTabBtn) {
        const tabsClickHandler = () => {
          logger.debug('Tabs tab button clicked');
          this._tabsCapture.initTabsCapture();
        };
        
        tabsTabBtn.addEventListener('click', tabsClickHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: tabsTabBtn,
          type: 'click',
          listener: tabsClickHandler
        });
      } else {
        logger.warn('Tabs tab button not found');
      }
      
      if (bookmarksTabBtn) {
        const bookmarksClickHandler = () => {
          logger.debug('Bookmarks tab button clicked');
          this._bookmarksCapture.initBookmarksCapture();
        };
        
        bookmarksTabBtn.addEventListener('click', bookmarksClickHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: bookmarksTabBtn,
          type: 'click',
          listener: bookmarksClickHandler
        });
      } else {
        logger.warn('Bookmarks tab button not found');
      }
      
      if (historyTabBtn) {
        const historyClickHandler = () => {
          logger.debug('History tab button clicked');
          this._historyCapture.initHistoryCapture();
        };
        
        historyTabBtn.addEventListener('click', historyClickHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: historyTabBtn,
          type: 'click',
          listener: historyClickHandler
        });
      } else {
        logger.warn('History tab button not found');
      }
      
      logger.debug('Tab buttons set up successfully');
    } catch (error) {
      logger.error('Error setting up tab buttons:', error);
      throw error;
    }
  },
  
  /**
   * Set up the "Capture Selected" button
   * @param {LogManager} logger - Logger instance
   */
  setupCaptureSelectedButton(logger) {
    logger.debug('Setting up capture selected button');
    
    try {
      const captureBtn = document.getElementById('capture-selected');
      
      if (captureBtn) {
        // Remove any existing event handlers
        const newCaptureBtn = captureBtn.cloneNode(true);
        captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);
        
        // Track the created DOM element
        this._domElements.push(newCaptureBtn);
        
        // Add event listener
        const captureClickHandler = () => {
          logger.info('Capture button clicked');
          this.captureSelectedItems(logger);
        };
        
        newCaptureBtn.addEventListener('click', captureClickHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: newCaptureBtn,
          type: 'click',
          listener: captureClickHandler
        });
        
        logger.debug('Capture button set up successfully');
      } else {
        logger.error('Capture button not found');
        throw new Error('Capture button not found in the DOM');
      }
    } catch (error) {
      logger.error('Error setting up capture button:', error);
      throw error;
    }
  },
  
  /**
   * Load initial data based on active tab
   * @param {LogManager} logger - Logger instance
   */
  loadInitialData(logger) {
    logger.debug('Loading initial data');
    
    try {
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab) {
        const tabType = activeTab.id.split('-')[0];
        logger.debug(`Active tab detected: ${tabType}`);
        
        if (tabType === 'tabs') {
          this._tabsCapture.initTabsCapture();
        } else if (tabType === 'bookmarks') {
          this._bookmarksCapture.initBookmarksCapture();
        } else if (tabType === 'history') {
          this._historyCapture.initHistoryCapture();
        }
      } else {
        // Default to tabs tab if no active tab
        const tabsTabBtn = document.querySelector('[data-tab="tabs"]');
        if (tabsTabBtn) {
          logger.debug('No active tab found, defaulting to tabs tab');
          tabsTabBtn.click();
        } else {
          logger.warn('No active tab and no tabs button found');
        }
      }
      
      logger.debug('Initial data loaded successfully');
    } catch (error) {
      logger.error('Error loading initial data:', error);
      throw error;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(logger, serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Capture selected items from the active tab
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async captureSelectedItems(logger) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.log(`[Notification ${type}]:`, message),
      updateNotificationProgress: () => {}
    });
    
    logger.info('captureSelectedItems function called');
    
    try {
      // Get active tab panel
      const activeTabPane = document.querySelector('.capture-tab-content .tab-pane.active');
      if (!activeTabPane) {
        logger.error('No capture tab is active');
        notificationService.showNotification('Error: No capture tab is active', 'error');
        return;
      }
      
      const type = activeTabPane.id.split('-')[0]; // tabs, bookmarks, or history
      logger.debug(`Capture type: ${type}`);
      
      // Get selected items based on type
      let selectedItems = [];
      
      switch (type) {
        case 'tabs':
          selectedItems = this._tabsCapture.getSelectedTabs();
          break;
        case 'bookmarks':
          selectedItems = this._bookmarksCapture.getSelectedBookmarks();
          break;
        case 'history':
          selectedItems = this._historyCapture.getSelectedHistoryItems();
          break;
        default:
          logger.warn(`Unknown capture type: ${type}`);
          notificationService.showNotification('Unknown capture type', 'error');
          return;
      }
      
      if (selectedItems.length === 0) {
        logger.info('No items selected');
        notificationService.showNotification('Please select at least one item to capture', 'warning');
        return;
      }
      
      // Process the capture
      await this.processCaptureItems(logger, selectedItems, type);
      
    } catch (error) {
      logger.error('Error capturing selected items:', error);
      notificationService.showNotification(`Error capturing items: ${error.message}`, 'error');
    }
  },
  
/**
 * Process capture for selected items
 * @param {LogManager} logger - Logger instance
 * @param {Array} selectedItems - Array of selected items to capture
 * @param {string} type - Type of items (tabs, bookmarks, history)
 * @returns {Promise<void>}
 */
async processCaptureItems(logger, selectedItems, type) {
  const notificationService = this.getService(logger, 'notificationService', {
    showNotification: (message, type) => console.log(`[Notification ${type}]:`, message),
    updateNotificationProgress: () => {}
  });
  
  logger.info(`Processing capture for ${selectedItems.length} ${type} items`);
  
  // Update UI to show capture in progress
  const captureBtn = document.getElementById('capture-selected');
  const originalText = captureBtn?.textContent || 'Capture Selected';
  
  if (captureBtn) {
    captureBtn.textContent = `Capturing ${selectedItems.length} items...`;
    captureBtn.disabled = true;
  }
  
  // Create a notification for overall progress
  notificationService.showNotification(`Capturing ${selectedItems.length} items...`, 'info', 0);
  
  try {
    // Track results for all captures
    const captureResults = [];
    let completedCount = 0;
    
    // Process each item
    for (const [index, item] of selectedItems.entries()) {
      try {
        // Update the notification for each item
        const currentItem = index + 1;
        const progressPercent = Math.round((currentItem / selectedItems.length) * 100);
        notificationService.updateNotificationProgress(`Capturing item ${currentItem}/${selectedItems.length}: ${item.title}`, progressPercent);
        
        // Prepare capture options
        const captureOptions = {
          context: this.getContextForType(type),
          title: item.title,
          browser_contexts: [this.getContextForType(type)]
        };
        
        // Add type-specific options
        if (type === 'tabs') {
          // For tabs, extract content if possible
          try {
            const tabId = parseInt(item.id);
            // Updated to use component method
            const extractedData = await this._tabsCapture.extractTabContent(tabId);
            
            captureOptions.content = extractedData.content || "";
            captureOptions.title = extractedData.title || item.title;
            captureOptions.metadata = extractedData.metadata || {};
            captureOptions.tabId = item.id.toString();
            captureOptions.windowId = item.windowId || "1";
          } catch (extractError) {
            logger.error(`Error extracting content for tab ${item.id}:`, extractError);
          }
        } else if (type === 'bookmarks') {
          captureOptions.bookmarkId = item.id.toString();
        } else if (type === 'history') {
          captureOptions.historyId = item.id.toString();
        }
        
        // Capture the URL - Improved background communication pattern
        const response = await this.communicateWithBackground(logger, 'captureUrl', { 
          url: item.url, 
          options: captureOptions 
        });
        
        if (response && response.success) {
          completedCount++;
          captureResults.push({
            url: item.url,
            success: true,
            data: response.data
          });
        } else {
          captureResults.push({
            url: item.url,
            success: false,
            error: response?.error || 'Unknown error'
          });
        }
      } catch (itemError) {
        logger.error(`Error capturing ${item.url}:`, itemError);
        captureResults.push({
          url: item.url,
          success: false,
          error: itemError.message
        });
      }
      
      // Small delay between captures to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Update capture history
    if (completedCount > 0) {
      await this.updateCaptureHistory(logger, selectedItems.filter((_, i) => captureResults[i]?.success));
    }
    
    // Update UI
    if (captureBtn) {
      if (completedCount === selectedItems.length) {
        captureBtn.textContent = 'Capture Successful!';
        notificationService.showNotification(`Successfully captured ${completedCount} items`, 'success');
      } else if (completedCount > 0) {
        captureBtn.textContent = `${completedCount}/${selectedItems.length} Captured`;
        notificationService.showNotification(`Partially successful: ${completedCount}/${selectedItems.length} captured`, 'warning');
      } else {
        captureBtn.textContent = 'Capture Failed';
        notificationService.showNotification('All captures failed', 'error');
      }
      
      // Reset button after delay using tracked timeout
      const timeoutId = setTimeout(() => {
        captureBtn.textContent = originalText;
        captureBtn.disabled = false;
        
        // Uncheck all items
        document.querySelectorAll(`.${type}-item input[type="checkbox"]:checked`).forEach(checkbox => {
          checkbox.checked = false;
        });
        
        // Refresh dashboard data if available
        if (typeof window.loadDashboardData === 'function') {
          window.loadDashboardData();
        }
        
        // Remove this timeout ID from tracking array once executed
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
      }, 2000);
      
      // Add to tracking array
      this._timeouts.push(timeoutId);
    }
  } catch (error) {
    logger.error('Error processing capture:', error);
    
    if (captureBtn) {
      captureBtn.textContent = 'Capture Failed';
      captureBtn.disabled = false;
      
      // Reset button after delay using tracked timeout
      const timeoutId = setTimeout(() => {
        captureBtn.textContent = originalText;
        
        // Remove this timeout ID from tracking array once executed
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
      }, 2000);
      
      // Add to tracking array
      this._timeouts.push(timeoutId);
    }
    
    notificationService.showNotification(`Error capturing items: ${error.message}`, 'error');
  }
},
  
  /**
   * Improved background communication pattern with better error handling
   * @param {LogManager} logger - Logger instance
   * @param {string} action - Action to perform
   * @param {Object} data - Data to send
   * @returns {Promise<Object>} Response from background
   */
  async communicateWithBackground(logger, action, data) {
    try {
      // Try to get background page
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin[action] === 'function') {
        logger.debug(`Communicating with background using direct access: ${action}`);
        return await backgroundPage.marvin[action](data.url, data.options);
      } else {
        logger.debug(`Background page marvin.${action} not available, using messaging`);
        // Fallback to messaging
        return await this.sendMessage(logger, { action, ...data });
      }
    } catch (error) {
      logger.warn(`Error accessing background page for ${action}, falling back to messaging:`, error);
      
      // Try messaging as fallback
      return await this.sendMessage(logger, { action, ...data });
    }
  },
  
  /**
   * Send message to background script with timeout
   * @param {LogManager} logger - Logger instance
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in ms (default: 30000)
   * @returns {Promise<Object>} Response from background
   */
  sendMessage(logger, message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // Add request ID for tracking
      const requestId = Date.now().toString() + Math.random().toString().substring(2, 8);
      const messageWithId = { ...message, requestId };
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms: ${message.action}`));
        
        // Remove from tracking array
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
      }, timeout);
      
      // Add to tracking array
      this._timeouts.push(timeoutId);
      
      // Send message
      chrome.runtime.sendMessage(messageWithId, (response) => {
        // Clear timeout
        clearTimeout(timeoutId);
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
        
        // Check for chrome runtime error
        if (chrome.runtime.lastError) {
          logger.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message || 'Unknown chrome runtime error'));
          return;
        }
        
        // Resolve with response
        resolve(response);
      });
    });
  },
  
  /**
   * Get context string for capture type
   * @param {string} type - Type of capture (tabs, bookmarks, history)
   * @returns {string} Context string for API
   */
  getContextForType(type) {
    switch (type) {
      case 'tabs':
        return 'browser_tab';
      case 'bookmarks':
        return 'bookmark';
      case 'history':
        return 'history';
      default:
        return 'unknown';
    }
  },
  
  /**
   * Update capture history in storage
   * @param {LogManager} logger - Logger instance
   * @param {Array} capturedItems - Successfully captured items
   * @returns {Promise<void>}
   */
  async updateCaptureHistory(logger, capturedItems) {
    logger.debug(`Updating capture history with ${capturedItems.length} items`);
    
    try {
      // Fetch current history
      const data = await chrome.storage.local.get('captureHistory');
      const captureHistory = data.captureHistory || [];
      
      // Add new captures to history
      const newCaptures = capturedItems.map(item => ({
        url: item.url,
        title: item.title || 'Untitled',
        timestamp: Date.now(),
        status: 'captured',
        type: item.type
      }));
      
      const updatedHistory = [...newCaptures, ...captureHistory];
      
      // Keep only the latest 100 items
      if (updatedHistory.length > 100) {
        updatedHistory.splice(100);
      }
      
      // Save updated history
      await chrome.storage.local.set({ captureHistory: updatedHistory });
      
      // Update stats
      const stats = (await chrome.storage.local.get('stats')).stats || { captures: 0, relationships: 0, queries: 0 };
      stats.captures += capturedItems.length;
      await chrome.storage.local.set({ stats });
      
      logger.debug(`Updated capture history and stats successfully`);
    } catch (error) {
      logger.error('Error updating capture history:', error);
    }
  },
  
/**
 * Clean up resources when component is unmounted
 * This helps prevent memory leaks and browser crashes
 */
cleanup() {
  // Create logger directly
  const logger = new LogManager({
    context: 'capture-panel',
    isBackgroundScript: false,
    maxEntries: 1000
  });
  
  if (!this.initialized) {
    logger.debug('Capture panel not initialized, skipping cleanup');
    return;
  }
  
  logger.info('Cleaning up capture panel resources');
  
  // Clean up capture components first
  if (this._tabsCapture) {
    try {
      this._tabsCapture.cleanup();
      logger.debug('Tabs capture component cleaned up');
    } catch (error) {
      logger.warn('Error cleaning up tabs capture component:', error);
    }
  }
  
  if (this._bookmarksCapture) {
    try {
      this._bookmarksCapture.cleanup();
      logger.debug('Bookmarks capture component cleaned up');
    } catch (error) {
      logger.warn('Error cleaning up bookmarks capture component:', error);
    }
  }
  
  if (this._historyCapture) {
    try {
      this._historyCapture.cleanup();
      logger.debug('History capture component cleaned up');
    } catch (error) {
      logger.warn('Error cleaning up history capture component:', error);
    }
  }
  
  // Clear all timeouts
  this._timeouts.forEach(id => {
    try {
      clearTimeout(id);
    } catch (error) {
      logger.warn(`Error clearing timeout:`, error);
    }
  });
  this._timeouts = [];
  
  // Clear all intervals
  this._intervals.forEach(id => {
    try {
      clearInterval(id);
    } catch (error) {
      logger.warn(`Error clearing interval:`, error);
    }
  });
  this._intervals = [];
  
  // Remove all event listeners
  this._eventListeners.forEach(({element, type, listener}) => {
    try {
      if (element && typeof element.removeEventListener === 'function') {
        element.removeEventListener(type, listener);
      }
    } catch (error) {
      logger.warn(`Error removing event listener:`, error);
    }
  });
  this._eventListeners = [];
  
  // Clean up DOM elements
  this._domElements.forEach(el => {
    try {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    } catch (error) {
      logger.warn('Error removing DOM element:', error);
    }
  });
  this._domElements = [];
  
  // Clear component references
  this._tabsCapture = null;
  this._bookmarksCapture = null;
  this._historyCapture = null;
  
  this.initialized = false;
  logger.debug('Capture panel cleanup completed');
}}

// Export using named export
export { CapturePanel };