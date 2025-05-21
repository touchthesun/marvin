// src/components/panels/capture/history-capture.js
import { LogManager } from '../../../utils/log-manager.js';
import { container } from '../../../core/dependency-container.js';

/**
 * History Capture Component
 * Manages browser history loading, filtering, and selection
 */
const HistoryCapture = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Store history data
  _historyItems: [],
  
  /**
   * Initialize history capture functionality
   * @returns {Promise<boolean>} Success state
   */
  async initHistoryCapture() {
    // Create logger directly
    const logger = new LogManager({
      context: 'history-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.debug('initHistoryCapture called');
    
    if (this.initialized) {
      logger.debug('History capture already initialized, skipping');
      return true;
    }
    
    try {
      await this.loadHistory(logger);
      this.initialized = true;
      logger.info('History capture initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing history capture:', error);
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error loading history: ' + error.message, 'error');
      return false;
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
   * Load browser history into the UI
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadHistory(logger) {
    logger.debug('loadHistory called');
    
    const historyList = document.getElementById('history-list');
    
    if (!historyList) {
      logger.error('history-list element not found');
      return;
    }
    
    historyList.innerHTML = '<div class="loading-indicator">Loading history...</div>';
    
    try {
      // Get time filter value
      const timeFilter = document.getElementById('history-time-filter')?.value || '7days';
      const startTime = this.getStartTimeFromFilter(timeFilter);
      
      logger.debug(`Fetching history with time filter: ${timeFilter}, startTime: ${startTime}`);
      
      // Query browser history
      const historyItems = await chrome.history.search({
        text: '',  // Empty string to get all history
        startTime: startTime,
        maxResults: 1000
      });
      
      // Filter out invalid URLs
      let validHistoryItems = [];
      try {
        const captureUtils = this.getService(logger, 'capture', {
          isValidCaptureUrl: (url) => {
            const lowerUrl = url.toLowerCase();
            return !lowerUrl.startsWith('chrome://') && 
                   !lowerUrl.startsWith('chrome-extension://') && 
                   !lowerUrl.startsWith('about:');
          }
        });
        
        validHistoryItems = historyItems.filter(item => captureUtils.isValidCaptureUrl(item.url));
      } catch (error) {
        logger.warn('Error validating URLs:', error);
        // Fallback validation
        validHistoryItems = historyItems.filter(item => {
          const url = item.url.toLowerCase();
          return !url.startsWith('chrome://') && 
                 !url.startsWith('chrome-extension://') && 
                 !url.startsWith('about:');
        });
      }
      
      if (validHistoryItems.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No history items found</div>';
        return;
      }
      
      // Store history items
      this._historyItems = validHistoryItems;
      
      // Display history items
      this.displayHistoryItems(logger);
      
      // Set up time filter change handler
      const timeFilterElement = document.getElementById('history-time-filter');
      if (timeFilterElement) {
        const timeFilterHandler = () => {
          this.loadHistory(logger);
        };
        
        timeFilterElement.addEventListener('change', timeFilterHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: timeFilterElement,
          type: 'change',
          listener: timeFilterHandler
        });
      }
      
      // Set up search handler
      const searchInput = document.getElementById('history-search');
      if (searchInput) {
        const searchHandler = (e) => {
          this.filterHistory(logger, e.target.value.toLowerCase());
        };
        
        searchInput.addEventListener('input', searchHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: searchInput,
          type: 'input',
          listener: searchHandler
        });
      }
      
      // Set up selection controls
      this.setupSelectionControls(logger);
      
      logger.info(`Loaded ${validHistoryItems.length} history items successfully`);
    } catch (error) {
      logger.error('Error loading history:', error);
      historyList.innerHTML = `<div class="error-state">Error loading history: ${error.message}</div>`;
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error loading history: ' + error.message, 'error');
    }
  },
  
  /**
   * Get start time from time filter value
   * @param {string} timeFilter - Time filter value
   * @returns {number} Start time in milliseconds
   */
  getStartTimeFromFilter(timeFilter) {
    const now = Date.now();
    
    switch (timeFilter) {
      case 'today':
        // Start of today
        return new Date().setHours(0, 0, 0, 0);
      case 'yesterday':
        // Start of yesterday
        return new Date().setHours(0, 0, 0, 0) - 86400000;
      case '7days':
        // 7 days ago
        return now - (7 * 86400000);
      case '30days':
        // 30 days ago
        return now - (30 * 86400000);
      case 'all':
        // All time (1 year ago as a practical limit)
        return now - (365 * 86400000);
      default:
        // Default to 7 days
        return now - (7 * 86400000);
    }
  },
  
  /**
   * Display history items in the list
   * @param {LogManager} logger - Logger instance
   */
  displayHistoryItems(logger) {
    logger.debug(`Displaying ${this._historyItems.length} history items`);
    
    const historyList = document.getElementById('history-list');
    
    if (!historyList) {
      logger.error('history-list element not found');
      return;
    }
    
    historyList.innerHTML = '';
    
    // Sort by last visit time (most recent first)
    this._historyItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    
    this._historyItems.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'list-item history-item';
      historyItem.setAttribute('data-id', item.id);
      historyItem.setAttribute('data-url', item.url);
      
      // Try to get favicon
      let favicon = '../icons/icon16.png';
      try {
        const faviconUrl = new URL(item.url);
        favicon = `https://www.google.com/s2/favicons?domain=${faviconUrl.hostname}`;
      } catch (error) {
        logger.warn(`Error getting favicon for ${item.url}:`, error);
      }
      
      // Format date
      const visitDate = new Date(item.lastVisitTime);
      const dateStr = this.formatDate(logger, visitDate);
      
      // Get the formatting utility for truncateText
      let truncatedUrl = item.url;
      try {
        const formatting = this.getService(logger, 'formatting', {
          truncateText: (text, maxLength) => {
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
          }
        });
        
        truncatedUrl = formatting.truncateText(item.url, 50);
      } catch (error) {
        logger.warn('Error truncating URL:', error);
        truncatedUrl = item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url;
      }
      
      historyItem.innerHTML = `
        <div class="item-selector">
          <input type="checkbox" id="history-${item.id}" class="item-checkbox">
        </div>
        <div class="item-icon">
          <img src="${favicon}" alt="" class="favicon">
        </div>
        <div class="item-content">
          <div class="item-title">${item.title || 'Untitled'}</div>
          <div class="item-url">${truncatedUrl}</div>
        </div>
        <div class="item-meta">
          <span class="item-date">Last visit: ${dateStr}</span>
          <span class="item-visits">${item.visitCount} visits</span>
        </div>
      `;
      
      historyList.appendChild(historyItem);
    });
  },
  
  /**
   * Format date for display
   * @param {LogManager} logger - Logger instance
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDate(logger, date) {
    if (!date) return 'Unknown';
    
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Check if date is today
      if (date >= today) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Check if date is yesterday
      if (date >= yesterday) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Otherwise show full date
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      logger.warn('Error formatting date:', error);
      return 'Unknown';
    }
  },
  
  /**
   * Filter history items based on search term
   * @param {LogManager} logger - Logger instance
   * @param {string} searchTerm - Search term to filter by
   */
  filterHistory(logger, searchTerm) {
    logger.debug(`Filtering history with search: "${searchTerm}"`);
    
    const historyList = document.getElementById('history-list');
    
    if (!historyList) {
      logger.error('history-list element not found');
      return;
    }
    
    if (!searchTerm) {
      // If no search term, show all items
      this.displayHistoryItems(logger);
      return;
    }
    
    // Filter items by search term
    const filteredItems = this._historyItems.filter(item => 
      item.title?.toLowerCase().includes(searchTerm) || 
      item.url.toLowerCase().includes(searchTerm)
    );
    
    if (filteredItems.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No matching history items found</div>';
      return;
    }
    
    this.displayHistoryItems(logger);
    logger.debug(`Filtered to ${filteredItems.length} history items`);
  },
  
  /**
   * Set up selection controls (Select All/Deselect All)
   * @param {LogManager} logger - Logger instance
   */
  setupSelectionControls(logger) {
    logger.debug('Setting up history selection controls');
    
    const selectAllBtn = document.getElementById('select-all-history');
    const deselectAllBtn = document.getElementById('deselect-all-history');
    
    if (!selectAllBtn || !deselectAllBtn) {
      logger.error('Selection control buttons not found');
      return;
    }
    
    const selectAllHandler = () => {
      const checkboxes = document.querySelectorAll('#history-list .item-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
      logger.debug(`Selected all ${checkboxes.length} history items`);
    };
    
    const deselectAllHandler = () => {
      const checkboxes = document.querySelectorAll('#history-list .item-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
      logger.debug('Deselected all history items');
    };
    
    selectAllBtn.addEventListener('click', selectAllHandler);
    deselectAllBtn.addEventListener('click', deselectAllHandler);
    
    // Track these listeners for cleanup
    this._eventListeners.push(
      {
        element: selectAllBtn,
        type: 'click',
        listener: selectAllHandler
      },
      {
        element: deselectAllBtn,
        type: 'click',
        listener: deselectAllHandler
      }
    );
  },
  
  /**
   * Get selected history items from the UI
   * @returns {Array} Array of selected history objects
   */
  getSelectedHistoryItems() {
    const logger = new LogManager({
      context: 'history-capture',
      isBackgroundScript: false
    });
    
    logger.debug('Getting selected history items');
    
    const selectedItems = [];
    const selectedCheckboxes = document.querySelectorAll('#history-list .item-checkbox:checked');
    
    Array.from(selectedCheckboxes).forEach(checkbox => {
      const item = checkbox.closest('.history-item');
      if (!item) return;
      
      const id = item.getAttribute('data-id');
      const url = item.getAttribute('data-url');
      const titleElement = item.querySelector('.item-title');
      const title = titleElement ? titleElement.textContent : 'Untitled';
      
      if (url) {
        selectedItems.push({
          id,
          url,
          title,
          type: 'history'
        });
      }
    });
    
    logger.debug(`Found ${selectedItems.length} selected history items`);
    return selectedItems;
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'history-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('History capture not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up history capture resources');
    
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
    
    // Clear data
    this._historyItems = [];
    this.initialized = false;
    
    logger.debug('History capture cleanup completed');
  }
};

// Export using named export
export { HistoryCapture };