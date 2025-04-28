// components/capture/capture-utils.js
import { LogManager } from '/shared/utils/log-manager.js';
import { ProgressTracker } from '/shared/utils/progress-tracker.js';

/**
 * Logger for capture utilities
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'capture-utils',
  storageKey: 'marvin_capture_utils_logs',
  maxEntries: 1000
});

/**
 * Create a batch tracker for multiple captures
 * @param {string} batchId - Unique batch ID
 * @returns {ProgressTracker} Progress tracker instance
 */
export function createBatchTracker(batchId) {
  logger.debug(`Creating batch tracker with ID: ${batchId}`);
  
  return new ProgressTracker(batchId, {
    stages: ['preparing', 'capturing', 'processing', 'complete'],
    persistence: true
  });
}

/**
 * Create an item tracker for individual capture
 * @param {string} itemId - Unique item ID
 * @returns {ProgressTracker} Progress tracker instance
 */
export function createItemTracker(itemId) {
  logger.debug(`Creating item tracker with ID: ${itemId}`);
  
  return new ProgressTracker(itemId, {
    stages: ['preparing', 'extracting', 'sending', 'complete'],
    persistence: true
  });
}

/**
 * Check if a URL is valid for capture
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is valid for capture
 */
export function isValidCaptureUrl(url) {
  if (!url) return false;
  
  try {
    // Skip browser internal pages
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('edge://') ||
        url.startsWith('brave://') ||
        url.startsWith('opera://') ||
        url.startsWith('vivaldi://') ||
        url.startsWith('firefox://') ||
        url.startsWith('data:') ||
        url.startsWith('file:') ||
        url.startsWith('view-source:') ||
        url.startsWith('devtools://')) {
      return false;
    }
    
    // Validate URL format
    new URL(url);
    return true;
  } catch (error) {
    logger.warn(`Invalid URL: ${url}`, error);
    return false;
  }
}

/**
 * Get context string for capture type
 * @param {string} type - Type of capture (tabs, bookmarks, history)
 * @returns {string} Context string for API
 */
export function getContextForType(type) {
  switch (type) {
    case 'tabs':
    case 'tab':
      return 'browser_tab';
    case 'bookmarks':
    case 'bookmark':
      return 'bookmark';
    case 'history':
      return 'history';
    default:
      return 'unknown';
  }
}

/**
 * Update capture history in storage
 * @param {Array} capturedItems - Successfully captured items
 * @returns {Promise<void>}
 */
export async function updateCaptureHistory(capturedItems) {
  try {
    if (!capturedItems || capturedItems.length === 0) {
      logger.debug('No items to update in capture history');
      return;
    }
    
    logger.debug(`Updating capture history with ${capturedItems.length} items`);
    
    // Fetch current history
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    // Add new captures to history
    const newCaptures = capturedItems.map(item => ({
      url: item.url,
      title: item.title || 'Untitled',
      timestamp: Date.now(),
      status: 'captured',
      type: item.type || 'unknown'
    }));
    
    const updatedHistory = [...newCaptures, ...captureHistory];
    
    // Keep only the latest 100 items
    if (updatedHistory.length > 100) {
      updatedHistory.splice(100);
    }
    
    // Save updated history
    await chrome.storage.local.set({ captureHistory: updatedHistory });
    
    // Update stats
    const stats = (await chrome.storage.local.get('stats')).stats || { 
      captures: 0, 
      relationships: 0, 
      queries: 0 
    };
    
    stats.captures += capturedItems.length;
    await chrome.storage.local.set({ stats });
    
    logger.debug('Capture history updated successfully');
  } catch (error) {
    logger.error('Error updating capture history:', error);
  }
}

// Export all utility functions
export {
  createBatchTracker,
  createItemTracker,
  isValidCaptureUrl,
  getContextForType,
  updateCaptureHistory
};
