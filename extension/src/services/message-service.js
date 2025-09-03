// extension/src/services/message-service.js
// Update for background script context and routing capabilities

import { BaseService } from '../services/base-service.js'
import { LogManager } from '../utils/log-manager.js';

/**
 * MessageService - Centralized messaging service for Chrome extension
 * Provides bidirectional communication between extension contexts
 * Adapted for background script context with enhanced routing
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
    circuitBreakerTimeout: 60000,
    maxTaskAge: 300000, // 5 minutes
    maxActiveTasks: 50
  };

  /**
   * Create a new MessageService instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: options.maxTaskAge || MessageService._DEFAULT_CONFIG.maxTaskAge,
      maxActiveTasks: options.maxActiveTasks || MessageService._DEFAULT_CONFIG.maxActiveTasks,
      maxRetryAttempts: options.maxRetries || MessageService._DEFAULT_CONFIG.maxRetries,
      retryBackoffBase: options.retryDelay || MessageService._DEFAULT_CONFIG.retryDelay,
      retryBackoffMax: options.maxRetryDelay || MessageService._DEFAULT_CONFIG.maxRetryDelay,
      circuitBreakerThreshold: options.circuitBreakerThreshold || MessageService._DEFAULT_CONFIG.circuitBreakerThreshold,
      circuitBreakerTimeout: options.circuitBreakerTimeout || MessageService._DEFAULT_CONFIG.circuitBreakerTimeout
    });

    // Context detection
    this._detectContext();
    
    // State initialization
    this._defaultTimeout = options.defaultTimeout || MessageService._DEFAULT_CONFIG.defaultTimeout;
    this._maxPendingRequests = options.maxPendingRequests || MessageService._DEFAULT_CONFIG.maxPendingRequests;
    
    // Enhanced message routing
    this._serviceHandlers = new Map();  // service → handler
    this._contextHandlers = new Map();  // context → handler
    
    // Statistics tracking
    this._stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      timeouts: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      receivedMessages: 0,
      handledMessages: 0,
      routedMessages: 0,
      crossContextMessages: 0
    };
    
    // Generate unique instance ID for this service instance
    this._instanceId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    
    // Bind handlers
    this._handleMessage = this._handleMessage.bind(this);
  }

  /**
   * Detect the current context (background script vs extension page)
   * @private
   */
  _detectContext() {
    // Check if we're in a background script context
    this._isBackgroundScript = typeof chrome !== 'undefined' && 
      chrome.runtime && 
      typeof chrome.runtime.getBackgroundPage === 'undefined';
    
    // Check if we're in a service worker context - IMPROVED DETECTION
    this._isServiceWorker = (
      // Method 1: Standard instanceof check (with safety checks)
      (typeof ServiceWorkerGlobalScope !== 'undefined' && 
       typeof self !== 'undefined' && 
       self instanceof ServiceWorkerGlobalScope) ||
      // Method 2: Constructor name check
      (typeof self !== 'undefined' && 
       self.constructor && 
       self.constructor.name === 'ServiceWorkerGlobalScope') ||
      // Method 3: Global scope check
      (typeof globalThis !== 'undefined' && 
       globalThis.ServiceWorkerGlobalScope && 
       globalThis instanceof globalThis.ServiceWorkerGlobalScope) ||
      // Method 4: Direct property check for test environment
      (typeof self !== 'undefined' && 
       self._isServiceWorkerTest === true)
    );
    
    this._context = this._isBackgroundScript ? 'background' : 'extension-page';
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success status
   */
  async _performInitialization() {
    try {
      // Create logger with context-aware configuration
      this._logger = new LogManager({
        context: 'message-service',
        isBackgroundScript: this._isBackgroundScript,
        maxEntries: 1000
      });
      
      this._logger.info(`Initializing MessageService in ${this._context} context`);
      
      // Initialize Maps
      this._pendingRequests = new Map();
      this._messageListeners = new Map();
      
      // Set up message listener
      this._setupMessageListener();
      
      // Restore state if in service worker context
      if (this._isServiceWorker) {
        await this._restorePendingRequests();
      }
      
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
    
    // Store critical state if in service worker context
    if (this._isServiceWorker) {
      await this._storeCriticalState();
    }
    
    // Clear and nullify Maps
    this._messageListeners = null;
    this._pendingRequests = null;
    this._serviceHandlers = null;
    this._contextHandlers = null;
    
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
   * Check if Chrome APIs are available
   * @returns {boolean} True if Chrome APIs are available
   * @private
   */
  _isChromeAvailable() {
    return typeof chrome !== 'undefined' && 
           chrome.runtime && 
           typeof chrome.runtime.sendMessage === 'function';
  }

  /**
   * Set up message listener based on context
   * @private
   */
  _setupMessageListener() {
    // Check if Chrome APIs are available
    if (!this._isChromeAvailable()) {
      this._logger.debug('Chrome runtime APIs not available, skipping message listener setup');
      return;
    }
    
    // Remove any existing listener first to prevent duplicates
    this._removeMessageListener();
    
    // Add message listener
    chrome.runtime.onMessage.addListener(this._handleMessage);
    
    this._logger.debug(`Message listener set up in ${this._context} context`);
  }
  
  /**
   * Remove message listener
   * @private
   */
  _removeMessageListener() {
    // Check if Chrome APIs are available
    if (!this._isChromeAvailable()) {
      return;
    }
    
    // Remove with the same bound reference (only if chrome.runtime.onMessage exists)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.removeListener(this._handleMessage);
    }
  }

  /**
   * Enhanced message handler with routing capabilities
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
    
    // Enhanced routing: Check for service-specific handlers
    if (message.service && this._serviceHandlers.has(message.service)) {
      this._stats.routedMessages++;
      const handler = this._serviceHandlers.get(message.service);
      
      try {
        const result = Promise.resolve(handler(message, sender));
        result.then(response => {
          sendResponse({ success: true, data: response });
        }).catch(error => {
          this._logger?.error(`Error in service handler for "${message.service}":`, error);
          sendResponse({ 
            success: false, 
            error: this._classifyError(error, message) 
          });
        });
        
        return true; // Keep channel open for async response
      } catch (error) {
        this._logger?.error(`Error in service handler for "${message.service}":`, error);
        sendResponse({ 
          success: false, 
          error: this._classifyError(error, message) 
        });
        return false;
      }
    }
    
    // Legacy routing: Check if we have a listener for this action
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
    
    // No handler found for this message
    this._logger?.warn(`No handler found for message:`, message);
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
   * Add a service handler for routing messages to specific services
   * @param {string} service - Service name (e.g., 'api', 'storage', 'task')
   * @param {function} handler - Handler function
   * @returns {function} Function to remove the handler
   */
  addServiceHandler(service, handler) {
    if (!this._initialized) {
      try {
        this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize service during addServiceHandler:', error);
        return () => {};
      }
    }
    
    if (!service || typeof handler !== 'function') {
      this._logger?.warn('Invalid service handler parameters');
      return () => {};
    }
    
    this._serviceHandlers.set(service, handler);
    
    this._logger?.debug(`Added service handler for "${service}"`);
    
    // Return function to remove this specific handler
    return () => {
      this._removeServiceHandler(service);
    };
  }
  
  /**
   * Remove a service handler
   * @param {string} service - Service name to remove handler for
   * @private
   */
  _removeServiceHandler(service) {
    if (this._serviceHandlers.has(service)) {
      this._serviceHandlers.delete(service);
      this._logger?.debug(`Removed service handler for "${service}"`);
    }
  }

  /**
   * Send message with enhanced routing
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Response from receiver
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
    
    // Enhanced message structure with routing metadata
    const messageWithId = { 
      ...message, 
      requestId,
      source: 'message-service',
      context: this._context,
      timestamp: Date.now()
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
   * Send message to specific service
   * @param {string} service - Service name
   * @param {Object} data - Service-specific data
   * @param {Object} options - Options for the message
   * @returns {Promise<any>} Response from service
   */
  async sendToService(service, data, options = {}) {
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
    
    // Check if we have a local service handler
    if (this._serviceHandlers.has(service)) {
      const message = {
        service,
        data,
        ...options
      };
      
      return this._handleLocalMessage(message);
    }
    
    // Fall back to sending via message system
    const message = {
      service,
      data,
      ...options
    };
    
    return this.sendMessage(message, options.timeout);
  }

  /**
   * Send message to background script (from extension page)
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Response from background script
   */
  async sendToBackground(message, timeout = this._defaultTimeout) {
    if (this._isBackgroundScript) {
      // We're already in background, handle locally
      return this._handleLocalMessage(message);
    } else {
      // Send to background script
      return this.sendMessage(message, timeout);
    }
  }

  /**
   * Send message to extension pages (from background script)
   * @param {Object} message - Message to send
   * @param {Object} options - Options for sending
   * @returns {Promise<Array>} Responses from extension pages
   */
  async sendToExtensionPages(message, options = {}) {
    if (!this._isBackgroundScript) {
      throw new Error('sendToExtensionPages can only be called from background script');
    }
    
    try {
      const tabs = await chrome.tabs.query({});
      const responses = await Promise.allSettled(
        tabs.map(tab => 
          chrome.tabs.sendMessage(tab.id, message).catch(() => null)
        )
      );
      
      return responses
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
    } catch (error) {
      this._logger?.error('Error sending to extension pages:', error);
      return [];
    }
  }

  /**
   * Handle message locally (when sender and receiver are in same context)
   * @param {Object} message - Message to handle
   * @returns {Promise<any>} Response
   * @private
   */
  async _handleLocalMessage(message) {
    // Check for service handlers first
    if (message.service && this._serviceHandlers.has(message.service)) {
      this._stats.routedMessages++;
      const handler = this._serviceHandlers.get(message.service);
      
      try {
        const result = await Promise.resolve(handler(message, null));
        return result;
      } catch (error) {
        this._logger?.error(`Error in service handler for "${message.service}":`, error);
        return { 
          success: false, 
          error: this._classifyError(error, message) 
        };
      }
    }
    
    // Check for message listeners
    if (message.action && this._messageListeners.has(message.action)) {
      const handlers = this._messageListeners.get(message.action);
      
      // Execute all handlers
      const promises = handlers.map(handler => {
        try {
          return Promise.resolve(handler(message, null));
        } catch (error) {
          this._logger?.error(`Error in message handler for action "${message.action}":`, error);
          return Promise.resolve({ success: false, error: error.message });
        }
      });
      
      if (handlers.length > 0) {
        this._stats.handledMessages++;
        
        // Execute all handlers and return the first successful result
        const results = await Promise.all(promises);
        const successResult = results.find(r => r && r.success);
        if (successResult) {
          return successResult;
        } else {
          // Combine error messages
          const errors = results
            .filter(r => r && r.error)
            .map(r => r.error)
            .join('; ');
            
          return { success: false, error: errors || 'Unknown error' };
        }
      }
    }
    
    // No handler found
    this._logger?.warn(`No handler found for message:`, message);
    return { success: false, error: 'No handler found for message' };
  }

  /**
   * Classify error for enhanced error handling
   * @param {Error} error - Error to classify
   * @param {Object} message - Original message
   * @returns {Object} Classified error information
   * @private
   */
  _classifyError(error, message) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { 
        type: 'NETWORK_ERROR', 
        message: 'Network unavailable', 
        retryable: true 
      };
    }
    
    if (error.name === 'AbortError') {
      return { 
        type: 'TIMEOUT_ERROR', 
        message: 'Request timed out', 
        retryable: true 
      };
    }
    
    if (error.message && error.message.includes('Chrome runtime APIs not available')) {
      return { 
        type: 'CONTEXT_ERROR', 
        message: 'Chrome APIs not available in this context', 
        retryable: false 
      };
    }
    
    return { 
      type: 'SYSTEM_ERROR', 
      message: error.message, 
      retryable: false 
    };
  }

  /**
   * Store critical state for service worker persistence
   * @private
   */
  async _storeCriticalState() {
    if (!this._isChromeAvailable() || !this._isServiceWorker) {
      return;
    }
    
    try {
      const pendingRequests = {};
      this._pendingRequests.forEach((data, requestId) => {
        pendingRequests[requestId] = {
          ...data,
          storedAt: Date.now()
        };
      });
      
      await chrome.storage.local.set({ 
        messageServicePendingRequests: pendingRequests 
      });
      
      this._logger?.debug('Stored critical state');
    } catch (error) {
      this._logger?.error('Error storing critical state:', error);
    }
  }

  /**
   * Restore pending requests from storage (for service worker restart)
   * @private
   */
  async _restorePendingRequests() {
    if (!this._isChromeAvailable() || !this._isServiceWorker) {
      return;
    }
    
    try {
      const { messageServicePendingRequests } = await chrome.storage.local.get(['messageServicePendingRequests']) || {};
      const now = Date.now();
      
      for (const [requestId, data] of Object.entries(messageServicePendingRequests || {})) {
        // Only restore recent requests
        if (now - data.storedAt < this._maxTaskAge) {
          this._pendingRequests.set(requestId, data);
        }
      }
      
      this._logger?.debug(`Restored ${this._pendingRequests.size} pending requests`);
    } catch (error) {
      this._logger?.error('Error restoring pending requests:', error);
    }
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
      handledMessages: 0,
      routedMessages: 0,
      crossContextMessages: 0
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
  }

  /**
   * Send message with promise-based timeout tracking
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Response from receiver
   * @private
   */
  _sendMessageWithPromise(message, timeout) {
    return new Promise((resolve, reject) => {
      // CRITICAL FIX: Track the timeout with resource tracker
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
      
      // Send message to background using Chrome API callback pattern
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Clear timeout since we got a response
          clearTimeout(timeoutId);
          
          // Check if we still have this request (might have been cleaned up)
          if (this._pendingRequests.has(message.requestId)) {
            this._pendingRequests.delete(message.requestId);
            
            // Check for Chrome runtime error
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this._pendingRequests.delete(message.requestId);
        reject(error);
      }
    });
  }
}