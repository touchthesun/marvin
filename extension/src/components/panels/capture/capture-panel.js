// src/components/panels/capture/capture-panel.js
import { container } from '@core/dependency-container.js';
import { 
  getSelectedTabs,
  initTabsCapture,
  extractTabContent
 } from './tabs-capture.js';

import { 
  initBookmarksCapture, 
  getSelectedBookmarks 
} from './bookmarks-capture.js';

import { 
  initHistoryCapture, 
  getSelectedHistoryItems 
} from './history-capture.js';

/**
 * Capture Panel Component
 * Manages the capture of browser tabs, bookmarks, and history items
 */
const CapturePanel = {
  /**
   * Initialize the capture panel
   * @returns {Promise<boolean>} Success state
   */
  async initCapturePanel() {
    // Get dependencies from container
    const logger = new (container.getUtil('LogManager'))({
      context: 'capture-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    const notificationService = container.getService('notificationService');
    
    logger.info('Initializing capture panel');
    
    try {
      // Initialize state
      this.initialized = false;
      
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
        tabsTabBtn.addEventListener('click', () => {
          logger.debug('Tabs tab button clicked');
          initTabsCapture();
        });
      } else {
        logger.warn('Tabs tab button not found');
      }
      
      if (bookmarksTabBtn) {
        bookmarksTabBtn.addEventListener('click', () => {
          logger.debug('Bookmarks tab button clicked');
          initBookmarksCapture();
        });
      } else {
        logger.warn('Bookmarks tab button not found');
      }
      
      if (historyTabBtn) {
        historyTabBtn.addEventListener('click', () => {
          logger.debug('History tab button clicked');
          initHistoryCapture();
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
        
        // Add event listener
        newCaptureBtn.addEventListener('click', () => {
          logger.info('Capture button clicked');
          this.captureSelectedItems(logger);
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
          initTabsCapture();
        } else if (tabType === 'bookmarks') {
          initBookmarksCapture();
        } else if (tabType === 'history') {
          initHistoryCapture();
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
   * Capture selected items from the active tab
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async captureSelectedItems(logger) {
    const notificationService = container.getService('notificationService');
    
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
          selectedItems = getSelectedTabs();
          break;
        case 'bookmarks':
          selectedItems = getSelectedBookmarks();
          break;
        case 'history':
          selectedItems = getSelectedHistoryItems();
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
    const notificationService = container.getService('notificationService');
    
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
              const extractedData = await extractTabContent(tabId);
              
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
          
          // Capture the URL
          const backgroundPage = chrome.extension.getBackgroundPage();
          const response = await backgroundPage.marvin.captureUrl(item.url, captureOptions);
          
          if (response.success) {
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
              error: response.error
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
        
        // Reset button after delay
        setTimeout(() => {
          captureBtn.textContent = originalText;
          captureBtn.disabled = false;
          
          // Uncheck all items
          document.querySelectorAll(`.${type}-item input[type="checkbox"]:checked`).forEach(checkbox => {
            checkbox.checked = false;
          });
          
          // Refresh dashboard data if available
          if (typeof loadDashboardData === 'function') {
            loadDashboardData();
          }
        }, 2000);
      }
    } catch (error) {
      logger.error('Error processing capture:', error);
      
      if (captureBtn) {
        captureBtn.textContent = 'Capture Failed';
        captureBtn.disabled = false;
        
        setTimeout(() => {
          captureBtn.textContent = originalText;
        }, 2000);
      }
      
      notificationService.showNotification(`Error capturing items: ${error.message}`, 'error');
    }
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
  }
};

// Export using named export
export { CapturePanel };