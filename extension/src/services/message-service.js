// src/services/message-service.js
import { LogManager } from '../utils/log-manager.js';

/**
 * MessageService - Centralized messaging service for Chrome extension
 * Provides a consistent interface for sending messages to the background script
 */
export class MessageService {
  constructor() {
    this.initialized = false;
    this.logger = null;
    this.defaultTimeout = 5000;
    
    // Statistics tracking
    this.stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      timeouts: 0,
      averageResponseTime: 0
    };
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
      
      this.logger.info('MessageService initialized');
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing MessageService:', error);
      return false;
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
      await this.initialize();
    }
    
    this.stats.totalMessages++;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // Generate unique request ID for tracking
      const requestId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.stats.timeouts++;
        this.stats.failedMessages++;
        if (this.logger) {
          this.logger.error(`Background message timeout after ${timeout}ms:`, message);
        }
        reject(new Error(`Background message timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        // Add request ID to message for tracking
        const messageWithId = { ...message, requestId };
        
        // Send message to background
        chrome.runtime.sendMessage(messageWithId, (response) => {
          clearTimeout(timeoutId);
          
          // Calculate response time
          const responseTime = Date.now() - startTime;
          this.updateAverageResponseTime(responseTime);
          
          if (chrome.runtime.lastError) {
            this.stats.failedMessages++;
            if (this.logger) {
              this.logger.error('Chrome runtime error:', chrome.runtime.lastError.message);
            }
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            this.stats.successfulMessages++;
            if (this.logger) {
              this.logger.debug('Received response from background:', response);
            }
            
            // Validate that the response has the correct request ID
            if (response && response.requestId && response.requestId !== requestId) {
              this.logger.warn('Response request ID mismatch:', {
                sent: requestId,
                received: response.requestId
              });
            }
            
            resolve(response || { success: true });
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.stats.failedMessages++;
        if (this.logger) {
          this.logger.error('Failed to send message:', error);
        }
        reject(new Error(`Failed to send message: ${error.message}`));
      }
    });
  }
  
  /**
   * Send message with retry logic
   * @param {Object} message - Message to send
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} retryDelay - Delay between retries in ms
   * @returns {Promise<any>} Response from background script
   */
  async sendMessageWithRetry(message, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendMessage(message);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          if (this.logger) {
            this.logger.warn(`Message attempt ${attempt + 1} failed, retrying in ${retryDelay}ms:`, error);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Update average response time statistic
   * @param {number} responseTime - Response time in milliseconds
   */
  updateAverageResponseTime(responseTime) {
    const totalResponses = this.stats.successfulMessages;
    if (totalResponses === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime = (
        (this.stats.averageResponseTime * (totalResponses - 1) + responseTime) / totalResponses
      );
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
      if (this.logger) {
        this.logger.warn('Background ping failed:', error);
      }
      return false;
    }
  }
  
  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.totalMessages > 0 
        ? (this.stats.successfulMessages / this.stats.totalMessages * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTimeMs: Math.round(this.stats.averageResponseTime)
    };
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
      averageResponseTime: 0
    };
    if (this.logger) {
      this.logger.debug('Statistics reset');
    }
  }
}