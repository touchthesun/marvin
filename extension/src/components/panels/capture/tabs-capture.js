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
      // Load open tabs
      await this.loadOpenTabs(logger);
      
      // Set up windows and tabs data for filtering
      await new Promise((resolve) => {
        chrome.windows.getAll({ populate: true }, (windows) => {
          this._windows = windows;
          this.updateWindowFilter(logger, windows);
          this.setupTabsFilter(logger, windows.reduce((tabs, window) => [...tabs, ...window.tabs], []));
          resolve();
        });
      });
      
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
      
      // Create hierarchical structure
      tabsList.innerHTML = '<div class="tabs-hierarchy"></div>';
      const tabsHierarchy = tabsList.querySelector('.tabs-hierarchy');
      
      // Create window filter dropdown
      this.updateWindowFilter(logger, windows);
      
      // Group tabs by windows
      windows.forEach(window => {
        const filteredTabs = window.tabs.filter(tab => this.shouldShowTab(logger, tab));
        if (filteredTabs.length === 0) return;
        
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
      });
      
      // Add search functionality
      this.setupSearchAndFilter(logger);
      
      logger.info('Tabs loaded successfully');
    } catch (error) {
      logger.error('Error loading tabs:', error);
      tabsList.innerHTML = `<div class="error-state">Error loading tabs: ${error.message}</div>`;
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error loading tabs: ' + error.message, 'error');
    }
  },
  
  /**
   * Filter tabs that should be shown (e.g., skip chrome:// URLs)
   * @param {LogManager} logger - Logger instance
   * @param {object} tab - Tab object to check
   * @returns {boolean} True if tab should be shown
   */
  shouldShowTab(logger, tab) {
    try {
      const captureUtils = this.getService(logger, 'capture', {
        isValidCaptureUrl: (url) => {
          const lowerUrl = url.toLowerCase();
          return !lowerUrl.startsWith('chrome://') && 
                 !lowerUrl.startsWith('chrome-extension://') && 
                 !lowerUrl.startsWith('about:');
        }
      });
      
      return captureUtils.isValidCaptureUrl(tab.url);
    } catch (error) {
      logger.warn('Error validating tab URL:', error);
      // Fallback validation
      return !tab.url.startsWith('chrome://') && 
             !tab.url.startsWith('chrome-extension://') && 
             !tab.url.startsWith('about:');
    }
  },
  
  /**
   * Create a list item for a tab
   * @param {LogManager} logger - Logger instance
   * @param {object} tab - Tab object
   * @param {number} windowId - Window ID
   * @returns {HTMLElement} Tab list item element
   */
  createTabListItem(logger, tab, windowId) {
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
   * Update the window filter dropdown
   * @param {LogManager} logger - Logger instance
   * @param {Array} windows - Array of window objects
   */
  updateWindowFilter(logger, windows) {
    logger.debug('Updating window filter with', windows.length, 'windows');
    const windowFilter = document.getElementById('tabs-window-filter');
    
    if (!windowFilter) {
      logger.error('tabs-window-filter element not found');
      return;
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
  },
  
  /**
   * Set up tabs filtering
   * @param {LogManager} logger - Logger instance
   * @param {Array} allTabs - Array of all tabs
   */
  setupTabsFilter(logger, allTabs) {
    logger.debug('Setting up tabs filter');
    
    const searchInput = document.getElementById('tabs-search');
    const windowFilter = document.getElementById('tabs-window-filter');
    
    if (!searchInput || !windowFilter) {
      logger.error('Filter elements not found');
      return;
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
  },
  
  /**
   * Set up advanced filtering options
   * @param {LogManager} logger - Logger instance
   */
  setupAdvancedFilters(logger) {
    logger.debug('Setting up advanced filters');
    
    // Add advanced filters button and panel
    const listControls = document.querySelector('.list-controls');
    
    if (!listControls) {
      logger.error('List controls element not found');
      return;
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
  },
  
  /**
   * Toggle advanced filters visibility
   * @param {LogManager} logger - Logger instance
   */
  toggleAdvancedFilters(logger) {
    const advancedFilters = document.querySelector('.advanced-filters');
    
    if (!advancedFilters) {
      logger.error('Advanced filters element not found');
      return;
    }
    
    advancedFilters.style.display = advancedFilters.style.display === 'none' ? 'block' : 'none';
  },
  
  /**
   * Apply all filters to tabs
   * @param {LogManager} logger - Logger instance
   */
  applyFilters(logger) {
    logger.debug('Applying filters to tabs');
    
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
  },
  
  /**
   * Reset all filters to default values
   * @param {LogManager} logger - Logger instance
   */
  resetFilters(logger) {
    logger.debug('Resetting filters');
    
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
  },
  
  /**
   * Set up search and filter UI
   * @param {LogManager} logger - Logger instance
   */
  setupSearchAndFilter(logger) {
    logger.debug('Setting up search and filter UI');
    
    const searchInput = document.getElementById('tabs-search');
    const windowFilter = document.getElementById('tabs-window-filter');
    
    if (!searchInput || !windowFilter) {
      logger.error('Search or filter elements not found');
      return;
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
   * Extract content from a tab
   * @param {number} tabId - Tab ID to extract content from
   * @returns {Promise<object>} Extracted content and metadata
   */
  async extractTabContent(tabId) {
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