// services/status-service.js
import { BaseService } from '../core/base-service.js';
import { LogManager } from '../utils/log-manager.js';

/**
 * Status Service - Monitors network and API status
 */
export class StatusService extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    apiCheckInterval: 60000,     // 1 minute
    maxStatusHistory: 50,        // Maximum entries in status history
    apiTimeout: 5000,           // API check timeout in ms
    minCheckInterval: 5000,     // Minimum allowed check interval
    maxRetryAttempts: 3,        // Maximum API check retry attempts
    retryBackoffBase: 1000,     // Base delay for retry backoff
    retryBackoffMax: 30000,     // Maximum retry delay
    circuitBreakerThreshold: 5,  // Number of failures before circuit breaker opens
    circuitBreakerTimeout: 60000 // Circuit breaker reset timeout
  };

  /**
   * Create a new StatusService instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 3,
      retryBackoffBase: 1000,
      retryBackoffMax: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });

    // State initialization
    this._config = {
      ...StatusService._DEFAULT_CONFIG,
      ...options
    };

    // Status state
    this._isOnline = navigator.onLine;
    this._apiStatus = 'unknown';
    this._lastApiCheck = 0;
    this._checkIntervalId = null;
    
    // Dependencies
    this._notificationService = null;
    this._storageService = null;
    
    // DOM element references for cleanup
    this._statusElements = new Map();
    
    // Status history for tracking
    this._statusHistory = {
      network: [],
      api: []
    };
    
    // Statistics
    this._stats = {
      apiChecks: 0,
      apiSuccesses: 0,
      apiFailures: 0,
      networkChanges: 0,
      lastNetworkChange: null
    };
  }
  
  /**
   * Initialize the status service
   * @returns {Promise<boolean>} Success state
   * @private
   */
  async _performInitialization() {
    try {
      // Create logger
      this._logger = new LogManager({
        context: 'status-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing status service');
      
      // Resolve dependencies
      await this._resolveDependencies();
      
      // Set up status monitoring
      await this._setupStatusMonitoring();
      
      this._logger.info('Status service initialized successfully');
      return true;
    } catch (error) {
      this._logger?.error('Error initializing status service:', error);
      throw error;
    }
  }


  /**
   * Set network status
   * @param {boolean} isOnline - Whether the network is online
   * @private
   */
  _setNetworkStatus(isOnline) {
    if (this._isOnline !== isOnline) {
      this._isOnline = isOnline;
      this._trackNetworkStatusChange(isOnline ? 'online' : 'offline');
      this._updateNetworkStatus();
    }
  }

  /**
   * Register content script for a tab
   * @param {number} tabId - Tab ID
   * @param {string} url - Tab URL
   * @private
   */
  _registerContentScript(tabId, url) {
    this._logger.debug(`Registering content script for tab ${tabId}: ${url}`);
    // Implementation will be added when content script functionality is needed
  }

  /**
   * Update tab status
   * @param {number} tabId - Tab ID
   * @param {object} status - Tab status
   * @private
   */
  _updateTabStatus(tabId, status) {
    this._logger.debug(`Updating status for tab ${tabId}:`, status);
    // Implementation will be added when tab status tracking is needed
  }

  /**
   * Register a tab
   * @param {number} tabId - Tab ID
   * @param {object} info - Tab information
   * @private
   */
  _registerTab(tabId, info) {
    this._logger.debug(`Registering tab ${tabId}:`, info);
    // Implementation will be added when tab registration is needed
  }

  /**
   * Set relationship between tabs
   * @param {number} tabId - Tab ID
   * @param {number} relatedTabId - Related tab ID
   * @param {string} relationship - Relationship type
   * @private
   */
  _setTabRelationship(tabId, relatedTabId, relationship) {
    this._logger.debug(`Setting relationship ${relationship} between tabs ${tabId} and ${relatedTabId}`);
    // Implementation will be added when tab relationships are needed
  }

  /**
   * Resolve service dependencies
   * @private
   */
  async _resolveDependencies() {
    try {
      // Get notification service (optional)
      try {
        this._notificationService = this._container.getService('notificationService');
        this._logger.debug('Notification service resolved successfully');
      } catch (error) {
        this._logger.warn('Notification service not available, notifications will be disabled');
        this._notificationService = null;
      }
      
      // Get storage service (optional)
      try {
        this._storageService = this._container.getService('storageService');
        this._logger.debug('Storage service resolved successfully');
      } catch (error) {
        this._logger.warn('Storage service not available, fallback to direct Chrome API');
        this._storageService = null;
      }
    } catch (error) {
      this._logger.warn('Error resolving dependencies:', error);
      // Continue even if dependencies can't be resolved
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
  async _setupStatusMonitoring() {
    this._logger.debug('Setting up status monitoring');
    
    try {
      // Update initial status
      this._updateNetworkStatus();
      
      // Add event listeners for online/offline events
      this._resourceTracker.trackEventListener(window, 'online', this._handleOnlineEvent.bind(this));
      this._resourceTracker.trackEventListener(window, 'offline', this._handleOfflineEvent.bind(this));
      
      // Set up periodic API status check
      await this._setupApiStatusCheck();
      
      this._logger.info('Status monitoring set up successfully');
    } catch (error) {
      this._logger.error('Error setting up status monitoring:', error);
      throw error;
    }
  }
  
  /**
   * Handle online event
   * @param {Event} event - Online event
   * @private
   */
  _handleOnlineEvent(event) {
    this._logger.info('Network status changed to online');
    this._isOnline = true;
    
    // Track status change
    this._trackNetworkStatusChange('online');
    
    // Update UI
    this._updateNetworkStatus();
    
    // Check API status when coming back online
    this._checkApiStatus().catch(error => {
      this._logger.error('Error checking API status after coming online:', error);
    });
    
    // Notify user
    this._showNotification('Network connection restored', 'success');
  }
  
  /**
   * Handle offline event
   * @param {Event} event - Offline event
   * @private
   */
  _handleOfflineEvent(event) {
    this._logger.info('Network status changed to offline');
    this._isOnline = false;
    
    // Track status change
    this._trackNetworkStatusChange('offline');
    
    // Update UI
    this._updateNetworkStatus();
    
    // Set API status to offline as well
    this._apiStatus = 'offline';
    this._trackApiStatusChange('offline', 'Network is offline');
    this._updateApiStatusIndicator();
    
    // Notify user
    this._showNotification('Network connection lost', 'warning');
  }
  
  /**
   * Track network status changes
   * @param {string} status - New network status
   * @private
   */
  _trackNetworkStatusChange(status) {
    // Update stats
    this._stats.networkChanges++;
    this._stats.lastNetworkChange = Date.now();
    
    // Add to history with timestamp, limited to maxStatusHistory entries
    this._statusHistory.network.unshift({
      status,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this._statusHistory.network.length > this._config.maxStatusHistory) {
      this._statusHistory.network.pop();
    }
  }
  
  /**
   * Track API status changes
   * @param {string} status - New API status
   * @param {string} reason - Reason for the status change
   * @private
   */
  _trackApiStatusChange(status, reason) {
    // Add to history with timestamp, limited to maxStatusHistory entries
    this._statusHistory.api.unshift({
      status,
      reason,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this._statusHistory.api.length > this._config.maxStatusHistory) {
      this._statusHistory.api.pop();
    }
  }
  
  /**
   * Show notification using notification service
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @private
   */
  _showNotification(message, type) {
    if (this._notificationService) {
      try {
        this._notificationService.showNotification(message, type);
      } catch (error) {
        this._logger.error('Error showing notification:', error);
      }
    }
  }
  
  /**
   * Update network status indicators
   * @private
   */
  _updateNetworkStatus() {
    try {
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      if (statusDot && statusText) {
        // Track DOM elements for cleanup
        this._resourceTracker.trackDOMElement(statusDot);
        this._resourceTracker.trackDOMElement(statusText);
        
        // Store references for later cleanup
        this._statusElements.set('networkDot', statusDot);
        this._statusElements.set('networkText', statusText);
        
        // Update UI
        if (this._isOnline) {
          statusDot.classList.add('online');
          statusDot.classList.remove('offline');
          statusText.textContent = 'Online';
        } else {
          statusDot.classList.remove('online');
          statusDot.classList.add('offline');
          statusText.textContent = 'Offline';
        }
      } else {
        this._logger.debug('Status indicators not found for update');
      }
      
      // Send status to background script
      this._sendNetworkStatusToBackground();
      
      this._logger.debug(`Network status indicators updated to: ${this._isOnline ? 'Online' : 'Offline'}`);
    } catch (error) {
      this._logger.error('Error updating network status indicators:', error);
    }
  }
  
  /**
   * Send network status to background script
   * @private
   */
  _sendNetworkStatusToBackground() {
    try {
      const port = chrome.runtime.connect();
      this._resourceTracker.trackMessagePort(port);
      
      port.postMessage({ 
        action: 'networkStatusChange', 
        isOnline: this._isOnline 
      });
      
      port.onDisconnect.addListener(() => {
        this._logger.debug('Background connection closed');
      });
    } catch (error) {
      // This is normal if background script is not ready or in MV3 inactive state
      this._logger.debug('Error sending network status to background:', error);
    }
  }
  
  /**
   * Set up periodic API status check
   * @returns {Promise<void>}
   * @private
   */
  async _setupApiStatusCheck() {
    try {
      // Initial check
      await this._checkApiStatus();
      
      // Clear any existing interval
      if (this._checkIntervalId) {
        clearInterval(this._checkIntervalId);
        this._checkIntervalId = null;
      }
      
      // Set up periodic check
      this._checkIntervalId = this._resourceTracker.trackInterval(
        this._handleApiCheckInterval.bind(this),
        this._config.apiCheckInterval
      );
      
      this._logger.debug(`API status check scheduled every ${this._config.apiCheckInterval / 1000} seconds`);
    } catch (error) {
      this._logger.error('Error setting up API status check:', error);
      throw error;
    }
  }
  
  /**
   * Check API server status
   * @returns {Promise<string>} API status
   * @private
   */
  async _checkApiStatus() {
    // Skip check if offline
    if (!navigator.onLine) {
      this._apiStatus = 'offline';
      this._trackApiStatusChange('offline', 'Network is offline');
      this._updateApiStatusIndicator();
      this._logger.debug('Skipping API check due to offline network status');
      return this._apiStatus;
    }
    
    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      this._logger.warn('Circuit breaker open, API check suppressed');
      return this._apiStatus;
    }
    
    // Throttle checks
    const now = Date.now();
    if (now - this._lastApiCheck < 10000) { // No more than once per 10 seconds
      this._logger.debug('Skipping API check due to throttling');
      return this._apiStatus;
    }
    
    this._lastApiCheck = now;
    this._stats.apiChecks++;
    
    try {
      this._logger.debug('Checking API server status');
      
      // Update API status indicator to checking
      const previousStatus = this._apiStatus;
      this._apiStatus = 'checking';
      this._updateApiStatusIndicator();
      
      // Get API URL from storage
      let baseUrl = 'http://localhost:8000'; // Default fallback
      try {
        if (this._storageService) {
          const apiConfig = await this._storageService.get('apiConfig') || {};
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
        this._logger.warn('Error getting API URL from storage, using default:', storageError);
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = this._resourceTracker.trackTimeout(
        () => controller.abort(),
        this._config.apiTimeout
      );
      
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
          this._apiStatus = 'online';
          this._stats.apiSuccesses++;
          this._trackApiStatusChange('online', 'API health check successful');
          this._logger.debug('API server is online');
          this._resetCircuitBreaker();
        } else {
          // API returned error
          this._apiStatus = 'error';
          this._stats.apiFailures++;
          this._trackApiStatusChange('error', `API returned status ${response.status}`);
          this._logger.warn(`API health check failed with status ${response.status}`);
          this._recordCircuitBreakerFailure();
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Check if it was a timeout
        if (fetchError.name === 'AbortError') {
          this._apiStatus = 'error';
          this._stats.apiFailures++;
          this._trackApiStatusChange('error', 'API request timed out');
          this._logger.warn('API health check timed out');
        } else {
          // API is offline or unreachable
          this._apiStatus = 'offline';
          this._stats.apiFailures++;
          this._trackApiStatusChange('offline', `API unreachable: ${fetchError.message}`);
          this._logger.error('API server unreachable:', fetchError);
        }
        this._recordCircuitBreakerFailure();
      }
      
      // Update UI if status changed
      if (previousStatus !== this._apiStatus) {
        this._updateApiStatusIndicator();
        
        // Notify on status changes (only from a definite state to another)
        if (previousStatus !== 'unknown' && previousStatus !== 'checking') {
          if (this._apiStatus === 'online' && (previousStatus === 'offline' || previousStatus === 'error')) {
            this._showNotification('API connection restored', 'success');
          } else if (this._apiStatus === 'offline' && previousStatus === 'online') {
            this._showNotification('API connection lost', 'warning');
          } else if (this._apiStatus === 'error' && previousStatus === 'online') {
            this._showNotification('API connection error', 'error');
          }
        }
      }
      
      return this._apiStatus;
    } catch (error) {
      this._stats.apiFailures++;
      this._apiStatus = 'error';
      this._trackApiStatusChange('error', `Error checking API: ${error.message}`);
      this._updateApiStatusIndicator();
      this._logger.error('Error checking API status:', error);
      this._recordCircuitBreakerFailure();
      return this._apiStatus;
    }
  }
  
  /**
   * Update API status indicator
   * @private
   */
  _updateApiStatusIndicator() {
    try {
      const apiStatusDot = document.querySelector('.api-status-dot');
      const apiStatusText = document.querySelector('.api-status-text');
      
      if (apiStatusDot && apiStatusText) {
        // Track DOM elements for cleanup
        this._resourceTracker.trackDOMElement(apiStatusDot);
        this._resourceTracker.trackDOMElement(apiStatusText);
        
        // Store references for later cleanup
        this._statusElements.set('apiDot', apiStatusDot);
        this._statusElements.set('apiText', apiStatusText);
        
        // Remove all status classes
        apiStatusDot.classList.remove('online', 'offline', 'error', 'checking', 'unknown');
        
        // Update based on current status
        switch (this._apiStatus) {
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
        
        this._logger.debug(`API status indicator updated to: ${this._apiStatus}`);
      } else {
        this._logger.debug('API status indicators not found');
      }
    } catch (error) {
      this._logger.error('Error updating API status indicator:', error);
    }
  }
  
  /**
   * Get current network status
   * @returns {Promise<boolean>} Whether the network is online
   */
  async getNetworkStatus() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during getNetworkStatus:', error);
        // Fall back to navigator.onLine if initialization fails
        return navigator.onLine;
      }
    }
    return this._isOnline;
  }
  
  /**
   * Get current API status
   * @returns {Promise<string>} API status ('online', 'offline', 'error', 'unknown', 'checking')
   */
  async getApiStatus() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during getApiStatus:', error);
        return 'unknown';
      }
    }
    return this._apiStatus;
  }
  
  /**
   * Force check of API status
   * @returns {Promise<string>} API status
   */
  async forceApiStatusCheck() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during forceApiStatusCheck:', error);
        return 'unknown';
      }
    }
    
    // Reset last check time to force a check
    this._lastApiCheck = 0;
    return this._checkApiStatus();
  }
  
  /**
   * Force update of all status indicators
   * @returns {Promise<void>}
   */
  async refreshStatusIndicators() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during refreshStatusIndicators:', error);
        return;
      }
    }
    
    this._updateNetworkStatus();
    this._updateApiStatusIndicator();
  }
  
  /**
   * Get status history
   * @returns {object} Status history for network and API
   */
  getStatusHistory() {
    return {
      network: [...this._statusHistory.network],
      api: [...this._statusHistory.api]
    };
  }
  
  /**
   * Get statistics
   * @returns {object} Service statistics
   */
  getStatistics() {
    return {
      ...this._stats,
      apiSuccessRate: this._stats.apiChecks > 0 
        ? Math.round((this._stats.apiSuccesses / this._stats.apiChecks) * 100) + '%'
        : '0%',
      currentNetworkStatus: this._isOnline ? 'online' : 'offline',
      currentApiStatus: this._apiStatus
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      hasLogger: !!this._logger,
      hasNotificationService: !!this._notificationService,
      hasStorageService: !!this._storageService,
      isOnline: this._isOnline,
      apiStatus: this._apiStatus,
      lastApiCheck: this._lastApiCheck,
      checkIntervalActive: !!this._checkIntervalId,
      trackedElements: this._statusElements.size,
      networkHistoryEntries: this._statusHistory.network.length,
      apiHistoryEntries: this._statusHistory.api.length
    };
  }
  
  /**
   * Update check interval
   * @param {number} interval - New interval in milliseconds
   */
  updateCheckInterval(interval) {
    if (typeof interval !== 'number' || interval < this._config.minCheckInterval) {
      this._logger?.warn(`Invalid check interval: ${interval}, must be at least ${this._config.minCheckInterval}ms`);
      return;
    }
    
    this._config.apiCheckInterval = interval;
    
    // Reset interval timer
    if (this._checkIntervalId) {
      clearInterval(this._checkIntervalId);
      this._checkIntervalId = this._resourceTracker.trackInterval(
        this._handleApiCheckInterval.bind(this),
        this._config.apiCheckInterval
      );
    }
    
    this._logger?.info(`API check interval updated to ${interval}ms`);
  }
  
  /**
   * Clean up resources
   * @private
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up status service');
    
    // Clear check interval
    if (this._checkIntervalId) {
      clearInterval(this._checkIntervalId);
      this._checkIntervalId = null;
    }

    // Remove event listeners
    window.removeEventListener('online', this._handleOnlineEvent);
    window.removeEventListener('offline', this._handleOfflineEvent);

    // Clear status elements
    this._statusElements.clear();
    this._statusElements = null;

    // Clear history
    this._statusHistory.network = [];
    this._statusHistory.api = [];
    this._statusHistory = null;

    // Clear statistics
    this._stats = null;

    // Clear service references
    this._notificationService = null;
    this._storageService = null;

    // Reset state
    this._isOnline = navigator.onLine;
    this._apiStatus = 'unknown';
    this._lastApiCheck = 0;
  }

  /**
   * Handle memory pressure
   * @param {object} snapshot - Memory snapshot
   * @private
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Clean up old status history
    this._cleanupOldStatusHistory();
  }

  /**
   * Clean up old status history
   * @private
   */
  _cleanupOldStatusHistory() {
    const now = Date.now();
    const maxAge = this._config.maxTaskAge;

    // Clean up network history
    this._statusHistory.network = this._statusHistory.network.filter(entry => 
      now - entry.timestamp < maxAge
    );

    // Clean up API history
    this._statusHistory.api = this._statusHistory.api.filter(entry => 
      now - entry.timestamp < maxAge
    );

    this._logger?.debug('Cleaned up old status history entries');
  }
}