// services/api-service.js
import { BaseService } from '../services/base-service.js'
import { LogManager } from '../utils/log-manager.js';

/**
 * API Service - Handles all API communication for the extension
 */
export class ApiService extends BaseService {
  /**
   * Initialize the API service
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
    this._baseURL = 'http://localhost:8000'; // Default base URL
    this._apiKey = null;
    this._activeRequests = new Map(); // Changed from WeakMap to Map
    this._abortControllers = new Map(); // Changed from WeakMap to Map
    this._messagePorts = new Set(); // Track message ports
    
    // Request statistics with size limits
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsByEndpoint: {},
      averageResponseTime: 0,
      totalResponseTime: 0,
      maxEndpointStats: 1000, // Limit number of endpoints tracked
      maxRequestAge: 3600000 // 1 hour
    };
    
    // Configuration
    this._config = {
      timeoutMs: 30000,
      retryCount: 3,
      retryDelay: 1000,
      maxRequestHistory: 1000 // Limit request history
    };

    // Error tracking
    this._errorCounts = new Map();
    this._lastErrorTime = null;
  }
  
  /**
   * Get the initialization status
   * @returns {boolean} Whether the service is initialized
   */
  get initialized() {
    return this._initialized;
  }
  
  /**
   * Initialize the API service
   * @returns {Promise<boolean>} Success state
   */
  async _performInitialization() {
    try {
      // Create logger - detect context automatically
      this._logger = new LogManager({
        context: 'api-service',
        isBackgroundScript: typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getBackgroundPage,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing API service');
      
      // Load configuration from storage
      await this._loadConfiguration();
      
      // Initialize message handlers only if in background script context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getBackgroundPage) {
        await this._initializeMessageHandlers();
        this._logger.info('API service initialized successfully in background script context');
      } else {
        this._logger.info('API service initialized successfully in dashboard context');
      }
      
      return true;
    } catch (error) {
      this._logger?.error('Error initializing API service:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up API service in background script');
    
    // Remove message listeners
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(this._handleApiRequest);
    }
    
    // Cancel all in-flight requests
    await this._cancelAllRequests();
    
    // Clear Maps
    this._activeRequests.clear();
    this._abortControllers.clear();
    
    // Reset statistics
    this._resetStatistics();
    
    // Clear configuration
    this._config = null;
    this._baseURL = null;
    this._apiKey = null;
  }

  /**
   * Handle memory pressure
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Cancel non-essential requests
    await this._cancelNonEssentialRequests();
    
    // Clear request statistics
    this._resetStatistics();
  }

  /**
   * Load API configuration from storage
   * @private
   */
  async _loadConfiguration() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get(['apiConfig', 'apiServiceConfig']);
        
        // Load API endpoint configuration
        if (data.apiConfig?.baseURL) {
          this._baseURL = data.apiConfig.baseURL;
          this._logger?.debug(`API base URL set to: ${this._baseURL}`);
        }
        
        // Set API key if available
        if (data.apiConfig?.apiKey) {
          this._apiKey = data.apiConfig.apiKey;
          this._logger?.debug('API key configured');
        }
        
        // Load service configuration
        if (data.apiServiceConfig) {
          this._config = {
            ...this._config,
            ...data.apiServiceConfig
          };
          this._logger?.debug('API service configuration loaded', this._config);
        }
      } else {
        this._logger?.warn('Chrome storage APIs not available, using defaults');
      }
    } catch (error) {
      this._logger?.warn('Failed to load configuration, using defaults:', error);
    }
  }

  /**
   * Save API service configuration to storage
   * @private
   */
  async _saveConfiguration() {
    try {
      await chrome.storage.local.set({
        apiServiceConfig: this._config
      });
      this._logger.debug('API service configuration saved');
      return true;
    } catch (error) {
      this._logger.error('Failed to save configuration:', error);
      return false;
    }
  }

  /**
   * Cancel all in-flight requests
   * @private
   */
  async _cancelAllRequests() {
    this._logger?.debug(`Cancelling ${this._abortControllers.size} in-flight requests`);
    
    for (const [requestId, controller] of this._abortControllers) {
      try {
        controller.abort();
        this._logger?.debug(`Aborted request: ${requestId}`);
      } catch (error) {
        this._logger?.warn(`Error aborting request ${requestId}:`, error);
      }
    }
    
    this._abortControllers.clear();
    this._activeRequests.clear();
  }

  /**
   * Cancel non-essential requests during memory pressure
   * @private
   */
  async _cancelNonEssentialRequests() {
    for (const [requestId, request] of this._activeRequests) {
      if (!request.isEssential) {
        const controller = this._abortControllers.get(requestId);
        if (controller) {
          controller.abort();
          this._abortControllers.delete(requestId);
          this._activeRequests.delete(requestId);
        }
      }
    }
  }

  /**
   * Reset API stats
   * @private
   */
  _resetStatistics() {
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsByEndpoint: {},
      averageResponseTime: 0,
      totalResponseTime: 0,
      maxEndpointStats: 1000,
      maxRequestAge: 3600000
    };
  }
  
  /**
   * Set the base URL for API requests
   * @param {string} url - Base URL for API
   * @returns {Promise<boolean>} Success status
   */
  async setBaseUrl(url) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    if (!url) {
      this._logger.warn('Attempted to set empty base URL');
      return false;
    }
    
    try {
      this._baseURL = url;
      
      // Save to storage
      await chrome.storage.local.set({
        apiConfig: {
          ...await chrome.storage.local.get('apiConfig').then(data => data.apiConfig || {}),
          baseURL: url
        }
      });
      
      this._logger.debug(`API base URL updated to: ${url}`);
      return true;
    } catch (error) {
      this._logger.error('Error setting base URL:', error);
      return false;
    }
  }
  
  /**
   * Set the API key
   * @param {string} key - API key
   * @returns {Promise<boolean>} Success status
   */
  async setApiKey(key) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    if (!key) {
      this._logger.warn('Attempted to set empty API key');
      return false;
    }
    
    try {
      this._apiKey = key;
      
      // Save to storage
      await chrome.storage.local.set({
        apiConfig: {
          ...await chrome.storage.local.get('apiConfig').then(data => data.apiConfig || {}),
          apiKey: key
        }
      });
      
      this._logger.debug('API key updated');
      return true;
    } catch (error) {
      this._logger.error('Error setting API key:', error);
      return false;
    }
  }
  
  /**
   * Update API service configuration
   * @param {object} newConfig - New configuration options
   * @returns {Promise<boolean>} Success status
   */
  async updateConfiguration(newConfig) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    try {
      this._config = {
        ...this._config,
        ...newConfig
      };
      
      await this._saveConfiguration();
      this._logger.debug('Configuration updated:', this._config);
      return true;
    } catch (error) {
      this._logger.error('Error updating configuration:', error);
      return false;
    }
  }
  
  /**
   * Fetch API wrapper with error handling, retries, and timeout
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Response data
   */
  async fetchAPI(endpoint, options = {}) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error: `Service initialization failed: ${error.message}`
        };
      }
    }
    
    // Generate a unique request ID
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Update statistics
    this._stats.totalRequests++;
    this._updateEndpointStats(endpoint);
    
    const startTime = Date.now();
    
    try {
      // Call internal fetch with retry
      const result = await this._fetchWithRetry(endpoint, options, requestId);
      
      // Update timing stats
      const responseTime = Date.now() - startTime;
      this._updateTimingStats(responseTime);
      
      if (result.success) {
        this._stats.successfulRequests++;
      } else {
        this._stats.failedRequests++;
      }
      
      return {
        ...result,
        requestId,
        responseTime
      };
    } catch (error) {
      // Update timing stats
      const responseTime = Date.now() - startTime;
      this._updateTimingStats(responseTime);
      
      this._stats.failedRequests++;
      
      this._logger.error(`API Error: ${endpoint}`, { 
        error: error.message,
        requestId 
      });
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        requestId,
        responseTime
      };
    } finally {
      // Clean up request tracking
      this._activeRequests.delete(requestId);
      this._abortControllers.delete(requestId);
    }
  }
  
  /**
   * Internal fetch implementation with retry logic
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @param {string} requestId - Unique request ID
   * @param {number} retryCount - Current retry attempt (internal)
   * @returns {Promise<object>} Response data
   * @private
   */
  async _fetchWithRetry(endpoint, options = {}, requestId, retryCount = 0) {
    try {
      // console.log(`🔍 _fetchWithRetry called with endpoint: ${endpoint}, timeout: ${options.timeout}`);
      
      // Ensure endpoint starts with /
      const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      // Set default headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      };
      
      // Add API key if available
      if (this._apiKey && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${this._apiKey}`;
      }
      
      // Add request ID for tracking
      if (requestId) {
        headers['X-Request-ID'] = requestId;
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      let timeoutId;
      
      // Use the passed timeout or default
      const timeoutMs = options.timeout || this._config.timeoutMs;
      // console.log(`⏰ Setting up timeout for ${timeoutMs}ms`);
      
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          // console.log(`⏰ Timeout triggered after ${timeoutMs}ms, aborting request`);
          controller.abort();
        }, timeoutMs);
        // console.log(`⏰ Timeout ID set: ${timeoutId}`);
      }
      
      // Store abort controller for potential cleanup
      this._abortControllers.set(requestId, controller);
      // console.log(`📦 Stored abort controller for request: ${requestId}`);
      
      // Log request
      this._logger?.debug(`API Request: ${formattedEndpoint}`, { 
        method: options.method || 'GET',
        baseURL: this._baseURL,
        requestId
      });
      
      // Track this request
      this._activeRequests.set(requestId, {
        endpoint,
        startTime: Date.now(),
        options,
        isEssential: options.isEssential || false
      });
      
      // console.log(`🌐 Making fetch request to: ${this._baseURL}${formattedEndpoint}`);
      
      // Send request
      const fullUrl = `${this._baseURL}${formattedEndpoint}`;
      console.log(`🌐 Making fetch request to: ${fullUrl}`);
      const response = await fetch(fullUrl, {
        ...options,
        headers,
        signal: controller.signal
      });
      
      // console.log(`📥 Fetch completed, clearing timeout`);
      
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        // console.log(`⏰ Timeout cleared: ${timeoutId}`);
      }
      
      // Handle response
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      } else {
        // Handle HTTP errors
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        
        // Retry logic
        if (retryCount < this._config.retryCount && this._shouldRetry(response.status)) {
          const delay = this._config.retryDelay * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this._fetchWithRetry(endpoint, options, requestId, retryCount + 1);
        }
        
        throw error;
      }
    } catch (error) {
      // console.log(`❌ Error in _fetchWithRetry: ${error.name} - ${error.message}`);
      
      // Handle network errors
      if (error.name === 'AbortError') {
        // console.log(`⏰ AbortError caught, throwing timeout error`);
        throw new Error('Request timed out');
      }
      
      // Retry logic for network errors
      if (retryCount < this._config.retryCount && this._shouldRetry(0)) {
        const delay = this._config.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchWithRetry(endpoint, options, requestId, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Determine if a request should be retried based on status code
   * @param {number} statusCode - HTTP status code
   * @returns {boolean} Whether to retry
   * @private
   */
  _shouldRetry(statusCode) {
    // Retry on 5xx errors, rate limits, and network errors (status 0)
    return statusCode >= 500 || statusCode === 429 || statusCode === 0;
  }

  /**
   * Update endpoint statistics
   * @param {string} endpoint - API endpoint
   * @private
   */
  _updateEndpointStats(endpoint) {
    if (!this._stats.requestsByEndpoint[endpoint]) {
      this._stats.requestsByEndpoint[endpoint] = {
        count: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0
      };
    }
    this._stats.requestsByEndpoint[endpoint].count++;
  }

  /**
   * Update timing statistics
   * @param {number} responseTime - Response time in milliseconds
   * @private
   */
  _updateTimingStats(responseTime) {
    this._stats.totalResponseTime += responseTime;
    this._stats.averageResponseTime = this._stats.totalResponseTime / this._stats.totalRequests;
  }
  
  /**
   * Send a message to background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response from background script
   */
  async sendMessageToBackground(message) {
  if (!this._initialized) {
    try {
      await this.initialize();
    } catch (error) {
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }

  if (this._isCircuitBreakerOpen()) {
    throw new Error('Circuit breaker is open, message sending blocked');
  }
  
  return new Promise((resolve, reject) => {
    // ✅ SAFETY CHECK: Verify Chrome runtime APIs are available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(message).then(response => {
          if (chrome.runtime.lastError) {
            this._recordFailure('message');
            if (this._logger) {
              this._logger.error('Background message error:', chrome.runtime.lastError);
            }
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }).catch(error => {
          this._logger?.debug('Background message failed:', error);
          reject(error);
        });
      } catch (error) {
        this._logger?.error('Error sending runtime message:', error);
        reject(new Error(`Runtime message failed: ${error.message}`));
      }
    } else {
      // ✅ GRACEFUL DEGRADATION: Chrome APIs not available
      this._logger?.warn('Chrome runtime message APIs not available');
      reject(new Error('Chrome runtime message APIs not available'));
    }
  });
}
  
  /**
   * Check API connection status
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during checkConnection:', error);
        return false;
      }
    }
    
    try {
      // Try to connect to health endpoint
      const response = await this.fetchAPI('/api/health', {
        method: 'GET',
        timeout: 5000
      });
      
      return response && response.success && response.status === 'ok';
    } catch (error) {
      this._logger.warn('API connection check failed:', error);
      return false;
    }
  }
  
  /**
   * Get API stats
   * @returns {object} API request statistics
   */
  getStatistics() {
    return {
      ...this._stats,
      activeRequestCount: this._activeRequests.size,
      successRate: this._stats.totalRequests > 0 
        ? Math.round((this._stats.successfulRequests / this._stats.totalRequests) * 100) + '%'
        : '0%'
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      baseURL: this._baseURL,
      hasApiKey: !!this._apiKey,
      activeRequestCount: this._activeRequests.size,
      stats: {
        totalRequests: this._stats.totalRequests,
        successRate: this._stats.totalRequests > 0 
          ? Math.round((this._stats.successfulRequests / this._stats.totalRequests) * 100) + '%'
          : '0%',
        averageResponseTimeMs: Math.round(this._stats.averageResponseTime)
      }
    };
  }

  /**
   * Send a message to background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response from background script
   */
  async sendMessageToBackground(message) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        throw new Error(`Service initialization failed: ${error.message}`);
      }
    }

    if (this._isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open, message sending blocked');
    }
    
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message).then(response => {
          if (chrome.runtime.lastError) {
            this._recordFailure('message');
            if (this._logger) {
              this._logger.error('Background message error:', chrome.runtime.lastError);
            }
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }).catch(error => {
          this._logger?.debug('Background message failed:', error);
          reject(error);
        });
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  /**
   * Update endpoint statistics with size limits
   * @param {string} endpoint - API endpoint
   * @private
   */
  _updateEndpointStats(endpoint) {
    // Normalize endpoint by removing query parameters
    const normalizedEndpoint = endpoint.split('?')[0];
    
    // Clean up old entries if we exceed the limit
    if (Object.keys(this._stats.requestsByEndpoint).length >= this._stats.maxEndpointStats) {
      const oldestEndpoint = Object.entries(this._stats.requestsByEndpoint)
        .sort(([, a], [, b]) => a - b)[0][0];
      delete this._stats.requestsByEndpoint[oldestEndpoint];
    }
    
    if (!this._stats.requestsByEndpoint[normalizedEndpoint]) {
      this._stats.requestsByEndpoint[normalizedEndpoint] = 0;
    }
    
    this._stats.requestsByEndpoint[normalizedEndpoint]++;
  }

  /**
   * Clean up old request data
   * @private
   */
  _cleanupOldRequests() {
    const now = Date.now();
    for (const [requestId, request] of this._activeRequests) {
      if (now - request.startTime > this._stats.maxRequestAge) {
        this._activeRequests.delete(requestId);
        this._abortControllers.delete(requestId);
      }
    }
  }

  /**
   * Record a failure for circuit breaker
   * @param {string} type - Type of failure
   * @private
   */
  _recordFailure(type) {
    const now = Date.now();
    this._errorCounts.set(type, (this._errorCounts.get(type) || 0) + 1);
    this._lastErrorTime = now;

    // Clean up old error counts
    if (now - (this._lastErrorTime || 0) > this._circuitBreakerTimeout) {
      this._errorCounts.clear();
    }
  }

  /**
   * Check if circuit breaker is open
   * @returns {boolean} Whether circuit breaker is open
   * @private
   */
  _isCircuitBreakerOpen() {
    const now = Date.now();
    if (now - (this._lastErrorTime || 0) > this._circuitBreakerTimeout) {
      this._errorCounts.clear();
      return false;
    }

    return Array.from(this._errorCounts.values()).some(count => count >= this._circuitBreakerThreshold);
  }
  // extension/src/services/api-service.js
// Add message passing interface for background script

  /**
   * Initialize message handlers for background script communication
   * @private
   */
  async _initializeMessageHandlers() {
  try {
    // Check if Chrome runtime APIs are available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      // Listen for API requests from UI components
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this._logger?.debug('Received message in API service:', message);
        
        if (message.action === 'apiRequest') {
          this._handleApiRequest(message, sendResponse);
          return true; // Keep message channel open for async response
        }
        
        if (message.action === 'getApiStatus') {
          this._handleStatusRequest(sendResponse);
          return true;
        }
        
        if (message.action === 'updateApiConfig') {
          this._handleConfigUpdate(message, sendResponse);
          return true;
        }
        
        return false; // Message not handled
      });
      
      this._logger?.info('Message handlers initialized for API service');
    } else {
      // ✅ GRACEFUL DEGRADATION: Log and continue without message handlers
      this._logger?.warn('Chrome runtime message APIs not available, continuing without message handlers');
    }
  } catch (error) {
    // ✅ ERROR HANDLING: Don't crash, just log and continue
    this._logger?.error('Error setting up message handlers:', error);
    this._logger?.warn('Message handlers not available, continuing without them');
  }
}

  /**
   * Handle API requests from UI components
   * @param {object} message - The message containing the API request
   * @param {function} sendResponse - Function to send response back
   * @private
   */
  async _handleApiRequest(message, sendResponse) {
  const startTime = Date.now();
  const { endpoint, options = {}, requestId } = message;
  
  try {
    this._logger?.debug(`Processing API request: ${endpoint}`, { 
      requestId,
      method: options.method || 'GET',
      hasBody: !!options.body
    });
    
    // Validate request
    if (!endpoint) {
      throw new Error('Endpoint is required');
    }
    
    // Add request tracking
    this._activeRequests.set(requestId, {
      endpoint,
      startTime,
      options,
      isEssential: options.isEssential || false
    });
    
    // Make the API request
    const result = await this.fetchAPI(endpoint, options);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Send structured response back to UI
    sendResponse({
      success: true,
      data: result,
      requestId,
      responseTime,
      timestamp: new Date().toISOString()
    });
    
    this._logger?.debug(`API request completed: ${endpoint}`, { 
      success: result.success,
      requestId,
      responseTime
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    this._logger?.error('Error handling API request:', error);
    
    // Send structured error response
    sendResponse({
      success: false,
      error: {
        type: this._classifyError(error),
        message: error.message,
        diagnostic: {
          endpoint,
          requestId,
          responseTime,
          timestamp: new Date().toISOString(),
          retryCount: 0 // Could be enhanced to track actual retries
        }
      },
      requestId,
      responseTime,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Clean up request tracking
    this._activeRequests.delete(requestId);
  }
}

/**
 * Classify error for structured error responses
 * @param {Error} error - The error to classify
 * @returns {string} Error type
 * @private
 */
_classifyError(error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  
  if (error.name === 'AbortError') {
    return 'TIMEOUT_ERROR';
  }
  
  if (error.status >= 400 && error.status < 500) {
    return 'CLIENT_ERROR';
  }
  
  if (error.status >= 500) {
    return 'SERVER_ERROR';
  }
  
  if (error.message.includes('timed out')) {
    return 'TIMEOUT_ERROR';
  }
  
  return 'API_ERROR';
}

  /**
   * Handle status requests from UI components
   * @param {function} sendResponse - Function to send response back
   * @private
   */
  async _handleStatusRequest(sendResponse) {
  try {
    const status = this.getStatus();
    const stats = this.getStatistics();
    
    sendResponse({
      success: true,
      data: {
        status,
        statistics: stats
      }
    });
  } catch (error) {
    this._logger?.error('Error handling status request:', error);
    
    sendResponse({
      success: false,
      error: {
        type: 'STATUS_ERROR',
        message: error.message
      }
    });
  }
}

  /**
   * Handle configuration update requests
   * @param {object} message - The message containing config updates
   * @param {function} sendResponse - Function to send response back
   * @private
   */
  async _handleConfigUpdate(message, sendResponse) {
  try {
    const { config } = message;
    
    this._logger?.debug('Updating API configuration:', config);
    
    // Update configuration
    const success = await this.updateConfiguration(config);
    
    if (success) {
      sendResponse({
        success: true,
        message: 'Configuration updated successfully'
      });
    } else {
      sendResponse({
        success: false,
        error: {
          type: 'CONFIG_ERROR',
          message: 'Failed to update configuration'
        }
      });
    }
  } catch (error) {
    this._logger?.error('Error handling config update:', error);
    
    sendResponse({
      success: false,
      error: {
        type: 'CONFIG_ERROR',
        message: error.message
      }
    });
  }
}

  /**
   * Send API request from UI component (for backward compatibility)
   * @param {string} endpoint - API endpoint
   * @param {object} options - Request options
   * @returns {Promise<object>} Response data
   */
  async sendApiRequest(endpoint, options = {}) {
  if (!this._initialized) {
    try {
      await this.initialize();
    } catch (error) {
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }
  
  // Generate request ID
  const requestId = `ui-req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Create message for internal routing
  const message = {
    action: 'apiRequest',
    endpoint,
    options,
    requestId
  };
  
  // Use internal handler directly
  return new Promise((resolve, reject) => {
    this._handleApiRequest(message, (response) => {
      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error.message));
      }
    });
  });
}

  /**
   * Get service status from UI component
   * @returns {Promise<object>} Service status
   */
  async getServiceStatus() {
  if (!this._initialized) {
    try {
      await this.initialize();
    } catch (error) {
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }
  
  return new Promise((resolve, reject) => {
    this._handleStatusRequest((response) => {
      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error.message));
      }
    });
  });
  }

  /**
   * Enhanced health checking with BackendHealthMonitor integration
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during checkConnection:', error);
        return false;
      }
    }
    
    try {
      // Try to connect to health endpoint
      const response = await this.fetchAPI('/api/v1/health', {
        method: 'GET',
        timeout: 5000
      });
      
      const isHealthy = response && response.success && response.data?.status === 'ok';
      
      // Update health monitor if available
      if (this._healthMonitor) {
        this._healthMonitor._updateBackendStatus(
          isHealthy ? 'healthy' : 'unhealthy',
          isHealthy ? 'API health check successful' : 'API health check failed'
        );
      }
      
      return isHealthy;
    } catch (error) {
      this._logger.warn('API connection check failed:', error);
      
      // Update health monitor if available
      if (this._healthMonitor) {
        this._healthMonitor._updateBackendStatus('unhealthy', `API connection error: ${error.message}`);
      }
      
      return false;
    }
  }

  /**
   * Set the health monitor reference
   * @param {BackendHealthMonitor} healthMonitor - Health monitor instance
   */
  setHealthMonitor(healthMonitor) {
    this._healthMonitor = healthMonitor;
    this._logger?.debug('Health monitor reference set');
  }


  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up API service');

    // Remove message listeners - with null check
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      try {
        chrome.runtime.onMessage.removeListener(this._handleApiRequest);
      } catch (error) {
        this._logger?.warn('Error removing message listener:', error);
      }
    }
    
    // Cancel all in-flight requests
    await this._cancelAllRequests();
    
    // Clear Maps
    this._activeRequests.clear();
    this._abortControllers.clear();
    
    // Reset statistics
    this._resetStatistics();
    
    // Clear configuration
    this._config = null;
    this._baseURL = null;
    this._apiKey = null;
  }

  /**
   * Get system statistics
   * @returns {Promise<Object>} Stats data
   */
  async getStats() {
    return this.fetchAPI('/stats');
  }

  /**
   * Get all tasks
   * @returns {Promise<Object>} Tasks data
   */
  async getTasks() {
    return this.fetchAPI('/api/v1/tasks');
  }

  /**
   * Get graph overview data for Knowledge Panel
   * @param {object} options - Request options
   * @returns {Promise<object>} Graph overview response
   */
  async getGraphOverview(options = {}) {
    console.log('🔍 DEBUG: getGraphOverview called with options:', options);
    try {
      console.log('🔍 DEBUG: Calling fetchAPI...');
      const response = await this.fetchAPI('/api/v1/graph/overview', {
        method: 'GET',
        ...options
      });
      
      console.log('🔍 DEBUG: fetchAPI response:', response);
      
      if (response.success) {
        console.log('🔍 DEBUG: Success! Returning response');
        return response;
      } else {
        console.error('🔍 DEBUG: API response not successful:', response);
        throw new Error(response.error || 'Failed to fetch graph overview');
      }
    } catch (error) {
      console.error('🔍 DEBUG: getGraphOverview error:', error);
      console.error('Error fetching graph overview:', error);
      return {
        success: false,
        error: error.message,
        data: { nodes: [], edges: [], pages: [] }
      };
    }
  }
}

