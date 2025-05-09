// services/api-service.js
import { container } from '../core/dependency-container.js';

/**
 * API Service - Handles all API communication for the extension
 */
export class ApiService {
  /**
   * Initialize the API service
   */
  constructor() {
    this.baseURL = 'http://localhost:8000'; // Default base URL
    this.initialized = false;
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
      // Get logger instance
      this.logger = new (container.getUtil('LogManager'))({
        context: 'api-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing API service');
      
      // Load configuration from storage
      const data = await chrome.storage.local.get('apiConfig');
      if (data.apiConfig?.baseURL) {
        this.baseURL = data.apiConfig.baseURL;
        this.logger.debug(`API base URL set to: ${this.baseURL}`);
      }
      
      // Set API key if available
      if (data.apiConfig?.apiKey) {
        this.apiKey = data.apiConfig.apiKey;
        this.logger.debug('API key configured');
      }
      
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
   * Set the base URL for API requests
   * @param {string} url - Base URL for API
   */
  setBaseUrl(url) {
    if (!url) return;
    
    this.baseURL = url;
    if (this.logger) {
      this.logger.debug(`API base URL updated to: ${url}`);
    }
  }
  
  /**
   * Set the API key
   * @param {string} key - API key
   */
  setApiKey(key) {
    if (!key) return;
    
    this.apiKey = key;
    if (this.logger) {
      this.logger.debug('API key updated');
    }
  }
  
  /**
   * Fetch API wrapper with error handling
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Response data
   */
  async fetchAPI(endpoint, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
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
      
      // Log request
      this.logger.debug(`API Request: ${formattedEndpoint}`, { 
        method: options.method || 'GET',
        baseURL: this.baseURL
      });
      
      // Send request
      const response = await fetch(`${this.baseURL}${formattedEndpoint}`, {
        ...options,
        headers
      });
      
      // Parse response
      if (response.ok) {
        const data = await response.json();
        this.logger.debug(`API Response: ${formattedEndpoint}`, { 
          status: response.status
        });
        return data;
      } else {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
    } catch (error) {
      this.logger.error(`API Error: ${endpoint}`, { error: error.message });
      throw error;
    }
  }
  
  /**
   * Send a message to background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response from background script
   */
  sendMessageToBackground(message) {
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
    try {
      // Try to connect to health endpoint
      const response = await this.fetchAPI('/api/health', {
        method: 'GET',
        timeout: 5000
      });
      
      return response && response.status === 'ok';
    } catch (error) {
      this.logger.warn('API connection check failed:', error);
      return false;
    }
  }
}