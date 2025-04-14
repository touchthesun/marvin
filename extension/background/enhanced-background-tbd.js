// background.js
// Main background script for the Marvin extension

import { ApiClient } from './api-client.js';
import { AnalysisQueue } from './analysis-queue.js';
import { ProgressTracker } from './progress-tracker.js';

// Create API client
const API_BASE_URL = 'http://localhost:8000'; // Default dev server
const apiClient = new ApiClient(API_BASE_URL);

// Create analysis queue
const analysisQueue = new AnalysisQueue(apiClient, {
  maxConcurrent: 2, // Process up to 2 tasks at once
  pollInterval: 5000, // Check status every 5 seconds
  maxRetries: 3 // Retry failed tasks up to 3 times
});

// Badge management
let lastBadgeUpdateTime = 0;

/**
 * Initialize the background script
 */
async function initialize() {
  // Load settings from storage
  chrome.storage.sync.get(['apiBaseUrl', 'autoAnalyze'], (result) => {
    // Update API base URL if configured
    if (result.apiBaseUrl) {
      apiClient.setBaseUrl(result.apiBaseUrl);
    }
    
    console.log('Marvin extension initialized', {
      apiBaseUrl: apiClient.baseUrl,
      autoAnalyze: result.autoAnalyze !== false
    });
  });
  
  // Check if we have any active trackers
  updateBadge();
  
  // Start badge update timer
  setInterval(updateBadge, 5000);
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

/**
 * Capture a URL for analysis
 * @param {string} url - URL to capture
 * @param {object} options - Capture options
 * @returns {Promise<string>} Task ID
 */
async function captureUrl(url, options = {}) {
  console.log(`Capturing URL: ${url}`);
  
  try {
    // Check if we should auto-analyze
    const { autoAnalyze = true } = await new Promise(resolve => {
      chrome.storage.sync.get(['autoAnalyze'], resolve);
    });
    
    // Default capture parameters
    const captureParams = {
      url,
      context: 'BROWSER_EXTENSION',
      ...options
    };
    
    // First create the page record
    const response = await apiClient.request('POST', '/api/v1/pages', captureParams);
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to create page');
    }
    
    console.log('Page created successfully', response.data);
    
    // Notify popup/content script that the URL was captured
    chrome.runtime.sendMessage({
      action: 'url_captured',
      url,
      pageData: response.data
    });
    
    // If auto-analyze is enabled, trigger analysis
    if (autoAnalyze) {
      console.log('Auto-analyzing URL');
      return await analyzeUrl(url, options);
    }
    
    return null;
  } catch (e) {
    console.error('Error capturing URL:', e);
    throw e;
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

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Return true to indicate we'll send a response asynchronously
  const isAsync = true;
  
  switch (message.action) {
    case 'captureUrl':
      captureUrl(message.url, message.options)
        .then(taskId => sendResponse({ success: true, taskId }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'captureCurrentTab':
      captureCurrentTab()
        .then(taskId => sendResponse({ success: true, taskId }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'analyzeUrl':
      analyzeUrl(message.url, message.options)
        .then(taskId => sendResponse({ success: true, taskId }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'getActiveTasks':
      getActiveTasks()
        .then(tasks => sendResponse({ success: true, tasks }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'getTaskStatus':
      getTaskStatus(message.taskId)
        .then(status => sendResponse({ success: true, status }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'cancelTask':
      cancelTask(message.taskId)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'retryTask':
      retryTask(message.taskId)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'analyzeBatch':
      analyzeBatch(message.urls, message.options)
        .then(batch => sendResponse({ success: true, batch }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
      
    case 'getBatchStatus':
      getBatchStatus(message.batchId)
        .then(status => sendResponse({ success: true, status }))
        .catch(error => sendResponse({ success: false, error: String(error) }));
      return isAsync;
  }
  
  // Not handled
  return false;
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