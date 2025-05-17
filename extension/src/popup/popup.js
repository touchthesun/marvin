import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';
import { ServiceRegistry } from '../core/service-registry.js';
import { UtilsRegistry } from '../core/utils-registry.js';
import { captureCurrentTab, setupCaptureButton } from '../components/shared/capture.js';

// do we need to update this to use new container

let initialized = false;
let messageService = null;
let logger = null;
let debugMode = false;
let isDashboardOpening = false;

/**
 * Initialize services using existing DI pattern
 */
async function initializeServices() {
  if (initialized) return;
  
  try {
    // Register utilities if not already registered
    if (!container.utils.has('LogManager')) {
      container.registerUtil('LogManager', UtilsRegistry.LogManager);
      if (UtilsRegistry.formatting) {
        container.registerUtil('formatting', UtilsRegistry.formatting);
      }
      if (UtilsRegistry.timeout) {
        container.registerUtil('timeout', UtilsRegistry.timeout);
      }
      if (UtilsRegistry.ui) {
        container.registerUtil('ui', UtilsRegistry.ui);
      }
    }
    
    // Register and initialize services if not already done
    if (container.services.size === 0) {
      ServiceRegistry.registerAll();
      await ServiceRegistry.initializeAll();
    }
    
    // Get services
    messageService = container.getService('messageService');
    
    // Initialize logger
    logger = new LogManager({
      isBackgroundScript: false,
      storageKey: 'marvin_popup_logs',
      maxEntries: 1000
    });
    
    initialized = true;
    logger.log('info', 'Popup services initialized');
  } catch (error) {
    console.error('Error initializing services:', error);
    throw error;
  }
}

/**
 * Initialize the popup
 */
async function initialize() {
  try {
    // Initialize services first
    await initializeServices();
    
    logger.log('info', 'Popup script loaded');
    
    // Log UI element existence
    const elements = logUIElements();

    // Check debug mode
    await checkDebugMode();
    
    // Set up all event listeners
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
    console.error('Error in initialize function:', error);
    if (logger) {
      logger.log('error', 'Error in initialize function', error);
    }
  }
}

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
  
  if (logger) {
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
  }
  
  return elements;
}

async function checkDebugMode() {
  try {
    const data = await chrome.storage.local.get('marvin_debug_mode');
    debugMode = !!data.marvin_debug_mode;
    updateDebugUI();
  } catch (error) {
    console.error('Error checking debug mode:', error);
    if (logger) {
      logger.log('error', 'Error checking debug mode:', error);
    }
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
  
  if (logger) {
    logger.log('debug', `Debug UI updated - debug mode is ${debugMode ? 'enabled' : 'disabled'}`);
  }
}

async function toggleDebugMode() {
  try {
    debugMode = !debugMode;
    await chrome.storage.local.set({ 'marvin_debug_mode': debugMode });
    
    updateDebugUI();
    if (logger) {
      logger.log('info', `Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
    }
  } catch (error) {
    console.error('Error toggling debug mode:', error);
    if (logger) {
      logger.log('error', 'Error toggling debug mode:', error);
    }
  }
}

function openDashboard() {
  if (isDashboardOpening) {
    if (logger) {
      logger.log('info', 'Dashboard already opening, ignoring duplicate request');
    }
    return;
  }
  
  isDashboardOpening = true;
  
  setTimeout(() => {
    isDashboardOpening = false;
  }, 2000);

  const dashboardUrl = 'dashboard/dashboard.html';
  if (logger) {
    logger.log('info', `Opening dashboard: ${dashboardUrl}`);
  }
  chrome.tabs.create({ url: chrome.runtime.getURL(dashboardUrl) });
}

function openDiagnosticDashboard() {
  if (isDashboardOpening) {
    if (logger) {
      logger.log('info', 'Dashboard already opening, ignoring duplicate request');
    }
    return;
  }
  
  isDashboardOpening = true;
  
  setTimeout(() => {
    isDashboardOpening = false;
  }, 2000);

  try {
    const dashboardUrl = 'popup/diagnostics.html';
    const fullUrl = chrome.runtime.getURL(dashboardUrl);
    
    if (logger) {
      logger.log('info', `Opening diagnostic dashboard: ${fullUrl}`);
    }
    
    chrome.tabs.create({ url: fullUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        if (logger) {
          logger.log('error', `Failed to open diagnostic dashboard: ${chrome.runtime.lastError.message}`);
        }
      } else {
        if (logger) {
          logger.log('info', `Successfully opened diagnostic dashboard in tab ${tab.id}`);
        }
      }
    });
  } catch (error) {
    if (logger) {
      logger.log('error', `Error opening diagnostic dashboard: ${error.message}`);
    }
  }
}
 
async function exportLogs() {
  try {
    if (logger) {
      logger.log('info', 'Exporting logs');
      const logs = await logger.exportLogs('text');
      
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
    }
  } catch (error) {
    console.error('Error exporting logs:', error);
    if (logger) {
      logger.log('error', 'Error exporting logs:', error);
    }
  }
}

/**
 * Set up all event listeners
 */
function setupEventListeners(elements) {
  if (logger) {
    logger.log('info', 'Setting up event listeners');
  }
  
  // Debug toggle
  setupSafeEventListener('debug-toggle', 'click', () => {
    if (logger) {
      logger.log('info', 'Debug toggle clicked');
    }
    const debugSection = document.getElementById('debug-section');
    if (debugSection) {
      const isVisible = debugSection.style.display === 'block';
      debugSection.style.display = isVisible ? 'none' : 'block';
      if (logger) {
        logger.log('debug', `Debug section visibility set to ${!isVisible}`);
      }
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
    if (logger) {
      logger.log('info', 'Dashboard button clicked');
    }
    openDashboard();
  });
  
  // Analyze button
  setupSafeEventListener('analyze-btn', 'click', () => {
    if (logger) {
      logger.log('info', 'Analyze button clicked');
    }
    analyzeCurrentTab();
  });
  
  // Options button
  setupSafeEventListener('options-btn', 'click', () => {
    if (logger) {
      logger.log('info', 'Options button clicked');
    }
    openSettings();
  });
  
  // Related content button
  setupSafeEventListener('related-btn', 'click', () => {
    if (logger) {
      logger.log('info', 'Related button clicked');
    }
    alert('Finding related content will be available in the next version.');
  });
  
  // Query button
  setupSafeEventListener('query-btn', 'click', () => {
    if (logger) {
      logger.log('info', 'Query button clicked');
    }
    alert('Ask Marvin functionality will be available in the next version.');
  });
  
  // Capture button
  if (elements.captureBtn) {
    if (logger) {
      logger.log('debug', 'Setting up capture button');
    }
    try {
      setupCaptureButton(elements.captureBtn, captureCurrentTab, () => {
        if (logger) {
          logger.log('info', 'Capture button success callback triggered');
        }
        loadRecentActivity();
      });
      if (logger) {
        logger.log('debug', 'Capture button setup completed');
      }
    } catch (error) {
      if (logger) {
        logger.log('error', 'Error setting up capture button', error);
      }
    }
  }
  
  // Authentication form submission
  const authForm = document.getElementById('login-form');
  if (authForm) {
    if (logger) {
      logger.log('debug', 'Setting up auth form submission handler');
    }
    try {
      const newForm = authForm.cloneNode(true);
      if (authForm.parentNode) {
        authForm.parentNode.replaceChild(newForm, authForm);
      }
      
      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (logger) {
          logger.log('info', 'Login form submitted');
        }
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
          await initializeServices(); // Ensure services are available
          const response = await messageService.sendMessage({
            action: 'login',
            username,
            password
          });
          
          if (logger) {
            logger.log('debug', 'Login response:', response);
          }
          
          if (!response.success) {
            alert('Login failed: ' + (response.error || 'Unknown error'));
            if (logger) {
              logger.log('error', 'Login failed:', response.error || 'Unknown error');
            }
            return;
          }
          
          checkAuthStatus();
        } catch (error) {
          if (logger) {
            logger.log('error', 'Error during login:', error);
          }
          alert('Login error: ' + error.message);
        }
      });
      
      if (logger) {
        logger.log('debug', 'Auth form submission handler set up successfully');
      }
    } catch (error) {
      if (logger) {
        logger.log('error', 'Error setting up auth form submission handler', error);
      }
    }
  }
  
  // Logout button
  setupSafeEventListener('logout-btn', 'click', async () => {
    if (logger) {
      logger.log('info', 'Logout clicked');
    }
    
    try {
      await initializeServices(); // Ensure services are available
      const response = await messageService.sendMessage({ action: 'logout' });
      if (!response.success) {
        if (logger) {
          logger.log('error', 'Logout error:', response.error);
        }
        return;
      }
      
      checkAuthStatus();
    } catch (error) {
      if (logger) {
        logger.log('error', 'Error during logout:', error);
      }
    }
  });
}

/**
 * Set up an event listener safely
 */
function setupSafeEventListener(elementId, eventType, handler) {
  const element = document.getElementById(elementId);
  
  if (!element) {
    if (logger) {
      logger.log('warn', `Element with ID "${elementId}" not found`);
    }
    return;
  }
  
  if (logger) {
    logger.log('debug', `Setting up ${eventType} listener for ${elementId}`);
  }
  
  try {
    const newElement = element.cloneNode(true);
    if (element.parentNode) {
      element.parentNode.replaceChild(newElement, element);
    }
    
    newElement.addEventListener(eventType, handler);
    if (logger) {
      logger.log('debug', `Successfully set up ${eventType} listener for ${elementId}`);
    }
  } catch (error) {
    if (logger) {
      logger.log('error', `Error setting up ${eventType} listener for ${elementId}`, error);
    }
  }
}

/**
 * Check online status
 */
function updateOnlineStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  if (!statusIndicator) return;
  
  const isOnline = navigator.onLine;
  if (logger) {
    logger.log('info', 'Online status:', isOnline);
  }
  
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
  if (logger) {
    logger.log('info', 'Checking auth status...');
  }
  
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  
  if (!loginForm || !userInfo) return;
  
  try {
    await initializeServices(); // Ensure services are available
    const response = await messageService.sendMessage({ action: 'checkAuthStatus' });
    if (logger) {
      logger.log('debug', 'Auth status response:', response);
    }
    
    if (!response.success) {
      if (logger) {
        logger.log('error', 'Error checking auth status:', response.error);
      }
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
  } catch (error) {
    if (logger) {
      logger.log('error', 'Error checking auth status:', error);
    }
    enableFunctionality(); // Fallback
  }
}

function enableFunctionality() {
  if (logger) {
    logger.log('info', 'Enabling functionality');
  }
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

function disableFunctionality() {
  if (logger) {
    logger.log('info', 'Disabling functionality');
  }
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

async function loadRecentActivity() {
  if (logger) {
    logger.log('info', 'Loading recent activity');
  }
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
      
      // Try to get formatting utility
      let formattedTime = item.timestamp;
      try {
        if (container.utils.has('formatting')) {
          const formatting = container.getUtil('formatting');
          if (formatting && formatting.formatTime) {
            formattedTime = formatting.formatTime(item.timestamp);
          }
        }
      } catch (error) {
        // Fallback to timestamp
      }
      
      element.innerHTML = `
        <div class="activity-title" title="${item.title}">${truncate(item.title, 40)}</div>
        <div class="activity-meta">
          <span class="activity-time">${formattedTime}</span>
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

async function analyzeCurrentTab() {
  updateStatus('Analyzing current tab...', 'info');
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      updateStatus('Error: No active tab found', 'error');
      return;
    }
    
    await initializeServices(); // Ensure services are available
    
    // Send message to background script
    const result = await messageService.sendMessage({
      action: 'analyzeUrl',
      url: tab.url,
      options: {
        tabId: String(tab.id),
        windowId: String(tab.windowId),
        title: tab.title
      }
    });
    
    if (logger) {
      logger.log('debug', 'Analysis result:', result);
    }
    
    if (!result.success) {
      updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
      return;
    }
    
    updateStatus('Analysis started', 'success');
    refreshActiveTasks();
  } catch (error) {
    if (logger) {
      logger.log('error', 'Error analyzing current tab:', error);
    }
    updateStatus(`Error: ${error.message}`, 'error');
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
  statusEl.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }
}

async function refreshActiveTasks() {
  try {
    await initializeServices(); // Ensure services are available
    
    // Get active tasks from background script
    const result = await messageService.sendMessage({
      action: 'getActiveTasks'
    });
    
    if (!result.success) {
      if (logger) {
        logger.log('error', 'Error getting active tasks:', result.error);
      }
      return;
    }
    
    const tasks = result.tasks;
    
    // Display tasks
    const tasksContainer = document.getElementById('activeTasks');
    if (tasksContainer) {
      displayActiveTasks(tasks);
    }
  } catch (error) {
    if (logger) {
      logger.log('error', 'Error refreshing active tasks:', error);
    }
  }
}

function displayActiveTasks(tasks) {
  const tasksContainer = document.getElementById('activeTasks');
  if (!tasksContainer) return;
  
  tasksContainer.innerHTML = '';
  
  tasks.forEach(task => {
    const taskElement = document.createElement('div');
    taskElement.className = `task-item task-${task.status}`;
    taskElement.dataset.taskId = task.id;
    
    const progressText = Math.round(task.progress) + '%';
    const progressTitle = task.stageName || `Stage ${task.stage + 1}`;
    
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
    
    tasksContainer.appendChild(taskElement);
    
    taskElement.querySelectorAll('.task-action').forEach(button => {
      button.addEventListener('click', handleTaskAction);
    });
  });
  
  if (tasks.length === 0) {
    tasksContainer.innerHTML = '<div class="no-tasks">No active analysis tasks</div>';
  }
}

function getTaskTitle(task) {
  return `Task ${task.id.split('_')[1]}`;
}

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

async function cancelTask(taskId) {
  updateStatus('Cancelling task...', 'info');
  
  try {
    await initializeServices(); // Ensure services are available
    const result = await messageService.sendMessage({
      action: 'cancelTask',
      taskId
    });
    
    if (!result.success) {
      updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
      return;
    }
    
    updateStatus('Task cancelled', 'success');
    refreshActiveTasks();
  } catch (error) {
    if (logger) {
      logger.log('error', 'Error cancelling task:', error);
    }
    updateStatus(`Error: ${error.message}`, 'error');
  }
}

async function retryTask(taskId) {
  updateStatus('Retrying task...', 'info');
  
  try {
    await initializeServices(); // Ensure services are available
    const result = await messageService.sendMessage({
      action: 'retryTask',
      taskId
    });
    
    if (!result.success) {
      updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
      return;
    }
    
    updateStatus('Task restarted', 'success');
    refreshActiveTasks();
  } catch (error) {
    if (logger) {
      logger.log('error', 'Error retrying task:', error);
    }
    updateStatus(`Error: ${error.message}`, 'error');
  }
}

function viewTaskResult(taskId) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`dashboard/dashboard.html?task=${taskId}`)
  });
}

function reportNetworkStatus() {
  const isOnline = navigator.onLine;
  if (logger) {
    logger.log('info', 'Reporting network status:', isOnline);
  }
  
  if (messageService) {
    messageService.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: isOnline 
    }).then(response => {
      if (!response.success) {
        if (logger) {
          logger.log('error', 'Error reporting network status:', response.error);
        }
      }
    }).catch(error => {
      if (logger) {
        logger.log('error', 'Error reporting network status:', error);
      }
    });
  }
}

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
        if (logger) {
          logger.log('info', 'Content script not loaded, injecting...');
        }
        
        // Inject the content script
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        }).catch(error => {
          console.error('Error injecting content script:', error);
        });
      } else {
        if (logger) {
          logger.log('info', 'Content script is loaded');
        }
      }
    });
  } catch (error) {
    console.error('Error checking content script:', error);
  }
}

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initialize();
  checkContentScript();
});