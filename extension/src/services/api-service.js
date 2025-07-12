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
   * Initialize the API service
   * @returns {Promise<boolean>} Success state
   */
  async _performInitialization() {
    try {
      // Create logger
      this._logger = new LogManager({
        context: 'api-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing API service');
      
      // Load configuration from storage
      await this._loadConfiguration();
      
      this._logger.info('API service initialized successfully');
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
    this._logger?.info('Cleaning up API service');
    
    // Cancel all in-flight requests
    await this._cancelAllRequests();
    
    // Clear and nullify Maps
    this._activeRequests = new WeakMap();
    this._abortControllers = new WeakMap();
    
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
    } catch (error) {
      // Use optional chaining to avoid undefined logger errors
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
      console.log(`🔍 _fetchWithRetry called with endpoint: ${endpoint}, timeout: ${options.timeout}`);
      
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
      console.log(`⏰ Setting up timeout for ${timeoutMs}ms`);
      
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          console.log(`⏰ Timeout triggered after ${timeoutMs}ms, aborting request`);
          controller.abort();
        }, timeoutMs);
        console.log(`⏰ Timeout ID set: ${timeoutId}`);
      }
      
      // Store abort controller for potential cleanup
      this._abortControllers.set(requestId, controller);
      console.log(`📦 Stored abort controller for request: ${requestId}`);
      
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
      
      console.log(`🌐 Making fetch request to: ${this._baseURL}${formattedEndpoint}`);
      
      // Send request
      const response = await fetch(`${this._baseURL}${formattedEndpoint}`, {
        ...options,
        headers,
        signal: controller.signal
      });
      
      console.log(`📥 Fetch completed, clearing timeout`);
      
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        console.log(`⏰ Timeout cleared: ${timeoutId}`);
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
      console.log(`❌ Error in _fetchWithRetry: ${error.name} - ${error.message}`);
      
      // Handle network errors
      if (error.name === 'AbortError') {
        console.log(`⏰ AbortError caught, throwing timeout error`);
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
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (this._logger) {
            this._logger.error('Background message error:', chrome.runtime.lastError);
          }
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
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
      const port = chrome.runtime.connect({ name: 'api-service' });
      this._messagePorts.add(port);
      this._resourceTracker.trackEventListener(port, 'message', (response) => {
        if (chrome.runtime.lastError) {
          this._recordFailure('message');
          if (this._logger) {
            this._logger.error('Background message error:', chrome.runtime.lastError);
          }
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });

      port.postMessage(message);
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

  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up API service');
    
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
}