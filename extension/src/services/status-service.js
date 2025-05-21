// services/status-service.js
import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';

/**
 * Status Service - Monitors network and API status
 */
export class StatusService {
  /**
   * Create a new StatusService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    this.logger = null;
    
    // Status state
    this.isOnline = navigator.onLine;
    this.apiStatus = 'unknown'; // 'online', 'offline', 'error', 'unknown', 'checking'
    this.lastApiCheck = 0;
    this.API_CHECK_INTERVAL = 60000; // 1 minute
    this.checkIntervalId = null;
    
    // Dependencies
    this.notificationService = null;
    this.storageService = null;
    
    // DOM element references for cleanup
    this.statusElements = new Map();
    
    // Status history for tracking
    this.statusHistory = {
      network: [],
      api: []
    };
    
    // Statistics
    this.stats = {
      apiChecks: 0,
      apiSuccesses: 0,
      apiFailures: 0,
      networkChanges: 0,
      lastNetworkChange: null
    };
    
    // Bind methods that will be used as event handlers
    this.handleOnlineEvent = this.handleOnlineEvent.bind(this);
    this.handleOfflineEvent = this.handleOfflineEvent.bind(this);
    this.handleApiCheckInterval = this.handleApiCheckInterval.bind(this);
  }
  
  /**
   * Initialize the status service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly
      this.logger = new LogManager({
        context: 'status-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing status service');
      
      // Resolve dependencies
      await this.resolveDependencies();
      
      // Set up status monitoring
      await this.setupStatusMonitoring();
      
      this.initialized = true;
      this.logger.info('Status service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing status service:', error);
      } else {
        console.error('Error initializing status service:', error);
      }
      return false;
    }
  }
  
  /**
   * Resolve service dependencies
   * @private
   */
  async resolveDependencies() {
    try {
      // Get notification service (optional)
      try {
        this.notificationService = container.getService('notificationService');
        this.logger.debug('Notification service resolved successfully');
      } catch (error) {
        this.logger.warn('Notification service not available, notifications will be disabled');
        this.notificationService = null;
      }
      
      // Get storage service (optional)
      try {
        this.storageService = container.getService('storageService');
        this.logger.debug('Storage service resolved successfully');
      } catch (error) {
        this.logger.warn('Storage service not available, fallback to direct Chrome API');
        this.storageService = null;
      }
    } catch (error) {
      this.logger.warn('Error resolving dependencies:', error);
      // Continue even if dependencies can't be resolved
    }
  }
  
  /**
   * Set up status monitoring for network and API
   * @returns {Promise<void>}
   * @private
   */
  async setupStatusMonitoring() {
    this.logger.debug('Setting up status monitoring');
    
    try {
      // Update initial status
      this.updateNetworkStatus();
      
      // Add event listeners for online/offline events
      window.addEventListener('online', this.handleOnlineEvent);
      window.addEventListener('offline', this.handleOfflineEvent);
      
      // Set up periodic API status check
      await this.setupApiStatusCheck();
      
      this.logger.info('Status monitoring set up successfully');
    } catch (error) {
      this.logger.error('Error setting up status monitoring:', error);
      throw error;
    }
  }
  
  /**
   * Handle online event
   * @param {Event} event - Online event
   * @private
   */
  handleOnlineEvent(event) {
    this.logger.info('Network status changed to online');
    this.isOnline = true;
    
    // Track status change
    this.trackNetworkStatusChange('online');
    
    // Update UI
    this.updateNetworkStatus();
    
    // Check API status when coming back online
    this.checkApiStatus().catch(error => {
      this.logger.error('Error checking API status after coming online:', error);
    });
    
    // Notify user
    this.showNotification('Network connection restored', 'success');
  }
  
  /**
   * Handle offline event
   * @param {Event} event - Offline event
   * @private
   */
  handleOfflineEvent(event) {
    this.logger.info('Network status changed to offline');
    this.isOnline = false;
    
    // Track status change
    this.trackNetworkStatusChange('offline');
    
    // Update UI
    this.updateNetworkStatus();
    
    // Set API status to offline as well
    this.apiStatus = 'offline';
    this.trackApiStatusChange('offline', 'Network is offline');
    this.updateApiStatusIndicator();
    
    // Notify user
    this.showNotification('Network connection lost', 'warning');
  }
  
  /**
   * Track network status changes
   * @param {string} status - New network status
   * @private
   */
  trackNetworkStatusChange(status) {
    // Update stats
    this.stats.networkChanges++;
    this.stats.lastNetworkChange = Date.now();
    
    // Add to history with timestamp, limited to 50 entries
    this.statusHistory.network.unshift({
      status,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.statusHistory.network.length > 50) {
      this.statusHistory.network.pop();
    }
  }
  
  /**
   * Track API status changes
   * @param {string} status - New API status
   * @param {string} reason - Reason for the status change
   * @private
   */
  trackApiStatusChange(status, reason) {
    // Add to history with timestamp, limited to 50 entries
    this.statusHistory.api.unshift({
      status,
      reason,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.statusHistory.api.length > 50) {
      this.statusHistory.api.pop();
    }
  }
  
  /**
   * Show notification using notification service
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @private
   */
  showNotification(message, type) {
    if (this.notificationService) {
      try {
        this.notificationService.showNotification(message, type);
      } catch (error) {
        this.logger.error('Error showing notification:', error);
      }
    }
  }
  
  /**
   * Update network status indicators
   * @private
   */
  updateNetworkStatus() {
    try {
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      if (statusDot && statusText) {
        // Store references for later cleanup
        this.statusElements.set('networkDot', statusDot);
        this.statusElements.set('networkText', statusText);
        
        // Update UI
        if (this.isOnline) {
          statusDot.classList.add('online');
          statusDot.classList.remove('offline');
          statusText.textContent = 'Online';
        } else {
          statusDot.classList.remove('online');
          statusDot.classList.add('offline');
          statusText.textContent = 'Offline';
        }
      } else {
        this.logger.debug('Status indicators not found for update');
      }
      
      // Send status to background script
      this.sendNetworkStatusToBackground();
      
      this.logger.debug(`Network status indicators updated to: ${this.isOnline ? 'Online' : 'Offline'}`);
    } catch (error) {
      this.logger.error('Error updating network status indicators:', error);
    }
  }
  
  /**
   * Send network status to background script
   * @private
   */
  sendNetworkStatusToBackground() {
    try {
      chrome.runtime.sendMessage({ 
        action: 'networkStatusChange', 
        isOnline: this.isOnline 
      }).catch(error => {
        this.logger.debug('Could not send message to background script (it may be inactive)');
      });
    } catch (error) {
      // This is normal if background script is not ready or in MV3 inactive state
      this.logger.debug('Error sending network status to background:', error);
    }
  }
  
  /**
   * Set up periodic API status check
   * @returns {Promise<void>}
   * @private
   */
  async setupApiStatusCheck() {
    try {
      // Initial check
      await this.checkApiStatus();
      
      // Clear any existing interval
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
      
      // Set up periodic check
      this.checkIntervalId = setInterval(this.handleApiCheckInterval, this.API_CHECK_INTERVAL);
      
      this.logger.debug(`API status check scheduled every ${this.API_CHECK_INTERVAL / 1000} seconds`);
    } catch (error) {
      this.logger.error('Error setting up API status check:', error);
      throw error;
    }
  }
  
  /**
   * Handle API check interval
   * @private
   */
  handleApiCheckInterval() {
    this.checkApiStatus().catch(error => {
      this.logger.error('Error in scheduled API status check:', error);
    });
  }
  
  /**
   * Check API server status
   * @returns {Promise<string>} API status
   */
  async checkApiStatus() {
    // Skip check if offline
    if (!navigator.onLine) {
      this.apiStatus = 'offline';
      this.trackApiStatusChange('offline', 'Network is offline');
      this.updateApiStatusIndicator();
      this.logger.debug('Skipping API check due to offline network status');
      return this.apiStatus;
    }
    
    // Throttle checks
    const now = Date.now();
    if (now - this.lastApiCheck < 10000) { // No more than once per 10 seconds
      this.logger.debug('Skipping API check due to throttling');
      return this.apiStatus;
    }
    
    this.lastApiCheck = now;
    this.stats.apiChecks++;
    
    try {
      this.logger.debug('Checking API server status');
      
      // Update API status indicator to checking
      const previousStatus = this.apiStatus;
      this.apiStatus = 'checking';
      this.updateApiStatusIndicator();
      
      // Get API URL from storage
      let baseUrl = 'http://localhost:8000'; // Default fallback
      try {
        if (this.storageService) {
          const apiConfig = await this.storageService.get('apiConfig') || {};
          if (apiConfig.baseUrl) {
            baseUrl = apiConfig.baseUrl;
          }
        } else {
          const data = await chrome.storage.local.get('apiConfig');
          const apiConfig = data.apiConfig || {};
          if (apiConfig.baseUrl) {
            baseUrl = apiConfig.baseUrl;
          }
        }
      } catch (storageError) {
        this.logger.warn('Error getting API URL from storage, using default:', storageError);
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        // Make health check request
        const response = await fetch(`${baseUrl}/api/v1/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          // API is online
          this.apiStatus = 'online';
          this.stats.apiSuccesses++;
          this.trackApiStatusChange('online', 'API health check successful');
          this.logger.debug('API server is online');
        } else {
          // API returned error
          this.apiStatus = 'error';
          this.stats.apiFailures++;
          this.trackApiStatusChange('error', `API returned status ${response.status}`);
          this.logger.warn(`API health check failed with status ${response.status}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Check if it was a timeout
        if (fetchError.name === 'AbortError') {
          this.apiStatus = 'error';
          this.stats.apiFailures++;
          this.trackApiStatusChange('error', 'API request timed out');
          this.logger.warn('API health check timed out');
        } else {
          // API is offline or unreachable
          this.apiStatus = 'offline';
          this.stats.apiFailures++;
          this.trackApiStatusChange('offline', `API unreachable: ${fetchError.message}`);
          this.logger.error('API server unreachable:', fetchError);
        }
      }
      
      // Update UI if status changed
      if (previousStatus !== this.apiStatus) {
        this.updateApiStatusIndicator();
        
        // Notify on status changes (only from a definite state to another)
        if (previousStatus !== 'unknown' && previousStatus !== 'checking') {
          if (this.apiStatus === 'online' && (previousStatus === 'offline' || previousStatus === 'error')) {
            this.showNotification('API connection restored', 'success');
          } else if (this.apiStatus === 'offline' && previousStatus === 'online') {
            this.showNotification('API connection lost', 'warning');
          } else if (this.apiStatus === 'error' && previousStatus === 'online') {
            this.showNotification('API connection error', 'error');
          }
        }
      }
      
      return this.apiStatus;
    } catch (error) {
      this.stats.apiFailures++;
      this.apiStatus = 'error';
      this.trackApiStatusChange('error', `Error checking API: ${error.message}`);
      this.updateApiStatusIndicator();
      this.logger.error('Error checking API status:', error);
      return this.apiStatus;
    }
  }
  
  /**
   * Update API status indicator
   * @private
   */
  updateApiStatusIndicator() {
    try {
      const apiStatusDot = document.querySelector('.api-status-dot');
      const apiStatusText = document.querySelector('.api-status-text');
      
      if (apiStatusDot && apiStatusText) {
        // Store references for later cleanup
        this.statusElements.set('apiDot', apiStatusDot);
        this.statusElements.set('apiText', apiStatusText);
        
        // Remove all status classes
        apiStatusDot.classList.remove('online', 'offline', 'error', 'checking', 'unknown');
        
        // Update based on current status
        switch (this.apiStatus) {
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
        
        this.logger.debug(`API status indicator updated to: ${this.apiStatus}`);
      } else {
        this.logger.debug('API status indicators not found');
      }
    } catch (error) {
      this.logger.error('Error updating API status indicator:', error);
    }
  }
  
  /**
   * Get current network status
   * @returns {Promise<boolean>} Whether the network is online
   */
  async getNetworkStatus() {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during getNetworkStatus:', error);
        // Fall back to navigator.onLine if initialization fails
        return navigator.onLine;
      }
    }
    return this.isOnline;
  }
  
  /**
   * Get current API status
   * @returns {Promise<string>} API status ('online', 'offline', 'error', 'unknown', 'checking')
   */
  async getApiStatus() {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during getApiStatus:', error);
        return 'unknown';
      }
    }
    return this.apiStatus;
  }
  
  /**
   * Force check of API status
   * @returns {Promise<string>} API status
   */
  async forceApiStatusCheck() {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during forceApiStatusCheck:', error);
        return 'unknown';
      }
    }
    
    // Reset last check time to force a check
    this.lastApiCheck = 0;
    return this.checkApiStatus();
  }
  
  /**
   * Force update of all status indicators
   * @returns {Promise<void>}
   */
  async refreshStatusIndicators() {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during refreshStatusIndicators:', error);
        return;
      }
    }
    
    this.updateNetworkStatus();
    this.updateApiStatusIndicator();
  }
  
  /**
   * Get status history
   * @returns {object} Status history for network and API
   */
  getStatusHistory() {
    return {
      network: [...this.statusHistory.network],
      api: [...this.statusHistory.api]
    };
  }
  
  /**
   * Get statistics
   * @returns {object} Service statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      apiSuccessRate: this.stats.apiChecks > 0 
        ? Math.round((this.stats.apiSuccesses / this.stats.apiChecks) * 100) + '%'
        : '0%',
      currentNetworkStatus: this.isOnline ? 'online' : 'offline',
      currentApiStatus: this.apiStatus
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasLogger: !!this.logger,
      hasNotificationService: !!this.notificationService,
      hasStorageService: !!this.storageService,
      isOnline: this.isOnline,
      apiStatus: this.apiStatus,
      lastApiCheck: this.lastApiCheck,
      checkIntervalActive: !!this.checkIntervalId,
      trackedElements: this.statusElements.size,
      networkHistoryEntries: this.statusHistory.network.length,
      apiHistoryEntries: this.statusHistory.api.length
    };
  }
  
  /**
   * Update check interval
   * @param {number} interval - New interval in milliseconds
   */
  updateCheckInterval(interval) {
    if (typeof interval !== 'number' || interval < 5000) {
      this.logger?.warn(`Invalid check interval: ${interval}, must be at least 5000ms`);
      return;
    }
    
    this.API_CHECK_INTERVAL = interval;
    
    // Reset interval timer
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = setInterval(this.handleApiCheckInterval, this.API_CHECK_INTERVAL);
    }
    
    this.logger?.info(`API check interval updated to ${interval}ms`);
  }
  
  /**
   * Clean up event listeners and intervals
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger?.info('Cleaning up status service');
    
    // Remove event listeners
    window.removeEventListener('online', this.handleOnlineEvent);
    window.removeEventListener('offline', this.handleOfflineEvent);
    
    // Clear interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    // Reset status elements
    this.statusElements.clear();
    
    this.initialized = false;
    this.logger?.debug('Status service cleanup complete');
  }
}