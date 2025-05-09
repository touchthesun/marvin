import { captureCurrentTab, setupCaptureButton } from '../components/shared/capture.js';
import { LogManager } from '../utils/log-manager.js';
import { formatTime } from '../utils/formatting.js';

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

  // First try to open the diagnostics dashboard.html
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
    
    // Use chrome.downloads API instead of blob URLs
    chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(logs),
      filename: 'marvin-popup-logs.txt',
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        logger.log('error', 'Error downloading logs:', chrome.runtime.lastError);
      } else {
        logger.log('info', 'Logs exported successfully with download ID:', downloadId);
      }
    });
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
    
    // Set up all event listeners using the improved pattern
    setupEventListeners(elements);
    
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
  } catch (error) {
    logger.log('error', 'Error in initialize function', error);
  }
}

/**
 * Set up an event listener safely by cloning the element to remove existing listeners
 * @param {string} elementId - ID of the element
 * @param {string} eventType - Type of event (e.g., 'click')
 * @param {function} handler - Event handler function
 */
function setupSafeEventListener(elementId, eventType, handler) {
  const element = document.getElementById(elementId);
  
  if (!element) {
    logger.log('warn', `Element with ID "${elementId}" not found`);
    return;
  }
  
  logger.log('debug', `Setting up ${eventType} listener for ${elementId}`);
  
  try {
    // Clone the element to remove any existing listeners
    const newElement = element.cloneNode(true);
    if (element.parentNode) {
      element.parentNode.replaceChild(newElement, element);
    }
    
    // Add the event listener to the new element
    newElement.addEventListener(eventType, handler);
    logger.log('debug', `Successfully set up ${eventType} listener for ${elementId}`);
  } catch (error) {
    logger.log('error', `Error setting up ${eventType} listener for ${elementId}`, error);
  }
}

/**
 * Set up all event listeners using the safe pattern to prevent duplicate handlers
 * @param {object} elements - UI elements object
 */
function setupEventListeners(elements) {
  logger.log('info', 'Setting up event listeners');
  
  // Debug toggle
  setupSafeEventListener('debug-toggle', 'click', () => {
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
  
  // Debug mode toggle button
  setupSafeEventListener('toggle-debug-mode', 'click', toggleDebugMode);
  
  // Diagnostic dashboard button
  setupSafeEventListener('open-diagnostic-dashboard', 'click', openDiagnosticDashboard);
  
  // Export logs button
  setupSafeEventListener('export-logs', 'click', exportLogs);
  
  // Dashboard button
  setupSafeEventListener('open-dashboard-btn', 'click', () => {
    logger.log('info', 'Dashboard button clicked');
    openDashboard();
  });
  
  // Analyze button
  setupSafeEventListener('analyze-btn', 'click', () => {
    logger.log('info', 'Analyze button clicked');
    analyzeCurrentTab();
  });
  
  // Options button
  setupSafeEventListener('options-btn', 'click', () => {
    logger.log('info', 'Options button clicked');
    openSettings();
  });
  
  // Related content button
  setupSafeEventListener('related-btn', 'click', () => {
    logger.log('info', 'Related button clicked');
    alert('Finding related content will be available in the next version.');
  });
  
  // Query button
  setupSafeEventListener('query-btn', 'click', () => {
    logger.log('info', 'Query button clicked');
    alert('Ask Marvin functionality will be available in the next version.');
  });
  
  // Capture button (using the existing utility function)
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
  
  // Authentication form submission
  const authForm = document.getElementById('login-form');
  if (authForm) {
    logger.log('debug', 'Setting up auth form submission handler');
    try {
      // Clone the form to remove any existing listeners
      const newForm = authForm.cloneNode(true);
      if (authForm.parentNode) {
        authForm.parentNode.replaceChild(newForm, authForm);
      }
      
      // Add the submit event listener to the new form
      newForm.addEventListener('submit', async (e) => {
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
      
      logger.log('debug', 'Auth form submission handler set up successfully');
    } catch (error) {
      logger.log('error', 'Error setting up auth form submission handler', error);
    }
  }
  
  // Logout button
  setupSafeEventListener('logout-btn', 'click', async () => {
    logger.log('info', 'Logout clicked');
    
    const response = await sendMessageToBackground({ action: 'logout' });
    if (!response.success) {
      logger.error('Logout error:', response.error);
      return;
    }
    
    checkAuthStatus();
  });
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


// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initialize();
  checkContentScript();
});
