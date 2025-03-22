// background/auth-manager.js

class AuthManager {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
    this.refreshing = false;
  }
  
  async initialize() {
    const data = await chrome.storage.local.get(['authToken', 'tokenExpiry']);
    this.token = data.authToken || null;
    this.tokenExpiry = data.tokenExpiry || null;
    
    console.log('Auth manager initialized');
  }
  
  async getToken() {
    // Check if token needs refresh
    if (this.token && this.tokenExpiry) {
      const now = Date.now();
      if (now >= this.tokenExpiry - 300000) { // Refresh 5 minutes before expiry
        await this.refreshToken();
      }
    }
    
    return this.token;
  }
  
  async setToken(token, expiresIn = 3600) {
    this.token = token;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);
    
    await chrome.storage.local.set({
      authToken: token,
      tokenExpiry: this.tokenExpiry
    });
    
    return true;
  }
  
  async validateToken() {
    if (!this.token) return false;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_token: this.token })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.success === true;
      }
      
      return false;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }
  
  async refreshToken() {
    if (this.refreshing) return false;
    this.refreshing = true;
    
    try {
      // Implement token refresh logic here
      // This might involve calling an auth endpoint with refresh token
      // For now, let's assume we just validate the current token
      
      const isValid = await this.validateToken();
      
      if (!isValid) {
        await this.clearToken();
      }
      
      this.refreshing = false;
      return isValid;
    } catch (error) {
      this.refreshing = false;
      await this.clearToken();
      return false;
    }
  }
  
  async clearToken() {
    this.token = null;
    this.tokenExpiry = null;
    await chrome.storage.local.remove(['authToken', 'tokenExpiry']);
  }
  
  async login(username, password) {
    try {
      // Implement actual login logic here
      // This is a placeholder
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.token) {
          await this.setToken(data.data.token, data.data.expires_in);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }
}

export default AuthManager;