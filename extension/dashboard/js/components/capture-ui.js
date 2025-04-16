// components/capture/capture-ui.js
import { LogManager } from '../../../shared/utils/log-manager.js';

/**
 * Logger for capture UI operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'capture-ui',
  storageKey: 'marvin_capture_ui_logs',
  maxEntries: 1000
});

/**
 * Create a list item for any capture source
 * @param {object} item - Item data
 * @param {string} type - Item type (tab, bookmark, history)
 * @returns {HTMLElement} List item element
 */
function createListItem(item, type) {
  logger.debug(`Creating list item for ${type}: ${item.url}`);
  
  const listItem = document.createElement('div');
  listItem.className = `list-item ${type}-item`;
  listItem.setAttribute('data-id', item.id);
  listItem.setAttribute('data-url', item.url);
  
  if (item.windowId) {
    listItem.setAttribute('data-window-id', item.windowId);
  }
  
  // Try to get favicon
  let favicon = '../icons/icon16.png';
  try {
    const faviconUrl = new URL(item.url);
    favicon = `https://www.google.com/s2/favicons?domain=${faviconUrl.hostname}`;
  } catch (error) {
    logger.warn(`Error getting favicon for ${item.url}:`, error);
  }
  
  // Create checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `${type}-${item.id}`;
  checkbox.className = 'item-checkbox';
  
  // Create icon
  const icon = document.createElement('img');
  icon.src = favicon;
  icon.alt = '';
  icon.className = `${type}-icon`;
  
  // Create content container
  const content = document.createElement('div');
  content.className = 'item-content';
  
  // Create title
  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.title || 'Untitled';
  
  // Create URL
  const url = document.createElement('div');
  url.className = 'item-url';
  url.textContent = truncateText(item.url, 50);
  
  // Assemble content
  content.appendChild(title);
  content.appendChild(url);
  
  // Assemble list item
  listItem.appendChild(checkbox);
  listItem.appendChild(icon);
  listItem.appendChild(content);
  
  return listItem;
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength) + '...';
}

/**
 * Format date for display
 * @param {Date|number} date - Date to format
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
function formatDate(date, includeTime = false) {
  if (!date) return 'Unknown';
  
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format time part
    const timeStr = includeTime ? 
      ` at ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    
    // Check if date is today
    if (dateObj >= today) {
      return `Today${timeStr}`;
    }
    
    // Check if date is yesterday
    if (dateObj >= yesterday) {
      return `Yesterday${timeStr}`;
    }
    
    // Otherwise show full date
    return dateObj.toLocaleDateString() + (includeTime ? timeStr : '');
  } catch (error) {
    logger.warn('Error formatting date:', error);
    return 'Unknown';
  }
}

/**
 * Set up selection controls (Select All/Deselect All)
 * @param {string} type - Type of items (tabs, bookmarks, history)
 */
function setupSelectionControls(type) {
  logger.debug(`Setting up selection controls for ${type}`);
  
  const selectAllBtn = document.getElementById(`select-all-${type}`);
  const deselectAllBtn = document.getElementById(`deselect-all-${type}`);
  
  if (!selectAllBtn || !deselectAllBtn) {
    logger.error(`Selection control buttons for ${type} not found`);
    return;
  }
  
  // Remove existing event listeners
  const newSelectAllBtn = selectAllBtn.cloneNode(true);
  const newDeselectAllBtn = deselectAllBtn.cloneNode(true);
  
  selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
  deselectAllBtn.parentNode.replaceChild(newDeselectAllBtn, deselectAllBtn);
  
  // Add new event listeners
  newSelectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    logger.debug(`Selected all ${checkboxes.length} ${type} items`);
  });
  
  newDeselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    logger.debug(`Deselected all ${type} items`);
  });
}

/**
 * Create a loading indicator
 * @param {string} message - Loading message
 * @returns {HTMLElement} Loading indicator element
 */
function createLoadingIndicator(message = 'Loading...') {
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-indicator';
  loadingIndicator.textContent = message;
  return loadingIndicator;
}

/**
 * Create an empty state indicator
 * @param {string} message - Empty state message
 * @returns {HTMLElement} Empty state element
 */
function createEmptyState(message = 'No items found') {
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.textContent = message;
  return emptyState;
}

/**
 * Create an error state indicator
 * @param {string} message - Error message
 * @param {Function} retryCallback - Optional callback for retry button
 * @returns {HTMLElement} Error state element
 */
function createErrorState(message, retryCallback = null) {
  const errorState = document.createElement('div');
  errorState.className = 'error-state';
  
  const errorMessage = document.createElement('p');
  errorMessage.textContent = message;
  errorState.appendChild(errorMessage);
  
  if (retryCallback && typeof retryCallback === 'function') {
    const retryButton = document.createElement('button');
    retryButton.className = 'btn-secondary retry-btn';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', retryCallback);
    errorState.appendChild(retryButton);
  }
  
  return errorState;
}

/**
 * Get domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    logger.warn(`Invalid URL: ${url}`, error);
    return 'unknown';
  }
}

/**
 * Group items by domain
 * @param {Array} items - Array of items with URLs
 * @returns {Object} Object with domains as keys and arrays of items as values
 */
function groupItemsByDomain(items) {
  const groups = {};
  
  items.forEach(item => {
    const domain = getDomainFromUrl(item.url);
    if (!groups[domain]) {
      groups[domain] = [];
    }
    groups[domain].push(item);
  });
  
  return groups;
}

/**
 * Create a domain group header
 * @param {string} domain - Domain name
 * @param {number} count - Number of items in domain
 * @returns {HTMLElement} Domain group header element
 */
function createDomainGroupHeader(domain, count) {
  const header = document.createElement('div');
  header.className = 'domain-header';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'domain-checkbox';
  checkbox.id = `domain-${domain.replace(/\./g, '-')}`;
  
  const title = document.createElement('div');
  title.className = 'domain-title';
  title.textContent = `${domain} (${count})`;
  
  header.appendChild(checkbox);
  header.appendChild(title);
  
  return header;
}

// Export all UI helper functions
export {
  createListItem,
  truncateText,
  formatDate,
  setupSelectionControls,
  createLoadingIndicator,
  createEmptyState,
  createErrorState,
  getDomainFromUrl,
  groupItemsByDomain,
  createDomainGroupHeader
};

