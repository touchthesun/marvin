// Import dependencies
import AuthManager from './auth-manager.js';
import MarvinAPIClient from './api-client.js';
import StateManager from './state-manager.js';
import { captureUrl } from '../shared/utils/capture.js';


// Add log deduplication to prevent double logging
const logCache = new Map();
const CACHE_TIMEOUT = 1000; // 1 second

// Create wrapped logging functions
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Replace console.log
console.log = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const now = Date.now();
  const cachedTime = logCache.get(message);
  
  // If this exact message was logged less than 1s ago, ignore it
  if (cachedTime && (now - cachedTime) < CACHE_TIMEOUT) {
    return;
  }
  
  // Otherwise log it and cache the timestamp
  logCache.set(message, now);
  originalConsoleLog.apply(console, args);
  
  // Cleanup old messages periodically
  if (logCache.size > 100) {
    for (const [key, timestamp] of logCache.entries()) {
      if (now - timestamp > CACHE_TIMEOUT) {
        logCache.delete(key);
      }
    }
  }
};

// Replace console.error
console.error = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const now = Date.now();
  const cachedTime = logCache.get('ERROR:' + message);
  
  // If this exact error was logged less than 1s ago, ignore it
  if (cachedTime && (now - cachedTime) < CACHE_TIMEOUT) {
    return;
  }
  
  // Otherwise log it and cache the timestamp
  logCache.set('ERROR:' + message, now);
  originalConsoleError.apply(console, args);
};

// Replace console.warn
console.warn = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const now = Date.now();
  const cachedTime = logCache.get('WARN:' + message);
  
  // If this exact warning was logged less than 1s ago, ignore it
  if (cachedTime && (now - cachedTime) < CACHE_TIMEOUT) {
    return;
  }
  
  // Otherwise log it and cache the timestamp
  logCache.set('WARN:' + message, now);
  originalConsoleWarn.apply(console, args);
};




// Configuration (would be loaded from storage in real implementation)
const API_BASE_URL = 'http://localhost:8000';

// Initialize components
const authManager = new AuthManager();
const apiClient = new MarvinAPIClient(API_BASE_URL, authManager);
const stateManager = new StateManager(apiClient);

// Initialize on extension load
async function initialize() {
  console.log('Initializing Marvin extension...');
  try {
    await authManager.initialize();
    await stateManager.initialize();
    
    // Load configuration from storage
    const config = await chrome.storage.local.get('apiConfig');
    if (config.apiConfig?.baseUrl) {
      apiClient.baseURL = config.apiConfig.baseUrl;
    }
    
    console.log('Marvin extension initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Helper function to extract content from a tab
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

// Update capture history
async function updateCaptureHistory(captureInfo) {
  try {
    // Get existing history
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    // Add new item to the beginning
    captureHistory.unshift(captureInfo);
    
    // Keep only the latest 100 items
    if (captureHistory.length > 100) {
      captureHistory.splice(100);
    }
    
    // Save updated history
    await chrome.storage.local.set({ captureHistory });
  } catch (error) {
    console.error('Error updating capture history:', error);
  }
}

// Use the shared capture utility to process API calls
async function processCapture(url, options = {}) {
  try {
    // Extract content if needed
    if (options.tabId && !options.content) {
      try {
        const tabId = parseInt(options.tabId);
        const extractedData = await extractTabContent(tabId);
        options.content = extractedData.content;
        options.title = options.title || extractedData.title;
      } catch (error) {
        console.error(`Error extracting content for tab ${options.tabId}:`, error);
      }
    }
    
    // Call the API directly (the shared utility might handle messaging, not API calls)
    const pageData = {
      url: url,
      title: options.title || '',
      content: options.content || '',
      context: options.context || 'active_tab',
      browser_contexts: options.browser_contexts || [options.context || 'active_tab'],
      tab_id: options.tabId,
      window_id: options.windowId
    };
    
    const response = await apiClient.post('/api/v1/pages/', pageData);
    
    // Update capture history
    if (response && response.success) {
      await updateCaptureHistory({
        url: url,
        title: options.title || url,
        timestamp: Date.now(),
        status: 'captured'
      });
    }
    
    return response;
  } catch (error) {
    console.error(`Error processing capture for ${url}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Message handler for communication with popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Handle various message types with a single switch statement
  switch (message.action) {
    case 'captureUrl':
      (async () => {
        try {
          const response = await processCapture(
            message.data.url, 
            {
              context: message.data.context,
              tabId: message.data.tabId,
              windowId: message.data.windowId,
              title: message.data.title,
              content: message.data.content,
              browser_contexts: message.data.browser_contexts
            }
          );
          
          sendResponse(response);
        } catch (error) {
          console.error('Error handling capture:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return true;
      
    case 'captureCurrentTab':
      (async () => {
        try {
          // Either use handleCaptureUrl or captureManager.captureCurrentTab, not both
          const response = await captureManager.captureCurrentTab();
          sendResponse(response);
        } catch (error) {
          console.error('Error handling capture:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return true;
  }
  
  // Handle other message types
  switch (message.action) {
    case 'checkAuthStatus':
      authManager.getToken()
        .then(token => sendResponse({ authenticated: !!token }))
        .catch(error => sendResponse({ authenticated: false, error: error.message }));
      return true;
      
    case 'login':
      authManager.login(message.username, message.password)
        .then(success => sendResponse({ success }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'logout':
      authManager.clearToken()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'updateSettings':
      stateManager.updateSettings(message.settings)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'syncBrowserState':
      stateManager.syncState()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'networkStatusChange':
      apiClient.handleNetworkChange(message.isOnline);
      return false; // No async response needed
      
    case 'extractedContent':
      (async () => {
        try {
          // Process extracted content
          if (!sender.tab) {
            throw new Error('No tab information provided');
          }
          
          const result = await processCapture(sender.tab.url, {
            tabId: sender.tab.id.toString(),
            windowId: sender.tab.windowId.toString(),
            title: sender.tab.title,
            content: message.content,
            metadata: message.metadata,
            context: 'active_tab',
            browser_contexts: ['active_tab']
          });
          
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getDashboardData':
      chrome.storage.local.get(['captureHistory', 'stats'], (data) => {
        sendResponse(data);
      });
      return true;

    case 'contentScriptPing':
      sendResponse({ success: true });
      return true;

    case 'pageVisible':
    case 'pageHidden':
      // Handle page visibility change
      console.log(`Page ${message.action === 'pageVisible' ? 'visible' : 'hidden'}:`, message.url);
      return false;
      
    default:
      console.log('Unhandled message type:', message.action);
      sendResponse({ success: false, error: 'Unhandled message type' });
      return false;
  }
});

// Initialize extension
initialize();