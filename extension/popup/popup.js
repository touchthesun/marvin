import { captureCurrentTab, setupCaptureButton } from '../shared/utils/capture.js';

/**
 * Initialize the popup
 */
async function initialize() {
  console.log('Popup initialized');
  
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
  const analyzeBtn = document.getElementById('analyze-btn');
  
  // Set up UI event listeners
  setupCaptureButton(captureBtn, captureCurrentTab, () => {
    // Callback to run after successful capture
    loadRecentActivity();
  });
  
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeCurrentTab);
  }
  
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', openDashboard);
  }
  
  if (optionsBtn) {
    optionsBtn.addEventListener('click', openSettings);
  }
  
  // Check online status
  updateOnlineStatus();
  
  // Check authentication status
  await checkAuthStatus();
  
  // Load and display active tasks
  await refreshActiveTasks();
  
  // Load recent activity
  await loadRecentActivity();
  
  // Set up refresh timer
  setInterval(refreshActiveTasks, 2000);
  
  // Report network status to service worker
  reportNetworkStatus();
  
  // Event listeners for network status
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
        const response = await sendMessageToBackground({
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
        await sendMessageToBackground({ action: 'logout' });
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
}

/**
 * Check online status
 */
function updateOnlineStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  if (!statusIndicator) return;
  
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

/**
 * Check authentication status
 */
async function checkAuthStatus() {
  console.log('Checking auth status...');
  
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  
  if (!loginForm || !userInfo) return;
  
  try {
    const response = await sendMessageToBackground({ action: 'checkAuthStatus' });
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

/**
 * Enable main functionality
 */
function enableFunctionality() {
  console.log('Enabling functionality');
  const captureBtn = document.getElementById('capture-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const relatedBtn = document.getElementById('related-btn');
  const queryBtn = document.getElementById('query-btn');
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  
  if (captureBtn) captureBtn.disabled = false;
  if (analyzeBtn) analyzeBtn.disabled = false;
  if (relatedBtn) relatedBtn.disabled = false;
  if (queryBtn) queryBtn.disabled = false;
  if (dashboardBtn) dashboardBtn.disabled = false;
}

/**
 * Disable main functionality
 */
function disableFunctionality() {
  console.log('Disabling functionality');
  const captureBtn = document.getElementById('capture-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const relatedBtn = document.getElementById('related-btn');
  const queryBtn = document.getElementById('query-btn');
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  
  if (captureBtn) captureBtn.disabled = true;
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (relatedBtn) relatedBtn.disabled = true;
  if (queryBtn) queryBtn.disabled = true;
  if (dashboardBtn) dashboardBtn.disabled = true;
}

/**
 * Load recent activity
 */
async function loadRecentActivity() {
  console.log('Loading recent activity');
  const activityList = document.getElementById('activity-list');
  if (!activityList) return;
  
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

/**
 * Analyze the current tab
 */
async function analyzeCurrentTab() {
  try {
    // Show loading state
    updateStatus('Analyzing current tab...', 'info');
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Send message to background script
    const result = await sendMessageToBackground({
      action: 'analyzeUrl',
      url: tab.url,
      options: {
        tabId: String(tab.id),
        windowId: String(tab.windowId),
        title: tab.title
      }
    });
    
    console.log('Analysis result:', result);
    
    if (result.success) {
      updateStatus('Analysis started', 'success');
      refreshActiveTasks();
    } else {
      updateStatus(`Error: ${result.error}`, 'error');
    }
  } catch (e) {
    console.error('Error analyzing tab:', e);
    updateStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Open the dashboard page
 */
function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

/**
 * Open the settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Update the status message
 * @param {string} message - Status message
 * @param {string} type - Message type (info, success, error)
 */
function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  // Set message and type
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
  
  // Show status
  statusEl.style.display = 'block';
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }
}

/**
 * Refresh the list of active tasks
 */
async function refreshActiveTasks() {
  try {
    // Get active tasks from background script
    const result = await sendMessageToBackground({
      action: 'getActiveTasks'
    });
    
    if (!result.success) {
      console.error('Error getting active tasks:', result.error);
      return;
    }
    
    const tasks = result.tasks;
    
    // Display tasks
    const tasksContainer = document.getElementById('activeTasks');
    if (tasksContainer) {
      displayActiveTasks(tasks);
    }
  } catch (e) {
    console.error('Error refreshing tasks:', e);
  }
}

/**
 * Display the list of active tasks
 * @param {array} tasks - Task objects
 */
function displayActiveTasks(tasks) {
  const tasksContainer = document.getElementById('activeTasks');
  if (!tasksContainer) return;
  
  // Clear current content
  tasksContainer.innerHTML = '';
  
  // Display each task
  tasks.forEach(task => {
    const taskElement = document.createElement('div');
    taskElement.className = `task-item task-${task.status}`;
    taskElement.dataset.taskId = task.id;
    
    // Format progress
    const progressText = Math.round(task.progress) + '%';
    const progressTitle = task.stageName || `Stage ${task.stage + 1}`;
    
    // Set inner HTML
    taskElement.innerHTML = `
      <div class="task-header">
        <span class="task-title">${getTaskTitle(task)}</span>
        <span class="task-status">${task.status}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${task.progress}%"></div>
        <span class="progress-text">${progressText}</span>
      </div>
      <div class="task-details">
        <span class="task-stage">${progressTitle}</span>
        <div class="task-actions">
          ${getTaskActions(task)}
        </div>
      </div>
    `;
    
    // Add to container
    tasksContainer.appendChild(taskElement);
    
    // Add event listeners to action buttons
    taskElement.querySelectorAll('.task-action').forEach(button => {
      button.addEventListener('click', handleTaskAction);
    });
  });
  
  // Show message if no tasks
  if (tasks.length === 0) {
    tasksContainer.innerHTML = '<div class="no-tasks">No active analysis tasks</div>';
  }
}

/**
 * Get a title for the task
 * @param {object} task - Task object
 * @returns {string} Task title
 */
function getTaskTitle(task) {
  // This would extract a title from task data or URL
  // For now, just use a generic title with the ID
  return `Task ${task.id.split('_')[1]}`;
}

/**
 * Get action buttons for a task
 * @param {object} task - Task object
 * @returns {string} HTML for action buttons
 */
function getTaskActions(task) {
  switch (task.status) {
    case 'error':
      return `<button class="task-action" data-action="retry" data-task-id="${task.id}">Retry</button>`;
      
    case 'processing':
    case 'analyzing':
    case 'pending':
      return `<button class="task-action" data-action="cancel" data-task-id="${task.id}">Cancel</button>`;
      
    case 'complete':
      return `<button class="task-action" data-action="view" data-task-id="${task.id}">View</button>`;
      
    default:
      return '';
  }
}

/**
 * Handle task action button clicks
 * @param {Event} event - Click event
 */
async function handleTaskAction(event) {
  const button = event.target;
  const action = button.dataset.action;
  const taskId = button.dataset.taskId;
  
  if (!action || !taskId) return;
  
  try {
    switch (action) {
      case 'cancel':
        await cancelTask(taskId);
        break;
        
      case 'retry':
        await retryTask(taskId);
        break;
        
      case 'view':
        viewTaskResult(taskId);
        break;
    }
  } catch (e) {
    console.error(`Error handling ${action} action:`, e);
    updateStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Cancel a task
 * @param {string} taskId - Task ID
 */
async function cancelTask(taskId) {
  updateStatus('Cancelling task...', 'info');
  
  const result = await sendMessageToBackground({
    action: 'cancelTask',
    taskId
  });
  
  if (result.success) {
    updateStatus('Task cancelled', 'success');
    refreshActiveTasks();
  } else {
    updateStatus(`Error: ${result.error}`, 'error');
  }
}

/**
 * Retry a task
 * @param {string} taskId - Task ID
 */
async function retryTask(taskId) {
  updateStatus('Retrying task...', 'info');
  
  const result = await sendMessageToBackground({
    action: 'retryTask',
    taskId
  });
  
  if (result.success) {
    updateStatus('Task restarted', 'success');
    refreshActiveTasks();
  } else {
    updateStatus(`Error: ${result.error}`, 'error');
  }
}

/**
 * View task result
 * @param {string} taskId - Task ID
 */
function viewTaskResult(taskId) {
  // Open dashboard with task ID
  chrome.tabs.create({
    url: chrome.runtime.getURL(`dashboard/dashboard.html?task=${taskId}`)
  });
}

/**
 * Report network status to service worker
 */
function reportNetworkStatus() {
  const isOnline = navigator.onLine;
  console.log('Reporting network status:', isOnline);
  
  try {
    sendMessageToBackground({ 
      action: 'networkStatusChange', 
      isOnline: isOnline 
    });
  } catch (error) {
    console.error('Error reporting network status:', error);
  }
}

/**
 * Send a message to the background script
 * @param {object} message - Message to send
 * @returns {Promise<object>} Response from background script
 */
function sendMessageToBackground(message) {
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

/**
 * Check if content script is loaded in the current tab
 */
async function checkContentScript() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) return;
    
    // Skip for chrome:// and other restricted URLs
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:')) {
      return;
    }
    
    // Try to send a ping message to the content script
    chrome.tabs.sendMessage(tab.id, { action: 'contentScriptPing' }, (response) => {
      // If there's an error, the content script might not be loaded
      if (chrome.runtime.lastError) {
        console.log('Content script not loaded, injecting...');
        
        // Inject the content script
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        }).catch(error => {
          console.error('Error injecting content script:', error);
        });
      } else {
        console.log('Content script is loaded');
      }
    });
  } catch (error) {
    console.error('Error checking content script:', error);
  }
}

/**
 * Utility: Truncate text with ellipsis
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

/**
 * Utility: Format timestamp as time
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted time
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initialize();
  checkContentScript();
});
