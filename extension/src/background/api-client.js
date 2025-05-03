/**
 * Client for interacting with the Marvin API
 */
class MarvinAPIClient {
  /**
   * Create a new API client
   * @param {string} baseURL - API base URL
   * @param {object} authManager - Authentication manager
   */
  constructor(baseURL, authManager) {
    this.baseURL = baseURL;
    this.authManager = authManager;
    this.pendingRequests = [];
    this.isOnline = true; // Default to online in service worker
    this.requestTimeout = 30000; // 30 seconds timeout
  }
  
  /**
   * Set the API base URL
   * @param {string} baseUrl - New base URL
   */
  setBaseUrl(baseUrl) {
    this.baseURL = baseUrl;
  }
  
  /**
   * Make an API request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request data
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = this._buildUrl(endpoint);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    
    // Add authentication if available
    const token = await this.authManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const requestOptions = {
      method: method.toUpperCase(),
      headers,
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow',
      ...options
    };
    
    // Add body for methods that support it
    if (data !== null && ['POST', 'PUT', 'PATCH'].includes(requestOptions.method)) {
      requestOptions.body = JSON.stringify(data);
    }
    
    // Handle offline mode
    if (!this.isOnline && options.queueOffline !== false) {
      return this.queueRequest(method, endpoint, data, options);
    }
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      requestOptions.signal = controller.signal;
      
      // Set timeout
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(url, requestOptions);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Handle authentication errors
      if (response.status === 401) {
        const refreshed = await this.authManager.refreshToken();
        if (refreshed) {
          // Retry with new token
          return this.request(method, endpoint, data, options);
        } else {
          throw new Error('Authentication failed');
        }
      }
      
      // Handle 404 errors gracefully
      if (response.status === 404) {
        console.warn(`Endpoint not found: ${endpoint}`);
        return {
          success: false,
          error: {
            error_code: "NOT_FOUND",
            message: `Endpoint ${endpoint} not available`
          }
        };
      }
      
      // Parse response
      let responseData;
      
      try {
        responseData = await response.json();
      } catch (e) {
        // Not JSON, return text content
        if (response.ok) {
          return {
            success: true,
            data: await response.text()
          };
        }
        
        throw new Error(`Invalid response: ${await response.text()}`);
      }
      
      // Return structured response
      if (response.ok) {
        // If API returns success flag, respect it
        if (typeof responseData.success === 'boolean') {
          return responseData;
        }
        
        // Otherwise build our own success response
        return {
          success: true,
          data: responseData
        };
      }
      
      // Error response
      return {
        success: false,
        error: {
          status: response.status,
          message: responseData.error?.message || responseData.message || 'Unknown error',
          details: responseData.error?.details || responseData.error || responseData
        }
      };
    } catch (error) {
      console.error('API request error:', error);
      
      // Handle fetch errors
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: {
            message: 'Request timed out',
            details: { timeout: this.requestTimeout }
          }
        };
      }
      
      if (!this.isOnline) {
        return this.queueRequest(method, endpoint, data, options);
      }
      
      // Other errors
      return {
        success: false,
        error: {
          message: error.message,
          details: { type: error.name }
        }
      };
    }
  }
  
  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }
  
  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request data
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async post(endpoint, data = null, options = {}) {
    return this.request('POST', endpoint, data, options);
  }
  
  /**
   * Make a PUT request
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request data
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async put(endpoint, data = null, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }
  
  /**
   * Make a DELETE request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }
  
  /**
   * Build full URL from endpoint
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {string} Full URL
   */
  _buildUrl(endpoint) {
    // Handle absolute URLs
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    
    // Ensure endpoint starts with slash
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    
    // Remove trailing slash from base URL if present
    let baseUrl = this.baseURL;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    return `${baseUrl}${endpoint}`;
  }
  
  // Handle offline queuing
  queueRequest(method, endpoint, data, options) {
    const queuedRequest = { method, endpoint, data, options, timestamp: Date.now() };
    this.pendingRequests.push(queuedRequest);
    this.savePendingRequests();
    
    return {
      success: false,
      queued: true,
      message: 'Request queued for offline processing'
    };
  }
  
  // Process queued requests when back online
  async processQueue() {
    if (!this.isOnline || this.pendingRequests.length === 0) return;
    
    console.log(`Processing ${this.pendingRequests.length} queued requests`);
    
    const requests = [...this.pendingRequests];
    this.pendingRequests = [];
    this.savePendingRequests();
    
    for (const req of requests) {
      try {
        await this.request(req.method, req.endpoint, req.data, {
          ...req.options,
          queueOffline: false
        });
      } catch (error) {
        // Re-queue failed requests
        this.pendingRequests.push(req);
      }
    }
    
    this.savePendingRequests();
  }
  
  // Network status change handler (called from background.js)
  handleNetworkChange(isOnline) {
    console.log(`Network status changed: ${isOnline ? 'online' : 'offline'}`);
    this.isOnline = isOnline;
    if (this.isOnline) {
      this.processQueue();
    }
  }
  
  // Persistence for request queue
  async savePendingRequests() {
    await chrome.storage.local.set({ pendingRequests: this.pendingRequests });
  }
  
  async loadPendingRequests() {
    const data = await chrome.storage.local.get('pendingRequests');
    this.pendingRequests = data.pendingRequests || [];
    return this.pendingRequests;
  }
}

export default MarvinAPIClient;
