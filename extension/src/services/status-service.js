// services/status-service.js
import { container } from '../core/dependency-container.js';

/**
 * Status Service - Monitors network and API status
 */
export class StatusService {
  /**
   * Create a new StatusService instance
   */
  constructor() {
    // Status state
    this.isOnline = navigator.onLine;
    this.apiStatus = 'unknown'; // 'online', 'offline', 'error', 'unknown', 'checking'
    this.lastApiCheck = 0;
    this.API_CHECK_INTERVAL = 60000; // 1 minute
    this.initialized = false;
    this.checkIntervalId = null;
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
      // Get logger instance
      this.logger = new (container.getUtil('LogManager'))({
        context: 'status-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing status service');
      
      // Set up status monitoring
      this.setupStatusMonitoring();
      
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
   * Set up status monitoring for network and API
   */
  setupStatusMonitoring() {
    this.logger.debug('Setting up status monitoring');
    
    try {
      // Update initial status
      this.updateNetworkStatus();
      
      // Add event listeners for online/offline events
      window.addEventListener('online', this.handleOnlineEvent.bind(this));
      window.addEventListener('offline', this.handleOfflineEvent.bind(this));
      
      // Set up periodic API status check
      this.setupApiStatusCheck();
      
      this.logger.info('Status monitoring set up successfully');
    } catch (error) {
      this.logger.error('Error setting up status monitoring:', error);
      throw error;
    }
  }
  
  /**
   * Handle online event
   * @param {Event} event - Online event
   */
  handleOnlineEvent(event) {
    this.logger.info('Network status changed to online');
    this.isOnline = true;
    this.updateNetworkStatus();
    
    // Check API status when coming back online
    this.checkApiStatus();
    
    // Notify user
    const notificationService = container.getService('notificationService');
    if (notificationService) {
      notificationService.showNotification('Network connection restored', 'success');
    }
  }
  
  /**
   * Handle offline event
   * @param {Event} event - Offline event
   */
  handleOfflineEvent(event) {
    this.logger.info('Network status changed to offline');
    this.isOnline = false;
    this.updateNetworkStatus();
    
    // Set API status to offline as well
    this.apiStatus = 'offline';
    this.updateApiStatusIndicator();
    
    // Notify user
    const notificationService = container.getService('notificationService');
    if (notificationService) {
      notificationService.showNotification('Network connection lost', 'warning');
    }
  }
  
  /**
   * Update network status indicators
   */
  updateNetworkStatus() {
    try {
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      if (!statusDot || !statusText) {
        this.logger.warn('Status indicators not found for update');
        return;
      }
      
      if (this.isOnline) {
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
          isOnline: this.isOnline 
        });
      } catch (messageError) {
        this.logger.error('Error sending network status to background:', messageError);
      }
      
      this.logger.debug(`Network status indicators updated to: ${this.isOnline ? 'Online' : 'Offline'}`);
    } catch (error) {
      this.logger.error('Error updating network status indicators:', error);
    }
  }
  
  /**
   * Set up periodic API status check
   */
  setupApiStatusCheck() {
    // Initial check
    this.checkApiStatus();
    
    // Set up periodic check
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    this.checkIntervalId = setInterval(() => this.checkApiStatus(), this.API_CHECK_INTERVAL);
    
    this.logger.debug(`API status check scheduled every ${this.API_CHECK_INTERVAL / 1000} seconds`);
  }
  
  /**
   * Check API server status
   * @returns {Promise<string>} API status
   */
  async checkApiStatus() {
    // Skip check if offline
    if (!navigator.onLine) {
      this.apiStatus = 'offline';
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
    
    try {
      this.logger.debug('Checking API server status');
      
      // Get API URL from storage
      const data = await chrome.storage.local.get('apiConfig');
      const apiConfig = data.apiConfig || {};
      const baseUrl = apiConfig.baseUrl || 'http://localhost:8000';
      
      // Update API status indicator to checking
      this.apiStatus = 'checking';
      this.updateApiStatusIndicator();
      
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
        this.apiStatus = 'online';
        this.logger.debug('API server is online');
      } else {
        // API returned error
        this.apiStatus = 'error';
        this.logger.warn(`API health check failed with status ${response.status}`);
      }
    } catch (error) {
      // API is offline or unreachable
      this.apiStatus = 'offline';
      this.logger.error('API server unreachable:', error);
    }
    
    // Update UI
    this.updateApiStatusIndicator();
    
    return this.apiStatus;
  }
  
  /**
   * Update API status indicator
   */
  updateApiStatusIndicator() {
    try {
      const apiStatusDot = document.querySelector('.api-status-dot');
      const apiStatusText = document.querySelector('.api-status-text');
      
      if (!apiStatusDot || !apiStatusText) {
        this.logger.warn('API status indicators not found');
        return;
      }
      
      // Remove all status classes
      apiStatusDot.classList.remove('online', 'offline', 'error', 'checking');
      
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
    } catch (error) {
      this.logger.error('Error updating API status indicator:', error);
    }
  }
  
  /**
   * Get current network status
   * @returns {boolean} Whether the network is online
   */
  getNetworkStatus() {
    return this.isOnline;
  }
  
  /**
   * Get current API status
   * @returns {string} API status ('online', 'offline', 'error', 'unknown', 'checking')
   */
  getApiStatus() {
    return this.apiStatus;
  }
  
  /**
   * Force update of all status indicators
   */
  refreshStatusIndicators() {
    this.updateNetworkStatus();
    this.updateApiStatusIndicator();
  }
  
  /**
   * Clean up event listeners and intervals
   */
  cleanup() {
    // Remove event listeners
    window.removeEventListener('online', this.handleOnlineEvent.bind(this));
    window.removeEventListener('offline', this.handleOfflineEvent.bind(this));
    
    // Clear interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    this.logger.debug('Status service cleaned up');
  }
}