import { captureCurrentTab, setupCaptureButton } from '../shared/utils/capture.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  
  // UI elements
  const statusIndicator = document.getElementById('status-indicator');
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  const authForm = document.getElementById('auth-form');
  const relatedBtn = document.getElementById('related-btn');
  const queryBtn = document.getElementById('query-btn');
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  const activityList = document.getElementById('activity-list');
  const optionsBtn = document.getElementById('options-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const captureBtn = document.getElementById('capture-btn');
  setupCaptureButton(captureBtn, captureCurrentTab, () => {
    // Callback to run after successful capture
    loadRecentActivity();
  });
  
  // Check online status
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    console.log('Online status:', isOnline);
    
    if (isOnline) {
      statusIndicator.textContent = 'Online';
      statusIndicator.className = 'status-online';
    } else {
      statusIndicator.textContent = 'Offline';
      statusIndicator.className = 'status-offline';
    }
  }
  
  // Check authentication status
  async function checkAuthStatus() {
    console.log('Checking auth status...');
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkAuthStatus' });
      console.log('Auth status response:', response);
      
      if (response.authenticated) {
        loginForm.style.display = 'none';
        userInfo.style.display = 'block';
        enableFunctionality();
      } else {
        loginForm.style.display = 'block';
        userInfo.style.display = 'none';
        disableFunctionality();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      // For testing, always enable functionality
      enableFunctionality();
    }
  }
  
  // Enable/disable main functionality
  function enableFunctionality() {
    console.log('Enabling functionality');
    captureBtn.disabled = false;
    relatedBtn.disabled = false;
    queryBtn.disabled = false;
    dashboardBtn.disabled = false;
  }
  
  function disableFunctionality() {
    console.log('Disabling functionality');
    captureBtn.disabled = true;
    relatedBtn.disabled = true;
    queryBtn.disabled = true;
    dashboardBtn.disabled = true;
  }
  
  // Load recent activity
  async function loadRecentActivity() {
    console.log('Loading recent activity');
    
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
      console.error('Error loading activity:', error);
      activityList.innerHTML = '<div class="error-state">Error loading activity</div>';
    }
  }
  
  // Utility functions
  function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
  
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Report network status to service worker
  function reportNetworkStatus() {
    const isOnline = navigator.onLine;
    console.log('Reporting network status:', isOnline);
    
    try {
      chrome.runtime.sendMessage({ 
        action: 'networkStatusChange', 
        isOnline: isOnline 
      });
    } catch (error) {
      console.error('Error reporting network status:', error);
    }
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
  
  // Login form submission
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('Login form submitted');
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'login',
          username,
          password
        });
        
        console.log('Login response:', response);
        
        if (response.success) {
          checkAuthStatus();
        } else {
          alert('Login failed: ' + (response.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Login error: ' + error.message);
      }
    });
  }
  
  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      console.log('Logout clicked');
      
      try {
        await chrome.runtime.sendMessage({ action: 'logout' });
        checkAuthStatus();
      } catch (error) {
        console.error('Logout error:', error);
      }
    });
  }
  
  
  // Related content button
  if (relatedBtn) {
    relatedBtn.addEventListener('click', () => {
      console.log('Related button clicked');
      alert('Finding related content will be available in the next version.');
    });
  }
  
  // Query button
  if (queryBtn) {
    queryBtn.addEventListener('click', () => {
      console.log('Query button clicked');
      alert('Ask Marvin functionality will be available in the next version.');
    });
  }
  
  // Open dashboard button
  if (dashboardBtn && !dashboardBtn.hasClickListener) {
    dashboardBtn.hasClickListener = true;
    dashboardBtn.addEventListener('click', () => {
      console.log('Dashboard button clicked');
      chrome.tabs.create({ url: 'dashboard/dashboard.html' });
    });
  }
  
  // Options button
  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      console.log('Options button clicked');
      chrome.runtime.openOptionsPage();
    });
  }
  
  // Initialize popup
  console.log('Initializing popup');
  updateOnlineStatus();
  checkAuthStatus();
  loadRecentActivity();
  
  // Report network status to service worker
  reportNetworkStatus();
});