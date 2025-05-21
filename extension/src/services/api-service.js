// services/api-service.js
import { LogManager } from '../utils/log-manager.js';

/**
 * API Service - Handles all API communication for the extension
 */
export class ApiService {
  /**
   * Initialize the API service
   */
  constructor() {
    // State initialization
    this.baseURL = 'http://localhost:8000'; // Default base URL
    this.initialized = false;
    this.logger = null; // Don't create logger until initialize()
    this.apiKey = null;
    this.activeRequests = new Map(); // Track active requests for cleanup
    this.abortControllers = new Map(); // For cancelling in-flight requests
    
    // Request statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsByEndpoint: {},
      averageResponseTime: 0,
      totalResponseTime: 0
    };
    
    // Configuration
    this.config = {
      timeoutMs: 30000,
      retryCount: 3,
      retryDelay: 1000
    };
  }
  
  /**
   * Initialize the API service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly - no container access needed
      this.logger = new LogManager({
        context: 'api-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing API service');
      
      // Load configuration from storage
      await this.loadConfiguration();
      
      this.initialized = true;
      this.logger.info('API service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing API service:', error);
      } else {
        console.error('Error initializing API service:', error);
      }
      return false;
    }
  }
  
  /**
   * Load API configuration from storage
   * @private
   */
  async loadConfiguration() {
    try {
      const data = await chrome.storage.local.get(['apiConfig', 'apiServiceConfig']);
      
      // Load API endpoint configuration
      if (data.apiConfig?.baseURL) {
        this.baseURL = data.apiConfig.baseURL;
        this.logger.debug(`API base URL set to: ${this.baseURL}`);
      }
      
      // Set API key if available
      if (data.apiConfig?.apiKey) {
        this.apiKey = data.apiConfig.apiKey;
        this.logger.debug('API key configured');
      }
      
      // Load service configuration
      if (data.apiServiceConfig) {
        this.config = {
          ...this.config,
          ...data.apiServiceConfig
        };
        this.logger.debug('API service configuration loaded', this.config);
      }
    } catch (error) {
      this.logger.warn('Failed to load configuration, using defaults:', error);
    }
  }
  
  /**
   * Save API service configuration to storage
   * @private
   */
  async saveConfiguration() {
    try {
      await chrome.storage.local.set({
        apiServiceConfig: this.config
      });
      this.logger.debug('API service configuration saved');
      return true;
    } catch (error) {
      this.logger.error('Failed to save configuration:', error);
      return false;
    }
  }
  
  /**
   * Set the base URL for API requests
   * @param {string} url - Base URL for API
   * @returns {Promise<boolean>} Success status
   */
  async setBaseUrl(url) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    if (!url) {
      this.logger.warn('Attempted to set empty base URL');
      return false;
    }
    
    try {
      this.baseURL = url;
      
      // Save to storage
      await chrome.storage.local.set({
        apiConfig: {
          ...await chrome.storage.local.get('apiConfig').then(data => data.apiConfig || {}),
          baseURL: url
        }
      });
      
      this.logger.debug(`API base URL updated to: ${url}`);
      return true;
    } catch (error) {
      this.logger.error('Error setting base URL:', error);
      return false;
    }
  }
  
  /**
   * Set the API key
   * @param {string} key - API key
   * @returns {Promise<boolean>} Success status
   */
  async setApiKey(key) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    if (!key) {
      this.logger.warn('Attempted to set empty API key');
      return false;
    }
    
    try {
      this.apiKey = key;
      
      // Save to storage
      await chrome.storage.local.set({
        apiConfig: {
          ...await chrome.storage.local.get('apiConfig').then(data => data.apiConfig || {}),
          apiKey: key
        }
      });
      
      this.logger.debug('API key updated');
      return true;
    } catch (error) {
      this.logger.error('Error setting API key:', error);
      return false;
    }
  }
  
  /**
   * Update API service configuration
   * @param {object} newConfig - New configuration options
   * @returns {Promise<boolean>} Success status
   */
  async updateConfiguration(newConfig) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return false;
      }
    }
    
    try {
      this.config = {
        ...this.config,
        ...newConfig
      };
      
      await this.saveConfiguration();
      this.logger.debug('Configuration updated:', this.config);
      return true;
    } catch (error) {
      this.logger.error('Error updating configuration:', error);
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
    if (!this.initialized) {
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
    this.stats.totalRequests++;
    this.updateEndpointStats(endpoint);
    
    const startTime = Date.now();
    
    try {
      // Call internal fetch with retry
      const result = await this.fetchWithRetry(endpoint, options, requestId);
      
      // Update timing stats
      const responseTime = Date.now() - startTime;
      this.updateTimingStats(responseTime);
      
      if (result.success) {
        this.stats.successfulRequests++;
      } else {
        this.stats.failedRequests++;
      }
      
      return result;
    } catch (error) {
      // Update timing stats
      const responseTime = Date.now() - startTime;
      this.updateTimingStats(responseTime);
      
      this.stats.failedRequests++;
      
      this.logger.error(`API Error: ${endpoint}`, { 
        error: error.message,
        requestId 
      });
      
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    } finally {
      // Clean up request tracking
      this.activeRequests.delete(requestId);
      this.abortControllers.delete(requestId);
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
  async fetchWithRetry(endpoint, options = {}, requestId, retryCount = 0) {
    try {
      // Ensure endpoint starts with /
      const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      // Set default headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      };
      
      // Add API key if available
      if (this.apiKey && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      // Add request ID for tracking
      if (requestId) {
        headers['X-Request-ID'] = requestId;
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, options.timeout || this.config.timeoutMs);
      
      // Store abort controller for potential cleanup
      this.abortControllers.set(requestId, controller);
      
      // Log request
      this.logger.debug(`API Request: ${formattedEndpoint}`, { 
        method: options.method || 'GET',
        baseURL: this.baseURL,
        requestId
      });
      
      // Track this request
      this.activeRequests.set(requestId, {
        endpoint,
        startTime: Date.now(),
        options
      });
      
      // Send request
      const response = await fetch(`${this.baseURL}${formattedEndpoint}`, {
        ...options,
        headers,
        signal: controller.signal
      });
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Parse response
      if (response.ok) {
        // Check content type for JSON parsing
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          // Handle non-JSON responses
          const textData = await response.text();
          data = {
            success: true,
            text: textData,
            contentType
          };
        }
        
        this.logger.debug(`API Response: ${formattedEndpoint}`, { 
          status: response.status,
          requestId
        });
        
        return {
          success: true,
          ...data
        };
      } else {
        // Try to parse error response
        let errorData;
        
        try {
          // Check content type for JSON parsing
          const contentType = response.headers.get('content-type');
          
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const errorText = await response.text();
            errorData = { error: errorText };
          }
        } catch (parseError) {
          // If parsing fails, use status text
          errorData = { error: response.statusText };
        }
        
        const errorMessage = errorData.error || `API error (${response.status})`;
        
        this.logger.warn(`API Error Response: ${formattedEndpoint}`, {
          status: response.status,
          error: errorMessage,
          requestId
        });
        
        // Check if we should retry
        if (retryCount < this.config.retryCount && this.shouldRetry(response.status)) {
          // Calculate delay with exponential backoff
          const delay = this.config.retryDelay * Math.pow(2, retryCount);
          
          this.logger.debug(`Retrying request (${retryCount + 1}/${this.config.retryCount}) after ${delay}ms`);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry the request
          return this.fetchWithRetry(endpoint, options, requestId, retryCount + 1);
        }
        
        // No more retries, return error
        return {
          success: false,
          status: response.status,
          error: errorMessage,
          ...errorData
        };
      }
    } catch (error) {
      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        this.logger.warn(`API request timeout: ${endpoint}`, { requestId });
        return {
          success: false,
          error: 'Request timed out',
          timeout: true
        };
      }
      
      // Check if we should retry network errors
      if (retryCount < this.config.retryCount && 
          (error.name === 'TypeError' || error.name === 'NetworkError')) {
        // Calculate delay with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        
        this.logger.debug(`Retrying request after network error (${retryCount + 1}/${this.config.retryCount}) after ${delay}ms`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the request
        return this.fetchWithRetry(endpoint, options, requestId, retryCount + 1);
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
  shouldRetry(statusCode) {
    // Retry server errors and specific client errors
    return (
      statusCode >= 500 || // Server errors
      statusCode === 408 || // Request Timeout
      statusCode === 429    // Too Many Requests
    );
  }
  
  /**
   * Update endpoint statistics
   * @param {string} endpoint - API endpoint
   * @private
   */
  updateEndpointStats(endpoint) {
    // Normalize endpoint by removing query parameters
    const normalizedEndpoint = endpoint.split('?')[0];
    
    if (!this.stats.requestsByEndpoint[normalizedEndpoint]) {
      this.stats.requestsByEndpoint[normalizedEndpoint] = 0;
    }
    
    this.stats.requestsByEndpoint[normalizedEndpoint]++;
  }
  
  /**
   * Update response timing statistics
   * @param {number} responseTime - Response time in ms
   * @private
   */
  updateTimingStats(responseTime) {
    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.totalRequests;
  }
  
  /**
   * Cancel all in-flight requests
   */
  cancelAllRequests() {
    this.logger.debug(`Cancelling ${this.abortControllers.size} in-flight requests`);
    
    this.abortControllers.forEach((controller, requestId) => {
      try {
        controller.abort();
        this.logger.debug(`Aborted request: ${requestId}`);
      } catch (error) {
        this.logger.warn(`Error aborting request ${requestId}:`, error);
      }
    });
    
    this.abortControllers.clear();
    this.activeRequests.clear();
  }
  
  /**
   * Send a message to background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response from background script
   */
  async sendMessageToBackground(message) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        throw new Error(`Service initialization failed: ${error.message}`);
      }
    }
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (this.logger) {
            this.logger.error('Background message error:', chrome.runtime.lastError);
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
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during checkConnection:', error);
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
      this.logger.warn('API connection check failed:', error);
      return false;
    }
  }
  
  /**
   * Get API stats
   * @returns {object} API request statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeRequestCount: this.activeRequests.size,
      successRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.successfulRequests / this.stats.totalRequests) * 100) + '%'
        : '0%'
    };
  }
  
  /**
   * Reset API stats
   */
  resetStatistics() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsByEndpoint: {},
      averageResponseTime: 0,
      totalResponseTime: 0
    };
    
    this.logger?.debug('API statistics reset');
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      activeRequestCount: this.activeRequests.size,
      stats: {
        totalRequests: this.stats.totalRequests,
        successRate: this.stats.totalRequests > 0 
          ? Math.round((this.stats.successfulRequests / this.stats.totalRequests) * 100) + '%'
          : '0%',
        averageResponseTimeMs: Math.round(this.stats.averageResponseTime)
      }
    };
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up API service');
    
    // Cancel all in-flight requests
    this.cancelAllRequests();
    
    // Clear state
    this.activeRequests.clear();
    this.abortControllers.clear();
    
    this.initialized = false;
    this.logger.debug('API service cleanup complete');
  }
}