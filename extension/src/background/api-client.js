/**
 * API Client for Chrome Extension Background Worker
 * 
 * Handles communication with the FastAPI server at 127.0.0.1:61697
 * Includes caching, authentication, and error handling.
 */

class APIClient {
  constructor() {
    this.baseURL = 'http://127.0.0.1:8000/api/v1'; // Default port
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.authCredentials = null;
    this.isServerAvailable = false; // Start as false to trigger port discovery
    this.discoveredPort = null;
    this.portDiscoveryAttempted = false;
  }

  /**
   * Set authentication credentials
   * @param {string} username 
   * @param {string} password 
   */
  setAuthCredentials(username, password) {
    this.authCredentials = { username, password };
  }

  /**
   * Make authenticated request to FastAPI server
   * @param {string} endpoint - API endpoint (e.g., '/api/tasks/active')
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, options = {}) {
    // Try port discovery if we haven't found the server yet
    if (!this.isServerAvailable && !this.portDiscoveryAttempted) {
      await this.discoverPort();
    }

    const url = `${this.baseURL}${endpoint}`;
    const cacheKey = `${options.method || 'GET'}:${url}`;

    // Skip cache for tasks endpoint (needs fresh data)
    const skipCache = endpoint === '/tasks' || endpoint.startsWith('/tasks/');
    
    // Check cache first (unless skipping)
    if (!skipCache) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        console.log(`Serving cached response for ${endpoint}`);
        return cached;
      }
    }

    try {
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      // Add authentication if available
      if (this.authCredentials) {
        headers['Authorization'] = `Basic ${btoa(`${this.authCredentials.username}:${this.authCredentials.password}`)}`;
      }

      // Make request
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Check if response exists (fetch succeeded)
      if (!response) {
        throw new Error('No response received from server');
      }

      if (!response.ok) {
        // Get error details for 422 responses
        let errorDetails = response.statusText;
        try {
          const errorData = await response.json();
          errorDetails = JSON.stringify(errorData);
          console.log('🚨 API Error Details:', errorData);
        } catch (e) {
          // Ignore JSON parse errors
        }
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      const data = await response.json();
      
      // Cache successful responses (except tasks endpoint)
      if (!skipCache) {
        this.cacheResponse(cacheKey, data);
      }
      
      // Mark server as available
      this.isServerAvailable = true;
      
      return data;

    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      
      // Mark server as unavailable
      this.isServerAvailable = false;
      
      // Return cached data if available (stale data is better than no data)
      const cached = this.getCachedResponse(cacheKey, true); // Allow stale data
      if (cached) {
        console.log(`Serving stale cached response for ${endpoint}`);
        return { ...cached, _stale: true };
      }
      
      throw error;
    }
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @param {boolean} allowStale - Whether to return stale data
   * @returns {Object|null} Cached response or null
   */
  getCachedResponse(key, allowStale = false) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    const isExpired = (now - cached.timestamp) > this.cacheTTL;

    if (isExpired && !allowStale) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Cache response
   * @param {string} key - Cache key
   * @param {Object} data - Response data
   */
  cacheResponse(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Discover the correct port for the FastAPI server
   * @returns {Promise<number|null>} The discovered port or null if not found
   */
  async discoverPort() {
    if (this.portDiscoveryAttempted) {
      return this.discoveredPort;
    }

    this.portDiscoveryAttempted = true;
    // Try common ports, with 8000 as the primary (fixed) port
    const commonPorts = [8000, 8080, 3000, 5000, 8001, 8002];
    
    console.log('🔍 Discovering FastAPI server port...');
    
    for (const port of commonPorts) {
      try {
        const testURL = `http://127.0.0.1:${port}/api/v1/health`;
        console.log(`  Trying port ${port}...`);
        
        const response = await fetch(testURL, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy') {
            console.log(`✅ Found server on port ${port}`);
            this.discoveredPort = port;
            this.baseURL = `http://127.0.0.1:${port}/api/v1`;
            this.isServerAvailable = true;
            return port;
          }
        }
      } catch (error) {
        // Continue to next port
        console.log(`  Port ${port} failed: ${error.message}`);
      }
    }
    
    console.log('❌ No server found on any common ports');
    this.isServerAvailable = false;
    return null;
  }

  /**
   * Check if server is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.isServerAvailable;
  }

  // API Methods

  /**
   * Get all tasks
   * @returns {Promise<Object>} All tasks
   */
  async getActiveTasks() {
    return this.makeRequest('/tasks');
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Task details
   */
  async getTask(taskId) {
    return this.makeRequest(`/tasks/${taskId}`);
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Result
   */
  async cancelTask(taskId) {
    return this.makeRequest(`/tasks/${taskId}/cancel`, {
      method: 'POST'
    });
  }

  /**
   * Retry a task
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Result
   */
  async retryTask(taskId) {
    return this.makeRequest(`/tasks/${taskId}/retry`, {
      method: 'POST'
    });
  }

  /**
   * Capture URL (create page)
   * @param {string} url - URL to capture
   * @param {Object} options - Capture options
   * @returns {Promise<Object>} Capture result
   */
  async captureUrl(url, options = {}) {
    const payload = { 
      url: url,
      context: options.context || 'active_tab'  // Use valid BrowserContext enum value
    };
    
    // Only include defined values
    if (options.tab_id !== undefined) payload.tab_id = options.tab_id;
    if (options.window_id !== undefined) payload.window_id = options.window_id;
    if (options.bookmark_id !== undefined) payload.bookmark_id = options.bookmark_id;
    
    console.log('🔍 API Client: Sending capture request:', payload);
    
    return this.makeRequest('/pages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * Capture batch of URLs
   * @param {Array<string>} urls - URLs to capture
   * @param {Object} options - Capture options
   * @returns {Promise<Object>} Batch capture result
   */
  async captureBatch(urls, options = {}) {
    return this.makeRequest('/pages/batch', {
      method: 'POST',
      body: JSON.stringify({ 
        urls,
        context: options.context || 'batch',
        tab_id: options.tab_id,
        window_id: options.window_id
      })
    });
  }

  /**
   * Get all tasks
   * @returns {Promise<Object>} Tasks data
   */
  async getTasks() {
    return this.makeRequest('/tasks');
  }

  /**
   * Get graph overview data
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Graph data
   */
  async getGraphOverview(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.include_empty) params.append('include_empty', options.include_empty);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest(`/graph/overview${query}`);
  }

  /**
   * Get system statistics
   * @returns {Promise<Object>} Stats data
   */
  async getStats() {
    return this.makeRequest('/stats');
  }

  /**
   * Analyze URL
   * @param {string} url - URL to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeUrl(url, options = {}) {
    return this.makeRequest('/api/analysis/url', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }

  /**
   * Get knowledge graph data
   * @param {string} panelName - Panel name
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Knowledge graph data
   */
  async getKnowledgeData(panelName, options = {}) {
    // Map panel names to actual API endpoints
    switch (panelName) {
      case 'overview':
        return this.makeRequest('/graph/overview');
      case 'capture':
        return this.makeRequest('/pages', {
          method: 'GET',
          params: { limit: 10 }
        });
      case 'knowledge':
        return this.makeRequest('/graph/overview', {
          method: 'GET',
          params: { limit: 20 }
        });
      default:
        return this.makeRequest('/graph/overview');
    }
  }

  /**
   * Get overview data
   * @returns {Promise<Object>} Overview data
   */
  async getOverviewData() {
    return this.makeRequest('/graph/overview');
  }

  /**
   * Get settings
   * @returns {Promise<Object>} Settings
   */
  async getSettings() {
    return this.makeRequest('/api/settings');
  }

  /**
   * Update settings
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Result
   */
  async updateSettings(settings) {
    return this.makeRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  /**
   * Check authentication status
   * @returns {Promise<Object>} Auth status
   */
  async checkAuthStatus() {
    return this.makeRequest('/api/auth/status');
  }

  /**
   * Login
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Login result
   */
  async login(username, password) {
    return this.makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  /**
   * Logout
   * @returns {Promise<Object>} Logout result
   */
  async logout() {
    return this.makeRequest('/api/auth/logout', {
      method: 'POST'
    });
  }
}

// Export singleton instance
export const apiClient = new APIClient();
