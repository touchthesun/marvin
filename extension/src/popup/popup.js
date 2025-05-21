// src/popup/popup.js
import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';
import { ServiceRegistry } from '../core/service-registry.js';
import { UtilsRegistry } from '../core/utils-registry.js';
import { captureCurrentTab, setupCaptureButton } from '../components/shared/capture.js';

/**
 * Popup Component
 * Manages the browser extension popup interface
 */
const Popup = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Store service references
  _messageService: null,
  _logger: null,
  _debugMode: false,
  _isDashboardOpening: false,
  
  /**
   * Initialize the popup
   * @returns {Promise<boolean>} Success status
   */
  async initPopup() {
    try {
      // Create logger directly
      this._logger = new LogManager({
        context: 'popup',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing popup');
      
      // Initialize services first
      await this.initializeServices();
      
      // Log UI element existence
      const elements = this.logUIElements();
      
      // Check debug mode
      await this.checkDebugMode();
      
      // Set up all event listeners
      this.setupEventListeners(elements);
      
      // Check online status
      this.updateOnlineStatus();
      
      // Check authentication status
      await this.checkAuthStatus();
      
      // Load and display active tasks
      await this.refreshActiveTasks();
      
      // Load recent activity
      await this.loadRecentActivity();
      
      // Set up refresh timer
      const refreshInterval = setInterval(() => this.refreshActiveTasks(), 2000);
      this._intervals.push(refreshInterval);
      
      // Report network status to service worker
      this.reportNetworkStatus();
      
      // Set up network status listeners
      const onlineHandler = () => {
        this.updateOnlineStatus();
        this.reportNetworkStatus();
      };
      
      window.addEventListener('online', onlineHandler);
      window.addEventListener('offline', onlineHandler);
      
      // Track these listeners
      this._eventListeners.push(
        { element: window, type: 'online', listener: onlineHandler },
        { element: window, type: 'offline', listener: onlineHandler }
      );
      
      this.initialized = true;
      this._logger.info('Popup initialized successfully');
      return true;
    } catch (error) {
      this._logger.error('Error in initialize function:', error);
      return false;
    }
  },
  
  /**
   * Initialize services using existing DI pattern
   */
  async initializeServices() {
    if (this.initialized) return;
    
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
      
      // Get services with fallbacks
      this._messageService = this.getService('messageService', {
        sendMessage: async (message) => {
          this._logger.warn('MessageService not available, using fallback');
          return { success: false, error: 'Service not available' };
        }
      });
      
      this._logger.info('Popup services initialized');
    } catch (error) {
      this._logger.error('Error initializing services:', error);
      throw error;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      this._logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Log UI elements and return them
   * @returns {Object} UI elements
   */
  logUIElements() {
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
    
    this._logger.debug('UI Elements Found', {
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
  },
  
  /**
   * Check and update debug mode
   */
  async checkDebugMode() {
    try {
      const data = await chrome.storage.local.get('marvin_debug_mode');
      this._debugMode = !!data.marvin_debug_mode;
      this.updateDebugUI();
    } catch (error) {
      this._logger.error('Error checking debug mode:', error);
    }
  },
  
  /**
   * Update debug UI elements
   */
  updateDebugUI() {
    const debugSection = document.getElementById('debug-section');
    if (debugSection) {
      debugSection.style.display = this._debugMode ? 'block' : 'none';
    }
    
    const toggleDebugBtn = document.getElementById('toggle-debug-mode');
    if (toggleDebugBtn) {
      toggleDebugBtn.textContent = this._debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode';
    }
    
    this._logger.debug(`Debug UI updated - debug mode is ${this._debugMode ? 'enabled' : 'disabled'}`);
  },
  
  /**
   * Toggle debug mode
   */
  async toggleDebugMode() {
    try {
      this._debugMode = !this._debugMode;
      await chrome.storage.local.set({ 'marvin_debug_mode': this._debugMode });
      
      this.updateDebugUI();
      this._logger.info(`Debug mode ${this._debugMode ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this._logger.error('Error toggling debug mode:', error);
    }
  },
  
  /**
   * Open the dashboard
   */
  openDashboard() {
    if (this._isDashboardOpening) {
      this._logger.info('Dashboard already opening, ignoring duplicate request');
      return;
    }
    
    this._isDashboardOpening = true;
    
    const timeoutId = setTimeout(() => {
      this._isDashboardOpening = false;
    }, 2000);
    
    this._timeouts.push(timeoutId);
    
    const dashboardUrl = 'dashboard/dashboard.html';
    this._logger.info(`Opening dashboard: ${dashboardUrl}`);
    chrome.tabs.create({ url: chrome.runtime.getURL(dashboardUrl) });
  },
  
  /**
   * Open the diagnostic dashboard
   */
  openDiagnosticDashboard() {
    if (this._isDashboardOpening) {
      this._logger.info('Dashboard already opening, ignoring duplicate request');
      return;
    }
    
    this._isDashboardOpening = true;
    
    const timeoutId = setTimeout(() => {
      this._isDashboardOpening = false;
    }, 2000);
    
    this._timeouts.push(timeoutId);
    
    try {
      const dashboardUrl = 'popup/diagnostics.html';
      const fullUrl = chrome.runtime.getURL(dashboardUrl);
      
      this._logger.info(`Opening diagnostic dashboard: ${fullUrl}`);
      
      chrome.tabs.create({ url: fullUrl }, (tab) => {
        if (chrome.runtime.lastError) {
          this._logger.error(`Failed to open diagnostic dashboard: ${chrome.runtime.lastError.message}`);
        } else {
          this._logger.info(`Successfully opened diagnostic dashboard in tab ${tab.id}`);
        }
      });
    } catch (error) {
      this._logger.error(`Error opening diagnostic dashboard: ${error.message}`);
    }
  },
  
  /**
   * Export logs
   */
  async exportLogs() {
    try {
      this._logger.info('Exporting logs');
      const logs = await this._logger.exportLogs('text');
      
      chrome.downloads.download({
        url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(logs),
        filename: 'marvin-popup-logs.txt',
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          this._logger.error('Error downloading logs:', chrome.runtime.lastError);
        } else {
          this._logger.info('Logs exported successfully with download ID:', downloadId);
        }
      });
    } catch (error) {
      this._logger.error('Error exporting logs:', error);
    }
  },
  
  /**
   * Set up all event listeners
   * @param {Object} elements - UI elements
   */
  setupEventListeners(elements) {
    this._logger.info('Setting up event listeners');
    
    // Debug toggle
    this.setupSafeEventListener('debug-toggle', 'click', () => {
      this._logger.info('Debug toggle clicked');
      const debugSection = document.getElementById('debug-section');
      if (debugSection) {
        const isVisible = debugSection.style.display === 'block';
        debugSection.style.display = isVisible ? 'none' : 'block';
        this._logger.debug(`Debug section visibility set to ${!isVisible}`);
      }
    });
    
    // Debug mode toggle button
    this.setupSafeEventListener('toggle-debug-mode', 'click', () => this.toggleDebugMode());
    
    // Diagnostic dashboard button
    this.setupSafeEventListener('open-diagnostic-dashboard', 'click', () => this.openDiagnosticDashboard());
    
    // Export logs button
    this.setupSafeEventListener('export-logs', 'click', () => this.exportLogs());
    
    // Dashboard button
    this.setupSafeEventListener('open-dashboard-btn', 'click', () => {
      this._logger.info('Dashboard button clicked');
      this.openDashboard();
    });
    
    // Analyze button
    this.setupSafeEventListener('analyze-btn', 'click', () => {
      this._logger.info('Analyze button clicked');
      this.analyzeCurrentTab();
    });
    
    // Options button
    this.setupSafeEventListener('options-btn', 'click', () => {
      this._logger.info('Options button clicked');
      this.openSettings();
    });
    
    // Related content button
    this.setupSafeEventListener('related-btn', 'click', () => {
      this._logger.info('Related button clicked');
      alert('Finding related content will be available in the next version.');
    });
    
    // Query button
    this.setupSafeEventListener('query-btn', 'click', () => {
      this._logger.info('Query button clicked');
      alert('Ask Marvin functionality will be available in the next version.');
    });
    
    // Capture button
    if (elements.captureBtn) {
      this._logger.debug('Setting up capture button');
      try {
        setupCaptureButton(elements.captureBtn, captureCurrentTab, () => {
          this._logger.info('Capture button success callback triggered');
          this.loadRecentActivity();
        });
        this._logger.debug('Capture button setup completed');
      } catch (error) {
        this._logger.error('Error setting up capture button', error);
      }
    }
    
    // Authentication form submission
    const authForm = document.getElementById('login-form');
    if (authForm) {
      this._logger.debug('Setting up auth form submission handler');
      try {
        const newForm = authForm.cloneNode(true);
        if (authForm.parentNode) {
          authForm.parentNode.replaceChild(newForm, authForm);
        }
        
        // Track the new form
        this._domElements.push(newForm);
        
        newForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          this._logger.info('Login form submitted');
          
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;
          
          try {
            await this.initializeServices();
            const response = await this._messageService.sendMessage({
              action: 'login',
              username,
              password
            });
            
            this._logger.debug('Login response:', response);
            
            if (!response.success) {
              alert('Login failed: ' + (response.error || 'Unknown error'));
              this._logger.error('Login failed:', response.error || 'Unknown error');
              return;
            }
            
            this.checkAuthStatus();
          } catch (error) {
            this._logger.error('Error during login:', error);
            alert('Login error: ' + error.message);
          }
        });
        
        // Track this listener
        this._eventListeners.push({
          element: newForm,
          type: 'submit',
          listener: newForm.onsubmit
        });
        
        this._logger.debug('Auth form submission handler set up successfully');
      } catch (error) {
        this._logger.error('Error setting up auth form submission handler', error);
      }
    }
    
    // Logout button
    this.setupSafeEventListener('logout-btn', 'click', async () => {
      this._logger.info('Logout clicked');
      
      try {
        await this.initializeServices();
        const response = await this._messageService.sendMessage({ action: 'logout' });
        if (!response.success) {
          this._logger.error('Logout error:', response.error);
          return;
        }
        
        this.checkAuthStatus();
      } catch (error) {
        this._logger.error('Error during logout:', error);
      }
    });
  },
  
  /**
   * Set up an event listener safely
   * @param {string} elementId - Element ID
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   */
  setupSafeEventListener(elementId, eventType, handler) {
    const element = document.getElementById(elementId);
    
    if (!element) {
      this._logger.warn(`Element with ID "${elementId}" not found`);
      return;
    }
    
    this._logger.debug(`Setting up ${eventType} listener for ${elementId}`);
    
    try {
      const newElement = element.cloneNode(true);
      if (element.parentNode) {
        element.parentNode.replaceChild(newElement, element);
      }
      
      // Track the new DOM element
      this._domElements.push(newElement);
      
      newElement.addEventListener(eventType, handler);
      
      // Track this listener
      this._eventListeners.push({
        element: newElement,
        type: eventType,
        listener: handler
      });
      
      this._logger.debug(`Successfully set up ${eventType} listener for ${elementId}`);
    } catch (error) {
      this._logger.error(`Error setting up ${eventType} listener for ${elementId}`, error);
    }
  },
  
  /**
   * Update online status
   */
  updateOnlineStatus() {
    const statusIndicator = document.getElementById('status-indicator');
    if (!statusIndicator) return;
    
    const isOnline = navigator.onLine;
    this._logger.info('Online status:', isOnline);
    
    if (isOnline) {
      statusIndicator.textContent = 'Online';
      statusIndicator.className = 'status-online';
    } else {
      statusIndicator.textContent = 'Offline';
      statusIndicator.className = 'status-offline';
    }
  },
  
  /**
   * Check authentication status
   */
  async checkAuthStatus() {
    this._logger.info('Checking auth status...');
    
    const loginForm = document.getElementById('login-form');
    const userInfo = document.getElementById('user-info');
    
    if (!loginForm || !userInfo) return;
    
    try {
      await this.initializeServices();
      const response = await this._messageService.sendMessage({ action: 'checkAuthStatus' });
      this._logger.debug('Auth status response:', response);
      
      if (!response.success) {
        this._logger.error('Error checking auth status:', response.error);
        // For testing, always enable functionality
        this.enableFunctionality();
        return;
      }
      
      if (response.authenticated) {
        loginForm.style.display = 'none';
        userInfo.style.display = 'block';
        this.enableFunctionality();
      } else {
        loginForm.style.display = 'block';
        userInfo.style.display = 'none';
        this.disableFunctionality();
      }
    } catch (error) {
      this._logger.error('Error checking auth status:', error);
      this.enableFunctionality(); // Fallback
    }
  },
  
  /**
   * Enable functionality
   */
  enableFunctionality() {
    this._logger.info('Enabling functionality');
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
  },
  
  /**
   * Disable functionality
   */
  disableFunctionality() {
    this._logger.info('Disabling functionality');
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
  },
  
  /**
   * Load recent activity
   */
  async loadRecentActivity() {
    this._logger.info('Loading recent activity');
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
          <div class="activity-title" title="${item.title}">${this.truncate(item.title, 40)}</div>
          <div class="activity-meta">
            <span class="activity-time">${formattedTime}</span>
            <span class="activity-status ${statusClass}">${item.status}</span>
          </div>
        `;
        
        activityList.appendChild(element);
      });
    } catch (error) {
      this._logger.error('Error loading activity:', error);
      activityList.innerHTML = '<div class="error-state">Error loading activity</div>';
    }
  },
  
  /**
   * Analyze current tab
   */
  async analyzeCurrentTab() {
    this.updateStatus('Analyzing current tab...', 'info');
    
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.updateStatus('Error: No active tab found', 'error');
        return;
      }
      
      await this.initializeServices();
      
      // Send message to background script
      const result = await this._messageService.sendMessage({
        action: 'analyzeUrl',
        url: tab.url,
        options: {
          tabId: String(tab.id),
          windowId: String(tab.windowId),
          title: tab.title
        }
      });
      
      this._logger.debug('Analysis result:', result);
      
      if (!result.success) {
        this.updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
        return;
      }
      
      this.updateStatus('Analysis started', 'success');
      this.refreshActiveTasks();
    } catch (error) {
      this._logger.error('Error analyzing current tab:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
    }
  },
  
  /**
   * Open settings
   */
  openSettings() {
    chrome.runtime.openOptionsPage();
  },
  
  /**
   * Update status
   * @param {string} message - Status message
   * @param {string} type - Status type
   */
  updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status status-${type}`;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
      const timeoutId = setTimeout(() => {
        statusEl.style.display = 'none';
      }, 5000);
      
      this._timeouts.push(timeoutId);
    }
  },
  
  /**
   * Refresh active tasks
   */
  async refreshActiveTasks() {
    try {
      await this.initializeServices();
      
      // Get active tasks from background script
      const result = await this._messageService.sendMessage({
        action: 'getActiveTasks'
      });
      
      if (!result.success) {
        this._logger.error('Error getting active tasks:', result.error);
        return;
      }
      
      const tasks = result.tasks;
      
      // Display tasks
      const tasksContainer = document.getElementById('activeTasks');
      if (tasksContainer) {
        this.displayActiveTasks(tasks);
      }
    } catch (error) {
      this._logger.error('Error refreshing active tasks:', error);
    }
  },
  
  /**
   * Display active tasks
   * @param {Array} tasks - Active tasks
   */
  displayActiveTasks(tasks) {
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
          <span class="task-title">${this.getTaskTitle(task)}</span>
          <span class="task-status">${task.status}</span>
        </div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${task.progress}%"></div>
          <span class="progress-text">${progressText}</span>
        </div>
        <div class="task-details">
          <span class="task-stage">${progressTitle}</span>
          <div class="task-actions">
            ${this.getTaskActions(task)}
          </div>
        </div>
      `;
      
      tasksContainer.appendChild(taskElement);
      
      taskElement.querySelectorAll('.task-action').forEach(button => {
        button.addEventListener('click', this.handleTaskAction.bind(this));
      });
    });
    
    if (tasks.length === 0) {
      tasksContainer.innerHTML = '<div class="no-tasks">No active analysis tasks</div>';
    }
  },
  
  /**
   * Get task title
   * @param {Object} task - Task object
   * @returns {string} Task title
   */
  getTaskTitle(task) {
    return `Task ${task.id.split('_')[1]}`;
  },
  
  /**
   * Get task actions
   * @param {Object} task - Task object
   * @returns {string} Task actions HTML
   */
  getTaskActions(task) {
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
  },
  
  /**
   * Handle task action
   * @param {Event} event - Click event
   */
  async handleTaskAction(event) {
    const button = event.target;
    const action = button.dataset.action;
    const taskId = button.dataset.taskId;
    
    if (!action || !taskId) return;
    
    try {
      switch (action) {
        case 'cancel':
          await this.cancelTask(taskId);
          break;
        case 'retry':
          await this.retryTask(taskId);
          break;
        case 'view':
          this.viewTaskResult(taskId);
          break;
      }
    } catch (e) {
      this._logger.error(`Error handling ${action} action:`, e);
      this.updateStatus(`Error: ${e.message}`, 'error');
    }
  },
  
  /**
   * Cancel task
   * @param {string} taskId - Task ID
   */
  async cancelTask(taskId) {
    this.updateStatus('Cancelling task...', 'info');
    
    try {
      await this.initializeServices();
      const result = await this._messageService.sendMessage({
        action: 'cancelTask',
        taskId
      });
      
      if (!result.success) {
        this.updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
        return;
      }
      
      this.updateStatus('Task cancelled', 'success');
      this.refreshActiveTasks();
    } catch (error) {
      this._logger.error('Error cancelling task:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
    }
  },
  
  /**
   * Retry task
   * @param {string} taskId - Task ID
   */
  async retryTask(taskId) {
    this.updateStatus('Retrying task...', 'info');
    
    try {
      await this.initializeServices();
      const result = await this._messageService.sendMessage({
        action: 'retryTask',
        taskId
      });
      
      if (!result.success) {
        this.updateStatus(`Error: ${result.error || 'Unknown error'}`, 'error');
        return;
      }
      
      this.updateStatus('Task restarted', 'success');
      this.refreshActiveTasks();
    } catch (error) {
      this._logger.error('Error retrying task:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
    }
  },
  
  /**
   * View task result
   * @param {string} taskId - Task ID
   */
  viewTaskResult(taskId) {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`dashboard/dashboard.html?task=${taskId}`)
    });
  },
  
  /**
   * Report network status
   */
  reportNetworkStatus() {
    const isOnline = navigator.onLine;
    this._logger.info('Reporting network status:', isOnline);
    
    if (this._messageService) {
      this._messageService.sendMessage({ 
        action: 'networkStatusChange', 
        isOnline: isOnline 
      }).then(response => {
        if (!response.success) {
          this._logger.error('Error reporting network status:', response.error);
        }
      }).catch(error => {
        this._logger.error('Error reporting network status:', error);
      });
    }
  },
  
  /**
   * Check content script
   */
  async checkContentScript() {
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
          this._logger.info('Content script not loaded, injecting...');
          
          // Inject the content script
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js']
          }).catch(error => {
            this._logger.error('Error injecting content script:', error);
          });
        } else {
          this._logger.info('Content script is loaded');
        }
      });
    } catch (error) {
      this._logger.error('Error checking content script:', error);
    }
  },
  
  /**
   * Truncate string
   * @param {string} str - String to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated string
   */
  truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  },
  
  /**
   * Clean up resources when popup is closed
   */
  cleanup() {
    if (!this.initialized) {
      this._logger.debug('Popup not initialized, skipping cleanup');
      return;
    }
    
    this._logger.info('Cleaning up popup resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        this._logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        this._logger.warn(`Error clearing interval:`, error);
      }
    });
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({element, type, listener}) => {
      try {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, listener);
        }
      } catch (error) {
        this._logger.warn(`Error removing event listener:`, error);
      }
    });
    this._eventListeners = [];
     
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        this._logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    // Clear service references
    this._messageService = null;
    this._logger = null;
    
    this.initialized = false;
    this._logger.debug('Popup cleanup completed');
  }
};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  Popup.initPopup();
  Popup.checkContentScript();
});

// Export the popup component
export { Popup };