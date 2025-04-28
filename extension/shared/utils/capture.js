/**
 * Capture utilities for Marvin browser extension
 * Provides consistent handling of URL capture across different interfaces
 * @module capture
 */

import { LogManager } from '/shared/utils/log-manager.js';

/**
 * Logger for capture operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'capture-utils',
  storageKey: 'marvin_capture_logs',
  maxEntries: 1000
});

/**
 * Default timeout for capture requests in milliseconds
 * @type {number}
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Capture a URL with consistent handling across interfaces
 * @param {string} url - The URL to capture
 * @param {object} options - Optional parameters
 * @param {string} [options.context='active_tab'] - Capture context
 * @param {string|null} [options.tabId=null] - Tab ID if capturing from a specific tab
 * @param {string|null} [options.windowId=null] - Window ID if capturing from a specific window
 * @param {string|null} [options.title=null] - Page title if available
 * @param {string|null} [options.content=null] - Page content if available
 * @param {object|null} [options.metadata=null] - Additional metadata
 * @param {string[]|null} [options.browser_contexts=null] - Browser contexts for this capture
 * @param {number} [options.timeout=30000] - Request timeout in milliseconds
 * @returns {Promise<object>} Capture result
 */

async function captureUrl(url, options = {}) {
  // Validate URL
  if (!url) {
    logger.error('Capture failed: No URL provided');
    return {
      success: false,
      error: 'No URL provided'
    };
  }
  
  // Extract and set default options
  const { 
    context = 'active_tab', 
    tabId = null,
    windowId = null,
    title = null,
    content = null,
    metadata = null,
    browser_contexts = null,
    timeout = DEFAULT_TIMEOUT
  } = options;
  
  try {
    logger.info(`Capture request for ${url}`, { context, tabId, windowId });
    
    // Create consistent browser_contexts array
    const contexts = browser_contexts || [context];
    
    // Always use a structured message
    const message = {
      action: 'captureUrl',
      data: {
        url,
        context,
        tabId,
        windowId,
        title,
        content,
        metadata,
        browser_contexts: contexts
      }
    };
    
    // Send message to background script with timeout handling
    const response = await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
      )
    ]);
    
    logger.debug('Capture response:', response);
    
    // Validate response structure
    if (!response) {
      throw new Error('No response from background script');
    }
    
    // Add timestamp to response for tracking
    const result = {
      ...response,
      timestamp: Date.now()
    };
    
    // If successful, update capture history
    if (response.success) {
      await updateCaptureHistory({
        url,
        title: title || response.data?.title || 'Unknown',
        context,
        timestamp: Date.now(),
        browser_contexts: contexts
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Capture error:', error);
    
    // Return a structured error response
    return {
      success: false,
      error: error.message || 'Unknown error',
      timestamp: Date.now()
    };
  }
}

/**
 * Update the capture history in local storage
 * @param {object} captureData - Data about the capture
 * @returns {Promise<void>}
 * @private
 */
async function updateCaptureHistory(captureData) {
  try {
    // Get existing history
    const data = await chrome.storage.local.get('captureHistory');
    let captureHistory = data.captureHistory || [];
    
    // Add new capture to history (at the beginning)
    captureHistory.unshift(captureData);
    
    // Limit history size to 100 items
    if (captureHistory.length > 100) {
      captureHistory = captureHistory.slice(0, 100);
    }
    
    // Save updated history
    await chrome.storage.local.set({ captureHistory });
    logger.debug('Capture history updated', { historySize: captureHistory.length });
  } catch (error) {
    logger.error('Error updating capture history:', error);
    // Non-critical error, don't throw
  }
}

/**
 * Capture the current active tab
 * @param {object} [options={}] - Additional capture options
 * @returns {Promise<object>} Capture result
 */
async function captureCurrentTab(options = {}) {
  try {
    logger.info('Capturing current tab');
    
    // Get current tab info
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    const currentTab = tabs[0];
    logger.debug('Current tab info:', { 
      id: currentTab.id, 
      url: currentTab.url, 
      title: currentTab.title 
    });
    
    // Skip capture for invalid URLs
    if (!currentTab.url || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://')) {
      logger.warn('Skipping capture for restricted URL:', currentTab.url);
      return {
        success: false,
        error: 'Cannot capture this type of page',
        errorCode: 'RESTRICTED_URL'
      };
    }
    
    // Call the main capture function with tab details
    return await captureUrl(currentTab.url, {
      context: 'active_tab',
      tabId: currentTab.id.toString(),
      windowId: currentTab.windowId.toString(),
      title: currentTab.title,
      ...options
    });
  } catch (error) {
    logger.error('Error capturing current tab:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      timestamp: Date.now()
    };
  }
}

/**
 * Capture a batch of URLs
 * @param {string[]} urls - Array of URLs to capture
 * @param {object} [options={}] - Additional capture options
 * @returns {Promise<object>} Batch capture result
 */
async function captureBatch(urls, options = {}) {
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    logger.error('Batch capture failed: No URLs provided');
    return {
      success: false,
      error: 'No URLs provided'
    };
  }
  
  logger.info(`Starting batch capture of ${urls.length} URLs`);
  
  try {
    // Create a batch ID
    const batchId = `batch_${Date.now()}`;
    
    // Send batch request to background script
    const message = {
      action: 'captureBatch',
      data: {
        urls,
        batchId,
        options
      }
    };
    
    const response = await chrome.runtime.sendMessage(message);
    
    logger.debug('Batch capture response:', response);
    
    if (!response) {
      throw new Error('No response from background script');
    }
    
    return {
      ...response,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error('Batch capture error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      timestamp: Date.now()
    };
  }
}

/**
 * Capture all open tabs
 * @param {object} [options={}] - Additional capture options
 * @returns {Promise<object>} Batch capture result
 */
async function captureAllTabs(options = {}) {
  try {
    logger.info('Capturing all open tabs');
    
    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    if (!tabs || tabs.length === 0) {
      throw new Error('No tabs found');
    }
    
    // Filter out restricted URLs
    const validTabs = tabs.filter(tab => {
      const url = tab.url || '';
      return url && 
        !url.startsWith('chrome://') && 
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:');
    });
    
    if (validTabs.length === 0) {
      throw new Error('No valid tabs to capture');
    }
    
    logger.debug(`Found ${validTabs.length} valid tabs to capture`);
    
    // Create a batch ID
    const batchId = `tabs_${Date.now()}`;
    
    // Send batch request to background script
    const message = {
      action: 'captureTabs',
      data: {
        tabIds: validTabs.map(tab => tab.id),
        batchId,
        options: {
          ...options,
          context: 'open_tabs'
        }
      }
    };
    
    const response = await chrome.runtime.sendMessage(message);
    
    logger.debug('All tabs capture response:', response);
    
    if (!response) {
      throw new Error('No response from background script');
    }
    
    return {
      ...response,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error('Error capturing all tabs:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      timestamp: Date.now()
    };
  }
}

/**
 * UI handler for capture buttons
 * Sets up click event and manages button state during capture
 * @param {HTMLElement} button - The button element
 * @param {Function} captureFunction - The capture function to call
 * @param {Function} [onComplete=null] - Optional callback after capture completes
 */
function setupCaptureButton(button, captureFunction, onComplete = null) {
  if (!button) {
    logger.warn('setupCaptureButton called with null button');
    return;
  }
  
  if (typeof captureFunction !== 'function') {
    logger.error('setupCaptureButton called with invalid capture function');
    return;
  }
  
  logger.debug('Setting up capture button', { buttonId: button.id, buttonText: button.textContent });
  
  const originalText = button.textContent;
  
  button.addEventListener('click', async () => {
    logger.info('Capture button clicked');
    
    // Update button state
    button.disabled = true;
    button.textContent = 'Capturing...';
    
    try {
      // Call the provided capture function
      const response = await captureFunction();
      
      if (response.success) {
        logger.info('Capture successful', { url: response.data?.url });
        button.textContent = 'Captured!';
        
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          
          // Call completion callback if provided
          if (onComplete && typeof onComplete === 'function') {
            try {
              onComplete(response);
            } catch (callbackError) {
              logger.error('Error in capture completion callback:', callbackError);
            }
          }
        }, 2000);
      } else {
        logger.error('Capture failed:', response.error);
        button.textContent = 'Capture Failed';
        
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      }
    } catch (error) {
      logger.error('Capture button error:', error);
      button.textContent = 'Error';
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  });
  
  logger.debug('Capture button setup complete');
}

/**
 * Setup a batch capture button
 * @param {HTMLElement} button - The button element
 * @param {Function} batchCaptureFunction - The batch capture function to call
 * @param {Function} [progressCallback=null] - Optional callback for progress updates
 * @param {Function} [onComplete=null] - Optional callback after capture completes
 */
function setupBatchCaptureButton(button, batchCaptureFunction, progressCallback = null, onComplete = null) {
  if (!button) {
    logger.warn('setupBatchCaptureButton called with null button');
    return;
  }
  
  if (typeof batchCaptureFunction !== 'function') {
    logger.error('setupBatchCaptureButton called with invalid capture function');
    return;
  }
  
  logger.debug('Setting up batch capture button', { buttonId: button.id, buttonText: button.textContent });
  
  const originalText = button.textContent;
  
  button.addEventListener('click', async () => {
    logger.info('Batch capture button clicked');
    
    // Update button state
    button.disabled = true;
    button.textContent = 'Starting...';
    
    try {
      // Call the provided batch capture function
      const response = await batchCaptureFunction();
      
      if (response.success) {
        logger.info('Batch capture initiated', { batchId: response.data?.batchId });
        button.textContent = 'Processing...';
        
        // If there's a batch ID, we can monitor progress
        if (response.data?.batchId && typeof progressCallback === 'function') {
          monitorBatchProgress(response.data.batchId, progressCallback, (finalStatus) => {
            button.textContent = finalStatus.completed ? 'Completed!' : 'Failed';
            
            setTimeout(() => {
              button.textContent = originalText;
              button.disabled = false;
              
              // Call completion callback if provided
              if (onComplete && typeof onComplete === 'function') {
                try {
                  onComplete(finalStatus);
                } catch (callbackError) {
                  logger.error('Error in batch completion callback:', callbackError);
                }
              }
            }, 2000);
          });
        } else {
          // No batch ID or progress callback, just show success
          button.textContent = 'Started!';
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
            
            // Call completion callback if provided
            if (onComplete && typeof onComplete === 'function') {
              try {
                onComplete(response);
              } catch (callbackError) {
                logger.error('Error in batch completion callback:', callbackError);
              }
            }
          }, 2000);
        }
      } else {
        logger.error('Batch capture failed:', response.error);
        button.textContent = 'Failed';
        
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      }
    } catch (error) {
      logger.error('Batch capture button error:', error);
      button.textContent = 'Error';
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  });
  
  logger.debug('Batch capture button setup complete');
}

/**
 * Monitor batch capture progress
 * @param {string} batchId - Batch ID to monitor
 * @param {Function} progressCallback - Callback for progress updates
 * @param {Function} completionCallback - Callback when batch completes
 * @private
 */
async function monitorBatchProgress(batchId, progressCallback, completionCallback) {
  if (!batchId) {
    logger.error('Cannot monitor batch progress: No batch ID provided');
    return;
  }
  
  logger.debug(`Starting to monitor batch progress for ${batchId}`);
  
  let completed = false;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (with 5-second intervals)
  
  while (!completed && attempts < maxAttempts) {
    try {
      // Get batch status from background script
      const message = {
        action: 'getBatchStatus',
        data: { batchId }
      };
      
      const response = await chrome.runtime.sendMessage(message);
      
      if (response && response.success) {
        const status = response.data;
        
        // Calculate progress percentage
        const total = status.total_docs || 1;
        const done = status.completed_docs || 0;
        const failed = status.failed_docs || 0;
        const progress = Math.round(((done + failed) / total) * 100);
        
        logger.debug(`Batch ${batchId} progress: ${progress}% (${done}/${total} complete, ${failed} failed)`);
        
        // Call progress callback
        if (typeof progressCallback === 'function') {
          try {
            progressCallback({
              batchId,
              progress,
              total,
              completed: done,
              failed,
              status: status.status
            });
          } catch (callbackError) {
            logger.error('Error in progress callback:', callbackError);
          }
        }
        
        // Check if batch is complete
        if (status.status === 'completed' || status.status === 'error' || (done + failed) >= total) {
          completed = true;
          
          // Call completion callback
          if (typeof completionCallback === 'function') {
            try {
              completionCallback({
                batchId,
                completed: status.status === 'completed',
                total,
                successful: done,
                failed,
                error: status.error
              });
            } catch (callbackError) {
              logger.error('Error in completion callback:', callbackError);
            }
          }
          
          break;
        }
      } else {
        logger.warn(`Failed to get batch status for ${batchId}:`, response?.error || 'Unknown error');
      }
    } catch (error) {
      logger.error(`Error monitoring batch ${batchId}:`, error);
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  // If we reached max attempts without completion
  if (!completed && attempts >= maxAttempts) {
    logger.warn(`Batch monitoring timed out for ${batchId} after ${maxAttempts} attempts`);
    
    // Call completion callback with timeout status
    if (typeof completionCallback === 'function') {
      try {
        completionCallback({
          batchId,
          completed: false,
          timedOut: true,
          error: 'Monitoring timed out'
        });
      } catch (callbackError) {
        logger.error('Error in completion callback:', callbackError);
      }
    }
  }
}

/**
 * Get capture history from storage
 * @param {number} [limit=0] - Maximum number of items to return (0 for all)
 * @returns {Promise<Array>} Capture history items
 */
async function getCaptureHistory(limit = 0) {
  try {
    logger.debug(`Getting capture history (limit: ${limit})`);
    
    const data = await chrome.storage.local.get('captureHistory');
    let history = data.captureHistory || [];
    
    // Apply limit if specified
    if (limit > 0 && history.length > limit) {
      history = history.slice(0, limit);
    }
    
    logger.debug(`Retrieved ${history.length} capture history items`);
    return history;
  } catch (error) {
    logger.error('Error getting capture history:', error);
    return [];
  }
}

/**
 * Clear capture history
 * @returns {Promise<boolean>} Success status
 */
async function clearCaptureHistory() {
  try {
    logger.info('Clearing capture history');
    
    await chrome.storage.local.remove('captureHistory');
    
    logger.debug('Capture history cleared successfully');
    return true;
  } catch (error) {
    logger.error('Error clearing capture history:', error);
    return false;
  }
}

/**
 * Check if a URL is valid for capture
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is valid for capture
 */
function isValidCaptureUrl(url) {
  if (!url) return false;
  
  try {
    // Check for restricted URL schemes
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') || 
        url.startsWith('about:') ||
        url.startsWith('data:') ||
        url.startsWith('file:') ||
        url.startsWith('javascript:')) {
      return false;
    }
    
    // Try to parse the URL to ensure it's valid
    new URL(url);
    
    return true;
  } catch (error) {
    logger.warn(`Invalid URL for capture: ${url}`, error);
    return false;
  }
}

/**
 * Get the domain from a URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name or empty string if invalid
 */
function getDomainFromUrl(url) {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    logger.warn(`Error extracting domain from URL: ${url}`, error);
    return '';
  }
}

/**
 * Check if a URL is in the excluded domains list
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} True if URL is excluded
 */
async function isUrlExcluded(url) {
  if (!url) return false;
  
  try {
    const domain = getDomainFromUrl(url);
    if (!domain) return false;
    
    // Get excluded domains from settings
    const data = await chrome.storage.local.get('captureSettings');
    const settings = data.captureSettings || {};
    const excludedDomains = settings.excludedDomains || [];
    
    // Check if domain or any parent domain is excluded
    return excludedDomains.some(excluded => {
      // Exact match
      if (domain === excluded) return true;
      
      // Check if domain ends with .excluded
      if (domain.endsWith(`.${excluded}`)) return true;
      
      return false;
    });
  } catch (error) {
    logger.error('Error checking if URL is excluded:', error);
    return false;
  }
}

/**
 * Check if a URL is in the included domains list (if enabled)
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} True if URL is included or if inclusion list is empty
 */
async function isUrlIncluded(url) {
  if (!url) return false;
  
  try {
    const domain = getDomainFromUrl(url);
    if (!domain) return false;
    
    // Get included domains from settings
    const data = await chrome.storage.local.get('captureSettings');
    const settings = data.captureSettings || {};
    const includedDomains = settings.includedDomains || [];
    
    // If no domains are explicitly included, all are allowed
    if (includedDomains.length === 0) return true;
    
    // Check if domain or any parent domain is included
    return includedDomains.some(included => {
      // Exact match
      if (domain === included) return true;
      
      // Check if domain ends with .included
      if (domain.endsWith(`.${included}`)) return true;
      
      return false;
    });
  } catch (error) {
    logger.error('Error checking if URL is included:', error);
    return true; // Default to included on error
  }
}

/**
 * Check if automatic capture is enabled
 * @returns {Promise<boolean>} True if automatic capture is enabled
 */
async function isAutoCaptureEnabled() {
  try {
    const data = await chrome.storage.local.get('captureSettings');
    const settings = data.captureSettings || {};
    
    // Default to false if not specified
    return settings.automaticCapture === true;
  } catch (error) {
    logger.error('Error checking if auto-capture is enabled:', error);
    return false; // Default to disabled on error
  }
}

/**
 * Get the minimum time on page required for automatic capture
 * @returns {Promise<number>} Minimum time in seconds
 */
async function getMinTimeOnPage() {
  try {
    const data = await chrome.storage.local.get('captureSettings');
    const settings = data.captureSettings || {};
    
    // Default to 10 seconds if not specified
    return settings.minTimeOnPage || 10;
  } catch (error) {
    logger.error('Error getting minimum time on page:', error);
    return 10; // Default to 10 seconds on error
  }
}

// Export all functions
export {
  captureUrl,
  captureCurrentTab,
  captureBatch,
  captureAllTabs,
  setupCaptureButton,
  setupBatchCaptureButton,
  getCaptureHistory,
  clearCaptureHistory,
  isValidCaptureUrl,
  getDomainFromUrl,
  isUrlExcluded,
  isUrlIncluded,
  isAutoCaptureEnabled,
  getMinTimeOnPage
};
