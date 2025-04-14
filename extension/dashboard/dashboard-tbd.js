// dashboard.js
// JavaScript for the dashboard page

// Background script connection
const backgroundPage = chrome.extension.getBackgroundPage();

// Task lists
let activeTasks = [];
let completedTasks = [];

// Page data
let capturedPages = [];

// Filters
let pageSearchQuery = '';

/**
 * Initialize the dashboard
 */
async function initialize() {
  console.log('Dashboard initialized');
  
  // Set up tab switching
  setupTabs();
  
  // Set up event listeners
  document.getElementById('captureBtn').addEventListener('click', captureCurrentTab);
  document.getElementById('refreshBtn').addEventListener('click', refreshData);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('cancelAllBtn').addEventListener('click', cancelAllTasks);
  document.getElementById('clearCompletedBtn').addEventListener('click', clearCompletedTasks);
  document.getElementById('pageSearch').addEventListener('input', handlePageSearch);
  
  // Set up modal close buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  
  // Load initial data
  await refreshData();
  
  // Set up refresh timer for active tasks
  setInterval(refreshActiveTasks, 2000);
}

/**
 * Set up tab switching
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Show corresponding tab pane
      const tabId = tab.dataset.tab;
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });
}

/**
 * Refresh all data
 */
async function refreshData() {
  try {
    // Show loading state
    document.getElementById('activeTasks').innerHTML = '<div class="loading">Loading tasks...</div>';
    document.getElementById('completedTasks').innerHTML = '<div class="loading">Loading tasks...</div>';
    document.getElementById('pagesList').innerHTML = '<div class="loading">Loading pages...</div>';
    
    // Refresh tasks
    await refreshAllTasks();
    
    // Refresh pages
    await refreshPages();
  } catch (e) {
    console.error('Error refreshing data:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Handle page action button click
 * @param {Event} event - Click event
 */
async function handlePageAction(event) {
  const action = event.target.dataset.action;
  const pageId = event.target.dataset.pageId;
  const url = event.target.dataset.url;
  
  if (!action) return;
  
  try {
    switch (action) {
      case 'analyze':
        if (url) {
          await analyzeUrl(url, { pageId });
        }
        break;
        
      case 'view':
        if (url) {
          chrome.tabs.create({ url });
        }
        break;
    }
  } catch (e) {
    console.error(`Error handling page action ${action}:`, e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Cancel a task
 * @param {string} taskId - Task ID
 */
async function cancelTask(taskId) {
  try {
    showStatus('Cancelling task...', 'info');
    
    const result = await sendMessageToBackground({
      action: 'cancelTask',
      taskId
    });
    
    if (result.success) {
      showStatus('Task cancelled successfully', 'success');
      await refreshAllTasks();
    } else {
      throw new Error(result.error || 'Failed to cancel task');
    }
  } catch (e) {
    console.error('Error cancelling task:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Retry a task
 * @param {string} taskId - Task ID
 */
async function retryTask(taskId) {
  try {
    showStatus('Retrying task...', 'info');
    
    const result = await sendMessageToBackground({
      action: 'retryTask',
      taskId
    });
    
    if (result.success) {
      showStatus('Task restarted successfully', 'success');
      await refreshAllTasks();
    } else {
      throw new Error(result.error || 'Failed to retry task');
    }
  } catch (e) {
    console.error('Error retrying task:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Show task details in modal
 * @param {string} taskId - Task ID
 */
async function showTaskDetails(taskId) {
  try {
    // Show modal
    const modal = document.getElementById('taskDetails');
    modal.classList.add('active');
    
    // Show loading state
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = '<div class="loading">Loading task details...</div>';
    
    // Get task status
    const result = await sendMessageToBackground({
      action: 'getTaskStatus',
      taskId
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get task details');
    }
    
    const task = result.status;
    
    // Get task data
    const taskData = getTaskData(taskId) || {};
    
    // Format task details
    let detailsHtml = `
      <div class="task-detail-header">
        <h3>${getTaskTitle(task)}</h3>
        <div class="task-detail-status ${task.status}">${task.status}</div>
      </div>
      
      <div class="task-detail-section">
        <h4>Task Information</h4>
        <table class="detail-table">
          <tr>
            <th>Task ID:</th>
            <td>${task.id}</td>
          </tr>
          <tr>
            <th>URL:</th>
            <td>${taskData.url || 'Unknown'}</td>
          </tr>
          <tr>
            <th>Started:</th>
            <td>${new Date(task.startTime).toLocaleString()}</td>
          </tr>
          <tr>
            <th>Current Stage:</th>
            <td>${task.stageName || `Stage ${task.stage + 1}`}</td>
          </tr>
          <tr>
            <th>Progress:</th>
            <td>${Math.round(task.progress)}%</td>
          </tr>
          <tr>
            <th>Elapsed Time:</th>
            <td>${formatElapsedTime(task.startTime)}</td>
          </tr>
        </table>
      </div>
    `;
    
    // Add task history
    if (task.history && task.history.length) {
      detailsHtml += `
        <div class="task-detail-section">
          <h4>Task History</h4>
          <table class="history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      task.history.forEach(entry => {
        const entryTime = new Date(entry.timestamp).toLocaleTimeString();
        const stageName = entry.stageName || `Stage ${entry.stage + 1}`;
        
        detailsHtml += `
          <tr>
            <td>${entryTime}</td>
            <td>${entry.status}</td>
            <td>${stageName}</td>
            <td>${Math.round(entry.progress)}%</td>
          </tr>
        `;
      });
      
      detailsHtml += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Add errors if any
    if (task.errors && task.errors.length) {
      detailsHtml += `
        <div class="task-detail-section">
          <h4>Errors</h4>
          <div class="error-list">
      `;
      
      task.errors.forEach(error => {
        const errorTime = new Date(error.timestamp).toLocaleString();
        detailsHtml += `
          <div class="error-item">
            <div class="error-time">${errorTime}</div>
            <div class="error-message">${error.message}</div>
          </div>
        `;
      });
      
      detailsHtml += `
          </div>
        </div>
      `;
    }
    
    // Update modal content
    modalBody.innerHTML = detailsHtml;
    modal.querySelector('.modal-header h2').textContent = `Task Details: ${getTaskTitle(task)}`;
  } catch (e) {
    console.error('Error showing task details:', e);
    const modalBody = document.getElementById('taskDetails').querySelector('.modal-body');
    modalBody.innerHTML = `<div class="error-message">Error loading task details: ${e.message}</div>`;
  }
}

/**
 * Close the modal
 */
function closeModal() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });
}

/**
 * Capture the current tab
 */
async function captureCurrentTab() {
  try {
    showStatus('Capturing current tab...', 'info');
    
    const result = await sendMessageToBackground({
      action: 'captureCurrentTab'
    });
    
    if (result.success) {
      showStatus('Page captured successfully', 'success');
      
      // If analysis was triggered, switch to active tasks tab
      if (result.taskId) {
        document.querySelector('.tab[data-tab="active-tasks"]').click();
        await refreshAllTasks();
      } else {
        // Otherwise refresh pages
        await refreshPages();
      }
    } else {
      throw new Error(result.error || 'Failed to capture page');
    }
  } catch (e) {
    console.error('Error capturing tab:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Analyze a URL
 * @param {string} url - URL to analyze
 * @param {object} options - Analysis options
 */
async function analyzeUrl(url, options = {}) {
  try {
    showStatus(`Analyzing ${url}...`, 'info');
    
    const result = await sendMessageToBackground({
      action: 'analyzeUrl',
      url,
      options
    });
    
    if (result.success) {
      showStatus('Analysis started successfully', 'success');
      
      // Switch to active tasks tab
      document.querySelector('.tab[data-tab="active-tasks"]').click();
      await refreshAllTasks();
    } else {
      throw new Error(result.error || 'Failed to start analysis');
    }
  } catch (e) {
    console.error('Error analyzing URL:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Cancel all active tasks
 */
async function cancelAllTasks() {
  if (!activeTasks.length) {
    showStatus('No active tasks to cancel', 'info');
    return;
  }
  
  // Confirm with user
  if (!confirm(`Cancel all ${activeTasks.length} active tasks?`)) {
    return;
  }
  
  try {
    showStatus(`Cancelling ${activeTasks.length} tasks...`, 'info');
    
    let cancelledCount = 0;
    
    // Cancel each task
    for (const task of activeTasks) {
      try {
        const result = await sendMessageToBackground({
          action: 'cancelTask',
          taskId: task.id
        });
        
        if (result.success) {
          cancelledCount++;
        }
      } catch (e) {
        console.error(`Error cancelling task ${task.id}:`, e);
      }
    }
    
    showStatus(`Cancelled ${cancelledCount} of ${activeTasks.length} tasks`, 'success');
    await refreshAllTasks();
  } catch (e) {
    console.error('Error cancelling all tasks:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Clear completed tasks history
 */
function clearCompletedTasks() {
  if (!completedTasks.length) {
    showStatus('No completed tasks to clear', 'info');
    return;
  }
  
  // Confirm with user
  if (!confirm(`Clear history of ${completedTasks.length} completed tasks?`)) {
    return;
  }
  
  // TODO: Implement clearing of completed tasks
  showStatus('Clearing completed tasks is not yet implemented', 'info');
}

/**
 * Open the settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Get a title for the task
 * @param {object} task - Task object
 * @returns {string} Task title
 */
function getTaskTitle(task) {
  // Get task data if available
  const taskData = getTaskData(task.id);
  
  if (taskData && taskData.url) {
    // Use domain name as title
    try {
      const url = new URL(taskData.url);
      return url.hostname;
    } catch (e) {
      // If URL parsing fails, use the URL as is
      return taskData.url;
    }
  }
  
  // Fallback to task ID
  return `Task ${task.id.split('_')[1]}`;
}

/**
 * Get stored task data
 * @param {string} taskId - Task ID
 * @returns {object|null} Task data
 */
function getTaskData(taskId) {
  // This is a placeholder. In a real implementation, we would
  // retrieve the stored task data from memory or storage.
  // For demo purposes, we'll return mock data
  
  // In future, this would be an actual lookup in the background page
  if (backgroundPage && backgroundPage.marvin) {
    // Return the actual task data from background page
    return null; // Not implemented yet
  }
  
  // For now, just return some fake URLs for demo purposes
  return {
    url: `https://example.com/page${taskId.slice(-3)}`
  };
}

/**
 * Format elapsed time
 * @param {number} startTime - Start time in milliseconds
 * @returns {string} Formatted elapsed time
 */
function formatElapsedTime(startTime) {
  const elapsed = Date.now() - startTime;
  
  // Format as seconds if less than a minute
  if (elapsed < 60000) {
    return `${Math.round(elapsed / 1000)}s`;
  }
  
  // Format as minutes and seconds if less than an hour
  if (elapsed < 3600000) {
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.round((elapsed % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  
  // Format as hours and minutes
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.round((elapsed % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/**
 * Show status message
 * @param {string} message - Status message
 * @param {string} type - Message type (info, success, error)
 */
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  
  // Set message and type
  statusEl.textContent = message;
  statusEl.className = type;
  
  // Clear after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = '';
    }, 5000);
  }
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

/**
 * Get mock pages data
 * @returns {Promise<object[]>} Mock pages data
 */
async function getMockPages() {
  // This is a placeholder for demo purposes
  return [
    {
      id: 'page1',
      title: 'Example Website',
      url: 'https://example.com',
      capturedAt: Date.now() - 3600000, // 1 hour ago
      status: 'active'
    },
    {
      id: 'page2',
      title: 'Mozilla Developer Network',
      url: 'https://developer.mozilla.org',
      capturedAt: Date.now() - 7200000, // 2 hours ago
      status: 'analyzed'
    },
    {
      id: 'page3',
      title: 'GitHub - Home',
      url: 'https://github.com',
      capturedAt: Date.now() - 86400000, // 1 day ago
      status: 'active'
    }
  ];
}

// Initialize the dashboard when the DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);error'); 


/**
 * Refresh just the active tasks
 */
async function refreshActiveTasks() {
  try {
    await refreshAllTasks();
  } catch (e) {
    console.error('Error refreshing active tasks:', e);
  }
}

/**
 * Refresh all tasks
 */
async function refreshAllTasks() {
  try {
    // Get tasks from background script
    const tasks = await sendMessageToBackground({ action: 'getActiveTasks' });
    
    if (!tasks.success) {
      throw new Error(tasks.error || 'Failed to get tasks');
    }
    
    // Separate active and completed tasks
    activeTasks = tasks.tasks.filter(task => 
      task.status !== 'complete' && task.status !== 'error' && task.status !== 'cancelled'
    );
    
    completedTasks = tasks.tasks.filter(task => 
      task.status === 'complete' || task.status === 'error' || task.status === 'cancelled'
    );
    
    // Display tasks
    displayActiveTasks();
    displayCompletedTasks();
  } catch (e) {
    console.error('Error refreshing tasks:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Refresh pages list
 */
async function refreshPages() {
  try {
    // TODO: Implement API call to get captured pages
    // For now, use mock data
    capturedPages = await getMockPages();
    
    // Display pages
    displayPages();
  } catch (e) {
    console.error('Error refreshing pages:', e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}

/**
 * Display active tasks
 */
function displayActiveTasks() {
  const container = document.getElementById('activeTasks');
  
  // Clear current content
  container.innerHTML = '';
  
  if (activeTasks.length === 0) {
    container.innerHTML = '<div class="empty-message">No active analysis tasks</div>';
    return;
  }
  
  // Sort tasks by start time (newest first)
  activeTasks.sort((a, b) => b.startTime - a.startTime);
  
  // Display each task
  activeTasks.forEach(task => {
    container.appendChild(createTaskCard(task));
  });
}

/**
 * Display completed tasks
 */
function displayCompletedTasks() {
  const container = document.getElementById('completedTasks');
  
  // Clear current content
  container.innerHTML = '';
  
  if (completedTasks.length === 0) {
    container.innerHTML = '<div class="empty-message">No completed analysis tasks</div>';
    return;
  }
  
  // Sort tasks by completion time (newest first)
  completedTasks.sort((a, b) => {
    const aTime = a.history[a.history.length - 1]?.timestamp || 0;
    const bTime = b.history[b.history.length - 1]?.timestamp || 0;
    return bTime - aTime;
  });
  
  // Display each task
  completedTasks.forEach(task => {
    container.appendChild(createTaskCard(task));
  });
}

/**
 * Create a task card
 * @param {object} task - Task object
 * @returns {HTMLElement} Task card element
 */
function createTaskCard(task) {
  // Clone template
  const template = document.getElementById('taskCardTemplate');
  const card = document.importNode(template.content, true).querySelector('.task-card');
  
  // Add task ID as data attribute
  card.dataset.taskId = task.id;
  
  // Set task title
  card.querySelector('.task-title').textContent = getTaskTitle(task);
  
  // Set task status
  const statusEl = card.querySelector('.task-status');
  statusEl.textContent = task.status;
  statusEl.className = `task-status ${task.status}`;
  
  // Set progress bar
  card.querySelector('.progress-bar').style.width = `${task.progress}%`;
  card.querySelector('.progress-text').textContent = `${Math.round(task.progress)}%`;
  
  // Set task URL
  const taskData = getTaskData(task.id) || {};
  if (taskData.url) {
    card.querySelector('.task-url').textContent = taskData.url;
  } else {
    card.querySelector('.task-url').textContent = 'Unknown URL';
  }
  
  // Set task time
  const elapsed = formatElapsedTime(task.startTime);
  card.querySelector('.task-time').textContent = elapsed;
  
  // Set task stage
  card.querySelector('.task-stage').textContent = task.stageName || `Stage ${task.stage + 1}`;
  
  // Set actions
  const actionsContainer = card.querySelector('.task-actions');
  actionsContainer.innerHTML = ''; // Clear default actions
  
  // Add appropriate actions based on status
  if (task.status === 'processing' || task.status === 'analyzing' || task.status === 'pending') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'task-action';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.dataset.taskId = task.id;
    cancelBtn.addEventListener('click', handleTaskAction);
    actionsContainer.appendChild(cancelBtn);
  }
  
  if (task.status === 'error') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'task-action';
    retryBtn.textContent = 'Retry';
    retryBtn.dataset.action = 'retry';
    retryBtn.dataset.taskId = task.id;
    retryBtn.addEventListener('click', handleTaskAction);
    actionsContainer.appendChild(retryBtn);
  }
  
  // Add details button for all tasks
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'task-action';
  detailsBtn.textContent = 'Details';
  detailsBtn.dataset.action = 'details';
  detailsBtn.dataset.taskId = task.id;
  detailsBtn.addEventListener('click', handleTaskAction);
  actionsContainer.appendChild(detailsBtn);
  
  return card;
}

/**
 * Display pages
 */
function displayPages() {
  const container = document.getElementById('pagesList');
  
  // Clear current content
  container.innerHTML = '';
  
  if (capturedPages.length === 0) {
    container.innerHTML = '<div class="empty-message">No pages captured</div>';
    return;
  }
  
  // Filter pages by search query
  let filteredPages = capturedPages;
  if (pageSearchQuery) {
    const query = pageSearchQuery.toLowerCase();
    filteredPages = capturedPages.filter(page => 
      page.title.toLowerCase().includes(query) || 
      page.url.toLowerCase().includes(query)
    );
  }
  
  // Sort pages by capture time (newest first)
  filteredPages.sort((a, b) => b.capturedAt - a.capturedAt);
  
  // Display each page
  filteredPages.forEach(page => {
    container.appendChild(createPageCard(page));
  });
  
  // Show message if no results from filter
  if (filteredPages.length === 0 && pageSearchQuery) {
    container.innerHTML = '<div class="empty-message">No pages match your search</div>';
  }
}

/**
 * Create a page card
 * @param {object} page - Page object
 * @returns {HTMLElement} Page card element
 */
function createPageCard(page) {
  // Clone template
  const template = document.getElementById('pageCardTemplate');
  const card = document.importNode(template.content, true).querySelector('.page-card');
  
  // Add page ID as data attribute
  card.dataset.pageId = page.id;
  
  // Set favicon
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(page.url).hostname}`;
  card.querySelector('.page-favicon img').src = faviconUrl;
  
  // Set page title and URL
  card.querySelector('.page-title').textContent = page.title;
  card.querySelector('.page-url').textContent = page.url;
  card.querySelector('.page-url').title = page.url;
  
  // Set capture date
  const captureDate = new Date(page.capturedAt).toLocaleString();
  card.querySelector('.page-date').textContent = `Captured: ${captureDate}`;
  
  // Set status
  card.querySelector('.page-status').textContent = page.status;
  
  // Set actions
  const actionsContainer = card.querySelector('.page-actions');
  
  // Add analyze action
  const analyzeBtn = document.createElement('button');
  analyzeBtn.className = 'page-action';
  analyzeBtn.textContent = 'Analyze';
  analyzeBtn.dataset.action = 'analyze';
  analyzeBtn.dataset.pageId = page.id;
  analyzeBtn.dataset.url = page.url;
  analyzeBtn.addEventListener('click', handlePageAction);
  actionsContainer.appendChild(analyzeBtn);
  
  // Add view action
  const viewBtn = document.createElement('button');
  viewBtn.className = 'page-action';
  viewBtn.textContent = 'View';
  viewBtn.dataset.action = 'view';
  viewBtn.dataset.url = page.url;
  viewBtn.addEventListener('click', handlePageAction);
  actionsContainer.appendChild(viewBtn);
  
  return card;
}

/**
 * Handle page search input
 * @param {Event} event - Input event
 */
function handlePageSearch(event) {
  pageSearchQuery = event.target.value;
  displayPages();
}

/**
 * Handle task action button click
 * @param {Event} event - Click event
 */
async function handleTaskAction(event) {
  const action = event.target.dataset.action;
  const taskId = event.target.dataset.taskId;
  
  if (!action || !taskId) return;
  
  try {
    switch (action) {
      case 'cancel':
        await cancelTask(taskId);
        break;
        
      case 'retry':
        await retryTask(taskId);
        break;
        
      case 'details':
        showTaskDetails(taskId);
        break;
    }
  } catch (e) {
    console.error(`Error handling task action ${action}:`, e);
    showStatus(`Error: ${e.message}`, 'error');
  }
}