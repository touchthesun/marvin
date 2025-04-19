// Import dependencies
import AuthManager from './auth-manager.js';
import MarvinAPIClient from './api-client.js';
import StateManager from './state-manager.js';
import { captureUrl } from '../shared/utils/capture.js';
import { AnalysisQueue } from './analysis-queue.js';
import { ProgressTracker } from './progress-tracker.js';
import { LogManager } from '../shared/utils/log-manager.js';
import { captureCurrentTab } from '../shared/utils/capture.js';


// Initialize log manager
const logger = new LogManager({ 
  isBackgroundScript: true,
  logLevel: 'debug',
  deduplicationTimeout: 1000, // Match existing CACHE_TIMEOUT
  maxDuplicateCache: 100     // Match existing cleanup threshold
});

// Add message listener for logs from other contexts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'marvin_log_entry') {
    logger.logs.push(message.entry);
    return false;
  }
  
  if (message.action === 'marvin_export_logs') {
    logger.exportLogs(message.format)
      .then(logs => sendResponse({ success: true, logs }))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  
  if (message.action === 'marvin_clear_logs') {
    logger.clearLogs();
    sendResponse({ success: true });
    return false;
  }
  
  // Handle other messages
  return false;
});

// Make logger globally available for debugging
window.marvinLogger = logger;

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
  logger.log('Initializing Marvin extension...');
  try {
    await authManager.initialize();
    await stateManager.initialize();
    
    // Load configuration from storage
    const config = await chrome.storage.local.get(['apiConfig', 'autoAnalyze', 'autoCapture']);
    
    // Update API base URL if configured
    if (config.apiConfig?.baseUrl) {
      apiClient.setBaseUrl(config.apiConfig.baseUrl);
    }
    
    logger.log('Marvin extension initialized successfully', {
      apiBaseUrl: apiClient.baseURL,
      autoAnalyze: config.autoAnalyze !== false,
      autoCapture: config.autoCapture
    });
    
    // Check if we have any active trackers
    updateBadge();
    
    // Start badge update timer
    setInterval(updateBadge, 5000);
  } catch (error) {
    logger.error('Initialization error:', error);
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
    logger.error('Error updating badge:', e);
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
    logger.error(`Error extracting content from tab ${tabId}:`, error);
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
    logger.error('Error updating capture history:', error);
  }
}


/**
 * Analyze a captured URL
 * @param {string} url - URL to analyze
 * @param {object} options - Analysis options
 * @returns {Promise<string>} Task ID
 */
async function analyzeUrl(url, options = {}) {
  logger.log(`Analyzing URL: ${url}`);
  
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
    logger.error('Error analyzing URL:', e);
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
  logger.log(`Analyzing batch of ${urls.length} URLs`);
  
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
    logger.error('Error analyzing batch:', e);
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
  logger.log('Background received message:', message);
  
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
          logger.error('Error handling capture:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return isAsync;

    case 'ping':
      sendResponse({ 
        success: true, 
        timestamp: message.timestamp, 
        message: 'Background script is active' 
      });
      return false;
      
    case 'captureCurrentTab':
      (async () => {
        try {
          const response = await captureCurrentTab();
          sendResponse({ success: true, ...response });
        } catch (error) {
          logger.error('Error handling capture:', error);
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
      logger.log(`Page ${message.action === 'pageVisible' ? 'visible' : 'hidden'}:`, message.url);
      return false;
      
    default:
      logger.log('Unhandled message type:', message.action);
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
          logger.error('Error auto-capturing tab:', error);
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

