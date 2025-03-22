// popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
  // UI elements
  const statusIndicator = document.getElementById('status-indicator');
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  const authForm = document.getElementById('auth-form');
  const captureBtn = document.getElementById('capture-btn');
  const relatedBtn = document.getElementById('related-btn');
  const queryBtn = document.getElementById('query-btn');
  const activityList = document.getElementById('activity-list');
  const optionsBtn = document.getElementById('options-btn');
  const logoutBtn = document.getElementById('logout-btn');
  
  // Check online status
  function updateOnlineStatus() {
    if (navigator.onLine) {
      statusIndicator.textContent = 'Online';
      statusIndicator.className = 'status-online';
    } else {
      statusIndicator.textContent = 'Offline';
      statusIndicator.className = 'status-offline';
    }
  }
  
  // Check authentication status
  async function checkAuthStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuthStatus' });
    
    if (response.authenticated) {
      loginForm.style.display = 'none';
      userInfo.style.display = 'block';
      enableFunctionality();
    } else {
      loginForm.style.display = 'block';
      userInfo.style.display = 'none';
      disableFunctionality();
    }
  }
  
  // Enable/disable main functionality
  function enableFunctionality() {
    captureBtn.disabled = false;
    relatedBtn.disabled = false;
    queryBtn.disabled = false;
  }
  
  function disableFunctionality() {
    captureBtn.disabled = true;
    relatedBtn.disabled = true;
    queryBtn.disabled = true;
  }
  
  // Load recent activity
  async function loadRecentActivity() {
    try {
      const data = await chrome.storage.local.get('captureHistory');
      const history = data.captureHistory || [];
      
      if (history.length === 0) {
        activityList.innerHTML = '<div class="empty-state">No recent activity</div>';
        return;
      }
      
      activityList.innerHTML = '';
      
      history.slice(0, 10).forEach(item => {
        const element = document.createElement('div');
        element.className = 'activity-item';
        
        const statusClass = item.status === 'captured' ? 'status-success' : 'status-pending';
        
        element.innerHTML = `
          <div class="activity-title" title="${item.title}">${truncate(item.title, 40)}</div>
          <div class="activity-meta">
            <span class="activity-time">${formatTime(item.timestamp)}</span>
            <span class="activity-status ${statusClass}">${item.status}</span>
          </div>
        `;
        
        activityList.appendChild(element);
      });
    } catch (error) {
      activityList.innerHTML = '<div class="error-state">Error loading activity</div>';
      console.error('Error loading activity:', error);
    }
  }
  
  // Utility functions
  function truncate(str, length) {
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
  
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Report network status to background script
  function reportNetworkStatus() {
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: navigator.onLine 
    });
  }
  
  // Event listeners
  window.addEventListener('online', () => {
    updateOnlineStatus();
    reportNetworkStatus();
  });
  
  window.addEventListener('offline', () => {
    updateOnlineStatus();
    reportNetworkStatus();
  });
  
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const response = await chrome.runtime.sendMessage({
      action: 'login',
      username,
      password
    });
    
    if (response.success) {
      checkAuthStatus();
    } else {
      alert('Login failed: ' + (response.error || 'Unknown error'));
    }
  });
  
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'logout' });
    checkAuthStatus();
  });
  
  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturing...';
    
    const response = await chrome.runtime.sendMessage({ action: 'captureCurrentTab' });
    
    if (response.success) {
      captureBtn.textContent = 'Captured!';
      setTimeout(() => {
        captureBtn.textContent = 'Capture Current Page';
        captureBtn.disabled = false;
        loadRecentActivity();
      }, 2000);
    } else {
      alert('Capture failed: ' + (response.error || 'Unknown error'));
      captureBtn.textContent = 'Capture Failed';
      setTimeout(() => {
        captureBtn.textContent = 'Capture Current Page';
        captureBtn.disabled = false;
      }, 2000);
    }
  });
  
  relatedBtn.addEventListener('click', () => {
    // Will be implemented in Phase 2
    alert('Finding related content will be available in the next version.');
  });
  
  queryBtn.addEventListener('click', () => {
    // Will be implemented in Phase 3
    alert('Ask Marvin functionality will be available in the next version.');
  });
  
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Initialize popup
  updateOnlineStatus();
  checkAuthStatus();
  loadRecentActivity();
  
  // Report network status to service worker
  reportNetworkStatus();
});