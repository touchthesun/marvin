import { captureCurrentTab, setupCaptureButton } from '../shared/utils/capture.js';
import { LogManager } from '../shared/utils/log-manager.js';


// Initialize logger
const logger = new LogManager({
  isBackgroundScript: false,
  storageKey: 'marvin_popup_logs',
  maxEntries: 1000
});

logger.log('info', 'Popup script loaded');


// Track if dashboard is already being opened
let debugMode = false;
let isDashboardOpening = false;


function logUIElements() {
  const elements = {
    captureBtn: document.getElementById('capture-btn'),
    analyzeBtn: document.getElementById('analyze-btn'),
    dashboardBtn: document.getElementById('open-dashboard-btn'),
    relatedBtn: document.getElementById('related-btn'),
    queryBtn: document.getElementById('query-btn'),
    optionsBtn: document.getElementById('options-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    statusIndicator: document.getElementById('status-indicator'),
    activityList: document.getElementById('activity-list')
  };
  
  logger.log('debug', 'UI Elements Found', {
    captureBtn: !!elements.captureBtn,
    analyzeBtn: !!elements.analyzeBtn,
    dashboardBtn: !!elements.dashboardBtn,
    relatedBtn: !!elements.relatedBtn,
    queryBtn: !!elements.queryBtn,
    optionsBtn: !!elements.optionsBtn,
    logoutBtn: !!elements.logoutBtn,
    statusIndicator: !!elements.statusIndicator,
    activityList: !!elements.activityList
  });
  
  return elements;
}


async function checkDebugMode() {
  try {
    const data = await chrome.storage.local.get('marvin_debug_mode');
    debugMode = !!data.marvin_debug_mode;
    updateDebugUI();
  } catch (error) {
    console.error('Error checking debug mode:', error);
    logger.log('error', 'Error checking debug mode:', error);
  }
}

function updateDebugUI() {
  const debugSection = document.getElementById('debug-section');
  if (debugSection) {
    debugSection.style.display = debugMode ? 'block' : 'none';
  }
  
  const toggleDebugBtn = document.getElementById('toggle-debug-mode');
  if (toggleDebugBtn) {
    toggleDebugBtn.textContent = debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode';
  }
  
  logger.log('debug', `Debug UI updated - debug mode is ${debugMode ? 'enabled' : 'disabled'}`);
}

// Add this function to toggle debug mode
async function toggleDebugMode() {
  try {
    debugMode = !debugMode;
    await chrome.storage.local.set({ 'marvin_debug_mode': debugMode });
    
    updateDebugUI();
    logger.log('info', `Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('Error toggling debug mode:', error);
    logger.log('error', 'Error toggling debug mode:', error);
  }
}

// Modify the openDashboard function to support diagnostic mode
function openDashboard() {
  // Prevent multiple dashboard tabs from opening
  if (isDashboardOpening) {
    logger.log('info', 'Dashboard already opening, ignoring duplicate request');
    return;
  }
  
  isDashboardOpening = true;
  
  // Reset the flag after a short delay
  setTimeout(() => {
    isDashboardOpening = false;
  }, 2000);

  const dashboardUrl = 'dashboard/dashboard.html';
  logger.log('info', `Opening dashboard: ${dashboardUrl}`);
  chrome.tabs.create({ url: chrome.runtime.getURL(dashboardUrl) });
}

/**
 * Open diagnostic dashboard with fallback options
 */
function openDiagnosticDashboard() {
  // Prevent multiple dashboard tabs from opening
  if (isDashboardOpening) {
    logger.log('info', 'Dashboard already opening, ignoring duplicate request');
    return;
  }
  
  isDashboardOpening = true;
  
  // Reset the flag after a short delay
  setTimeout(() => {
    isDashboardOpening = false;
  }, 2000);

  // First try to open the dashboard-minimal.html
  try {
    // Path relative to extension root
    const dashboardUrl = 'popup/diagnostics.html';
    const fullUrl = chrome.runtime.getURL(dashboardUrl);
    
    logger.log('info', `Opening diagnostic dashboard: ${fullUrl}`);
    
    chrome.tabs.create({ url: fullUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        logger.log('error', `Failed to open diagnostic dashboard: ${chrome.runtime.lastError.message}`);
      } else {
        logger.log('info', `Successfully opened diagnostic dashboard in tab ${tab.id}`);
      }
    });
  } catch (error) {
    logger.log('error', `Error opening diagnostic dashboard: ${error.message}`);
  }
}

// Add a function to export logs from the popup
async function exportLogs() {
  try {
    logger.log('info', 'Exporting logs');
    const logs = await logger.exportLogs('text');
    
    // Create a download link
    const blob = new Blob([logs], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marvin-popup-logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logger.log('info', 'Logs exported successfully');
  } catch (error) {
    console.error('Error exporting logs:', error);
    logger.log('error', 'Error exporting logs:', error);
  }
}


/**
 * Initialize the popup
 */
async function initialize() {
  logger.log('info', 'Popup initialize function started');
  
  try {
    // Log UI element existence
    const elements = logUIElements();

    // Check debug mode
    await checkDebugMode();
    
    // Set up debug toggle
    const debugToggle = document.getElementById('debug-toggle');
    logger.log('debug', 'Debug toggle element:', debugToggle);
    
    if (debugToggle) {
      // Remove any existing listeners by cloning and replacing
      const newToggle = debugToggle.cloneNode(true);
      if (debugToggle.parentNode) {
        debugToggle.parentNode.replaceChild(newToggle, debugToggle);
      }

      // Add click listener to the new element
      newToggle.addEventListener('click', () => {
        logger.log('info', 'Debug toggle clicked');
        const debugSection = document.getElementById('debug-section');
        if (debugSection) {
          const isVisible = debugSection.style.display === 'block';
          debugSection.style.display = isVisible ? 'none' : 'block';
          logger.log('debug', `Debug section visibility set to ${!isVisible}`);
        } else {
          logger.log('warn', 'Debug section element not found');
        }
      });
      
      logger.log('debug', 'Debug toggle event listener added');
    } else {
      logger.log('warn', 'Debug toggle element not found');
    }
    
    // Set up debug buttons
    const toggleDebugBtn = document.getElementById('toggle-debug-mode');
    if (toggleDebugBtn) {
      toggleDebugBtn.addEventListener('click', toggleDebugMode);
      logger.log('debug', 'Toggle debug mode button initialized');
    }
    
    const openDiagnosticBtn = document.getElementById('open-diagnostic-dashboard');
    if (openDiagnosticBtn) {
      openDiagnosticBtn.addEventListener('click', openDiagnosticDashboard);
      logger.log('debug', 'Open diagnostic dashboard button initialized');
    }
    
    const exportLogsBtn = document.getElementById('export-logs');
    if (exportLogsBtn) {
      exportLogsBtn.addEventListener('click', exportLogs);
      logger.log('debug', 'Export logs button initialized');
    }
    
    // Set up capture button
    if (elements.captureBtn) {
      logger.log('debug', 'Setting up capture button');
      try {
        setupCaptureButton(elements.captureBtn, captureCurrentTab, () => {
          logger.log('info', 'Capture button success callback triggered');
          loadRecentActivity();
        });
        logger.log('debug', 'Capture button setup completed');
      } catch (error) {
        logger.log('error', 'Error setting up capture button', error);
      }
    }

    // Add explicit logging before each event listener setup
    if (elements.dashboardBtn) {
      logger.log('debug', 'Setting up dashboard button');
      try {
        // Check if the button exists and has a parent node
        if (elements.dashboardBtn && elements.dashboardBtn.parentNode) {
          // Remove any existing click listeners
          const newBtn = elements.dashboardBtn.cloneNode(true);
          elements.dashboardBtn.parentNode.replaceChild(newBtn, elements.dashboardBtn);
          elements.dashboardBtn = newBtn;
        }
        
        // Make sure elements.dashboardBtn is still valid
        if (elements.dashboardBtn) {
          elements.dashboardBtn.addEventListener('click', () => {
            logger.log('info', 'Dashboard button clicked');
            openDashboard();
          });
          logger.log('debug', 'Dashboard button setup completed');
        } else {
          logger.log('warn', 'Dashboard button not found or became invalid');
        }
      } catch (error) {
        logger.log('error', 'Error setting up dashboard button', error);
      }
    }
    
    if (elements.analyzeBtn) {
      logger.log('debug', 'Setting up analyze button');
      try {
        elements.analyzeBtn.addEventListener('click', () => {
          logger.log('info', 'Analyze button clicked');
          analyzeCurrentTab();
        });
        logger.log('debug', 'Analyze button setup completed');
      } catch (error) {
        logger.log('error', 'Error setting up analyze button', error);
      }
    }
    

    if (elements.optionsBtn) {
      logger.log('debug', 'Setting up options button');
      try {
        elements.optionsBtn.addEventListener('click', () => {
          logger.log('info', 'Dashboard button clicked');
          openSettings();
        });
        logger.log('debug', 'Dashboard button setup completed');
      } catch (error) {
        logger.log('error', 'Error setting up dashboard button', error);
      }
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
      logger.log('info', 'Login form submitted');
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      const response = await sendMessageToBackground({
        action: 'login',
        username,
        password
      });
      
      logger.log('debug', 'Login response:', response);
      
      if (!response.success) {
        alert('Login failed: ' + (response.error || 'Unknown error'));
        logger.log('error', 'Login failed:', response.error || 'Unknown error');
        return;
      }
      
      checkAuthStatus();
    });
  }
  
  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logger.log('info', 'Logout clicked');
      
      const response = await sendMessageToBackground({ action: 'logout' });
      if (!response.success) {
        logger.error('Logout error:', response.error);
        return;
      }
      
      checkAuthStatus();
    });
  }
  
  // Related content button
  if (relatedBtn) {
    relatedBtn.addEventListener('click', () => {
      logger.log('info', 'Related button clicked');
      alert('Finding related content will be available in the next version.');
    });
  }
  
  // Query button
  if (queryBtn) {
    queryBtn.addEventListener('click', () => {
      logger.log('info', 'Query button clicked');
      alert('Ask Marvin functionality will be available in the next version.');
    });
  }} catch (error) {
    logger.log('error', 'Error in initialize function', error);
  }
}


/**
 * Check online status
 */
function updateOnlineStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  if (!statusIndicator) return;
  
  const isOnline = navigator.onLine;
  logger.log('Online status:', isOnline);
  
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
  logger.log('Checking auth status...');
  
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  
  if (!loginForm || !userInfo) return;
  
  const response = await sendMessageToBackground({ action: 'checkAuthStatus' });
  logger.log('Auth status response:', response);
  
  if (!response.success) {
    logger.error('Error checking auth status:', response.error);
    // For testing, always enable functionality
    enableFunctionality();
    return;
  }
  
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

/**
 * Enable main functionality
 */
function enableFunctionality() {
  logger.log('Enabling functionality');
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
  logger.log('Disabling functionality');
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
  logger.log('Loading recent activity');
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
  // Show loading state
  updateStatus('Analyzing current tab...', 'info');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    updateStatus('Error: No active tab found', 'error');
    return;
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
  
  logger.log('Analysis result:', result);
  
  if (!result.success) {
    updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
    return;
  }
  
  updateStatus('Analysis started', 'success');
  refreshActiveTasks();
}


// Track if dashboard is already being opened
// let isDashboardOpening = false;

// /**
//  * Open the dashboard page
//  */
// function openDashboard() {
//   // Prevent multiple dashboard tabs from opening
//   if (isDashboardOpening) {
//     console.log('Dashboard already opening, ignoring duplicate request');
//     return;
//   }
  
//   isDashboardOpening = true;
  
//   // Reset the flag after a short delay
//   setTimeout(() => {
//     isDashboardOpening = false;
//   }, 2000);
  
//   chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard-minimal.html') });
// }

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
  // Get active tasks from background script
  const result = await sendMessageToBackground({
    action: 'getActiveTasks'
  });
  
  if (!result.success) {
    logger.error('Error getting active tasks:', result.error);
    return;
  }
  
  const tasks = result.tasks;
  
  // Display tasks
  const tasksContainer = document.getElementById('activeTasks');
  if (tasksContainer) {
    displayActiveTasks(tasks);
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
  
  if (!result.success) {
    updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
    return;
  }
  
  updateStatus('Task cancelled', 'success');
  refreshActiveTasks();
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
  
  if (!result.success) {
    updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
    return;
  }
  
  updateStatus('Task restarted', 'success');
  refreshActiveTasks();
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
  logger.log('Reporting network status:', isOnline);
  
  sendMessageToBackground({ 
    action: 'networkStatusChange', 
    isOnline: isOnline 
  }).then(response => {
    if (!response.success) {
      logger.error('Error reporting network status:', response.error);
    }
  });
}

/**
 * Safely send a message to the background script with timeout
 * @param {object} message - Message to send
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<any>} - Response from background script
 */
function sendMessageToBackground(message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // Create a timeout to handle cases where background doesn't respond
    const timeoutId = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out' });
    }, timeout);

    try {
      chrome.runtime.sendMessage(message, response => {
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          // Don't reject - just resolve with error details
          resolve({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          resolve(response || { success: true });
        }
      });
    } catch (error) {
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // Handle any exceptions
      resolve({ 
        success: false, 
        error: error.message || 'Unknown error in sendMessageToBackground' 
      });
    }
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
        logger.log('Content script not loaded, injecting...');
        
        // Inject the content script
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        }).catch(error => {
          console.error('Error injecting content script:', error);
        });
      } else {
        logger.log('Content script is loaded');
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