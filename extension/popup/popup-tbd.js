// popup.js
// UI controller for the extension popup

/**
 * Initialize the popup
 */
async function initialize() {
    console.log('Popup initialized');
    
    // Set up UI event listeners
    document.getElementById('captureBtn').addEventListener('click', captureCurrentTab);
    document.getElementById('analyzeBtn').addEventListener('click', analyzeCurrentTab);
    document.getElementById('dashboardBtn').addEventListener('click', openDashboard);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    
    // Load and display active tasks
    await refreshActiveTasks();
    
    // Set up refresh timer
    setInterval(refreshActiveTasks, 2000);
  }
  
  /**
   * Capture the current tab
   */
  async function captureCurrentTab() {
    try {
      // Show loading state
      updateStatus('Capturing current tab...', 'info');
      
      // Send message to background script
      const result = await sendMessageToBackground({
        action: 'captureCurrentTab'
      });
      
      console.log('Capture result:', result);
      
      if (result.success) {
        updateStatus('Page captured successfully', 'success');
        
        // Refresh task list if a task was created
        if (result.taskId) {
          refreshActiveTasks();
        }
      } else {
        updateStatus(`Error: ${result.error}`, 'error');
      }
    } catch (e) {
      console.error('Error capturing tab:', e);
      updateStatus(`Error: ${e.message}`, 'error');
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
      displayActiveTasks(tasks);
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
   * Send a message to the background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response
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
  
  // Initialize the popup when the DOM is loaded
  document.addEventListener('DOMContentLoaded', initialize);