// src/services/message-service.js
import { LogManager } from '../utils/log-manager.js';

/**
 * MessageService - Centralized messaging service for Chrome extension
 * Provides a consistent interface for sending messages to the background script
 * and listening for messages from other contexts
 */
export class MessageService {
  /**
   * Create a new MessageService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    this.logger = null;
    this.defaultTimeout = 5000;
    this.pendingRequests = new Map(); // Track pending requests
    this.messageListeners = new Map(); // Track message listeners by action
    
    // Statistics tracking
    this.stats = {
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
    this.instanceId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    
    // Bind handlers
    this.handleMessage = this.handleMessage.bind(this);
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly - no container needed
      this.logger = new LogManager({
        context: 'message-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing MessageService');
      
      // Set up message listener
      this.setupMessageListener();
      
      this.initialized = true;
      this.logger.info('MessageService initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing MessageService:', error);
      return false;
    }
  }
  
  /**
   * Set up message listener
   * @private
   */
  setupMessageListener() {
    // Remove any existing listener first to prevent duplicates
    this.removeMessageListener();
    
    // Add message listener
    chrome.runtime.onMessage.addListener(this.handleMessage);
    
    this.logger.debug('Message listener set up');
  }
  
  /**
   * Remove message listener
   * @private
   */
  removeMessageListener() {
    // Remove with the same bound reference
    chrome.runtime.onMessage.removeListener(this.handleMessage);
  }
  
  /**
   * Handle incoming messages
   * @param {object} message - Incoming message
   * @param {object} sender - Message sender
   * @param {function} sendResponse - Function to send response
   * @returns {boolean} Whether to keep the message channel open
   * @private
   */
  handleMessage(message, sender, sendResponse) {
    if (!message) {
      return false;
    }
    
    this.stats.receivedMessages++;
    
    // Check if this is a response to one of our pending requests
    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const { resolve, timeoutId } = this.pendingRequests.get(message.requestId);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Resolve promise with response
      resolve(message);
      
      // Clean up request
      this.pendingRequests.delete(message.requestId);
      
      return false; // Don't keep channel open
    }
    
    // If it's not a response, check if we have a listener for this action
    if (message.action && this.messageListeners.has(message.action)) {
      const handlers = this.messageListeners.get(message.action);
      
      // Execute all handlers
      const promises = handlers.map(handler => {
        try {
          return Promise.resolve(handler(message, sender));
        } catch (error) {
          this.logger?.error(`Error in message handler for action "${message.action}":`, error);
          return Promise.resolve({ success: false, error: error.message });
        }
      });
      
      // If there are handlers, keep the message channel open and handle async response
      if (handlers.length > 0) {
        this.stats.handledMessages++;
        
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
            this.logger?.error('Error processing message handlers:', error);
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
    if (!this.initialized) {
      try {
        this.initialize();
      } catch (error) {
        this.logger?.error('Failed to initialize service during addMessageListener:', error);
        return () => {};
      }
    }
    
    if (!action || typeof handler !== 'function') {
      this.logger?.warn('Invalid message listener parameters');
      return () => {};
    }
    
    // Get or create handlers array for this action
    if (!this.messageListeners.has(action)) {
      this.messageListeners.set(action, []);
    }
    
    const handlers = this.messageListeners.get(action);
    
    // Add handler
    handlers.push(handler);
    
    this.logger?.debug(`Added message listener for action "${action}"`);
    
    // Return function to remove this specific handler
    return () => {
      this.removeSpecificMessageListener(action, handler);
    };
  }
  
  /**
   * Remove a specific message listener
   * @param {string} action - Action to remove listener for
   * @param {function} handler - Handler function to remove
   * @private
   */
  removeSpecificMessageListener(action, handler) {
    if (!this.messageListeners.has(action)) {
      return;
    }
    
    const handlers = this.messageListeners.get(action);
    const index = handlers.indexOf(handler);
    
    if (index !== -1) {
      handlers.splice(index, 1);
      this.logger?.debug(`Removed message listener for action "${action}"`);
      
      // Clean up empty handler arrays
      if (handlers.length === 0) {
        this.messageListeners.delete(action);
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
    
    if (this.messageListeners.has(action)) {
      this.messageListeners.delete(action);
      this.logger?.debug(`Removed all message listeners for action "${action}"`);
    }
  }
  
  /**
   * Send message to background script with timeout and error handling
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Response from background script
   */
  async sendMessage(message, timeout = this.defaultTimeout) {
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
    
    if (!message) {
      this.logger?.warn('Attempted to send undefined or null message');
      return {
        success: false,
        error: 'Message is required'
      };
    }
    
    // Update statistics
    this.stats.totalMessages++;
    const startTime = Date.now();
    
    // Generate unique request ID for tracking
    const requestId = `${this.instanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to message for tracking
    const messageWithId = { 
      ...message, 
      requestId,
      source: 'message-service' 
    };
    
    try {
      const response = await this.sendMessageWithPromise(messageWithId, timeout);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      this.updateTimingStats(responseTime);
      
      // Update statistics
      this.stats.successfulMessages++;
      
      return response;
    } catch (error) {
      // Calculate response time even for failures
      const responseTime = Date.now() - startTime;
      this.updateTimingStats(responseTime);
      
      // Update statistics
      if (error.message && error.message.includes('timeout')) {
        this.stats.timeouts++;
      }
      this.stats.failedMessages++;
      
      this.logger?.error('Message send error:', error);
      
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
  sendMessageWithPromise(message, timeout) {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(message.requestId)) {
          this.pendingRequests.delete(message.requestId);
          reject(new Error(`Message timeout after ${timeout}ms`));
        }
      }, timeout);
      
      // Store resolver and timeout ID
      this.pendingRequests.set(message.requestId, {
        resolve,
        timeoutId,
        sentAt: Date.now(),
        message
      });
      
      // Log outgoing message
      this.logger?.debug('Sending message:', {
        action: message.action,
        requestId: message.requestId
      });
      
      // Send message to background
      chrome.runtime.sendMessage(message).catch(error => {
        // Clear timeout and request tracking
        clearTimeout(timeoutId);
        this.pendingRequests.delete(message.requestId);
        
        // Log error
        this.logger?.error('Chrome runtime error:', error);
        
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
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    const timeout = options.timeout || this.defaultTimeout;
    
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
        if (this.shouldNotRetry(response)) {
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
        this.logger?.warn(`Message attempt ${attempt + 1} failed, retrying in ${retryDelay}ms:`, lastError);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
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
  shouldNotRetry(response) {
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
  updateTimingStats(responseTime) {
    // Update total response time
    this.stats.totalResponseTime += responseTime;
    
    // Update average
    const totalMessages = this.stats.successfulMessages + this.stats.failedMessages;
    if (totalMessages > 0) {
      this.stats.averageResponseTime = this.stats.totalResponseTime / totalMessages;
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
      this.logger?.warn('Background ping failed:', error);
      return false;
    }
  }
  
  /**
   * Get all pending requests
   * @returns {Array} Pending requests information
   */
  getPendingRequests() {
    const result = [];
    
    this.pendingRequests.forEach((data, requestId) => {
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
  cancelRequest(requestId) {
    if (!this.pendingRequests.has(requestId)) {
      return false;
    }
    
    const { timeoutId } = this.pendingRequests.get(requestId);
    clearTimeout(timeoutId);
    this.pendingRequests.delete(requestId);
    this.logger?.debug(`Cancelled request: ${requestId}`);
    
    return true;
  }
  
  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    const count = this.pendingRequests.size;
    
    this.pendingRequests.forEach(({ timeoutId }, requestId) => {
      clearTimeout(timeoutId);
    });
    
    this.pendingRequests.clear();
    this.logger?.debug(`Cancelled ${count} pending requests`);
  }
  
  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
      registeredListeners: this.countRegisteredListeners(),
      successRate: this.stats.totalMessages > 0 
        ? (this.stats.successfulMessages / this.stats.totalMessages * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTimeMs: Math.round(this.stats.averageResponseTime)
    };
  }
  
  /**
   * Count total registered message listeners
   * @returns {number} Count of registered listeners
   * @private
   */
  countRegisteredListeners() {
    let count = 0;
    this.messageListeners.forEach(handlers => {
      count += handlers.length;
    });
    return count;
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      timeouts: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      receivedMessages: 0,
      handledMessages: 0
    };
    
    this.logger?.debug('Statistics reset');
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasLogger: !!this.logger,
      instanceId: this.instanceId,
      pendingRequests: this.pendingRequests.size,
      listenerCount: this.countRegisteredListeners(),
      stats: this.getStatistics()
    };
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger?.info('Cleaning up message service');
    
    // Remove message listener
    this.removeMessageListener();
    
    // Cancel all pending requests
    this.cancelAllRequests();
    
    // Clear listeners
    this.messageListeners.clear();
    
    this.initialized = false;
    this.logger?.debug('Message service cleanup complete');
  }
}