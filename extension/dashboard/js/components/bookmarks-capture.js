// components/bookmarks-capture.js
import { showNotification } from '../services/notification-service.js';
import { LogManager } from '../../../shared/utils/log-manager.js';
import { isValidCaptureUrl } from '../../../shared/utils/capture.js';
import { truncateText } from '../../js/components/capture-ui.js';

/**
 * Logger for bookmarks capture operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'bookmarks-capture',
  storageKey: 'marvin_bookmarks_capture_logs',
  maxEntries: 1000
});

// Initialization flag
let bookmarksInitialized = false;

// Debounce function for search and filter operations
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create debounced versions of functions
const debouncedFilterBookmarks = debounce(filterBookmarks, 300);

/**
 * Initialize bookmarks capture functionality
 * @returns {Promise<void>}
 */
async function initBookmarksCapture() {
  logger.debug('initBookmarksCapture called');
  
  if (bookmarksInitialized) {
    logger.debug('Bookmarks capture already initialized, skipping');
    return;
  }
  
  try {
    await loadBookmarks();
    bookmarksInitialized = true;
    logger.info('Bookmarks capture initialized successfully');
  } catch (error) {
    logger.error('Error initializing bookmarks capture:', error);
    showNotification('Error loading bookmarks: ' + error.message, 'error');
  }
}

/**
 * Load bookmarks into the UI
 * @returns {Promise<void>}
 */
async function loadBookmarks() {
  logger.debug('loadBookmarks called');
  
  const bookmarksList = document.getElementById('bookmarks-list');
  
  if (!bookmarksList) {
    logger.error('bookmarks-list element not found');
    return;
  }
  
  bookmarksList.innerHTML = '<div class="loading-indicator">Loading bookmarks...</div>';
  
  try {
    // Get bookmark tree
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // Process and flatten bookmark tree
    const bookmarks = flattenBookmarks(bookmarkTree);
    
    if (bookmarks.length === 0) {
      bookmarksList.innerHTML = '<div class="empty-state">No bookmarks found</div>';
      return;
    }
    
    // Populate folder filter
    populateBookmarkFolders(bookmarks);
    
    // Display bookmarks
    displayBookmarks(bookmarks);
    
    // Set up selection controls
    setupSelectionControls();
    
    logger.info(`Loaded ${bookmarks.length} bookmarks successfully`);
  } catch (error) {
    logger.error('Error loading bookmarks:', error);
    bookmarksList.innerHTML = `<div class="error-state">Error loading bookmarks: ${error.message}</div>`;
  }
}

/**
 * Helper function to flatten bookmark tree into array
 * @param {Array} bookmarkNodes - Bookmark tree nodes
 * @param {string} path - Current path in the tree
 * @returns {Array} Flattened array of bookmarks
 */
function flattenBookmarks(bookmarkNodes, path = "") {
  let bookmarks = [];
  
  for (const node of bookmarkNodes) {
    // Skip the root nodes
    if (node.id === "0" || node.id === "1" || node.id === "2") {
      if (node.children) {
        bookmarks = bookmarks.concat(flattenBookmarks(node.children));
      }
      continue;
    }
    
    const currentPath = path ? `${path} > ${node.title}` : node.title;
    
    if (node.url) {
      // Skip invalid URLs
      if (!isValidCaptureUrl(node.url)) {
        continue;
      }
      
      // This is a bookmark
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        path: path,
        dateAdded: node.dateAdded
      });
    } else if (node.children) {
      // This is a folder
      bookmarks = bookmarks.concat(flattenBookmarks(node.children, currentPath));
    }
  }
  
  return bookmarks;
}

/**
 * Populate folder dropdown for filtering
 * @param {Array} bookmarks - Array of bookmark objects
 */
function populateBookmarkFolders(bookmarks) {
  logger.debug('Populating bookmark folders filter');
  
  const folderFilter = document.getElementById('bookmarks-folder-filter');
  
  if (!folderFilter) {
    logger.error('bookmarks-folder-filter element not found');
    return;
  }
  
  folderFilter.innerHTML = '<option value="all">All Folders</option>';
  
  // Get unique folders
  const folders = [...new Set(bookmarks.map(b => b.path))].filter(path => path);

  // Add options for each folder
  folders.sort().forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    folderFilter.appendChild(option);
  });

  // Set up event listener for filtering
  const searchInput = document.getElementById('bookmarks-search');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const selectedFolder = folderFilter.value;
      
      debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
    });
  }
  
  folderFilter.addEventListener('change', () => {
    const selectedFolder = folderFilter.value;
    const searchTerm = document.getElementById('bookmarks-search')?.value.toLowerCase() || '';
    
    debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
  });
  
  logger.debug(`Added ${folders.length} folders to filter dropdown`);
}

/**
 * Display bookmarks in the list
 * @param {Array} bookmarks - Array of bookmark objects
 */
function displayBookmarks(bookmarks) {
  logger.debug(`Displaying ${bookmarks.length} bookmarks`);
  
  const bookmarksList = document.getElementById('bookmarks-list');
  
  if (!bookmarksList) {
    logger.error('bookmarks-list element not found');
    return;
  }
  
  bookmarksList.innerHTML = '';
  
  bookmarks.forEach(bookmark => {
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'list-item bookmark-item';
    bookmarkItem.setAttribute('data-id', bookmark.id);
    bookmarkItem.setAttribute('data-url', bookmark.url);
    
    // Try to get favicon
    let favicon = '../icons/icon16.png';
    try {
      const faviconUrl = new URL(bookmark.url);
      favicon = `https://www.google.com/s2/favicons?domain=${faviconUrl.hostname}`;
    } catch (error) {
      logger.warn(`Error getting favicon for ${bookmark.url}:`, error);
    }
    
    bookmarkItem.innerHTML = `
      <div class="item-selector">
        <input type="checkbox" id="bookmark-${bookmark.id}" class="item-checkbox">
      </div>
      <div class="item-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="item-content">
        <div class="item-title">${bookmark.title || 'Untitled'}</div>
        <div class="item-url">${truncateText(bookmark.url, 50)}</div>
      </div>
      <div class="item-meta">
        <span class="item-folder">${bookmark.path || 'Root'}</span>
        <span class="item-date">${formatDate(bookmark.dateAdded)}</span>
      </div>
    `;
    
    bookmarksList.appendChild(bookmarkItem);
  });
}

/**
 * Format date for display
 * @param {number} timestamp - Timestamp to format
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  } catch (error) {
    logger.warn('Error formatting date:', error);
    return 'Unknown';
  }
}

/**
 * Filter bookmarks based on search term and folder
 * @param {Array} allBookmarks - Array of all bookmarks
 * @param {string} searchTerm - Search term to filter by
 * @param {string} folder - Folder to filter by
 */
function filterBookmarks(allBookmarks, searchTerm, folder) {
  logger.debug(`Filtering bookmarks with search: "${searchTerm}", folder: "${folder}"`);
  
  const bookmarksList = document.getElementById('bookmarks-list');
  
  if (!bookmarksList) {
    logger.error('bookmarks-list element not found');
    return;
  }
  
  bookmarksList.innerHTML = '';
  
  const filteredBookmarks = allBookmarks.filter(bookmark => {
    // Apply folder filter
    if (folder !== 'all' && bookmark.path !== folder) {
      return false;
    }
    
    // Apply search filter
    if (searchTerm && !bookmark.title.toLowerCase().includes(searchTerm) && 
        !bookmark.url.toLowerCase().includes(searchTerm)) {
      return false;
    }
    
    return true;
  });
  
  if (filteredBookmarks.length === 0) {
    bookmarksList.innerHTML = '<div class="empty-state">No matching bookmarks found</div>';
    return;
  }
  
  displayBookmarks(filteredBookmarks);
  logger.debug(`Filtered to ${filteredBookmarks.length} bookmarks`);
}

/**
 * Set up selection controls (Select All/Deselect All)
 */
function setupSelectionControls() {
  logger.debug('Setting up bookmark selection controls');
  
  const selectAllBtn = document.getElementById('select-all-bookmarks');
  const deselectAllBtn = document.getElementById('deselect-all-bookmarks');
  
  if (!selectAllBtn || !deselectAllBtn) {
    logger.error('Selection control buttons not found');
    return;
  }
  
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#bookmarks-list .item-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    logger.debug(`Selected all ${checkboxes.length} bookmarks`);
  });
  
  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#bookmarks-list .item-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    logger.debug('Deselected all bookmarks');
  });
}

/**
 * Get selected bookmarks from the UI
 * @returns {Array} Array of selected bookmark objects
 */
function getSelectedBookmarks() {
    logger.debug('Getting selected bookmarks');
    
    const selectedItems = [];
    const selectedCheckboxes = document.querySelectorAll('#bookmarks-list .item-checkbox:checked');
    
    Array.from(selectedCheckboxes).forEach(checkbox => {
        const item = checkbox.closest('.bookmark-item');
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
            type: 'bookmark'
          });
        }
      });
      
      logger.debug(`Found ${selectedItems.length} selected bookmarks`);
      return selectedItems;
    }
    
// Export all necessary functions
export {
    initBookmarksCapture,
    loadBookmarks,
    flattenBookmarks,
    populateBookmarkFolders,
    displayBookmarks,
    filterBookmarks,
    setupSelectionControls,
    getSelectedBookmarks
  };