// services/status-service.js
import { LogManager } from '../../../shared/utils/log-manager.js';
import { showNotification } from './notification-service.js';

/**
 * Logger for status monitoring operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'status-service',
  storageKey: 'marvin_status_logs',
  maxEntries: 1000
});

// Status state
let isOnline = navigator.onLine;
let apiStatus = 'unknown'; // 'online', 'offline', 'error', 'unknown'
let lastApiCheck = 0;
const API_CHECK_INTERVAL = 60000; // 1 minute

/**
 * Set up status monitoring for network and API
 * @returns {void}
 */
function setupStatusMonitoring() {
  logger.debug('Setting up status monitoring');
  
  try {
    // Network status indicators
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (!statusDot || !statusText) {
      logger.warn('Status indicators not found in DOM');
      return;
    }
    
    // Initial status update
    updateNetworkStatus();
    
    // Add event listeners for online/offline events
    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);
    
    // Set up periodic API status check
    setupApiStatusCheck();
    
    logger.info('Status monitoring set up successfully');
  } catch (error) {
    logger.error('Error setting up status monitoring:', error);
  }
}

/**
 * Handle online event
 * @param {Event} event - Online event
 * @returns {void}
 */
function handleOnlineEvent(event) {
  logger.info('Network status changed to online');
  isOnline = true;
  updateNetworkStatus();
  
  // Check API status when coming back online
  checkApiStatus();
  
  // Notify user
  showNotification('Network connection restored', 'success');
}

/**
 * Handle offline event
 * @param {Event} event - Offline event
 * @returns {void}
 */
function handleOfflineEvent(event) {
  logger.info('Network status changed to offline');
  isOnline = false;
  updateNetworkStatus();
  
  // Set API status to offline as well
  apiStatus = 'offline';
  updateApiStatusIndicator();
  
  // Notify user
  showNotification('Network connection lost', 'warning');
}

/**
 * Update network status indicators
 * @returns {void}
 */
function updateNetworkStatus() {
  try {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (!statusDot || !statusText) {
      logger.warn('Status indicators not found for update');
      return;
    }
    
    if (isOnline) {
      statusDot.classList.add('online');
      statusDot.classList.remove('offline');
      statusText.textContent = 'Online';
    } else {
      statusDot.classList.remove('online');
      statusDot.classList.add('offline');
      statusText.textContent = 'Offline';
    }
    
    // Send status to background script
    try {
      chrome.runtime.sendMessage({ 
        action: 'networkStatusChange', 
        isOnline: isOnline 
      });
    } catch (messageError) {
      logger.error('Error sending network status to background:', messageError);
    }
    
    logger.debug(`Network status indicators updated to: ${isOnline ? 'Online' : 'Offline'}`);
  } catch (error) {
    logger.error('Error updating network status indicators:', error);
  }
}

/**
 * Set up periodic API status check
 * @returns {void}
 */
function setupApiStatusCheck() {
  // Initial check
  checkApiStatus();
  
  // Set up periodic check
  setInterval(checkApiStatus, API_CHECK_INTERVAL);
  
  logger.debug(`API status check scheduled every ${API_CHECK_INTERVAL / 1000} seconds`);
}

/**
 * Check API server status
 * @returns {Promise<void>}
 */
async function checkApiStatus() {
  // Skip check if offline
  if (!navigator.onLine) {
    apiStatus = 'offline';
    updateApiStatusIndicator();
    logger.debug('Skipping API check due to offline network status');
    return;
  }
  
  // Throttle checks
  const now = Date.now();
  if (now - lastApiCheck < 10000) { // No more than once per 10 seconds
    logger.debug('Skipping API check due to throttling');
    return;
  }
  
  lastApiCheck = now;
  
  try {
    logger.debug('Checking API server status');
    
    // Get API URL from storage
    const data = await chrome.storage.local.get('apiConfig');
    const apiConfig = data.apiConfig || {};
    const baseUrl = apiConfig.baseUrl || 'http://localhost:8000';
    
    // Update API status indicator to checking
    apiStatus = 'checking';
    updateApiStatusIndicator();
    
    // Make health check request
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      // Add timeout
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (response.ok) {
      // API is online
      apiStatus = 'online';
      logger.debug('API server is online');
    } else {
      // API returned error
      apiStatus = 'error';
      logger.warn(`API health check failed with status ${response.status}`);
    }
  } catch (error) {
    // API is offline or unreachable
    apiStatus = 'offline';
    logger.error('API server unreachable:', error);
  }
  
  // Update UI
  updateApiStatusIndicator();
}

/**
 * Update API status indicator
 * @returns {void}
 */
function updateApiStatusIndicator() {
  try {
    const apiStatusDot = document.querySelector('.api-status-dot');
    const apiStatusText = document.querySelector('.api-status-text');
    
    if (!apiStatusDot || !apiStatusText) {
      logger.warn('API status indicators not found');
      return;
    }
    
    // Remove all status classes
    apiStatusDot.classList.remove('online', 'offline', 'error', 'checking');
    
    // Update based on current status
    switch (apiStatus) {
      case 'online':
        apiStatusDot.classList.add('online');
        apiStatusText.textContent = 'API Online';
        break;
      case 'offline':
        apiStatusDot.classList.add('offline');
        apiStatusText.textContent = 'API Offline';
        break;
      case 'error':
        apiStatusDot.classList.add('error');
        apiStatusText.textContent = 'API Error';
        break;
      case 'checking':
        apiStatusDot.classList.add('checking');
        apiStatusText.textContent = 'Checking API...';
        break;
      default:
        apiStatusDot.classList.add('unknown');
        apiStatusText.textContent = 'API Status Unknown';
    }
    
    logger.debug(`API status indicator updated to: ${apiStatus}`);
  } catch (error) {
    logger.error('Error updating API status indicator:', error);
  }
}

/**
 * Get current network status
 * @returns {boolean} Whether the network is online
 */
function getNetworkStatus() {
  return isOnline;
}

/**
 * Get current API status
 * @returns {string} API status ('online', 'offline', 'error', 'unknown', 'checking')
 */
function getApiStatus() {
  return apiStatus;
}

/**
 * Force update of all status indicators
 * @returns {void}
 */
function refreshStatusIndicators() {
  updateNetworkStatus();
  updateApiStatusIndicator();
}

// Export all necessary functions
export { 
  setupStatusMonitoring,
  checkApiStatus,
  getNetworkStatus,
  getApiStatus,
  refreshStatusIndicators
};