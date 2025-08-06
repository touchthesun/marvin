// src/components/panels/capture/tabs-capture.js
import { LogManager } from '../../../utils/log-manager.js';
import { container } from '../../../core/dependency-container.js';

/**
 * Tabs Capture Component
 * Manages browser tabs loading, filtering, and selection
 */
const TabsCapture = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Store tabs data
  _tabs: [],
  _windows: [],
  
  /**
   * Initialize tabs capture functionality
   * @returns {Promise<boolean>} Success state
   */
  async initTabsCapture() {
    // Create logger directly
    const logger = new LogManager({
      context: 'tabs-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.debug('initTabsCapture called');
    
    if (this.initialized) {
      logger.debug('Tabs capture already initialized, skipping');
      return true;
    }
    
    try {
      await this.loadOpenTabs(logger);
      this.initialized = true;
      logger.info('Tabs capture initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing tabs capture:', error);
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error initializing tabs capture: ' + error.message, 'error');
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
   * Clean up existing event listeners for tabs components
   * @param {LogManager} logger - Logger instance
   */
  _cleanupExistingListeners(logger) {
    logger.debug('Cleaning up existing tabs event listeners');
    
    // Remove existing search listeners
    const searchInput = document.getElementById('tabs-search');
    if (searchInput) {
      this._eventListeners.forEach(({element, type, listener}) => {
        if (element === searchInput && type === 'input') {
          try {
            element.removeEventListener(type, listener);
          } catch (error) {
            logger.warn('Error removing existing search listener:', error);
          }
        }
      });
    }
    
    // Remove existing window filter listeners
    const windowFilter = document.getElementById('tabs-window-filter');
    if (windowFilter) {
      this._eventListeners.forEach(({element, type, listener}) => {
        if (element === windowFilter && type === 'change') {
          try {
            element.removeEventListener(type, listener);
          } catch (error) {
            logger.warn('Error removing existing window filter listener:', error);
          }
        }
      });
    }
    
    // Remove existing advanced filter listeners
    const advancedButton = document.querySelector('.advanced-filters .btn-text');
    if (advancedButton) {
      this._eventListeners.forEach(({element, type, listener}) => {
        if (element === advancedButton && type === 'click') {
          try {
            element.removeEventListener(type, listener);
          } catch (error) {
            logger.warn('Error removing existing advanced filter listener:', error);
          }
        }
      });
    }
  },
  
  /**
   * Validate input parameters
   * @param {string} methodName - Name of the calling method
   * @param {Object} params - Parameters to validate
   * @param {LogManager} logger - Logger instance
   * @returns {boolean} True if valid, false otherwise
   */
  _validateInputs(methodName, params, logger) {
    const validations = {
      initTabsCapture: () => true, // No params to validate
      loadOpenTabs: () => true, // Only logger param
      shouldShowTab: (tab) => {
        if (tab !== undefined && typeof tab !== 'object') {
          return false;
        }
        return true;
      },
      createTabListItem: (tab, windowId) => {
        if (tab !== undefined && typeof tab !== 'object') {
          return false;
        }
        if (windowId !== undefined && typeof windowId !== 'string' && typeof windowId !== 'number') {
          return false;
        }
        return true;
      },
      updateWindowFilter: (windows) => {
        if (windows !== undefined && !Array.isArray(windows)) {
          return false;
        }
        return true;
      },
      setupTabsFilter: (allTabs) => {
        if (allTabs !== undefined && !Array.isArray(allTabs)) {
          return false;
        }
        return true;
      },
      toggleAdvancedFilters: () => true, // No params to validate
      applyFilters: () => true, // No params to validate
      resetFilters: () => true, // No params to validate
      setupSearchAndFilter: () => true, // No params to validate
      getSelectedTabs: () => true, // No params to validate
      extractTabContent: (tabId) => {
        if (tabId !== undefined && typeof tabId !== 'number') {
          return false;
        }
        return true;
      },
      cleanup: () => true // No params to validate
    };
    
    const validator = validations[methodName];
    if (!validator) {
      logger.warn(`No validation defined for method: ${methodName}`);
      return true;
    }
    
    return validator(...Object.values(params));
  },
  
  /**
   * Safely execute DOM operations with error boundaries
   * @param {Function} operation - DOM operation to execute
   * @param {LogManager} logger - Logger instance
   * @param {string} operationName - Name of the operation for logging
   * @returns {boolean} True if successful, false otherwise
   */
  _safeDOMOperation(operation, logger, operationName) {
    try {
      return operation();
    } catch (error) {
      logger.error(`DOM operation failed: ${operationName}`, error);
      return false;
    }
  },
  
  /**
   * Load open tabs into the UI
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadOpenTabs(logger) {
    logger.debug('loadOpenTabs called');
    
    const tabsList = document.getElementById('tabs-list');
    
    if (!tabsList) {
      logger.error('tabs-list element not found');
      return;
    }
    
    // Clean up existing listeners before adding new ones
    this._cleanupExistingListeners(logger);
    
    tabsList.innerHTML = '<div class="loading-indicator">Loading tabs...</div>';
    
    try {
      // Get all windows with tabs
      logger.debug('Calling chrome.windows.getAll');
      const windows = await new Promise((resolve) => {
        chrome.windows.getAll({ populate: true }, resolve);
      });
      
      logger.debug(`Got ${windows.length} windows`);
      
      if (windows.length === 0) {
        tabsList.innerHTML = '<div class="empty-state">No open tabs found</div>';
        return;
      }
      
      // Store windows data
      this._windows = windows;
      
      // Create hierarchical structure
      tabsList.innerHTML = '<div class="tabs-hierarchy"></div>';
      const tabsHierarchy = tabsList.querySelector('.tabs-hierarchy');
      
      // Group tabs by windows
      for (const window of windows) {
        const filteredTabs = [];
        for (const tab of window.tabs) {
          if (await this.shouldShowTab(logger, tab)) {
            filteredTabs.push(tab);
          }
        }
        if (filteredTabs.length === 0) continue;
        
        const windowGroup = document.createElement('div');
        windowGroup.className = 'window-group';
        windowGroup.setAttribute('data-window-id', window.id);
        
        // Create window header
        const windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        
        const windowCheckbox = document.createElement('input');
        windowCheckbox.type = 'checkbox';
        windowCheckbox.className = 'window-checkbox';
        windowCheckbox.id = `window-${window.id}`;
        
        const windowTitle = document.createElement('div');
        windowTitle.className = 'window-title';
        windowTitle.textContent = `Window ${window.id} (${filteredTabs.length} tabs)`;
        
        windowHeader.appendChild(windowCheckbox);
        windowHeader.appendChild(windowTitle);
        
        // Add collapse/expand toggle
        const toggleButton = document.createElement('button');
        toggleButton.className = 'btn-icon toggle-window';
        toggleButton.innerHTML = '▼';
        windowHeader.appendChild(toggleButton);
        
        windowGroup.appendChild(windowHeader);
        
        // Create container for tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'window-tabs';
        
        // Add tabs to container
        filteredTabs.forEach(tab => {
          const tabItem = this.createTabListItem(logger, tab, window.id);
          tabsContainer.appendChild(tabItem);
        });
        
        windowGroup.appendChild(tabsContainer);
        tabsHierarchy.appendChild(windowGroup);
        
        // Window checkbox selects all tabs
        const windowCheckboxHandler = () => {
          const checked = windowCheckbox.checked;
          tabsContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
          });
        };
        
        windowCheckbox.addEventListener('change', windowCheckboxHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: windowCheckbox,
          type: 'change',
          listener: windowCheckboxHandler
        });
        
        // Toggle expand/collapse
        const toggleHandler = () => {
          tabsContainer.style.display = tabsContainer.style.display === 'none' ? 'block' : 'none';
          toggleButton.innerHTML = tabsContainer.style.display === 'none' ? '▶' : '▼';
        };
        
        toggleButton.addEventListener('click', toggleHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: toggleButton,
          type: 'click',
          listener: toggleHandler
        });
      }
      
      // Add search functionality
      this.setupSearchAndFilter(logger);
      
      logger.info('Tabs loaded successfully');
    } catch (error) {
      logger.error('Error loading tabs:', error);
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      notificationService.showNotification('Error loading tabs: ' + error.message, 'error');
    }
  },
  
  /**
   * Check if a tab should be shown (not a chrome:// URL)
   * @param {LogManager} logger - Logger instance
   * @param {Object} tab - Tab object to check
   * @returns {Promise<boolean>} True if tab should be shown
   */
  async shouldShowTab(logger, tab) {
    if (!this._validateInputs('shouldShowTab', { tab }, logger)) {
      return false;
    }
    
    try {
      const { isValidCaptureUrl } = await import('../../shared/capture.js');
      return isValidCaptureUrl(tab.url);
    } catch (error) {
      logger.warn('Error importing capture utils, using fallback validation:', error);
      const lowerUrl = tab.url.toLowerCase();
      return !lowerUrl.startsWith('chrome://') && 
             !lowerUrl.startsWith('chrome-extension://') && 
             !lowerUrl.startsWith('about:');
    }
  },
  
  /**
   * Create a tab list item element
   * @param {LogManager} logger - Logger instance
   * @param {Object} tab - Tab object
   * @param {string|number} windowId - Window ID
   * @returns {HTMLElement} Tab item element
   */
  createTabListItem(logger, tab, windowId) {
    if (!this._validateInputs('createTabListItem', { tab, windowId }, logger)) {
      return document.createElement('div'); // Return empty div as fallback
    }
    
    const item = document.createElement('div');
    item.className = 'tab-item';
    item.setAttribute('data-id', tab.id);
    item.setAttribute('data-url', tab.url);
    item.setAttribute('data-window-id', windowId);
    
    const favicon = tab.favIconUrl || '../icons/icon16.png';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `tab-${tab.id}`;
    checkbox.className = 'item-checkbox';
    
    const icon = document.createElement('img');
    icon.src = favicon;
    icon.alt = '';
    icon.className = 'tab-icon';
    
    const content = document.createElement('div');
    content.className = 'tab-content';
    
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Untitled';
    
    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.url;
    
    content.appendChild(title);
    content.appendChild(url);
    
    item.appendChild(checkbox);
    item.appendChild(icon);
    item.appendChild(content);
    
    return item;
  },
  
  /**
   * Update window filter dropdown
   * @param {LogManager} logger - Logger instance
   * @param {Array} windows - Array of window objects
   */
  updateWindowFilter(logger, windows) {
    if (!this._validateInputs('updateWindowFilter', { windows }, logger)) {
      return;
    }
    
    logger.debug('Updating window filter with', windows.length, 'windows');
    
    const success = this._safeDOMOperation(() => {
      const windowFilter = document.getElementById('tabs-window-filter');
      
      if (!windowFilter) {
        logger.error('tabs-window-filter element not found');
        return false;
      }
      
      // Clear existing options
      windowFilter.innerHTML = '<option value="all">All Windows</option>';
      
      // Add options for each window
      windows.forEach(window => {
        const option = document.createElement('option');
        option.value = window.id.toString();
        option.textContent = `Window ${window.id} (${window.tabs.length} tabs)`;
        windowFilter.appendChild(option);
      });
      
      return true;
    }, logger, 'updateWindowFilter');
    
    if (!success) {
      logger.error('Failed to update window filter');
    }
  },
  
  /**
   * Set up tabs filtering functionality
   * @param {LogManager} logger - Logger instance
   * @param {Array} allTabs - Array of all tabs
   */
  setupTabsFilter(logger, allTabs) {
    if (!this._validateInputs('setupTabsFilter', { allTabs }, logger)) {
      return;
    }
    
    logger.debug('Setting up tabs filter');
    
    const success = this._safeDOMOperation(() => {
      const searchInput = document.getElementById('tabs-search');
      const windowFilter = document.getElementById('tabs-window-filter');
      
      if (!searchInput || !windowFilter) {
        logger.error('Filter elements not found');
        return false;
      }
      
      // Search functionality
      const searchHandler = () => {
        this.applyFilters(logger);
      };
      
      searchInput.addEventListener('input', searchHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: searchInput,
        type: 'input',
        listener: searchHandler
      });
      
      const windowFilterHandler = () => {
        this.applyFilters(logger);
      };
      
      windowFilter.addEventListener('change', windowFilterHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: windowFilter,
        type: 'change',
        listener: windowFilterHandler
      });
      
      // Set up advanced filters
      this.setupAdvancedFilters(logger);
      
      return true;
    }, logger, 'setupTabsFilter');
    
    if (!success) {
      logger.error('Failed to set up tabs filter');
    }
  },
  
  /**
   * Set up advanced filtering options
   * @param {LogManager} logger - Logger instance
   */
  setupAdvancedFilters(logger) {
    logger.debug('Setting up advanced filters');
    
    const success = this._safeDOMOperation(() => {
      // Add advanced filters button and panel
      const listControls = document.querySelector('.list-controls');
      
      if (!listControls) {
        logger.error('List controls element not found');
        return false;
      }
      
      const advancedButton = document.createElement('button');
      advancedButton.className = 'btn-text';
      advancedButton.textContent = 'Advanced Filters';
      
      const toggleHandler = () => {
        this.toggleAdvancedFilters(logger);
      };
      
      advancedButton.addEventListener('click', toggleHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: advancedButton,
        type: 'click',
        listener: toggleHandler
      });
      
      listControls.appendChild(advancedButton);
      
      // Create advanced filters panel
      const advancedFilters = document.createElement('div');
      advancedFilters.className = 'advanced-filters';
      advancedFilters.style.display = 'none';
      
      advancedFilters.innerHTML = `
        <div class="filter-row">
          <span class="filter-label">Domain:</span>
          <input type="text" id="domain-filter" placeholder="e.g., example.com">
        </div>
        <div class="filter-row">
          <span class="filter-label">Exclude:</span>
          <input type="text" id="exclude-filter" placeholder="e.g., social">
        </div>
        <div class="filter-row">
          <span class="filter-label">Type:</span>
          <select id="type-filter">
            <option value="all">All types</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="file">Files</option>
          </select>
        </div>
        <button class="btn-secondary" id="apply-filters">Apply Filters</button>
        <button class="btn-text" id="reset-filters">Reset</button>
      `;
      
      document.getElementById('tabs-content').insertBefore(advancedFilters, document.getElementById('tabs-list'));
      
      // Set up filter application
      const applyButton = document.getElementById('apply-filters');
      const resetButton = document.getElementById('reset-filters');
      
      if (applyButton && resetButton) {
        const applyHandler = () => {
          this.applyFilters(logger);
        };
        
        const resetHandler = () => {
          this.resetFilters(logger);
        };
        
        applyButton.addEventListener('click', applyHandler);
        resetButton.addEventListener('click', resetHandler);
        
        // Track these listeners for cleanup
        this._eventListeners.push(
          {
            element: applyButton,
            type: 'click',
            listener: applyHandler
          },
          {
            element: resetButton,
            type: 'click',
            listener: resetHandler
          }
        );
      }
      
      return true;
    }, logger, 'setupAdvancedFilters');
    
    if (!success) {
      logger.error('Failed to set up advanced filters');
    }
  },
  
  /**
   * Toggle advanced filters panel visibility
   * @param {LogManager} logger - Logger instance
   */
  toggleAdvancedFilters(logger) {
    logger.debug('Toggling advanced filters');
    
    const success = this._safeDOMOperation(() => {
      const advancedFilters = document.querySelector('.advanced-filters');
      
      if (!advancedFilters) {
        logger.error('Advanced filters element not found');
        return false;
      }
      
      advancedFilters.style.display = advancedFilters.style.display === 'none' ? 'block' : 'none';
      return true;
    }, logger, 'toggleAdvancedFilters');
    
    if (!success) {
      logger.error('Failed to toggle advanced filters');
    }
  },
  
  /**
   * Apply filters to tabs
   * @param {LogManager} logger - Logger instance
   */
  applyFilters(logger) {
    logger.debug('Applying filters to tabs');
    
    const success = this._safeDOMOperation(() => {
      const searchTerm = document.getElementById('tabs-search')?.value.toLowerCase() || '';
      const windowId = document.getElementById('tabs-window-filter')?.value || 'all';
      const domainFilter = document.getElementById('domain-filter')?.value.toLowerCase() || '';
      const excludeFilter = document.getElementById('exclude-filter')?.value.toLowerCase() || '';
      const typeFilter = document.getElementById('type-filter')?.value || 'all';
      
      // Process all tab items
      const tabItems = document.querySelectorAll('.tab-item');
      let visibleCount = 0;
      
      tabItems.forEach(item => {
        const url = item.getAttribute('data-url').toLowerCase();
        const title = item.querySelector('.tab-title')?.textContent.toLowerCase() || '';
        const itemWindowId = item.getAttribute('data-window-id');
        
        let visible = true;
        
        // Apply window filter
        if (windowId !== 'all' && itemWindowId !== windowId) {
          visible = false;
        }
        
        // Apply search filter
        if (searchTerm && !url.includes(searchTerm) && !title.includes(searchTerm)) {
          visible = false;
        }
        
        // Apply domain filter
        if (domainFilter && !url.includes(domainFilter)) {
          visible = false;
        }
        
        // Apply exclude filter
        if (excludeFilter && (url.includes(excludeFilter) || title.includes(excludeFilter))) {
          visible = false;
        }
        
        // Apply type filter
        if (typeFilter === 'http' && !url.startsWith('http:')) {
          visible = false;
        } else if (typeFilter === 'https' && !url.startsWith('https:')) {
          visible = false;
        } else if (typeFilter === 'file' && !url.startsWith('file:')) {
          visible = false;
        }
        
        // Update visibility
        item.style.display = visible ? 'flex' : 'none';
        if (visible) visibleCount++;
      });
      
      // Update window visibility based on visible tabs
      const windowGroups = document.querySelectorAll('.window-group');
      windowGroups.forEach(group => {
        const visibleTabsInWindow = Array.from(group.querySelectorAll('.tab-item'))
          .filter(item => item.style.display !== 'none').length;
            
        group.style.display = visibleTabsInWindow > 0 ? 'block' : 'none';
      });
      
      // Show message if no results
      const tabsList = document.getElementById('tabs-list');
      const noResults = tabsList?.querySelector('.no-results');
      
      if (visibleCount === 0 && tabsList) {
        if (!noResults) {
          const message = document.createElement('div');
          message.className = 'no-results empty-state';
          message.textContent = 'No tabs match your filters';
          tabsList.appendChild(message);
        }
      } else if (noResults) {
        noResults.remove();
      }
      
      logger.debug(`Filter applied: ${visibleCount} tabs visible`);
      return true;
    }, logger, 'applyFilters');
    
    if (!success) {
      logger.error('Failed to apply filters');
    }
  },
  
  /**
   * Reset all filters
   * @param {LogManager} logger - Logger instance
   */
  resetFilters(logger) {
    logger.debug('Resetting filters');
    
    const success = this._safeDOMOperation(() => {
      const searchInput = document.getElementById('tabs-search');
      const windowFilter = document.getElementById('tabs-window-filter');
      const domainFilter = document.getElementById('domain-filter');
      const excludeFilter = document.getElementById('exclude-filter');
      const typeFilter = document.getElementById('type-filter');
      
      if (searchInput) searchInput.value = '';
      if (windowFilter) windowFilter.value = 'all';
      if (domainFilter) domainFilter.value = '';
      if (excludeFilter) excludeFilter.value = '';
      if (typeFilter) typeFilter.value = 'all';
      
      this.applyFilters(logger);
      logger.debug('Filters reset successfully');
      return true;
    }, logger, 'resetFilters');
    
    if (!success) {
      logger.error('Failed to reset filters');
    }
  },
  
  /**
   * Set up search and filter UI
   * @param {LogManager} logger - Logger instance
   */
  setupSearchAndFilter(logger) {
    logger.debug('Setting up search and filter UI');
    
    const success = this._safeDOMOperation(() => {
      const searchInput = document.getElementById('tabs-search');
      const windowFilter = document.getElementById('tabs-window-filter');
      
      if (!searchInput || !windowFilter) {
        logger.error('Search or filter elements not found');
        return false;
      }
      
      // Apply filters when search changes
      const searchHandler = () => {
        this.applyFilters(logger);
      };
      
      const windowFilterHandler = () => {
        this.applyFilters(logger);
      };
      
      searchInput.addEventListener('input', searchHandler);
      windowFilter.addEventListener('change', windowFilterHandler);
      
      // Track these listeners for cleanup
      this._eventListeners.push(
        {
          element: searchInput,
          type: 'input',
          listener: searchHandler
        },
        {
          element: windowFilter,
          type: 'change',
          listener: windowFilterHandler
        }
      );
      
      return true;
    }, logger, 'setupSearchAndFilter');
    
    if (!success) {
      logger.error('Failed to set up search and filter');
    }
  },
  
  /**
   * Get selected tabs from the UI
   * @returns {Array} Array of selected tab objects
   */
  getSelectedTabs() {
    const logger = new LogManager({
      context: 'tabs-capture',
      isBackgroundScript: false
    });
    
    logger.debug('Getting selected tabs');
    
    const selectedItems = [];
    const selectedCheckboxes = document.querySelectorAll('#tabs-list .tab-item input[type="checkbox"]:checked');
    
    Array.from(selectedCheckboxes).forEach(checkbox => {
      const item = checkbox.closest('.tab-item');
      if (!item) return;
      
      const id = item.getAttribute('data-id');
      const url = item.getAttribute('data-url');
      const windowId = item.getAttribute('data-window-id');
      const titleElement = item.querySelector('.tab-title');
      const title = titleElement ? titleElement.textContent : 'Untitled';
      
      if (url) {
        selectedItems.push({
          id,
          url,
          title,
          windowId,
          type: 'tab'
        });
      }
    });
    
    logger.debug(`Found ${selectedItems.length} selected tabs`);
    return selectedItems;
  },
  
  /**
   * Extract content from a specific tab
   * @param {number} tabId - Tab ID to extract content from
   * @returns {Promise<Object>} Extracted content data
   */
  async extractTabContent(tabId) {
    if (!this._validateInputs('extractTabContent', { tabId }, new LogManager({
      context: 'tabs-capture',
      isBackgroundScript: false
    }))) {
      return {
        content: "",
        title: "",
        metadata: {}
      };
    }
    
    const logger = new LogManager({
      context: 'tabs-capture',
      isBackgroundScript: false
    });
    
    logger.debug(`Extracting content from tab ${tabId}`);
    
    try {
      // We'll use the executeScript method to extract content from the tab
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
          return {
            content: document.documentElement.outerHTML,
            title: document.title,
            metadata: {
              description: document.querySelector('meta[name="description"]')?.content || '',
              keywords: document.querySelector('meta[name="keywords"]')?.content || '',
              author: document.querySelector('meta[name="author"]')?.content || '',
              ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
              ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
              ogImage: document.querySelector('meta[property="og:image"]')?.content || ''
            }
          };
        }
      });
      
      if (!results || !results[0] || chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError?.message || 'Failed to extract content');
      }
      
      logger.debug(`Content extracted successfully from tab ${tabId}`);
      return results[0].result;
    } catch (error) {
      logger.error(`Error extracting content from tab ${tabId}:`, error);
      // Return minimal data if extraction fails
      return {
        content: "",
        title: "",
        metadata: {}
      };
    }
  },
  
  /**
   * Refresh the display without reloading data
   * @param {LogManager} logger - Logger instance
   */
  refreshDisplay(logger) {
    logger.debug('Refreshing tabs display');
    this.applyFilters(logger);
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'tabs-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Tabs capture not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up tabs capture resources');
    
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
    this._tabs = [];
    this._windows = [];
    this.initialized = false;
    
    logger.debug('Tabs capture cleanup completed');
  }
};

// Export using named export
export { TabsCapture };