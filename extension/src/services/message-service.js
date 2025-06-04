// src/services/message-service.js
import { BaseService } from '../core/base-service.js';
import { LogManager } from '../utils/log-manager.js';

/**
 * MessageService - Centralized messaging service for Chrome extension
 * Provides a consistent interface for sending messages to the background script
 * and listening for messages from other contexts
 */
export class MessageService extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    defaultTimeout: 5000,
    maxPendingRequests: 100,
    maxRetries: 3,
    retryDelay: 1000,
    maxRetryDelay: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000
  };

  /**
   * Create a new MessageService instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: options.maxRetries || MessageService._DEFAULT_CONFIG.maxRetries,
      retryBackoffBase: options.retryDelay || MessageService._DEFAULT_CONFIG.retryDelay,
      retryBackoffMax: options.maxRetryDelay || MessageService._DEFAULT_CONFIG.maxRetryDelay,
      circuitBreakerThreshold: options.circuitBreakerThreshold || MessageService._DEFAULT_CONFIG.circuitBreakerThreshold,
      circuitBreakerTimeout: options.circuitBreakerTimeout || MessageService._DEFAULT_CONFIG.circuitBreakerTimeout
    });

    // State initialization
    this._defaultTimeout = options.defaultTimeout || MessageService._DEFAULT_CONFIG.defaultTimeout;
    this._maxPendingRequests = options.maxPendingRequests || MessageService._DEFAULT_CONFIG.maxPendingRequests;
    
    // Statistics tracking
    this._stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      timeouts: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      receivedMessages: 0,
      handledMessages: 0
    };
    
    // Generate unique instance ID for this service instance
    this._instanceId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    
    // Bind handlers
    this._handleMessage = this._handleMessage.bind(this);
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success status
   */
  async _performInitialization() {
    try {
      // Create logger
      this._logger = new LogManager({
        context: 'message-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing MessageService');
      
      // Set up message listener
      this._setupMessageListener();
      
      this._logger.info('MessageService initialized successfully');
      return true;
    } catch (error) {
      this._logger?.error('Error initializing MessageService:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up message service');
    
    // Remove message listener
    this._removeMessageListener();
    
    // Cancel all pending requests
    await this._cancelAllRequests();
    
    // Clear and nullify Maps
    this._messageListeners = null;
    this._pendingRequests = null;
    
    // Reset and nullify statistics
    this._resetStatistics();
    this._stats = null;
    
    // Clear other properties
    this._defaultTimeout = null;
    this._instanceId = null;
  }

  /**
   * Handle memory pressure
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Cancel old pending requests
    await this._cleanupOldRequests();
  }

    /**
   * Clean up old pending requests
   * @private
   */
    async _cleanupOldRequests() {
      const now = Date.now();
      const oldRequests = [];
  
      // Find old requests
      this._pendingRequests.forEach((data, requestId) => {
        if (now - data.sentAt > this._maxTaskAge) {
          oldRequests.push(requestId);
        }
      });
  
      // Cancel old requests
      for (const requestId of oldRequests) {
        await this._cancelRequest(requestId);
      }
  
      if (oldRequests.length > 0) {
        this._logger?.warn(`Cleaned up ${oldRequests.length} old pending requests`);
      }
    }

  /**
   * Set up message listener
   * @private
   */
  _setupMessageListener() {
    // Remove any existing listener first to prevent duplicates
    this._removeMessageListener();
    
    // Add message listener
    chrome.runtime.onMessage.addListener(this._handleMessage);
    
    this._logger.debug('Message listener set up');
  }
  
  /**
   * Remove message listener
   * @private
   */
  _removeMessageListener() {
    // Remove with the same bound reference
    chrome.runtime.onMessage.removeListener(this._handleMessage);
  }

  /**
   * Handle incoming messages
   * @param {object} message - Incoming message
   * @param {object} sender - Message sender
   * @param {function} sendResponse - Function to send response
   * @returns {boolean} Whether to keep the message channel open
   * @private
   */
  _handleMessage(message, sender, sendResponse) {
    if (!message) {
      return false;
    }
    
    this._stats.receivedMessages++;
    
    // Check if this is a response to one of our pending requests
    if (message.requestId && this._pendingRequests.has(message.requestId)) {
      const { resolve, timeoutId } = this._pendingRequests.get(message.requestId);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Resolve promise with response
      resolve(message);
      
      // Clean up request
      this._pendingRequests.delete(message.requestId);
      
      return false; // Don't keep channel open
    }
    
    // If it's not a response, check if we have a listener for this action
    if (message.action && this._messageListeners.has(message.action)) {
      const handlers = this._messageListeners.get(message.action);
      
      // Execute all handlers
      const promises = handlers.map(handler => {
        try {
          return Promise.resolve(handler(message, sender));
        } catch (error) {
          this._logger?.error(`Error in message handler for action "${message.action}":`, error);
          return Promise.resolve({ success: false, error: error.message });
        }
      });
      
      // If there are handlers, keep the message channel open and handle async response
      if (handlers.length > 0) {
        this._stats.handledMessages++;
        
        // Execute all handlers and send combined response
        Promise.all(promises)
          .then(results => {
            // Use the first successful result, or combine errors
            const successResult = results.find(r => r && r.success);
            if (successResult) {
              sendResponse(successResult);
            } else {
              // Combine error messages
              const errors = results
                .filter(r => r && r.error)
                .map(r => r.error)
                .join('; ');
                
              sendResponse({ success: false, error: errors || 'Unknown error' });
            }
          })
          .catch(error => {
            this._logger?.error('Error processing message handlers:', error);
            sendResponse({ success: false, error: error.message });
          });
        
        return true; // Keep channel open for async response
      }
    }
    
    // No handler found for this action
    return false;
  }
  
  /**
   * Add a message listener for a specific action
   * @param {string} action - Action to listen for
   * @param {function} handler - Handler function
   * @returns {function} Function to remove the listener
   */
  addMessageListener(action, handler) {
    if (!this._initialized) {
      try {
        this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during addMessageListener:', error);
        return () => {};
      }
    }
    
    if (!action || typeof handler !== 'function') {
      this._logger?.warn('Invalid message listener parameters');
      return () => {};
    }
    
    // Get or create handlers array for this action
    if (!this._messageListeners.has(action)) {
      this._messageListeners.set(action, []);
    }
    
    const handlers = this._messageListeners.get(action);
    
    // Add handler
    handlers.push(handler);
    
    this._logger?.debug(`Added message listener for action "${action}"`);
    
    // Return function to remove this specific handler
    return () => {
      this._removeSpecificMessageListener(action, handler);
    };
  }
  
  /**
   * Remove a specific message listener
   * @param {string} action - Action to remove listener for
   * @param {function} handler - Handler function to remove
   * @private
   */
  _removeSpecificMessageListener(action, handler) {
    if (!this._messageListeners.has(action)) {
      return;
    }
    
    const handlers = this._messageListeners.get(action);
    const index = handlers.indexOf(handler);
    
    if (index !== -1) {
      handlers.splice(index, 1);
      this._logger?.debug(`Removed message listener for action "${action}"`);
      
      // Clean up empty handler arrays
      if (handlers.length === 0) {
        this._messageListeners.delete(action);
      }
    }
  }
  
  /**
   * Remove all message listeners for a specific action
   * @param {string} action - Action to remove listeners for
   */
  removeMessageListeners(action) {
    if (!action) {
      return;
    }
    
    if (this._messageListeners.has(action)) {
      this._messageListeners.delete(action);
      this._logger?.debug(`Removed all message listeners for action "${action}"`);
    }
  }
  
  /**
   * Send message to background script with timeout and error handling
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Response from background script
   */
  async sendMessage(message, timeout = this._defaultTimeout) {
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
    
    if (!message) {
      this._logger?.warn('Attempted to send undefined or null message');
      return {
        success: false,
        error: 'Message is required'
      };
    }

    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      return {
        success: false,
        error: 'Circuit breaker is open',
        circuitBreakerOpen: true
      };
    }
    
    // Update statistics
    this._stats.totalMessages++;
    const startTime = Date.now();
    
    // Generate unique request ID for tracking
    const requestId = `${this._instanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to message for tracking
    const messageWithId = { 
      ...message, 
      requestId,
      source: 'message-service' 
    };
    
    try {
      const response = await this._sendMessageWithPromise(messageWithId, timeout);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      this._updateTimingStats(responseTime);
      
      // Update statistics
      this._stats.successfulMessages++;
      
      return response;
    } catch (error) {
      // Calculate response time even for failures
      const responseTime = Date.now() - startTime;
      this._updateTimingStats(responseTime);
      
      // Update statistics
      if (error.message && error.message.includes('timeout')) {
        this._stats.timeouts++;
      }
      this._stats.failedMessages++;
      
      this._logger?.error('Message send error:', error);
      
      // Record failure for circuit breaker
      this._recordFailure();
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        timeout: error.message && error.message.includes('timeout')
      };
    }
  }
  
  /**
   * Internal promise-based message sending
   * @param {object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<object>} Response from receiver
   * @private
   */
  _sendMessageWithPromise(message, timeout) {
    return new Promise((resolve, reject) => {
      // Check pending requests limit
      if (this._pendingRequests.size >= this._maxPendingRequests) {
        reject(new Error('Too many pending requests'));
        return;
      }

      // Set up timeout
      const timeoutId = this._resourceTracker.trackTimeout(() => {
        if (this._pendingRequests.has(message.requestId)) {
          this._pendingRequests.delete(message.requestId);
          reject(new Error(`Message timeout after ${timeout}ms`));
        }
      }, timeout);
      
      // Store resolver and timeout ID
      this._pendingRequests.set(message.requestId, {
        resolve,
        timeoutId,
        sentAt: Date.now(),
        message
      });
      
      // Log outgoing message
      this._logger?.debug('Sending message:', {
        action: message.action,
        requestId: message.requestId
      });
      
      // Send message to background
      chrome.runtime.sendMessage(message).catch(error => {
        // Clear timeout and request tracking
        clearTimeout(timeoutId);
        this._pendingRequests.delete(message.requestId);
        
        // Log error
        this._logger?.error('Chrome runtime error:', error);
        
        // Reject with error
        reject(error);
      });
    });
  }
  
  /**
   * Send message with retry logic
   * @param {Object} message - Message to send
   * @param {Object} options - Options for retry
   * @param {number} options.maxRetries - Maximum number of retries
   * @param {number} options.retryDelay - Delay between retries in ms
   * @param {number} options.timeout - Timeout for each attempt
   * @returns {Promise<any>} Response from background script
   */
  async sendMessageWithRetry(message, options = {}) {
    const maxRetries = options.maxRetries || this._maxRetryAttempts;
    const retryDelay = options.retryDelay || this._retryBackoffBase;
    const timeout = options.timeout || this._defaultTimeout;
    
    let lastError;
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      try {
        const response = await this.sendMessage(message, timeout);
        
        // Check if response indicates success
        if (response && response.success) {
          return response;
        }
        
        // If response indicates error but not timeout, might be worth retrying
        lastError = new Error(response.error || 'Unknown error');
        
        // Don't retry specific error types
        if (this._shouldNotRetry(response)) {
          throw lastError;
        }
      } catch (error) {
        lastError = error;
        
        // Don't retry specific error types
        if (error.message && !error.message.includes('timeout') && !error.message.includes('network')) {
          throw error;
        }
      }
      
      // Only delay and retry if not on last attempt
      if (attempt < maxRetries) {
        const delay = this._calculateRetryDelay(attempt, retryDelay);
        this._logger?.warn(`Message attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      attempt++;
    }
    
    // If we got here, all retries failed
    return {
      success: false,
      error: lastError?.message || 'All retry attempts failed',
      retriesExhausted: true
    };
  }
  
  /**
   * Determine if a response should not be retried
   * @param {object} response - Response object
   * @returns {boolean} Whether retry should be skipped
   * @private
   */
  _shouldNotRetry(response) {
    // Don't retry specific error types
    return (
      // If response indicates not found or forbidden, don't retry
      response.error && (
        response.error.includes('not found') ||
        response.error.includes('forbidden') ||
        response.error.includes('unauthorized') ||
        response.error.includes('invalid') ||
        response.error.includes('bad request')
      )
    );
  }
  
  /**
   * Update timing statistics
   * @param {number} responseTime - Response time in ms
   * @private
   */
  _updateTimingStats(responseTime) {
    // Update total response time
    this._stats.totalResponseTime += responseTime;
    
    // Update average
    const totalMessages = this._stats.successfulMessages + this._stats.failedMessages;
    if (totalMessages > 0) {
      this._stats.averageResponseTime = this._stats.totalResponseTime / totalMessages;
    }
  }
  
  /**
   * Check if the background script is responsive
   * @returns {Promise<boolean>} True if background is responsive
   */
  async pingBackground() {
    try {
      const response = await this.sendMessage({ action: 'ping' }, 3000);
      return response && response.success;
    } catch (error) {
      this._logger?.warn('Background ping failed:', error);
      return false;
    }
  }
  
  /**
   * Get all pending requests
   * @returns {Array} Pending requests information
   */
  getPendingRequests() {
    const result = [];
    
    this._pendingRequests.forEach((data, requestId) => {
      result.push({
        requestId,
        sentAt: data.sentAt,
        pendingFor: Date.now() - data.sentAt,
        action: data.message?.action
      });
    });
    
    return result;
  }
  
  /**
   * Cancel a specific pending request
   * @param {string} requestId - Request ID to cancel
   * @returns {boolean} Whether request was found and cancelled
   */
  async _cancelRequest(requestId) {
    if (!this._pendingRequests.has(requestId)) {
      return false;
    }
    
    const { timeoutId } = this._pendingRequests.get(requestId);
    clearTimeout(timeoutId);
    this._pendingRequests.delete(requestId);
    this._logger?.debug(`Cancelled request: ${requestId}`);
    
    return true;
  }

  /**
   * Cancel all pending requests
   * @private
   */
  async _cancelAllRequests() {
    const count = this._pendingRequests.size;
    
    this._pendingRequests.forEach(({ timeoutId }, requestId) => {
      clearTimeout(timeoutId);
    });
    
    this._pendingRequests.clear();
    this._logger?.debug(`Cancelled ${count} pending requests`);
  }
  
  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStatistics() {
    return {
      ...this._stats,
      pendingRequests: this._pendingRequests.size,
      registeredListeners: this._countRegisteredListeners(),
      successRate: this._stats.totalMessages > 0 
        ? (this._stats.successfulMessages / this._stats.totalMessages * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTimeMs: Math.round(this._stats.averageResponseTime)
    };
  }
  
  /**
   * Count total registered message listeners
   * @returns {number} Count of registered listeners
   * @private
   */
  _countRegisteredListeners() {
    let count = 0;
    this._messageListeners.forEach(handlers => {
      count += handlers.length;
    });
    return count;
  }

  
  /**
   * Reset statistics
   * @private
   */
  _resetStatistics() {
    this._stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      timeouts: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      receivedMessages: 0,
      handledMessages: 0
    };
    
    this._logger?.debug('Statistics reset');
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      hasLogger: !!this._logger,
      instanceId: this._instanceId,
      pendingRequests: this._pendingRequests.size,
      listenerCount: this._countRegisteredListeners(),
      stats: this.getStatistics(),
      circuitBreakerOpen: this._isCircuitBreakerOpen()
    };
  }}