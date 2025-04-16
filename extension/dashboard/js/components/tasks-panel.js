// components/tasks-panel.js
import { sendMessageToBackground } from '../services/api-service.js';
import { showNotification, updateNotificationProgress } from '../services/notification-service.js';
import { truncateText } from '../utils/ui-utils.js';
import { LogManager } from '../../shared/utils/log-manager.js';

/**
 * Logger for tasks panel operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'tasks-panel',
  storageKey: 'marvin_tasks_logs',
  maxEntries: 1000
});

// Panel initialization flag
let tasksInitialized = false;

// Task state
let activeTasks = [];
let completedTasks = [];

/**
 * Initialize tasks panel and set up event listeners
 * @returns {Promise<void>}
 */
export async function initTasksPanel() {
  if (tasksInitialized) {
    logger.debug('Tasks panel already initialized, skipping');
    return;
  }
  
  logger.info('Initializing tasks panel');
  
  try {
    // Set up event listeners for task management
    setupTaskEventListeners();
    
    // Mark as initialized
    tasksInitialized = true;
    
    // Initial load of tasks
    await refreshAllTasks();
    
    logger.info('Tasks panel initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize tasks panel:', error);
    showNotification('Failed to initialize tasks panel', 'error');
  }
}

/**
 * Set up event listeners for task management buttons
 */
export function setupTaskEventListeners() {
  logger.debug('Setting up task event listeners');
  
  try {
    // Set up refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshData);
      logger.debug('Refresh button listener attached');
    } else {
      logger.warn('Refresh button not found in DOM');
    }
    
    // Set up cancel all button
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (cancelAllBtn) {
      cancelAllBtn.addEventListener('click', cancelAllTasks);
      logger.debug('Cancel all button listener attached');
    } else {
      logger.warn('Cancel all button not found in DOM');
    }
    
    // Set up clear completed button
    const clearCompletedBtn = document.getElementById('clearCompletedBtn');
    if (clearCompletedBtn) {
      clearCompletedBtn.addEventListener('click', clearCompletedTasks);
      logger.debug('Clear completed button listener attached');
    } else {
      logger.warn('Clear completed button not found in DOM');
    }
  } catch (error) {
    logger.error('Error setting up task event listeners:', error);
  }
}

/**
 * Refresh all tasks (active and completed)
 * @returns {Promise<void>}
 */
export async function refreshAllTasks() {
  logger.info('Refreshing all tasks');
  
  // Get task list containers
  const activeTasksList = document.getElementById('active-tasks-list');
  const completedTasksList = document.getElementById('completed-tasks-list');
  
  // Show loading state if containers exist
  if (activeTasksList) {
    activeTasksList.innerHTML = '<div class="loading">Loading active tasks...</div>';
  }
  
  if (completedTasksList) {
    completedTasksList.innerHTML = '<div class="loading">Loading completed tasks...</div>';
  }
  
  try {
    // Get tasks from background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage || !backgroundPage.marvin) {
      throw new Error('Background page or marvin object not available');
    }
    
    const tasks = await backgroundPage.marvin.getActiveTasks();
    logger.debug(`Retrieved ${tasks.length} tasks from background`);
    
    // Split into active and completed
    activeTasks = tasks.filter(task => 
      task.status === 'pending' || 
      task.status === 'processing' || 
      task.status === 'analyzing'
    );
    
    completedTasks = tasks.filter(task => 
      task.status === 'complete' || 
      task.status === 'error'
    );
    
    logger.debug(`Active tasks: ${activeTasks.length}, Completed tasks: ${completedTasks.length}`);
    
    // Update UI
    renderActiveTasks();
    renderCompletedTasks();
    
    // Update counts
    updateTaskCounts();
    
  } catch (error) {
    logger.error('Error refreshing tasks:', error);
    
    // Update UI with error state
    if (activeTasksList) {
      activeTasksList.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
    
    if (completedTasksList) {
      completedTasksList.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
    
    showNotification(`Error refreshing tasks: ${error.message}`, 'error');
  }
}

/**
 * Update task count indicators in the UI
 */
function updateTaskCounts() {
  try {
    const activeCountEl = document.getElementById('active-count');
    const completedCountEl = document.getElementById('completed-count');
    
    if (activeCountEl) {
      activeCountEl.textContent = activeTasks.length;
    }
    
    if (completedCountEl) {
      completedCountEl.textContent = completedTasks.length;
    }
    
    logger.debug(`Updated task counts: ${activeTasks.length} active, ${completedTasks.length} completed`);
  } catch (error) {
    logger.error('Error updating task counts:', error);
  }
}

/**
 * General data refresh function with notification feedback
 * @returns {Promise<void>}
 */
async function refreshData() {
  logger.info('Manual refresh requested');
  
  const notification = showNotification('Refreshing tasks...', 'info');
  
  try {
    await refreshAllTasks();
    showNotification('Tasks refreshed successfully', 'success');
  } catch (error) {
    logger.error('Error refreshing data:', error);
    showNotification(`Error refreshing data: ${error.message}`, 'error');
  }
}

/**
 * Render active tasks in the UI
 */
function renderActiveTasks() {
  logger.debug(`Rendering ${activeTasks.length} active tasks`);
  
  const container = document.getElementById('active-tasks-list');
  if (!container) {
    logger.error('Active tasks container not found');
    return;
  }
  
  if (activeTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No active tasks</div>';
    return;
  }
  
  container.innerHTML = '';
  
  activeTasks.forEach(task => {
    try {
      const taskElement = createActiveTaskElement(task);
      container.appendChild(taskElement);
    } catch (error) {
      logger.error(`Error rendering active task ${task.id}:`, error);
    }
  });
}

/**
 * Create DOM element for an active task
 * @param {Object} task - Task data object
 * @returns {HTMLElement} Task DOM element
 */
function createActiveTaskElement(task) {
  const taskElement = document.createElement('div');
  taskElement.className = 'task-item';
  taskElement.dataset.taskId = task.id;
  
  // Format progress
  const progress = task.progress || 0;
  const progressPercent = Math.round(progress * 100);
  
  // Format time
  const startTime = new Date(task.created_at || task.timestamp);
  const timeAgo = formatTimeAgo(startTime);
  
  // Create task HTML
  taskElement.innerHTML = `
    <div class="task-header">
      <div class="task-title">${truncateText(task.url || 'Unknown URL', 40)}</div>
      <div class="task-actions">
        <button class="btn-icon cancel-task" title="Cancel Task">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    <div class="task-details">
      <div class="task-status">${formatTaskStatus(task.status)}</div>
      <div class="task-time">${timeAgo}</div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progressPercent}%"></div>
    </div>
  `;
  
  // Add event listeners
  const cancelButton = taskElement.querySelector('.cancel-task');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      cancelTask(task.id);
    });
  }
  
  return taskElement;
}

/**
 * Render completed tasks in the UI
 */
function renderCompletedTasks() {
  logger.debug(`Rendering ${completedTasks.length} completed tasks`);
  
  const container = document.getElementById('completed-tasks-list');
  if (!container) {
    logger.error('Completed tasks container not found');
    return;
  }
  
  if (completedTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No completed tasks</div>';
    return;
  }
  
  container.innerHTML = '';
  
  // Sort by completion time (most recent first)
  completedTasks.sort((a, b) => {
    const timeA = new Date(a.completed_at || a.timestamp);
    const timeB = new Date(b.completed_at || b.timestamp);
    return timeB - timeA;
  });
  
  completedTasks.forEach(task => {
    try {
      const taskElement = createCompletedTaskElement(task);
      container.appendChild(taskElement);
    } catch (error) {
      logger.error(`Error rendering completed task ${task.id}:`, error);
    }
  });
}

/**
 * Create DOM element for a completed task
 * @param {Object} task - Task data object
 * @returns {HTMLElement} Task DOM element
 */
function createCompletedTaskElement(task) {
  const taskElement = document.createElement('div');
  taskElement.className = 'task-item';
  taskElement.dataset.taskId = task.id;
  
  // Add status-specific class
  if (task.status === 'error') {
    taskElement.classList.add('task-error');
  } else {
    taskElement.classList.add('task-complete');
  }
  
  // Format time
  const completionTime = new Date(task.completed_at || task.timestamp);
  const timeAgo = formatTimeAgo(completionTime);
  
  taskElement.innerHTML = `
    <div class="task-header">
      <div class="task-title">${truncateText(task.url || 'Unknown URL', 40)}</div>
      <div class="task-actions">
        ${task.status === 'error' ? 
          `<button class="btn-icon retry-task" title="Retry Task">
            <i class="fas fa-redo"></i>
          </button>` : ''}
        <button class="btn-icon remove-task" title="Remove Task">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
    <div class="task-details">
      <div class="task-status">${formatTaskStatus(task.status)}</div>
      <div class="task-time">${timeAgo}</div>
    </div>
    ${task.status === 'error' ? 
      `<div class="task-error-message">${task.error || 'Unknown error'}</div>` : ''}
  `;
  
  // Add event listeners
  if (task.status === 'error') {
    const retryButton = taskElement.querySelector('.retry-task');
    if (retryButton) {
      retryButton.addEventListener('click', () => {
        retryTask(task.id);
      });
    }
  }
  
  const removeButton = taskElement.querySelector('.remove-task');
  if (removeButton) {
    removeButton.addEventListener('click', () => {
      removeTask(task.id);
    });
  }
  
  return taskElement;
}

/**
 * Format task status for display
 * @param {string} status - Raw task status
 * @returns {string} Formatted status text
 */
function formatTaskStatus(status) {
  if (!status) return 'Unknown';
  
  const statusMap = {
    'pending': 'Pending',
    'processing': 'Processing',
    'analyzing': 'Analyzing',
    'complete': 'Completed',
    'error': 'Failed'
  };
  
  return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Format time ago
 * @param {Date} date - Date to format
 * @returns {string} Formatted time ago string
 */
function formatTimeAgo(date) {
  if (!date || isNaN(date.getTime())) {
    return 'Unknown time';
  }
  
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) {
    return `${diffSec} seconds ago`;
  }
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  }
  
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  }
  
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

/**
 * Cancel a task
 * @param {string} taskId - ID of task to cancel
 * @returns {Promise<void>}
 */
export async function cancelTask(taskId) {
  if (!taskId) {
    logger.warn('Attempted to cancel task with no ID');
    return;
  }
  
  logger.info(`Cancelling task: ${taskId}`);
  showNotification(`Cancelling task...`, 'info');
  
  try {
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage || !backgroundPage.marvin) {
      throw new Error('Background page or marvin object not available');
    }
    
    const result = await backgroundPage.marvin.cancelTask(taskId);
    
    if (result) {
      // Remove from active tasks
      activeTasks = activeTasks.filter(task => task.id !== taskId);
      renderActiveTasks();
      
      // Update count
      updateTaskCounts();
      
      // Show notification
      showNotification('Task cancelled successfully', 'success');
      logger.info(`Task ${taskId} cancelled successfully`);
    } else {
      throw new Error('Failed to cancel task');
    }
  } catch (error) {
    logger.error(`Error cancelling task ${taskId}:`, error);
    showNotification(`Error cancelling task: ${error.message}`, 'error');
  }
}

/**
 * Retry a failed task
 * @param {string} taskId - ID of task to retry
 * @returns {Promise<void>}
 */
export async function retryTask(taskId) {
  if (!taskId) {
    logger.warn('Attempted to retry task with no ID');
    return;
  }
  
  logger.info(`Retrying task: ${taskId}`);
  showNotification(`Retrying task...`, 'info');
  
  try {
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage || !backgroundPage.marvin) {
      throw new Error('Background page or marvin object not available');
    }
    
    const result = await backgroundPage.marvin.retryTask(taskId);
    
    if (result) {
      // Remove from completed tasks
      completedTasks = completedTasks.filter(task => task.id !== taskId);
      renderCompletedTasks();
      
      // Update count
      updateTaskCounts();
      
      // Refresh active tasks to show the retried task
      await refreshAllTasks();
      
      // Show notification
      showNotification('Task retried successfully', 'success');
      logger.info(`Task ${taskId} retried successfully`);
    } else {
      throw new Error('Failed to retry task');
    }
  } catch (error) {
    logger.error(`Error retrying task ${taskId}:`, error);
    showNotification(`Error retrying task: ${error.message}`, 'error');
  }
}

/**
 * Remove a task from the completed list
 * @param {string} taskId - ID of task to remove
 */
export function removeTask(taskId) {
  if (!taskId) {
    logger.warn('Attempted to remove task with no ID');
    return;
  }
  
  logger.info(`Removing task from list: ${taskId}`);
  
  try {
    // Remove from completed tasks
    const previousLength = completedTasks.length;
    completedTasks = completedTasks.filter(task => task.id !== taskId);
    
    if (completedTasks.length === previousLength) {
      logger.warn(`Task ${taskId} not found in completed tasks`);
    }
    
    // Update UI
    renderCompletedTasks();
    
    // Update count
    updateTaskCounts();
    
    logger.debug(`Task ${taskId} removed from list`);
  } catch (error) {
    logger.error(`Error removing task ${taskId}:`, error);
    showNotification(`Error removing task: ${error.message}`, 'error');
  }
}

/**
 * Cancel all active tasks
 * @returns {Promise<void>}
 */
export async function cancelAllTasks() {
  if (activeTasks.length === 0) {
    logger.info('No active tasks to cancel');
    showNotification('No active tasks to cancel', 'info');
    return;
  }
  
  logger.info(`Attempting to cancel all ${activeTasks.length} active tasks`);
  
  // Confirm with user
  if (!confirm(`Cancel all ${activeTasks.length} active tasks?`)) {
    logger.debug('User cancelled the operation');
    return;
  }
  
  const notification = showNotification(`Cancelling ${activeTasks.length} tasks...`, 'info', 0);
  let successCount = 0;
  
  try {
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage || !backgroundPage.marvin) {
      throw new Error('Background page or marvin object not available');
    }
    
    // Process tasks one by one with progress updates
    for (let i = 0; i < activeTasks.length; i++) {
      const task = activeTasks[i];
      const progress = Math.round((i / activeTasks.length) * 100);
      
      updateNotificationProgress(
        `Cancelling tasks (${i+1}/${activeTasks.length})...`, 
        progress
      );
      
      try {
        const result = await backgroundPage.marvin.cancelTask(task.id);
        if (result) {
          successCount++;
          logger.debug(`Successfully cancelled task ${task.id}`);
        } else {
          logger.warn(`Failed to cancel task ${task.id}`);
        }
      } catch (taskError) {
        logger.error(`Error cancelling task ${task.id}:`, taskError);
      }
    }
    
    // Refresh tasks to update UI
    await refreshAllTasks();
    
    // Show final notification
    if (successCount === activeTasks.length) {
      showNotification(`Successfully cancelled all ${successCount} tasks`, 'success');
    } else {
      showNotification(
        `Cancelled ${successCount} of ${activeTasks.length} tasks`, 
        successCount > 0 ? 'warning' : 'error'
      );
    }
    
    logger.info(`Cancelled ${successCount} of ${activeTasks.length} tasks`);
  } catch (error) {
    logger.error('Error cancelling all tasks:', error);
    showNotification(`Error cancelling tasks: ${error.message}`, 'error');
  }
}

/**
 * Clear all completed tasks from the UI
 */
export function clearCompletedTasks() {
  if (completedTasks.length === 0) {
    logger.info('No completed tasks to clear');
    showNotification('No completed tasks to clear', 'info');
    return;
  }
  
  logger.info(`Attempting to clear ${completedTasks.length} completed tasks`);
  
  // Confirm with user
  if (!confirm(`Clear all ${completedTasks.length} completed tasks?`)) {
    logger.debug('User cancelled the operation');
    return;
  }
  
  try {
    // Clear completed tasks
    completedTasks = [];
    renderCompletedTasks();
    
    // Update count
    updateTaskCounts();
    
    // Show notification
    showNotification('Completed tasks cleared', 'success');
    logger.info('Completed tasks cleared successfully');
  } catch (error) {
    logger.error('Error clearing completed tasks:', error);
    showNotification(`Error clearing tasks: ${error.message}`, 'error');
  }
}

/**
 * View task result in detail
 * @param {string} taskId - ID of task to view
 */
export function viewTaskResult(taskId) {
  if (!taskId) {
    logger.warn('Attempted to view task with no ID');
    return;
  }
  
  logger.info(`Viewing task result: ${taskId}`);
  
  try {
    // Find the task
    const task = [...activeTasks, ...completedTasks].find(t => t.id === taskId);
    
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      showNotification('Task not found', 'error');
      return;
    }
    
    // Show task details in a modal or detail view
    const detailsContainer = document.getElementById('task-details');
    if (!detailsContainer) {
      logger.error('Task details container not found');
      return;
    }
    
    // Format dates
    const startTime = new Date(task.startTime || task.created_at || task.timestamp);
    const formattedStartTime = startTime.toLocaleString();
    
    // Create detail view
    detailsContainer.innerHTML = `
      <h2>${task.title || `Task ${task.id}`}</h2>
      <div class="detail-meta">
        <div>Status: ${formatTaskStatus(task.status)}</div>
        <div>Progress: ${Math.round(task.progress || 0)}%</div>
        <div>Stage: ${task.stageName || `Stage ${(task.stage || 0) + 1}`}</div>
        <div>Started: ${formattedStartTime}</div>
      </div>
      <div class="detail-content">${task.result || 'No result available yet'}</div>
    `;
    
    // Show the details container
    detailsContainer.style.display = 'block';
    
    // Add close button if not already present
    if (!detailsContainer.querySelector('.close-details')) {
      const closeButton = document.createElement('button');
      closeButton.className = 'btn-secondary close-details';
      closeButton.textContent = 'Close';
      closeButton.addEventListener('click', () => {
        detailsContainer.style.display = 'none';
      });
      
      detailsContainer.appendChild(closeButton);
    }
    
    logger.debug(`Task ${taskId} details displayed`);
  } catch (error) {
    logger.error(`Error viewing task ${taskId}:`, error);
    showNotification(`Error viewing task details: ${error.message}`, 'error');
  }
}

/**
 * Check if a task exists by ID
 * @param {string} taskId - ID of task to check
 * @returns {boolean} Whether the task exists
 */
export function taskExists(taskId) {
  if (!taskId) return false;
  
  return [...activeTasks, ...completedTasks].some(task => task.id === taskId);
}

/**
 * Get a task by ID
 * @param {string} taskId - ID of task to get
 * @returns {Object|null} Task object or null if not found
 */
export function getTaskById(taskId) {
  if (!taskId) return null;
  
  return [...activeTasks, ...completedTasks].find(task => task.id === taskId) || null;
}

/**
 * Get all active tasks
 * @returns {Array} Array of active task objects
 */
export function getActiveTasks() {
  return [...activeTasks];
}

/**
 * Get all completed tasks
 * @returns {Array} Array of completed task objects
 */
export function getCompletedTasks() {
  return [...completedTasks];
}

// Export additional functions needed by other modules
export { 
  refreshAllTasks, 
  cancelTask, 
  retryTask,
  cancelAllTasks,
  clearCompletedTasks,
  viewTaskResult
};