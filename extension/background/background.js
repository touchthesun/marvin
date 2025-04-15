// Import dependencies
import AuthManager from './auth-manager.js';
import MarvinAPIClient from './api-client.js';
import StateManager from './state-manager.js';
import { captureUrl } from '../shared/utils/capture.js';
import { AnalysisQueue } from './analysis-queue.js';
import { ProgressTracker } from './progress-tracker.js';

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

// Create analysis queue
const analysisQueue = new AnalysisQueue(apiClient, {
  maxConcurrent: 2, // Process up to 2 tasks at once
  pollInterval: 5000, // Check status every 5 seconds
  maxRetries: 3 // Retry failed tasks up to 3 times
});

// Badge management
let lastBadgeUpdateTime = 0;

// Initialize on extension load
async function initialize() {
  console.log('Initializing Marvin extension...');
  try {
    await authManager.initialize();
    await stateManager.initialize();
    
    // Load configuration from storage
    const config = await chrome.storage.local.get(['apiConfig', 'autoAnalyze', 'autoCapture']);
    
    // Update API base URL if configured
    if (config.apiConfig?.baseUrl) {
      apiClient.setBaseUrl(config.apiConfig.baseUrl);
    }
    
    console.log('Marvin extension initialized successfully', {
      apiBaseUrl: apiClient.baseURL,
      autoAnalyze: config.autoAnalyze !== false,
      autoCapture: config.autoCapture
    });
    
    // Check if we have any active trackers
    updateBadge();
    
    // Start badge update timer
    setInterval(updateBadge, 5000);
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

/**
 * Update the browser action badge with status
 */
async function updateBadge() {
  // Throttle updates to avoid excessive badge updates
  const now = Date.now();
  if (now - lastBadgeUpdateTime < 1000) {
    return;
  }
  
  lastBadgeUpdateTime = now;
  
  try {
    // Check for active tasks
    const activeTasks = await analysisQueue.getActiveTasks();
    
    if (activeTasks.length === 0) {
      // No active tasks, clear badge
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    // Count tasks by status
    const statusCounts = {
      pending: 0,
      processing: 0,
      analyzing: 0,
      complete: 0,
      error: 0
    };
    
    for (const task of activeTasks) {
      const status = task.status || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    
    // Determine overall status
    let badgeText = '';
    let badgeColor = '#4285F4'; // Blue
    
    if (statusCounts.processing > 0 || statusCounts.analyzing > 0 || statusCounts.pending > 0) {
      // Tasks in progress
      badgeText = String(statusCounts.processing + statusCounts.analyzing + statusCounts.pending);
      badgeColor = '#4285F4'; // Blue
    }
    
    if (statusCounts.error > 0) {
      // Some tasks have failed
      badgeText = String(statusCounts.error);
      badgeColor = '#DB4437'; // Red
    }
    
    // Update badge
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  } catch (e) {
    console.error('Error updating badge:', e);
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


/**
 * Analyze a captured URL
 * @param {string} url - URL to analyze
 * @param {object} options - Analysis options
 * @returns {Promise<string>} Task ID
 */
async function analyzeUrl(url, options = {}) {
  console.log(`Analyzing URL: ${url}`);
  
  try {
    // Queue for analysis
    const taskId = await analysisQueue.queueUrl(url, options);
    
    // Update badge
    updateBadge();
    
    // Notify popup/content script
    chrome.runtime.sendMessage({
      action: 'analysis_started',
      url,
      taskId
    });
    
    return taskId;
  } catch (e) {
    console.error('Error analyzing URL:', e);
    throw e;
  }
}

/**
 * Capture the current active tab
 * @returns {Promise<string>} Task ID
 */
async function captureCurrentTab() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Check if URL is valid
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture browser UI pages');
    }
    
    // Optionally get page content
    let content = null;
    
    try {
      // Try to execute content script to get page content
      const result = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' });
      content = result.content;
    } catch (e) {
      console.warn('Could not get page content, capturing metadata only', e);
    }
    
    // Capture the URL
    return await captureUrl(tab.url, {
      tabId: String(tab.id),
      windowId: String(tab.windowId),
      content,
      title: tab.title
    });
  } catch (e) {
    console.error('Error capturing current tab:', e);
    throw e;
  }
}

/**
 * Get active analysis tasks
 * @returns {Promise<object[]>} Task statuses
 */
async function getActiveTasks() {
  return await analysisQueue.getActiveTasks();
}

/**
 * Get status of an analysis task
 * @param {string} taskId - Task ID
 * @returns {Promise<object>} Task status
 */
async function getTaskStatus(taskId) {
  return await analysisQueue.getTaskStatus(taskId);
}

/**
 * Cancel an analysis task
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} Success
 */
async function cancelTask(taskId) {
  const result = await analysisQueue.cancelTask(taskId);
  
  // Update badge
  updateBadge();
  
  return result;
}

/**
 * Retry a failed analysis task
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} Success
 */
async function retryTask(taskId) {
  const result = await analysisQueue.retryTask(taskId);
  
  // Update badge
  updateBadge();
  
  return result;
}

/**
 * Analyze a batch of URLs
 * @param {string[]} urls - URLs to analyze
 * @param {object} options - Analysis options
 * @returns {Promise<object>} Batch info
 */
async function analyzeBatch(urls, options = {}) {
  console.log(`Analyzing batch of ${urls.length} URLs`);
  
  try {
    // Queue batch for analysis
    const batch = await analysisQueue.queueBatch(urls, options);
    
    // Update badge
    updateBadge();
    
    // Notify popup/content script
    chrome.runtime.sendMessage({
      action: 'batch_started',
      urls,
      batchId: batch.batchId,
      taskIds: batch.taskIds
    });
    
    return batch;
  } catch (e) {
    console.error('Error analyzing batch:', e);
    throw e;
  }
}

/**
 * Get status of a batch
 * @param {string} batchId - Batch ID
 * @returns {Promise<object>} Batch status
 */
async function getBatchStatus(batchId) {
  return await analysisQueue.getBatchStatus(batchId);
}

// Message handler for communication with popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Return true to indicate we'll send a response asynchronously
  const isAsync = true;
  
  // Handle various message types with a single switch statement
  switch (message.action) {
    case 'captureUrl':
      (async () => {
        try {
          const response = await captureUrl(
            message.data?.url || message.url, 
            {
              context: message.data?.context || message.options?.context,
              tabId: message.data?.tabId || message.options?.tabId,
              windowId: message.data?.windowId || message.options?.windowId,
              title: message.data?.title || message.options?.title,
              content: message.data?.content || message.options?.content,
              browser_contexts: message.data?.browser_contexts || message.options?.browser_contexts
            }
          );
          
          sendResponse({ success: true, ...response });
        } catch (error) {
          console.error('Error handling capture:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return isAsync;
      
    case 'captureCurrentTab':
      (async () => {
        try {
          const response = await captureCurrentTab();
          sendResponse({ success: true, ...response });
        } catch (error) {
          console.error('Error handling capture:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return isAsync;
      
    case 'analyzeUrl':
      (async () => {
        try {
          const taskId = await analyzeUrl(message.url, message.options);
          sendResponse({ success: true, taskId });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'getActiveTasks':
      (async () => {
        try {
          const tasks = await getActiveTasks();
          sendResponse({ success: true, tasks });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'getTaskStatus':
      (async () => {
        try {
          const status = await getTaskStatus(message.taskId);
          sendResponse({ success: true, status });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'cancelTask':
      (async () => {
        try {
          const result = await cancelTask(message.taskId);
          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'retryTask':
      (async () => {
        try {
          const result = await retryTask(message.taskId);
          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'analyzeBatch':
      (async () => {
        try {
          const batch = await analyzeBatch(message.urls, message.options);
          sendResponse({ success: true, batch });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
      
    case 'getBatchStatus':
      (async () => {
        try {
          const status = await getBatchStatus(message.batchId);
          sendResponse({ success: true, status });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return isAsync;
  }
  
  // Handle other message types
  switch (message.action) {
    case 'checkAuthStatus':
      authManager.getToken()
        .then(token => sendResponse({ authenticated: !!token }))
        .catch(error => sendResponse({ authenticated: false, error: error.message }));
      return isAsync;
      
    case 'login':
      authManager.login(message.username, message.password)
        .then(success => sendResponse({ success }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return isAsync;
      
    case 'logout':
      authManager.clearToken()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return isAsync;
      
    case 'updateSettings':
      stateManager.updateSettings(message.settings)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return isAsync;
      
    case 'syncBrowserState':
      stateManager.syncState()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return isAsync;
      
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
          
          const result = await captureUrl(sender.tab.url, {
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
      return isAsync;

    case 'getDashboardData':
      chrome.storage.local.get(['captureHistory', 'stats'], (data) => {
        sendResponse(data);
      });
      return isAsync;

    case 'contentScriptPing':
      sendResponse({ success: true });
      return false;

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

// Listen for browser events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if URL changed and page is completely loaded
  if (changeInfo.status === 'complete' && changeInfo.url) {
    // Check if we have auto-capture enabled
    chrome.storage.sync.get(['autoCapture'], (result) => {
      if (result.autoCapture) {
        // Auto-capture the URL
        captureUrl(tab.url, {
          tabId: String(tabId),
          windowId: String(tab.windowId),
          title: tab.title
        }).catch(error => {
          console.error('Error auto-capturing tab:', error);
        });
      }
    });
  }
});

// Make functions available to popup
window.marvin = {
  captureUrl,
  captureCurrentTab,
  analyzeUrl,
  getActiveTasks,
  getTaskStatus,
  cancelTask,
  retryTask,
  analyzeBatch,
  getBatchStatus
};

// Initialize the extension
initialize();

