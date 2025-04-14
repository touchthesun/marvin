// api-client.js
// Client for interacting with the Marvin API
 
/**
 * Client for interacting with the Marvin API
 */
export class ApiClient {
  /**
   * Create a new API client
   * @param {string} baseUrl - API base URL
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.authToken = null;
    this.requestTimeout = 30000; // 30 seconds
  }
  
  /**
   * Set the API base URL
   * @param {string} baseUrl - New base URL
   */
  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Set authentication token
   * @param {string} token - Auth token
   */
  setAuthToken(token) {
    this.authToken = token;
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
    
    // Prepare fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      },
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow',
    };
    
    // Add authorization if token is available
    if (this.authToken) {
      fetchOptions.headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    // Add body for methods that support it
    if (data !== null && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
      fetchOptions.body = JSON.stringify(data);
    }
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      
      // Set timeout
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      // Make request
      const response = await fetch(url, fetchOptions);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
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
    let baseUrl = this.baseUrl;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    return `${baseUrl}${endpoint}`;
  }
}