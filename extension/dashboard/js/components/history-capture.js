// components/capture/history-capture.js
import { showNotification } from '/dashboard/js/services/notification-service.js';
import { LogManager } from '/shared/utils/log-manager.js';
import { isValidCaptureUrl } from '/shared/utils/capture.js';
import { truncateText } from '/dashboard/js/components/capture-ui.js';

/**
 * Logger for history capture operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'history-capture',
  storageKey: 'marvin_history_capture_logs',
  maxEntries: 1000
});

// Initialization flag
let historyInitialized = false;

// Debounce function for search and filter operations
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create debounced versions of functions
const debouncedFilterHistory = debounce(filterHistory, 300);

/**
 * Initialize history capture functionality
 * @returns {Promise<void>}
 */
async function initHistoryCapture() {
  logger.debug('initHistoryCapture called');
  
  if (historyInitialized) {
    logger.debug('History capture already initialized, skipping');
    return;
  }
  
  try {
    await loadHistory();
    historyInitialized = true;
    logger.info('History capture initialized successfully');
  } catch (error) {
    logger.error('Error initializing history capture:', error);
    showNotification('Error loading history: ' + error.message, 'error');
  }
}

/**
 * Load browser history into the UI
 * @returns {Promise<void>}
 */
async function loadHistory() {
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
    const startTime = getStartTimeFromFilter(timeFilter);
    
    logger.debug(`Fetching history with time filter: ${timeFilter}, startTime: ${startTime}`);
    
    // Query browser history
    const historyItems = await chrome.history.search({
      text: '',  // Empty string to get all history
      startTime: startTime,
      maxResults: 1000
    });
    
    // Filter out invalid URLs
    const validHistoryItems = historyItems.filter(item => isValidCaptureUrl(item.url));
    
    if (validHistoryItems.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No history items found</div>';
      return;
    }
    
    // Display history items
    displayHistoryItems(validHistoryItems);
    
    // Set up time filter change handler
    const timeFilterElement = document.getElementById('history-time-filter');
    if (timeFilterElement) {
      timeFilterElement.addEventListener('change', () => {
        loadHistory();
      });
    }
    
    // Set up search handler
    const searchInput = document.getElementById('history-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        debouncedFilterHistory(validHistoryItems, e.target.value.toLowerCase());
      });
    }
    
    // Set up selection controls
    setupSelectionControls();
    
    logger.info(`Loaded ${validHistoryItems.length} history items successfully`);
  } catch (error) {
    logger.error('Error loading history:', error);
    historyList.innerHTML = `<div class="error-state">Error loading history: ${error.message}</div>`;
  }
}

/**
 * Get start time from time filter value
 * @param {string} timeFilter - Time filter value
 * @returns {number} Start time in milliseconds
 */
function getStartTimeFromFilter(timeFilter) {
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
}

/**
 * Display history items in the list
 * @param {Array} historyItems - Array of history items
 */
function displayHistoryItems(historyItems) {
  logger.debug(`Displaying ${historyItems.length} history items`);
  
  const historyList = document.getElementById('history-list');
  
  if (!historyList) {
    logger.error('history-list element not found');
    return;
  }
  
  historyList.innerHTML = '';
  
  // Sort by last visit time (most recent first)
  historyItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  
  historyItems.forEach(item => {
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
    const dateStr = formatDate(visitDate);
    
    historyItem.innerHTML = `
      <div class="item-selector">
        <input type="checkbox" id="history-${item.id}" class="item-checkbox">
      </div>
      <div class="item-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="item-content">
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-url">${truncateText(item.url, 50)}</div>
      </div>
      <div class="item-meta">
        <span class="item-date">Last visit: ${dateStr}</span>
        <span class="item-visits">${item.visitCount} visits</span>
      </div>
    `;
    
    historyList.appendChild(historyItem);
  });
}

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
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
}

/**
 * Filter history items based on search term
 * @param {Array} allItems - Array of all history items
 * @param {string} searchTerm - Search term to filter by
 */
function filterHistory(allItems, searchTerm) {
  logger.debug(`Filtering history with search: "${searchTerm}"`);
  
  const historyList = document.getElementById('history-list');
  
  if (!historyList) {
    logger.error('history-list element not found');
    return;
  }
  
  if (!searchTerm) {
    // If no search term, show all items
    displayHistoryItems(allItems);
    return;
  }
  
  // Filter items by search term
  const filteredItems = allItems.filter(item => 
    item.title?.toLowerCase().includes(searchTerm) || 
    item.url.toLowerCase().includes(searchTerm)
  );
  
  if (filteredItems.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No matching history items found</div>';
    return;
  }
  
  displayHistoryItems(filteredItems);
  logger.debug(`Filtered to ${filteredItems.length} history items`);
}

/**
 * Set up selection controls (Select All/Deselect All)
 */
function setupSelectionControls() {
  logger.debug('Setting up history selection controls');
  
  const selectAllBtn = document.getElementById('select-all-history');
  const deselectAllBtn = document.getElementById('deselect-all-history');
  
  if (!selectAllBtn || !deselectAllBtn) {
    logger.error('Selection control buttons not found');
    return;
  }
  
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#history-list .item-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    logger.debug(`Selected all ${checkboxes.length} history items`);
  });
  
  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#history-list .item-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    logger.debug('Deselected all history items');
  });
}

/**
 * Get selected history items from the UI
 * @returns {Array} Array of selected history objects
 */
function getSelectedHistoryItems() {
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
}

// Export all necessary functions
export {
  loadHistory,
  initHistoryCapture,
  getStartTimeFromFilter,
  displayHistoryItems,
  filterHistory,
  setupSelectionControls,
  getSelectedHistoryItems
};
