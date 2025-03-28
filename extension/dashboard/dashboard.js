// Import dependencies
import * as d3 from 'd3';

import { loadSettings, saveSettings } from '../shared/utils/settings.js';
import { fetchAPI } from '../shared/utils/api.js';
import { captureUrl } from '../shared/utils/capture.js';
import { BrowserContext, TabTypeToContext, BrowserContextLabels } from '../shared/constants.js';

let captureInitialized = false;
let knowledgeInitialized = false;
let assistantInitialized = false;
let navigationInitialized = false;
let tabsFilterInitialized = false;
let statusMonitoringInitialized = false;

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}


// Create debounced versions of functions
const debouncedSearchKnowledge = debounce(searchKnowledge, 300);
const debouncedFilterTabs = debounce(filterTabs, 200);
const debouncedFilterBookmarks = debounce(filterBookmarks, 200);
const debouncedFilterHistory = debounce(filterHistory, 200);

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard loaded');
   
  // Initialize navigation
  initNavigation();
  initTabs();
  
  // Load dashboard data
  await loadDashboardData();
  
  
  // Setup status monitoring
  setupStatusMonitoring();
});


function initNavigation() {
  if (navigationInitialized) {
    console.log('Navigation already initialized, skipping');
    return;
  }
  
  console.log('Initializing navigation');
  navigationInitialized = true;

  console.log('Initializing navigation');
  const navItems = document.querySelectorAll('.nav-item');
  const contentPanels = document.querySelectorAll('.content-panel');
  
  console.log('Found nav items:', navItems.length);
  console.log('Found content panels:', contentPanels.length);
  
  navItems.forEach(item => {
    console.log('Setting up click handler for nav item:', item.getAttribute('data-panel'));
    
    item.addEventListener('click', () => {
      console.log('Nav item clicked:', item.getAttribute('data-panel'));
      const targetPanel = item.getAttribute('data-panel');
      
      // Update navigation highlighting
      navItems.forEach(navItem => navItem.classList.remove('active'));
      item.classList.add('active');
      
      // Show corresponding panel
      contentPanels.forEach(panel => {
        if (panel.id === `${targetPanel}-panel`) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
      
      // Initialize panel if needed
      if (targetPanel === 'capture') {
        initCapturePanel();
      } else if (targetPanel === 'knowledge') {
        initKnowledgePanel();
        initKnowledgeGraph();
      } else if (targetPanel === 'assistant') {
        initAssistantPanel();
      }
    });
  });
}

// Add initialization function for capture panel
function initCapturePanel() {
  if (captureInitialized) {
    console.log('Capture panel already initialized, skipping');
    return;
  }
  console.log('Initializing capture panel');
  captureInitialized = true;

  // Set up tab loading
  document.querySelector('[data-tab="tabs"]').addEventListener('click', loadOpenTabs);
  document.querySelector('[data-tab="bookmarks"]').addEventListener('click', loadBookmarks);
  document.querySelector('[data-tab="history"]').addEventListener('click', loadHistory);
  
  // Set up batch capture
  document.getElementById('capture-selected').addEventListener('click', captureSelectedItems);
  
  // Load tabs by default (if active)
  const activeTab = document.querySelector('.tab-pane.active');
  if (activeTab) {
    const tabType = activeTab.id.split('-')[0];
    if (tabType === 'tabs') {
      loadOpenTabs();
    } else if (tabType === 'bookmarks') {
      loadBookmarks();
    } else if (tabType === 'history') {
      loadHistory();
    }
  } else {
    // Default to tabs if nothing is active
    document.querySelector('[data-tab="tabs"]').click();
  }
}

// Tabs within panels (e.g., Capture panel)
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Update tab highlighting
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Show corresponding tab content
      tabPanes.forEach(pane => {
        if (pane.id === `${targetTab}-content`) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });
}

// Load initial dashboard data
async function loadDashboardData() {
  try {
    // Show loading state
    document.getElementById('recent-captures-list').innerHTML = '<div class="loading-indicator">Loading data...</div>';
    
    // Fetch data from storage
    const storage = await chrome.storage.local.get(['captureHistory', 'stats']);
    const captureHistory = storage.captureHistory || [];
    
    // Default stats from storage or use zeros
    let stats = storage.stats || { captures: captureHistory.length, relationships: 0, queries: 0 };
    
    // Update stats
    document.getElementById('captured-count').textContent = stats.captures;
    document.getElementById('relationship-count').textContent = stats.relationships;
    document.getElementById('query-count').textContent = stats.queries;
    
    // Update recent captures
    updateRecentCaptures(captureHistory);
    
    // Try to fetch updated stats from API (but handle missing endpoint)
    try {
      const apiStats = await fetchAPI('/api/v1/stats');
      if (apiStats.success) {
        // Update with latest data from server
        document.getElementById('captured-count').textContent = apiStats.data.captures;
        document.getElementById('relationship-count').textContent = apiStats.data.relationships;
        document.getElementById('query-count').textContent = apiStats.data.queries;
        
        // Save to storage
        chrome.storage.local.set({ 
          stats: {
            captures: apiStats.data.captures,
            relationships: apiStats.data.relationships,
            queries: apiStats.data.queries
          }
        });
      }
    } catch (error) {
      console.log('Stats endpoint not available, using local data');
      // Continue with local data
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Update recent captures list
function updateRecentCaptures(captures) {
  const capturesList = document.getElementById('recent-captures-list');
  
  if (captures.length === 0) {
    capturesList.innerHTML = '<div class="empty-state">No recent captures</div>';
    return;
  }
  
  capturesList.innerHTML = '';
  
  // Show most recent 5 captures
  captures.slice(0, 5).forEach(capture => {
    const captureItem = document.createElement('li');
    captureItem.className = 'capture-item';
    
    const date = new Date(capture.timestamp);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    captureItem.innerHTML = `
      <div class="capture-title">${truncateText(capture.title, 50)}</div>
      <div class="capture-meta">
        <span class="capture-url">${truncateText(capture.url, 30)}</span>
        <span class="capture-time">${formattedDate}</span>
      </div>
    `;
    
    capturesList.appendChild(captureItem);
  });
}


// Load open tabs
async function loadOpenTabs() {
  const tabsList = document.getElementById('tabs-list');
  tabsList.innerHTML = '<div class="loading-indicator">Loading tabs...</div>';
  
  try {
    // Get all windows with tabs
    const windows = await chrome.windows.getAll({ populate: true });
    
    if (windows.length === 0) {
      tabsList.innerHTML = '<div class="empty-state">No open tabs found</div>';
      return;
    }
    
    // Populate window filter
    const windowFilter = document.getElementById('tabs-window-filter');
    windowFilter.innerHTML = '<option value="all">All Windows</option>';
    
    windows.forEach(window => {
      const option = document.createElement('option');
      option.value = window.id;
      option.textContent = `Window ${window.id} (${window.tabs.length} tabs)`;
      windowFilter.appendChild(option);
    });
    
    // Create tab list
    tabsList.innerHTML = '';
    
    // Flatten all tabs from all windows
    const allTabs = windows.flatMap(window => 
      window.tabs.map(tab => ({ ...tab, windowTitle: `Window ${window.id}` }))
    );
    
    // Filter and display tabs
    const filteredTabs = allTabs.filter(shouldShowTab);
    
    for (const tab of filteredTabs) {
      const tabItem = createTabListItem(tab);
      tabsList.appendChild(tabItem);
    }
    
    // Add filter functionality
    setupTabsFilter(filteredTabs);
    
    // Add selection controls
    setupSelectionControls('tabs');
  } catch (error) {
    console.error('Error loading tabs:', error);
    tabsList.innerHTML = `<div class="error-state">Error loading tabs: ${error.message}</div>`;
  }
}

// Add a function to extract content from a tab

async function extractTabContent(tabId) {
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
    
    return results[0].result;
  } catch (error) {
    console.error(`Error extracting content from tab ${tabId}:`, error);
    // Return minimal data if extraction fails
    return {
      content: "",
      title: "",
      metadata: {}
    };
  }
}

// Filter tabs that should be shown (e.g., skip chrome:// URLs)
function shouldShowTab(tab) {
  // Skip chrome internal pages
  if (tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')) {
    return false;
  }
  
  return true;
}

// Create a list item for a tab
function createTabListItem(tab) {
  const item = document.createElement('div');
  item.className = 'list-item tab-item';
  item.setAttribute('data-id', tab.id);
  item.setAttribute('data-url', tab.url);
  
  const favicon = tab.favIconUrl || '../icons/icon16.png';
  
  item.innerHTML = `
    <div class="item-selector">
      <input type="checkbox" id="tab-${tab.id}" class="item-checkbox">
    </div>
    <div class="item-icon">
      <img src="${favicon}" alt="" class="favicon">
    </div>
    <div class="item-content">
      <div class="item-title">${tab.title || 'Untitled'}</div>
      <div class="item-url">${truncateText(tab.url, 50)}</div>
    </div>
    <div class="item-meta">
      <span class="item-window">${tab.windowTitle}</span>
      ${tab.active ? '<span class="item-active">Active</span>' : ''}
    </div>
  `;
  
  return item;
}

// Set up filtering for tabs
function setupTabsFilter(allTabs) {
  if (tabsFilterInitialized) {
    console.log('Tabs filter already initialized, updating tabs only');
    // Just update the tabs data without adding new event listeners
    const searchInput = document.getElementById('tabs-search');
    const windowFilter = document.getElementById('tabs-window-filter');
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    filterTabs(allTabs, searchTerm, windowId);
    return;
  }
  
  console.log('Initializing tabs filter');
  tabsFilterInitialized = true;
  
  const searchInput = document.getElementById('tabs-search');
  const windowFilter = document.getElementById('tabs-window-filter');
  
  // Search functionality
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    debouncedFilterTabs(allTabs, searchTerm, windowId);
  });
  
  windowFilter.addEventListener('change', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    debouncedFilterTabs(allTabs, searchTerm, windowId);
  });
}


// Filter tabs based on search term and window
function filterTabs(allTabs, searchTerm, windowId) {
  const tabsList = document.getElementById('tabs-list');
  tabsList.innerHTML = '';
  
  const filteredTabs = allTabs.filter(tab => {
    // Apply window filter
    if (windowId !== null && tab.windowId !== windowId) {
      return false;
    }
    
    // Apply search filter
    if (searchTerm && !tab.title.toLowerCase().includes(searchTerm) && 
        !tab.url.toLowerCase().includes(searchTerm)) {
      return false;
    }
    
    return shouldShowTab(tab);
  });
  
  if (filteredTabs.length === 0) {
    tabsList.innerHTML = '<div class="empty-state">No matching tabs found</div>';
    return;
  }
  
  filteredTabs.forEach(tab => {
    const tabItem = createTabListItem(tab);
    tabsList.appendChild(tabItem);
  });
}

// Setup selection controls (Select All/Deselect All)
function setupSelectionControls(type) {
  const selectAllBtn = document.getElementById(`select-all-${type}`);
  const deselectAllBtn = document.getElementById(`deselect-all-${type}`);
  
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  });
  
  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  });
}


async function loadBookmarks() {
  const bookmarksList = document.getElementById('bookmarks-list');
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
    setupSelectionControls('bookmarks');
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    bookmarksList.innerHTML = `<div class="error-state">Error loading bookmarks: ${error.message}</div>`;
  }
}

// Helper function to flatten bookmark tree into array
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

// Populate folder dropdown for filtering
function populateBookmarkFolders(bookmarks) {
  const folderFilter = document.getElementById('bookmarks-folder-filter');
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
  document.getElementById('bookmarks-search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const selectedFolder = folderFilter.value;
    
    debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
  });
  
  folderFilter.addEventListener('change', () => {
    const selectedFolder = folderFilter.value;
    const searchTerm = document.getElementById('bookmarks-search').value.toLowerCase();
    
    debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
  });
}

// Display bookmarks in the list
function displayBookmarks(bookmarks) {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '';
  
  bookmarks.forEach(bookmark => {
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'list-item bookmark-item';
    bookmarkItem.setAttribute('data-id', bookmark.id);
    bookmarkItem.setAttribute('data-url', bookmark.url);
    
    // Try to get favicon
    const faviconUrl = new URL(bookmark.url);
    const favicon = `https://www.google.com/s2/favicons?domain=${faviconUrl.hostname}`;
    
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

// Filter bookmarks based on search term and folder
function filterBookmarks(allBookmarks, searchTerm, folder) {
  const bookmarksList = document.getElementById('bookmarks-list');
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
  
  filteredBookmarks.forEach(bookmark => {
    // Create bookmark item (same as in displayBookmarks)
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'list-item bookmark-item';
    // ... rest of the item creation code
    bookmarksList.appendChild(bookmarkItem);
  });
}

// Helper function to format date
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}


async function loadHistory() {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '<div class="loading-indicator">Loading history...</div>';
  
  try {
    // Get time filter value
    const timeFilter = document.getElementById('history-time-filter').value;
    const startTime = getStartTimeFromFilter(timeFilter);
    
    // Query browser history
    const historyItems = await chrome.history.search({
      text: '',  // Empty string to get all history
      startTime: startTime,
      maxResults: 1000
    });
    
    if (historyItems.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No history items found</div>';
      return;
    }
    
    // Display history items
    displayHistoryItems(historyItems);
    
    // Set up time filter change handler
    document.getElementById('history-time-filter').addEventListener('change', () => {
      loadHistory();
    });
    
    // Set up search handler
    document.getElementById('history-search').addEventListener('input', (e) => {
      debouncedFilterHistory(historyItems, e.target.value.toLowerCase());
    });
    
    // Set up selection controls
    setupSelectionControls('history');
  } catch (error) {
    console.error('Error loading history:', error);
    historyList.innerHTML = `<div class="error-state">Error loading history: ${error.message}</div>`;
  }
}

// Get start time based on filter
function getStartTimeFromFilter(filter) {
  const now = new Date();
  
  switch (filter) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime();
      
    case 'yesterday':
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      return yesterday.getTime();
      
    case 'week':
      const week = new Date();
      week.setDate(week.getDate() - 7);
      return week.getTime();
      
    case 'month':
      const month = new Date();
      month.setDate(month.getDate() - 30);
      return month.getTime();
      
    default:
      return 0; // All history
  }
}

// Display history items
function displayHistoryItems(items) {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';
  
  // Group by domain
  const groupedItems = groupHistoryByDomain(items);
  
  // Create UI for grouped items
  Object.entries(groupedItems).forEach(([domain, domainItems]) => {
    // Create domain group header
    const domainHeader = document.createElement('div');
    domainHeader.className = 'domain-header';
    
    // Try to get favicon
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}`;
    
    domainHeader.innerHTML = `
      <div class="domain-selector">
        <input type="checkbox" id="domain-${domain}" class="domain-checkbox">
      </div>
      <div class="domain-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="domain-name">${domain}</div>
      <div class="domain-count">${domainItems.length} items</div>
      <div class="domain-toggle">▼</div>
    `;
    
    historyList.appendChild(domainHeader);
    
    // Create container for domain items
    const domainContainer = document.createElement('div');
    domainContainer.className = 'domain-items';
    
    // Add domain items
    domainItems.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'list-item history-item';
      historyItem.setAttribute('data-id', item.id);
      historyItem.setAttribute('data-url', item.url);
      
      historyItem.innerHTML = `
        <div class="item-selector">
          <input type="checkbox" id="history-${item.id}" class="item-checkbox">
        </div>
        <div class="item-content">
          <div class="item-title">${item.title || 'Untitled'}</div>
          <div class="item-url">${truncateText(item.url, 50)}</div>
        </div>
        <div class="item-meta">
          <span class="item-date">${formatDate(item.lastVisitTime)}</span>
          <span class="item-visits">${item.visitCount} visits</span>
        </div>
      `;
      
      domainContainer.appendChild(historyItem);
    });
    
    historyList.appendChild(domainContainer);
    
    // Set up domain checkbox to select/deselect all items
    domainHeader.querySelector('.domain-checkbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      domainContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
      });
    });
    
    // Set up toggle to expand/collapse domain items
    domainHeader.querySelector('.domain-toggle').addEventListener('click', () => {
      domainContainer.style.display = domainContainer.style.display === 'none' ? 'block' : 'none';
      domainHeader.querySelector('.domain-toggle').textContent = 
        domainContainer.style.display === 'none' ? '▶' : '▼';
    });
  });
}

// Group history items by domain
function groupHistoryByDomain(items) {
  const grouped = {};
  
  items.forEach(item => {
    try {
      const url = new URL(item.url);
      const domain = url.hostname;
      
      if (!grouped[domain]) {
        grouped[domain] = [];
      }
      
      grouped[domain].push(item);
    } catch (error) {
      // Skip invalid URLs
      console.warn('Invalid URL in history:', item.url);
    }
  });
  
  // Sort each domain's items by lastVisitTime (most recent first)
  Object.values(grouped).forEach(domainItems => {
    domainItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  });
  
  return grouped;
}

// Filter history items based on search term
function filterHistory(allItems, searchTerm) {
  if (!searchTerm) {
    displayHistoryItems(allItems);
    return;
  }
  
  const filteredItems = allItems.filter(item => 
    item.title?.toLowerCase().includes(searchTerm) || 
    item.url.toLowerCase().includes(searchTerm)
  );
  
  displayHistoryItems(filteredItems);
}

async function captureSelectedItems() {
  // Get active tab panel
  const activeTabPane = document.querySelector('.capture-tab-content .tab-pane.active');
  if (!activeTabPane) {
    alert('No capture tab is active');
    return;
  }
  const type = activeTabPane.id.split('-')[0]; // tabs, bookmarks, or history
  
  // Get selected items
  const selectedCheckboxes = activeTabPane.querySelectorAll('.item-checkbox:checked');
  
  if (selectedCheckboxes.length === 0) {
    alert('Please select at least one item to capture');
    return;
  }
  
  // Gather selected items
  const selectedItems = Array.from(selectedCheckboxes).map(checkbox => {
    const item = checkbox.closest('.list-item');
    return {
      id: item.getAttribute('data-id'),
      url: item.getAttribute('data-url'),
      title: item.querySelector('.item-title')?.textContent || 'Untitled',
      type: type,  // tabs, bookmarks, or history
      context: getContextForType(type)
    };
  });
  
  // Show capturing status
  const captureBtn = document.getElementById('capture-selected');
  const originalText = captureBtn.textContent;
  captureBtn.textContent = `Capturing ${selectedItems.length} items...`;
  captureBtn.disabled = true;
  
  try {
    console.log(`Starting capture of ${selectedItems.length} items`, selectedItems);
    
    // Determine context based on source type
    const contextType = TabTypeToContext[type] || BrowserContext.ACTIVE_TAB;
    
    // Track results for all captures
    const captureResults = [];
    const failedItems = [];
    
    // Process items one by one
    for (const item of selectedItems) {
      try {
        let content = "";
        let extractedTitle = item.title;
        let metadata = {};
        
        // Extract content for tabs if needed
        if (type === 'tabs') {
          const tabId = parseInt(item.id);
          try {
            const extractedData = await extractTabContent(tabId);
            content = extractedData.content || "";
            extractedTitle = extractedData.title || item.title;
            metadata = extractedData.metadata || {};
            
            console.log(`Extracted content from tab ${tabId}:`, {
              title: extractedData.title,
              contentLength: extractedData.content?.length || 0,
              hasMetadata: !!extractedData.metadata
            });
          } catch (extractError) {
            console.error(`Error extracting content for tab ${tabId}:`, extractError);
          }
        }
        
        // Use the captureUrl utility for each item
        const captureOptions = {
          context: contextType,
          title: extractedTitle,
          content: content,
          metadata: metadata
        };
        
        // Add source-specific fields
        if (type === 'tabs') {
          captureOptions.tabId = item.id.toString();
          captureOptions.windowId = "1";
        } else if (type === 'bookmarks') {
          captureOptions.bookmarkId = item.id.toString();
        }
        
        // Capture the URL using the shared utility
        const response = await captureUrl(item.url, captureOptions);
        
        // Track result
        if (response.success) {
          captureResults.push({
            url: item.url,
            success: true,
            data: response.data
          });
        } else {
          failedItems.push(item);
          captureResults.push({
            url: item.url,
            success: false,
            error: response.error
          });
        }
        
        // Small delay to prevent overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (itemError) {
        console.error(`Error capturing ${item.url}:`, itemError);
        failedItems.push(item);
        captureResults.push({
          url: item.url,
          success: false,
          error: itemError.message
        });
      }
    }
    
    // Check if we have any successful captures
    const successCount = captureResults.filter(r => r.success).length;
    console.log(`Capture results: ${successCount} successful, ${failedItems.length} failed`);
    
    if (successCount > 0) {
      console.log("Some captures successful, updating history and stats");
      
      // Update capture history
      const captureHistory = (await chrome.storage.local.get('captureHistory')).captureHistory || [];
      
      // Add new captures to history
      const newCaptures = captureResults
        .filter(result => result.success)
        .map(result => ({
          url: result.url,
          title: selectedItems.find(item => item.url === result.url)?.title || 'Untitled',
          timestamp: Date.now(),
          status: 'captured'
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
      stats.captures += successCount;
      await chrome.storage.local.set({ stats });
      
      // Show success or partial success message
      if (failedItems.length === 0) {
        captureBtn.textContent = 'Capture Successful!';
      } else {
        captureBtn.textContent = `${successCount}/${selectedItems.length} Captured`;
      }
      
      // Dispatch success event
      const captureSuccessEvent = new CustomEvent('marvin:capture-success', { 
        detail: { 
          items: captureResults.filter(r => r.success).map(r => r.url), 
          count: successCount 
        } 
      });
      document.dispatchEvent(captureSuccessEvent);
    } else {
      // All captures failed
      throw new Error(`All ${selectedItems.length} captures failed`);
    }
    
    // Reset button after delay
    setTimeout(() => {
      captureBtn.textContent = originalText;
      captureBtn.disabled = false;
      
      // Uncheck all items
      selectedCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
      
      // Refresh dashboard data
      loadDashboardData();
    }, 2000);
  } catch (error) {
    console.error('Error capturing items:', error);
    captureBtn.textContent = 'Capture Failed';
    
    // Dispatch error event
    const captureErrorEvent = new CustomEvent('marvin:capture-error', { 
      detail: { 
        error: error.message, 
        items: selectedItems 
      } 
    });
    document.dispatchEvent(captureErrorEvent);
    
    setTimeout(() => {
      captureBtn.textContent = originalText;
      captureBtn.disabled = false;
    }, 2000);
    
    alert(`Error capturing items: ${error.message}`);
  }
}

function getContextForType(type) {
  // Map item types to context types
  const contextMap = {
    'tabs': 'ACTIVE_TAB',
    'bookmarks': 'BOOKMARK',
    'history': 'HISTORY'
  };
  
  return contextMap[type] || 'ACTIVE_TAB';
}

// Initialize knowledge panel
async function initKnowledgePanel() {
  if (knowledgeInitialized) {
    console.log('Knowledge panel already initialized, skipping');
    return;
  }
  
  console.log('Initializing knowledge panel');
  knowledgeInitialized = true;

  try {
    // Load initial knowledge data
    await debouncedLoadKnowledgeData();
    
    // Knowledge panel search
    document.getElementById('knowledge-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        debouncedSearchKnowledge(e.target.value);
      }
    });
    
    document.getElementById('search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('knowledge-search').value;
      debouncedSearchKnowledge(searchTerm);
    });
    
    // Set up filter handlers
    setupKnowledgeFilters();
  } catch (error) {
    console.error('Error initializing knowledge panel:', error);
    document.querySelector('.knowledge-list').innerHTML = 
      `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
  }
}


async function loadKnowledgeData() {
  const knowledgeList = document.querySelector('.knowledge-list');
  knowledgeList.innerHTML = '<div class="loading-indicator">Loading knowledge items...</div>';
  
  try {
    // First try to get data from the API
    const response = await fetchAPI('/api/v1/pages/');
    
    if (response.success) {
      displayKnowledgeItems(response.data.pages);
    } else {
      // If API fails, show fallback message and use captured history instead
      console.error('API error:', response.error);
      
      // Load capture history from storage as fallback
      const data = await chrome.storage.local.get('captureHistory');
      const captureHistory = data.captureHistory || [];
      
      if (captureHistory.length > 0) {
        knowledgeList.innerHTML = `
          <div class="error-note">
            Could not load data from API server.
            Showing locally captured pages instead.
          </div>
        `;
        
        // Convert capture history to a format similar to API response
        const fallbackItems = captureHistory.map(item => ({
          id: item.url, // Use URL as ID
          url: item.url,
          title: item.title,
          domain: new URL(item.url).hostname,
          discovered_at: item.timestamp,
          browser_contexts: [BrowserContext.ACTIVE_TAB],
          keywords: {},
          relationships: []
        }));
        
        displayKnowledgeItems(fallbackItems);
      } else {
        knowledgeList.innerHTML = `
          <div class="error-state">
            Could not load knowledge data from API.
            <br>
            Error: ${response.error?.message || 'Unknown error'}
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading knowledge data:', error);
    
    // Show fallback UI and error message
    knowledgeList.innerHTML = `
      <div class="error-state">
        Error loading knowledge data:
        <br>
        ${error.message}
        <br><br>
        <button id="retry-load-btn" class="btn-secondary">Retry</button>
      </div>
    `;
    
    // Add retry button functionality
    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      loadKnowledgeData();
    });
  }
}

// For async loadKnowledgeData
const debouncedLoadKnowledgeData = (() => {
  let timeout;
  let pendingPromise = null;
  
  return function() {
    if (pendingPromise) return pendingPromise;
    
    clearTimeout(timeout);
    
    pendingPromise = new Promise(resolve => {
      timeout = setTimeout(async () => {
        try {
          const result = await loadKnowledgeData();
          resolve(result);
        } catch (error) {
          console.error('Error in debounced loadKnowledgeData:', error);
          resolve(null);
        } finally {
          pendingPromise = null;
        }
      }, 500);
    });
    
    return pendingPromise;
  };
})();



function displayKnowledgeItems(items) {
  const knowledgeList = document.querySelector('.knowledge-list');
  
  if (!items || items.length === 0) {
    knowledgeList.innerHTML = '<div class="empty-state">No knowledge items found</div>';
    return;
  }
  
  knowledgeList.innerHTML = '';
  
  items.forEach(item => {
    const knowledgeItem = document.createElement('div');
    knowledgeItem.className = 'knowledge-item';
    knowledgeItem.setAttribute('data-id', item.id);
    knowledgeItem.setAttribute('data-url', item.url);
    
    // Try to determine favicon
    let favicon = '';
    try {
      const urlObj = new URL(item.url);
      favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}`;
    } catch (e) {
      // Use default if URL parsing fails
      favicon = '../icons/icon16.png';
    }
    
    // Format date
    const discoveredDate = new Date(item.discovered_at);
    const dateStr = discoveredDate.toLocaleDateString();
    
    knowledgeItem.innerHTML = `
      <div class="item-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="item-content">
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-url">${truncateText(item.url, 50)}</div>
        <div class="item-meta">
          <span class="item-date">Captured: ${dateStr}</span>
          <span class="item-source">${formatContext(item.browser_contexts)}</span>
        </div>
        ${item.keywords && Object.keys(item.keywords).length > 0 
          ? `<div class="item-keywords">
              ${Object.entries(item.keywords).slice(0, 5).map(([keyword, score]) => 
                `<span class="keyword">${keyword}</span>`
              ).join('')}
             </div>` 
          : ''}
      </div>
      <div class="item-actions">
        <button class="btn-action">View Details</button>
      </div>
    `;
    
    // Add click handler to show details
    knowledgeItem.querySelector('.btn-action').addEventListener('click', () => {
      showKnowledgeDetails(item);
    });
    
    knowledgeList.appendChild(knowledgeItem);
  });
}

function formatContext(contexts) {
  if (!contexts || contexts.length === 0) return '';
  
  function formatContext(contexts) {
    if (!contexts || contexts.length === 0) return '';
    
    return contexts.map(c => BrowserContextLabels[c] || c).join(', ');
  }
}

function setupKnowledgeFilters() {
  // Set up source filter checkboxes
  document.querySelectorAll('.knowledge-filters input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      applyKnowledgeFilters();
    });
  });
  
  // Set up date filters
  document.getElementById('date-from').addEventListener('change', applyKnowledgeFilters);
  document.getElementById('date-to').addEventListener('change', applyKnowledgeFilters);
}

function applyKnowledgeFilters() {
  // This will be implemented to filter the knowledge items based on selected filters
  // For now, just reload all data
  loadKnowledgeData();
}

async function searchKnowledge(searchTerm) {
  if (!searchTerm.trim()) {
    loadKnowledgeData();
    return;
  }
  
  const knowledgeList = document.querySelector('.knowledge-list');
  knowledgeList.innerHTML = '<div class="loading-indicator">Searching...</div>';
  
  try {
    // First try the search endpoint that should be there
    let response;
    try {
      response = await fetchAPI(`/api/v1/pages/?query=${encodeURIComponent(searchTerm)}`);
    } catch (error) {
      // If the first attempt fails, try a fallback approach
      // by getting all pages and filtering client-side
      console.log('Search endpoint error, falling back to all pages:', error);
      response = await fetchAPI('/api/v1/pages/');
      
      if (response.success && response.data && response.data.pages) {
        // Filter pages by the search term
        const filteredPages = response.data.pages.filter(page => 
          page.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          page.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
          Object.keys(page.keywords || {}).some(k => 
            k.toLowerCase().includes(searchTerm.toLowerCase())
          )
        );
        
        // Create a modified response with filtered pages
        response = {
          success: true,
          data: {
            ...response.data,
            pages: filteredPages
          }
        };
      }
    }
    
    if (response.success) {
      displayKnowledgeItems(response.data.pages || []);
    } else {
      throw new Error(response.error?.message || 'Search failed');
    }
  } catch (error) {
    console.error('Search error:', error);
    knowledgeList.innerHTML = `<div class="error-state">Search error: ${error.message}</div>`;
  }
}

function showKnowledgeDetails(item) {
  // Get the details sidebar
  const sidebar = document.getElementById('details-sidebar');
  
  // Update sidebar content
  const detailsContent = sidebar.querySelector('.details-content');
  
  // Format date
  const discoveredDate = new Date(item.discovered_at);
  const dateStr = discoveredDate.toLocaleDateString();
  
  // Create HTML content for details
  detailsContent.innerHTML = `
    <div class="details-item">
      <h3>${item.title || 'Untitled'}</h3>
      <div class="details-url">
        <a href="${item.url}" target="_blank">${item.url}</a>
      </div>
      
      <div class="details-section">
        <h4>Metadata</h4>
        <dl class="details-data">
          <dt>Captured</dt>
          <dd>${dateStr}</dd>
          
          <dt>Source</dt>
          <dd>${formatContext(item.browser_contexts)}</dd>
          
          <dt>Status</dt>
          <dd>${item.status}</dd>
          
          <dt>Domain</dt>
          <dd>${item.domain}</dd>
        </dl>
      </div>
      
      ${item.keywords && Object.keys(item.keywords).length > 0 
        ? `<div class="details-section">
            <h4>Keywords</h4>
            <div class="keyword-cloud">
              ${Object.entries(item.keywords).map(([keyword, score]) => 
                `<div class="keyword-tag" style="font-size: ${Math.min(100, score * 100) + 80}%">
                  ${keyword} <span class="keyword-score">${(score * 100).toFixed(0)}%</span>
                </div>`
              ).join('')}
            </div>
          </div>` 
        : ''}
      
      ${item.relationships && item.relationships.length > 0 
        ? `<div class="details-section">
            <h4>Relationships</h4>
            <ul class="relationship-list">
              ${item.relationships.map(rel => 
                `<li>
                  <span class="relationship-type">${rel.type}</span>
                  <a href="#" class="relationship-target" data-id="${rel.target_id}">
                    ${rel.target_id}
                  </a>
                </li>`
              ).join('')}
            </ul>
          </div>` 
        : ''}
      
      <div class="details-actions">
        <button class="btn-secondary" id="view-in-browser">Open in Browser</button>
        <button class="btn-secondary" id="recapture-page">Recapture</button>
      </div>
    </div>
  `;
  
  // Add event listeners
  detailsContent.querySelector('#view-in-browser').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });
  
  detailsContent.querySelector('#recapture-page').addEventListener('click', async () => {
    const button = detailsContent.querySelector('#recapture-page');
    button.disabled = true;
    button.textContent = 'Recapturing...';
    
    try {
      // Request recapture
      const pageData = {
        url: item.url,
        title: item.title,
        context: item.browser_contexts[0] || 'active_tab',
        browser_contexts: item.browser_contexts
      };
      
      const response = await fetchAPI('/api/v1/pages/', {
        method: 'POST',
        body: JSON.stringify(pageData)
      });

      if (response.success) {
        button.textContent = 'Recaptured!';
        
        // Reload knowledge data to show updated information
        setTimeout(() => {
          loadKnowledgeData();
          button.disabled = false;
          button.textContent = 'Recapture';
        }, 2000);
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Recapture error:', error);
      button.textContent = 'Recapture Failed';
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Recapture';
      }, 2000);
    }
  });
  
  // Set up relationship item clicks to load related items
  detailsContent.querySelectorAll('.relationship-target').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-id');
      loadRelatedItem(targetId);
    });
  });
  
  // Display the sidebar
  sidebar.classList.add('active');
  
  // Set up close button
  sidebar.querySelector('.close-details-btn').addEventListener('click', () => {
    sidebar.classList.remove('active');
  });
}

async function loadRelatedItem(itemId) {
  try {
    // Request item details
    const response = await fetchAPI(`/api/v1/pages/${itemId}`);
    
    if (response.success) {
      showKnowledgeDetails(response.data);
    } else {
      throw new Error(response.error?.message || 'Failed to load related item');
    }
  } catch (error) {
    console.error('Error loading related item:', error);
    alert(`Error loading related item: ${error.message}`);
  }
}

// Initialize assistant panel
function initAssistantPanel() {
  if (assistantInitialized) {
    console.log('Assistant panel already initialized, skipping');
    return;
  }
  
  console.log('Initializing assistant panel');
  assistantInitialized = true;

  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-message');
  const messagesContainer = document.getElementById('chat-messages');
  const contextButton = document.getElementById('context-selector-btn');
  const contextDropdown = document.getElementById('context-dropdown');
  
  // Toggle context dropdown
  contextButton.addEventListener('click', () => {
    contextDropdown.classList.toggle('active');
  });
  
  // Close context dropdown when clicking outside
  document.addEventListener('click', (event) => {
    if (!contextButton.contains(event.target) && !contextDropdown.contains(event.target)) {
      contextDropdown.classList.remove('active');
    }
  });
  
  // Updated sendMessage function in dashboard.js
  async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) return;
    
    // Add user message to chat
    addMessageToChat('user', messageText);
    
    // Clear input
    chatInput.value = '';
    
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'message assistant loading';
    loadingIndicator.innerHTML = '<div class="message-content"><p>Loading response...</p></div>';
    messagesContainer.appendChild(loadingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Get selected context
    const contextOptions = document.querySelectorAll('.context-options input:checked');
    const selectedContext = Array.from(contextOptions).map(option => option.id.replace('context-', ''));
    
    try {
      // Get relevant URLs based on selected context
      let relevantUrls = [];
      if (selectedContext.length > 0) {
        // If context items are selected, fetch relevant URLs
        try {
          const contextResponse = await fetchAPI('/api/v1/pages/?limit=5');
          if (contextResponse.success && contextResponse.data && contextResponse.data.pages) {
            relevantUrls = contextResponse.data.pages.map(page => page.url);
          }
        } catch (error) {
          console.error('Error fetching context URLs:', error);
        }
      }
      
      // Send query to agent API
      const agentResponse = await fetchAPI('/api/v1/agent/query', {
        method: 'POST',
        body: JSON.stringify({
          task_type: 'query',
          query: messageText,
          relevant_urls: relevantUrls
        })
      });
       
      // Remove loading indicator
      messagesContainer.removeChild(loadingIndicator);
      
      if (agentResponse.success && agentResponse.data && agentResponse.data.task_id) {
        // Start checking for completion
        const taskId = agentResponse.data.task_id;
        checkTaskStatus(taskId, messageText);
      } else {
        // Show error message
        const errorMessage = agentResponse.error?.message || 'Failed to send query to assistant';
        addMessageToChat('assistant', `Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error sending message to agent:', error);
      
      // Remove loading indicator
      messagesContainer.removeChild(loadingIndicator);
      
      // Show error message
      addMessageToChat('assistant', `Error: ${error.message || 'Failed to connect to assistant'}`);
    }
  }

  async function checkTaskStatus(taskId, originalQuery) {
    try {
      const statusResponse = await fetchAPI(`/api/v1/agent/status/${taskId}`);
      
      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data.status;
        
        if (status === 'completed') {
          // Task is complete, show response
          const result = statusResponse.data.result;
          
          // Format response with sources if available
          let responseText = result.response || 'No response received.';
          
          // Add sources if available
          if (result.sources && result.sources.length > 0) {
            responseText += '\n\nSources:';
            result.sources.forEach(source => {
              responseText += `\n- ${source.title || source.url}`;
            });
          }
          
          addMessageToChat('assistant', responseText);
        } else if (status === 'error') {
          // Show error message
          addMessageToChat('assistant', `Error: ${statusResponse.data.error || 'Assistant encountered an error'}`);
        } else if (status === 'processing' || status === 'enqueued') {
          // Still processing, check again after a delay
          setTimeout(() => checkTaskStatus(taskId, originalQuery), 2000);
        } else {
          // Unknown status
          addMessageToChat('assistant', `Unknown status: ${status}`);
        }
      } else {
        // Error checking status
        throw new Error(statusResponse.error?.message || 'Failed to check task status');
      }
    } catch (error) {
      console.error('Error checking task status:', error);
      addMessageToChat('assistant', `Error: ${error.message || 'Failed to get response from assistant'}`);
    }
  }
  
  // Add message to chat
  function addMessageToChat(type, text) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    messageElement.innerHTML = `
      <div class="message-content">
        <p>${text.replace(/\n/g, '<br>')}</p>
      </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Handle send button click
  sendButton.addEventListener('click', sendMessage);
  
  // Handle enter key
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

// Initialize settings panel
async function initSettingsPanel() {
  // Load current settings
  const settings = await loadSettings();
  
  // API config form
  const apiConfigForm = document.getElementById('api-config-form');
  document.getElementById('api-url').value = settings.apiUrl || 'http://localhost:8000';
  
  apiConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const apiUrl = document.getElementById('api-url').value;
    
    await saveSettings({ apiUrl });
    showSaveConfirmation(apiConfigForm);
  });
  
  // Capture settings form
  const captureSettingsForm = document.getElementById('capture-settings-form');
  document.getElementById('auto-capture').checked = settings.automaticCapture !== false;
  document.getElementById('min-time').value = settings.minTimeOnPage || 10;
  document.getElementById('excluded-domains').value = (settings.excludedDomains || []).join('\n');
  document.getElementById('included-domains').value = (settings.includedDomains || []).join('\n');
  
  captureSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const automaticCapture = document.getElementById('auto-capture').checked;
    const minTimeOnPage = parseInt(document.getElementById('min-time').value, 10);
    const excludedDomainsText = document.getElementById('excluded-domains').value;
    const includedDomainsText = document.getElementById('included-domains').value;
    
    // Parse domains, filtering empty lines
    const excludedDomains = excludedDomainsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
      
    const includedDomains = includedDomainsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    await saveSettings({
      automaticCapture,
      minTimeOnPage,
      excludedDomains,
      includedDomains
    });
    
    showSaveConfirmation(captureSettingsForm);
  });
  
  // Clear data button
  const clearDataBtn = document.getElementById('clear-data-btn');
  
  clearDataBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
      await chrome.storage.local.clear();
      
      // Reload page
      window.location.reload();
    }
  });
}

// Show save confirmation message
function showSaveConfirmation(form) {
  const confirmation = document.createElement('div');
  confirmation.className = 'save-confirmation';
  confirmation.textContent = 'Settings saved!';
  
  form.appendChild(confirmation);
  
  setTimeout(() => {
    confirmation.style.opacity = '0';
    setTimeout(() => {
      confirmation.remove();
    }, 300);
  }, 2000);
}

// Setup status monitoring
function setupStatusMonitoring() {
  if (statusMonitoringInitialized) {
    console.log('Status monitoring already initialized, skipping');
    return;
  }
  
  console.log('Initializing status monitoring');
  statusMonitoringInitialized = true;

  // Network status
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  function updateNetworkStatus() {
    if (navigator.onLine) {
      statusDot.classList.add('online');
      statusText.textContent = 'Online';
    } else {
      statusDot.classList.remove('online');
      statusText.textContent = 'Offline';
    }
    
    // Send status to service worker
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: navigator.onLine 
    });
  }
  
  // Check initial status
  updateNetworkStatus();
  
  // Listen for changes
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

// Utility: Truncate text with ellipsis
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

async function initKnowledgeGraph() {
  const graphContainer = document.querySelector('.graph-container');
  
  try {
    await debouncedLoadGraphData();
  } catch (error) {
    console.error('Error initializing knowledge graph:', error);
    graphContainer.innerHTML = `<div class="error-state">Error loading graph: ${error.message}</div>`;
  }
}




async function loadGraphData() {
  const graphContainer = document.querySelector('.graph-container');
  graphContainer.innerHTML = '<div class="loading-indicator">Loading graph data...</div>';
  
  try {
    // Try to get graph data from API
    const response = await fetchAPI('/api/v1/graph/overview');
    
    if (response.success) {
      renderGraph(response.data.nodes, response.data.edges);
    } else if (response.error?.error_code === 'NOT_FOUND') {
      // If endpoint doesn't exist, create a simple visualization from pages
      const pagesResponse = await fetchAPI('/api/v1/pages/');
      
      if (pagesResponse.success) {
        const pages = pagesResponse.data.pages || [];
        
        // Create simple graph data
        const nodes = pages.map(page => ({
          id: page.id,
          label: page.title || 'Untitled',
          url: page.url,
          type: 'page'
        }));
        
        // Create edges from relationships
        const edges = [];
        pages.forEach(page => {
          if (page.relationships && page.relationships.length > 0) {
            page.relationships.forEach(rel => {
              edges.push({
                source: page.id,
                target: rel.target_id,
                type: rel.type
              });
            });
          }
        });
        
        renderGraph(nodes, edges);
      } else {
        throw new Error('Failed to load pages for graph');
      }
    } else {
      throw new Error(response.error?.message || 'Failed to load graph data');
    }
  } catch (error) {
    console.error('Error loading graph data:', error);
    graphContainer.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
  }
}

// For async loadGraphData
const debouncedLoadGraphData = (() => {
  let timeout;
  let pendingPromise = null;
  
  return function() {
    if (pendingPromise) return pendingPromise;
    
    clearTimeout(timeout);
    
    pendingPromise = new Promise(resolve => {
      timeout = setTimeout(async () => {
        try {
          const result = await loadGraphData();
          resolve(result);
        } catch (error) {
          console.error('Error in debounced loadGraphData:', error);
          resolve(null);
        } finally {
          pendingPromise = null;
        }
      }, 500);
    });
    
    return pendingPromise;
  };
})();

function renderGraph(nodes, edges) {
  // Simple force-directed graph using D3.js
  const graphContainer = document.querySelector('.graph-container');
  const width = graphContainer.clientWidth;
  const height = graphContainer.clientHeight;
  
  // Clear container
  graphContainer.innerHTML = '';
  
  // Create SVG
  const svg = d3.select(graphContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  // Create force simulation
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2));
  
  // Create edges
  const link = svg.append('g')
    .selectAll('line')
    .data(edges)
    .enter()
    .append('line')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 2);
  
  // Create nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', 8)
    .attr('fill', d => {
      // Different colors for different node types
      const colorMap = {
        'page': '#4a6fa5',
        'site': '#6b8cae',
        'keyword': '#28a745'
      };
      return colorMap[d.type] || '#999';
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));
  
  // Add tooltips
  node.append('title')
    .text(d => d.label);
  
  // Update simulation on tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
  });
  
  // Add click handler to nodes
  node.on('click', (event, d) => {
    // Load and show details for the node
    if (d.type === 'page') {
      loadRelatedItem(d.id);
    }
  });
  
  // Drag functions
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  
  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}