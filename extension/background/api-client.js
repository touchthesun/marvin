// background/api-client.js

class MarvinAPIClient {
  constructor(baseURL, authManager) {
    this.baseURL = baseURL;
    this.authManager = authManager;
    this.pendingRequests = [];
    this.isOnline = true; // Default to online in service worker
  }
  
  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    // Add authentication if available
    const token = await this.authManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const requestOptions = {
      method,
      headers,
      ...options
    };
    
    if (data) {
      requestOptions.body = JSON.stringify(data);
    }
    
    // Handle offline mode
    if (!this.isOnline && options.queueOffline !== false) {
      return this.queueRequest(method, endpoint, data, options);
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
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
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('API request error:', error);
      
      if (!this.isOnline) {
        return this.queueRequest(method, endpoint, data, options);
      }
      throw error;
    }
  }
  
  // Convenience methods for common HTTP verbs
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }
  
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }
  
  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }
  
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
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