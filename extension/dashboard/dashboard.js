// dashboard/dashboard.js

// Import dependencies
import { loadSettings, saveSettings } from '../shared/utils/settings.js';
import { fetchAPI } from '../shared/utils/api.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI and load data
  initNavigation();
  initTabs();
  await loadDashboardData();
  initCapturePanel();
  initKnowledgePanel();
  initAssistantPanel();
  initSettingsPanel();
  setupStatusMonitoring();
});

// Navigation between main panels
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const contentPanels = document.querySelectorAll('.content-panel');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
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
    });
  });
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

// Initialize capture panel functionality
async function initCapturePanel() {
  // Set up tab loading
  document.querySelector('[data-tab="tabs"]').addEventListener('click', loadOpenTabs);
  document.querySelector('[data-tab="bookmarks"]').addEventListener('click', loadBookmarks);
  document.querySelector('[data-tab="history"]').addEventListener('click', loadHistory);
  
  // Set up batch capture
  document.getElementById('capture-selected').addEventListener('click', captureSelectedItems);
  
  // Load tabs by default
  loadOpenTabs();
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
  const searchInput = document.getElementById('tabs-search');
  const windowFilter = document.getElementById('tabs-window-filter');
  
  // Search functionality
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    filterTabs(allTabs, searchTerm, windowId);
  });
  
  // Window filter
  windowFilter.addEventListener('change', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    filterTabs(allTabs, searchTerm, windowId);
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

// Load bookmarks (placeholder for now)
async function loadBookmarks() {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '<div class="loading-indicator">Loading bookmarks...</div>';
  
  // Implement bookmark loading
  // This will be similar to loadOpenTabs but with chrome.bookmarks.getTree()
  bookmarksList.innerHTML = '<div class="placeholder">Bookmark loading will be implemented in the next phase</div>';
}

// Load history (placeholder for now)
async function loadHistory() {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '<div class="loading-indicator">Loading history...</div>';
  
  // Implement history loading
  // This will use chrome.history.search()
  historyList.innerHTML = '<div class="placeholder">History loading will be implemented in the next phase</div>';
}

// Capture selected items
async function captureSelectedItems() {
  // Get active tab panel
  const activeTabPane = document.querySelector('.capture-tab-content .tab-pane.active');
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
      title: item.querySelector('.item-title')?.textContent || 'Untitled'
    };
  });
  
  // Show capturing status
  const captureBtn = document.getElementById('capture-selected');
  const originalText = captureBtn.textContent;
  captureBtn.textContent = `Capturing ${selectedItems.length} items...`;
  captureBtn.disabled = true;
  
  try {
    // Gather full content for each tab if possible
    const itemsWithContent = [];
    
    for (const item of selectedItems) {
      try {
        // Only extract content for tabs (not bookmarks or history yet)
        if (type === 'tabs') {
          const tabId = parseInt(item.id);
          const extractedData = await extractTabContent(tabId);
          
          itemsWithContent.push({
            ...item,
            content: extractedData.content || "",
            extractedTitle: extractedData.title || item.title,
            metadata: extractedData.metadata || {}
          });
        } else {
          // For other types, no content extraction yet
          itemsWithContent.push(item);
        }
      } catch (error) {
        console.error(`Error extracting content for ${item.url}:`, error);
        // Continue with minimal data
        itemsWithContent.push(item);
      }
      
      // Small delay to prevent overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    let response;
    
    if (itemsWithContent.length === 1) {
      // Use single page endpoint for single item
      const item = itemsWithContent[0];
      const pageData = {
        url: item.url,
        title: item.extractedTitle || item.title,
        content: item.content || "",
        context: "active_tab",
        tab_id: item.id.toString(),
        window_id: "1",
        browser_contexts: ["active_tab"]
      };
      
      console.log("Single page request payload (truncated):", {
        ...pageData,
        content: pageData.content ? `[${pageData.content.length} characters]` : ""
      });
      
      response = await fetchAPI('/api/v1/pages/', {
        method: 'POST',
        body: JSON.stringify(pageData)
      });
    } else {
      // Use batch endpoint for multiple items
      const batchRequest = {
        pages: itemsWithContent.map(item => ({
          url: item.url,
          title: item.extractedTitle || item.title,
          content: item.content || "",
          context: "active_tab",
          tab_id: item.id.toString(),
          window_id: "1",
          browser_contexts: ["active_tab"]
        }))
      };
      
      console.log("Batch request payload (truncated):", {
        pages: batchRequest.pages.map(p => ({
          ...p,
          content: p.content ? `[${p.content.length} characters]` : ""
        }))
      });
      
      response = await fetchAPI('/api/v1/pages/batch', {
        method: 'POST',
        body: JSON.stringify(batchRequest)
      });
    }
    
    console.log("Capture response:", response);
    
    if (response.success) {
      // Update capture history
      const captureHistory = (await chrome.storage.local.get('captureHistory')).captureHistory || [];
      
      // Add new captures to history
      const newCaptures = selectedItems.map(item => ({
        url: item.url,
        title: item.title,
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
      stats.captures += selectedItems.length;
      await chrome.storage.local.set({ stats });
      
      // Show success
      captureBtn.textContent = 'Capture Successful!';
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
    } else {
      throw new Error(response.error?.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error capturing items:', error);
    captureBtn.textContent = 'Capture Failed';
    setTimeout(() => {
      captureBtn.textContent = originalText;
      captureBtn.disabled = false;
    }, 2000);
    
    alert(`Error capturing items: ${error.message}`);
  }
}
// Initialize knowledge panel
function initKnowledgePanel() {
  // Placeholder for now
  document.querySelector('.knowledge-list').innerHTML = 
    '<div class="placeholder">Knowledge panel will be implemented in the next phase</div>';
}

// Initialize assistant panel
function initAssistantPanel() {
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
  
  // Send message
  function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) return;
    
    // Add user message to chat
    addMessageToChat('user', messageText);
    
    // Clear input
    chatInput.value = '';
    
    // Get selected context
    const contextOptions = document.querySelectorAll('.context-options input:checked');
    const selectedContext = Array.from(contextOptions).map(option => option.id.replace('context-', ''));
    
    // Simulate assistant response
    setTimeout(() => {
      const response = `This is a simulated response to your message: "${messageText}". 
      ${selectedContext.length ? `You selected context: ${selectedContext.join(', ')}` : 'No context was selected.'}
      
      In the final implementation, this will use the LLM agent API to generate a proper response based on your query and the selected context.`;
      
      addMessageToChat('assistant', response);
    }, 1000);
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