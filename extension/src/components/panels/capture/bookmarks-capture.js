// src/components/panels/capture/bookmarks-capture.js
import { LogManager } from '../../../utils/log-manager.js';
import { container } from '../../../core/dependency-container.js';

/**
 * Bookmarks Capture Component
 * Manages bookmark loading, filtering, and selection
 */
const BookmarksCapture = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Store bookmarks data
  _bookmarks: [],
  
  /**
   * Initialize bookmarks capture functionality
   * @returns {Promise<boolean>} Success state
   */
  async initBookmarksCapture() {
    // Create logger directly
    const logger = new LogManager({
      context: 'bookmarks-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.debug('initBookmarksCapture called');
    
    if (this.initialized) {
      logger.debug('Bookmarks capture already initialized, skipping');
      return true;
    }
    
    try {
      await this.loadBookmarks(logger);
      this.initialized = true;
      logger.info('Bookmarks capture initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing bookmarks capture:', error);
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error loading bookmarks: ' + error.message, 'error');
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
   * Load bookmarks into the UI
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadBookmarks(logger) {
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
      this._bookmarks = this.flattenBookmarks(logger, bookmarkTree);
      
      if (this._bookmarks.length === 0) {
        bookmarksList.innerHTML = '<div class="empty-state">No bookmarks found</div>';
        return;
      }
      
      // Populate folder filter
      this.populateBookmarkFolders(logger);
      
      // Display bookmarks
      this.displayBookmarks(logger);
      
      // Set up selection controls
      this.setupSelectionControls(logger);
      
      logger.info(`Loaded ${this._bookmarks.length} bookmarks successfully`);
    } catch (error) {
      logger.error('Error loading bookmarks:', error);
      bookmarksList.innerHTML = `<div class="error-state">Error loading bookmarks: ${error.message}</div>`;
      
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error loading bookmarks: ' + error.message, 'error');
    }
  },
  
  /**
   * Helper function to flatten bookmark tree into array
   * @param {LogManager} logger - Logger instance
   * @param {Array} bookmarkNodes - Bookmark tree nodes
   * @param {string} path - Current path in the tree
   * @returns {Array} Flattened array of bookmarks
   */
  flattenBookmarks(logger, bookmarkNodes, path = "") {
    let bookmarks = [];
    
    for (const node of bookmarkNodes) {
      // Skip the root nodes
      if (node.id === "0" || node.id === "1" || node.id === "2") {
        if (node.children) {
          bookmarks = bookmarks.concat(this.flattenBookmarks(logger, node.children));
        }
        continue;
      }
      
      const currentPath = path ? `${path} > ${node.title}` : node.title;
      
      if (node.url) {
        // Skip invalid URLs
        let isValid = true;
        try {
          const captureUtils = this.getService(logger, 'capture', {
            isValidCaptureUrl: (url) => {
              const lowerUrl = url.toLowerCase();
              return !lowerUrl.startsWith('chrome://') && 
                     !lowerUrl.startsWith('chrome-extension://') && 
                     !lowerUrl.startsWith('about:');
            }
          });
          
          isValid = captureUtils.isValidCaptureUrl(node.url);
        } catch (error) {
          logger.warn('Error validating URL:', error);
          // Fallback validation
          const url = node.url.toLowerCase();
          isValid = !url.startsWith('chrome://') && 
                   !url.startsWith('chrome-extension://') && 
                   !url.startsWith('about:');
        }
        
        if (!isValid) {
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
        bookmarks = bookmarks.concat(this.flattenBookmarks(logger, node.children, currentPath));
      }
    }
    
    return bookmarks;
  },
  
  /**
   * Populate folder dropdown for filtering
   * @param {LogManager} logger - Logger instance
   */
  populateBookmarkFolders(logger) {
    logger.debug('Populating bookmark folders filter');
    
    const folderFilter = document.getElementById('bookmarks-folder-filter');
    
    if (!folderFilter) {
      logger.error('bookmarks-folder-filter element not found');
      return;
    }
    
    folderFilter.innerHTML = '<option value="all">All Folders</option>';
    
    // Get unique folders
    const folders = [...new Set(this._bookmarks.map(b => b.path))].filter(path => path);
    
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
      const searchHandler = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const selectedFolder = folderFilter.value;
        this.filterBookmarks(logger, searchTerm, selectedFolder);
      };
      
      searchInput.addEventListener('input', searchHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: searchInput,
        type: 'input',
        listener: searchHandler
      });
    }
    
    const folderChangeHandler = () => {
      const selectedFolder = folderFilter.value;
      const searchTerm = document.getElementById('bookmarks-search')?.value.toLowerCase() || '';
      this.filterBookmarks(logger, searchTerm, selectedFolder);
    };
    
    folderFilter.addEventListener('change', folderChangeHandler);
    
    // Track this listener for cleanup
    this._eventListeners.push({
      element: folderFilter,
      type: 'change',
      listener: folderChangeHandler
    });
    
    logger.debug(`Added ${folders.length} folders to filter dropdown`);
  },
  
  /**
   * Display bookmarks in the list
   * @param {LogManager} logger - Logger instance
   */
  displayBookmarks(logger) {
    logger.debug(`Displaying ${this._bookmarks.length} bookmarks`);
    
    const bookmarksList = document.getElementById('bookmarks-list');
    
    if (!bookmarksList) {
      logger.error('bookmarks-list element not found');
      return;
    }
    
    bookmarksList.innerHTML = '';
    
    this._bookmarks.forEach(bookmark => {
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
      
      // Get truncate function from formatting utilities
      let truncatedUrl = bookmark.url;
      try {
        const formatting = this.getService(logger, 'formatting', {
          truncateText: (text, maxLength) => {
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
          }
        });
        
        truncatedUrl = formatting.truncateText(bookmark.url, 50);
      } catch (error) {
        logger.warn('Error truncating URL:', error);
        truncatedUrl = bookmark.url.length > 50 ? bookmark.url.substring(0, 50) + '...' : bookmark.url;
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
          <div class="item-url">${truncatedUrl}</div>
        </div>
        <div class="item-meta">
          <span class="item-folder">${bookmark.path || 'Root'}</span>
          <span class="item-date">${this.formatDate(logger, bookmark.dateAdded)}</span>
        </div>
      `;
      
      bookmarksList.appendChild(bookmarkItem);
    });
  },
  
  /**
   * Format date for display
   * @param {LogManager} logger - Logger instance
   * @param {number} timestamp - Timestamp to format
   * @returns {string} Formatted date string
   */
  formatDate(logger, timestamp) {
    if (!timestamp) return 'Unknown';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch (error) {
      logger.warn('Error formatting date:', error);
      return 'Unknown';
    }
  },
  
  /**
   * Filter bookmarks based on search term and folder
   * @param {LogManager} logger - Logger instance
   * @param {string} searchTerm - Search term to filter by
   * @param {string} folder - Folder to filter by
   */
  filterBookmarks(logger, searchTerm, folder) {
    logger.debug(`Filtering bookmarks with search: "${searchTerm}", folder: "${folder}"`);
    
    const bookmarksList = document.getElementById('bookmarks-list');
    
    if (!bookmarksList) {
      logger.error('bookmarks-list element not found');
      return;
    }
    
    bookmarksList.innerHTML = '';
    
    const filteredBookmarks = this._bookmarks.filter(bookmark => {
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
    
    this.displayBookmarks(logger);
    logger.debug(`Filtered to ${filteredBookmarks.length} bookmarks`);
  },
  
  /**
   * Set up selection controls (Select All/Deselect All)
   * @param {LogManager} logger - Logger instance
   */
  setupSelectionControls(logger) {
    logger.debug('Setting up bookmark selection controls');
    
    const selectAllBtn = document.getElementById('select-all-bookmarks');
    const deselectAllBtn = document.getElementById('deselect-all-bookmarks');
    
    if (!selectAllBtn || !deselectAllBtn) {
      logger.error('Selection control buttons not found');
      return;
    }
    
    const selectAllHandler = () => {
      const checkboxes = document.querySelectorAll('#bookmarks-list .item-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
      logger.debug(`Selected all ${checkboxes.length} bookmarks`);
    };
    
    const deselectAllHandler = () => {
      const checkboxes = document.querySelectorAll('#bookmarks-list .item-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
      logger.debug('Deselected all bookmarks');
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
   * Get selected bookmarks from the UI
   * @returns {Array} Array of selected bookmark objects
   */
  getSelectedBookmarks() {
    const logger = new LogManager({
      context: 'bookmarks-capture',
      isBackgroundScript: false
    });
    
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
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'bookmarks-capture',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Bookmarks capture not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up bookmarks capture resources');
    
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
    this._bookmarks = [];
    this.initialized = false;
    
    logger.debug('Bookmarks capture cleanup completed');
  }
};

// Export using named export
export { BookmarksCapture };