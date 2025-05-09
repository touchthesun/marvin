import { container } from '../../../core/dependency-container.js';

/**
 * Initialize logger for tabs capture operations
 */
const logger = new (container.getUtil('LogManager'))({
  isBackgroundScript: false,
  context: 'tabs-capture',
  storageKey: 'marvin_tabs_capture_logs',
  maxEntries: 1000
});

// Initialization flag
let tabsInitialized = false;

// Debounce function for search and filter operations
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
} 

// Create debounced versions of functions
const debouncedFilterTabs = debounce(applyFilters, 300);

/**
 * Initialize tabs capture functionality
 * @returns {Promise<void>}
 */
async function initTabsCapture() {
  logger.debug('initTabsCapture called');
  
  try {
    // Load open tabs
    await loadOpenTabs();
    
    // Set up windows and tabs data for filtering
    chrome.windows.getAll({ populate: true }, (windows) => {
      updateWindowFilter(windows);
      setupTabsFilter(windows.reduce((tabs, window) => [...tabs, ...window.tabs], []));
    });
    
    tabsInitialized = true;
    logger.info('Tabs capture initialized successfully');
  } catch (error) {
    logger.error('Error initializing tabs capture:', error);

    // Get notification service from container
    const notificationService = container.getService('notificationService');
    if (notificationService) {
      notificationService.showNotification('message', 'type');
    }
  }
}

/**
 * Load open tabs into the UI
 * @returns {Promise<void>}
 */
async function loadOpenTabs() {
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
    chrome.windows.getAll({ populate: true }, (windows) => {
      logger.debug(`Got ${windows.length} windows`);

      if (windows.length === 0) {
        tabsList.innerHTML = '<div class="empty-state">No open tabs found</div>';
        return;
      }
      
      // Create hierarchical structure
      tabsList.innerHTML = '<div class="tabs-hierarchy"></div>';
      const tabsHierarchy = tabsList.querySelector('.tabs-hierarchy');
      
      // Create window filter dropdown
      updateWindowFilter(windows);
      
      // Group tabs by windows
      windows.forEach(window => {
        const filteredTabs = window.tabs.filter(shouldShowTab);
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
          const tabItem = createTabListItem(tab, window.id);
          tabsContainer.appendChild(tabItem);
        });
        
        windowGroup.appendChild(tabsContainer);
        tabsHierarchy.appendChild(windowGroup);
        
        // Window checkbox selects all tabs
        windowCheckbox.addEventListener('change', () => {
          const checked = windowCheckbox.checked;
          tabsContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
          });
        });
        
        // Toggle expand/collapse
        toggleButton.addEventListener('click', () => {
          tabsContainer.style.display = tabsContainer.style.display === 'none' ? 'block' : 'none';
          toggleButton.innerHTML = tabsContainer.style.display === 'none' ? '▶' : '▼';
        });
      });
      
      // Add search functionality
      setupSearchAndFilter();
      
      logger.info('Tabs loaded successfully');
    });
  } catch (error) {
    logger.error('Error loading tabs:', error);
    tabsList.innerHTML = `<div class="error-state">Error loading tabs: ${error.message}</div>`;
  }
}

/**
 * Filter tabs that should be shown (e.g., skip chrome:// URLs)
 * @param {object} tab - Tab object to check
 * @returns {boolean} True if tab should be shown
 */
function shouldShowTab(tab) {
  // Get the utility for validation if available
  try {
    const captureUtils = container.getUtil('capture');
    if (captureUtils && captureUtils.isValidCaptureUrl) {
      return captureUtils.isValidCaptureUrl(tab.url);
    }
  } catch (error) {
    logger.warn('Capture utils not available, using fallback validation');
  }
  
  // Fallback validation
  return !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');
}

/**
 * Create a list item for a tab
 * @param {object} tab - Tab object
 * @param {number} windowId - Window ID
 * @returns {HTMLElement} Tab list item element
 */
function createTabListItem(tab, windowId) {
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
}

/**
 * Update the window filter dropdown
 * @param {Array} windows - Array of window objects
 */
function updateWindowFilter(windows) {
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
}

/**
 * Set up tabs filtering
 * @param {Array} allTabs - Array of all tabs
 */
function setupTabsFilter(allTabs) {
  logger.debug('Setting up tabs filter');
  
  const searchInput = document.getElementById('tabs-search');
  const windowFilter = document.getElementById('tabs-window-filter');
  
  if (!searchInput || !windowFilter) {
    logger.error('Filter elements not found');
    return;
  }
  
  // Search functionality
  searchInput.addEventListener('input', () => {
    debouncedFilterTabs();
  });
  
  windowFilter.addEventListener('change', () => {
    debouncedFilterTabs();
  });
  
  // Set up advanced filters
  setupAdvancedFilters();
}

/**
 * Set up advanced filtering options
 */
function setupAdvancedFilters() {
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
  advancedButton.addEventListener('click', toggleAdvancedFilters);
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
  document.getElementById('apply-filters').addEventListener('click', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

/**
 * Toggle advanced filters visibility
 */
function toggleAdvancedFilters() {
  const advancedFilters = document.querySelector('.advanced-filters');
  
  if (!advancedFilters) {
    logger.error('Advanced filters element not found');
    return;
  }
  
  advancedFilters.style.display = advancedFilters.style.display === 'none' ? 'block' : 'none';
}

/**
 * Apply all filters to tabs
 */
function applyFilters() {
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
}

/**
 * Reset all filters to default values
 */
function resetFilters() {
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
    
    applyFilters();
    logger.debug('Filters reset successfully');
  }

/**
 * Set up search and filter UI
 */
function setupSearchAndFilter() {
    logger.debug('Setting up search and filter UI');
    
    const searchInput = document.getElementById('tabs-search');
    const windowFilter = document.getElementById('tabs-window-filter');
    
    if (!searchInput || !windowFilter) {
      logger.error('Search or filter elements not found');
      return;
    }
    
    // Apply filters when search changes
    searchInput.addEventListener('input', applyFilters);
    windowFilter.addEventListener('change', applyFilters);
  }
  
/**
 * Get selected tabs from the UI
 * @returns {Array} Array of selected tab objects
 */
function getSelectedTabs() {
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
  }
  
  /**
   * Extract content from a tab
   * @param {number} tabId - Tab ID to extract content from
   * @returns {Promise<object>} Extracted content and metadata
   */
  async function extractTabContent(tabId) {
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
  }
  
  // Export all necessary functions
  export {
    extractTabContent,
    getSelectedTabs,
    initTabsCapture,
    loadOpenTabs,
    shouldShowTab,
    createTabListItem,
    updateWindowFilter,
    setupTabsFilter,
    applyFilters,
    resetFilters
  };