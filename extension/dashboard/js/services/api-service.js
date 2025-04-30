// services/api-service.js
import { LogManager } from '../../../shared/utils/log-manager.js';

const logger = new LogManager({
  isBackgroundScript: false,
  storageKey: 'marvin_api_logs',
  maxEntries: 1000
});

/**
 * Fetch API wrapper with error handling
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Response data
 */
export async function fetchAPI(endpoint, options = {}) {
  try {
    // Get API base URL from storage
    const data = await chrome.storage.local.get('apiConfig');
    const baseURL = data.apiConfig?.baseURL || 'http://localhost:8000';
    
    // Ensure endpoint starts with /
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // Set default headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    
    // Send request
    logger.log('debug', `API Request: ${formattedEndpoint}`, { method: options.method || 'GET' });
    
    const response = await fetch(`${baseURL}${formattedEndpoint}`, {
      ...options,
      headers
    });
    
    // Parse response
    if (response.ok) {
      const data = await response.json();
      logger.log('debug', `API Response: ${formattedEndpoint}`, { status: response.status });
      return data;
    } else {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
  } catch (error) {
    logger.log('error', `API Error: ${endpoint}`, { error: error.message });
    throw error;
  }
}

/**
 * Send a message to background script
 * @param {object} message - Message to send
 * @returns {Promise<object>} Response from background script
 */
export function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

