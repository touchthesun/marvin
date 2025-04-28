// services/task-service.js
import { LogManager } from '/shared/utils/log-manager.js';
import { showNotification, updateNotificationProgress } from '/dashboard/js/services/notification-service.js';
import { fetchAPI } from '/dashboard/js/services/api-service.js';

/**
 * Logger for task service operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'task-service',
  storageKey: 'marvin_task_service_logs',
  maxEntries: 1000
});

// Task tracking
let activeTasks = [];
let completedTasks = [];
let taskListeners = [];
let isPolling = false;
const POLLING_INTERVAL = 5000; // 5 seconds

/**
 * Initialize task service
 * @returns {Promise<void>}
 */
async function initTaskService() {
  logger.info('Initializing task service');
  
  try {
    // Load initial tasks from background or API
    await refreshTasks();
    
    // Start polling for task updates
    startTaskPolling();
    
    logger.info('Task service initialized successfully');
  } catch (error) {
    logger.error('Error initializing task service:', error);
  }
}

/**
 * Start polling for task updates
 * @returns {void}
 */
function startTaskPolling() {
  if (isPolling) {
    logger.debug('Task polling already active, skipping');
    return;
  }
  
  logger.debug('Starting task polling');
  isPolling = true;
  
  // Set up interval
  const pollingInterval = setInterval(async () => {
    try {
      // Only poll if we have active tasks
      if (activeTasks.length > 0) {
        logger.debug(`Polling for updates on ${activeTasks.length} active tasks`);
        await refreshTasks();
      }
    } catch (error) {
      logger.error('Error during task polling:', error);
    }
  }, POLLING_INTERVAL);
  
  // Store interval ID in a property so it can be cleared if needed
  startTaskPolling.intervalId = pollingInterval;
}

/**
 * Stop polling for task updates
 * @returns {void}
 */
function stopTaskPolling() {
  if (!isPolling) {
    return;
  }
  
  logger.debug('Stopping task polling');
  
  if (startTaskPolling.intervalId) {
    clearInterval(startTaskPolling.intervalId);
    startTaskPolling.intervalId = null;
  }
  
  isPolling = false;
}

/**
 * Refresh tasks from background or API
 * @returns {Promise<void>}
 */
async function refreshTasks() {
  logger.debug('Refreshing tasks');
  
  try {
    // Try to get tasks from background page first
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.getActiveTasks === 'function') {
      // Use background page
      const tasks = await backgroundPage.marvin.getActiveTasks();
      processTaskUpdates(tasks);
    } else {
      // Fall back to API
      await fetchTasksFromApi();
    }
  } catch (error) {
    logger.error('Error refreshing tasks:', error);
    
    // Try API as fallback if background page failed
    try {
      await fetchTasksFromApi();
    } catch (apiError) {
      logger.error('Error fetching tasks from API:', apiError);
    }
  }
}

/**
 * Fetch tasks from API
 * @returns {Promise<void>}
 */
async function fetchTasksFromApi() {
  logger.debug('Fetching tasks from API');
  
  try {
    const response = await fetchAPI('/api/v1/tasks');
    
    if (response.success) {
      processTaskUpdates(response.data.tasks || []);
      logger.debug(`Fetched ${response.data.tasks?.length || 0} tasks from API`);
    } else {
      throw new Error(response.error?.message || 'Unknown error fetching tasks');
    }
  } catch (error) {
    logger.error('Error fetching tasks from API:', error);
    throw error;
  }
}

/**
 * Process task updates and notify listeners
 * @param {Array} tasks - Array of tasks
 * @returns {void}
 */
function processTaskUpdates(tasks) {
  if (!Array.isArray(tasks)) {
    logger.warn('Received non-array tasks data:', tasks);
    return;
  }
  
  // Split into active and completed tasks
  const newActiveTasks = tasks.filter(task => 
    task.status === 'pending' || 
    task.status === 'processing' || 
    task.status === 'analyzing'
  );
  
  const newCompletedTasks = tasks.filter(task => 
    task.status === 'complete' || 
    task.status === 'error'
  );
  
  // Check for status changes
  const statusChanges = findStatusChanges(activeTasks, newActiveTasks, newCompletedTasks);
  
  // Update task lists
  activeTasks = newActiveTasks;
  completedTasks = newCompletedTasks;
  
  // Show notifications for completed tasks
  statusChanges.completed.forEach(task => {
    if (task.status === 'complete') {
      showNotification(`Task completed: ${task.title || 'Unknown task'}`, 'success');
    } else if (task.status === 'error') {
      showNotification(`Task failed: ${task.title || 'Unknown task'}`, 'error');
    }
  });
  
  // Notify listeners about changes
  if (statusChanges.completed.length > 0 || statusChanges.updated.length > 0) {
    notifyTaskListeners({
      activeTasks: newActiveTasks,
      completedTasks: newCompletedTasks,
      changes: statusChanges
    });
  }
}

/**
 * Find tasks with status changes
 * @param {Array} oldActiveTasks - Previous active tasks
 * @param {Array} newActiveTasks - New active tasks
 * @param {Array} newCompletedTasks - New completed tasks
 * @returns {Object} Object with arrays of completed and updated tasks
 */
function findStatusChanges(oldActiveTasks, newActiveTasks, newCompletedTasks) {
  const changes = {
    completed: [], // Tasks that were active and are now complete/error
    updated: []    // Tasks that had progress/status updates
  };
  
  // Find tasks that were active and are now completed
  const oldTaskIds = new Set(oldActiveTasks.map(task => task.id));
  const newActiveTaskIds = new Set(newActiveTasks.map(task => task.id));
  
  for (const id of oldTaskIds) {
    if (!newActiveTaskIds.has(id)) {
      // This task was active but is no longer, must be completed or errored
      const completedTask = newCompletedTasks.find(task => task.id === id);
      if (completedTask) {
        changes.completed.push(completedTask);
      }
    }
  }
  
  // Find tasks that had updates
  oldActiveTasks.forEach(oldTask => {
    const newTask = newActiveTasks.find(task => task.id === oldTask.id);
    if (newTask && (
      newTask.status !== oldTask.status || 
      newTask.progress !== oldTask.progress ||
      newTask.stage !== oldTask.stage
    )) {
      changes.updated.push(newTask);
    }
  });
  
  return changes;
}

/**
 * Create a new task
 * @param {Object} taskData - Task data
 * @returns {Promise<Object>} Created task
 */
async function createTask(taskData) {
  logger.info('Creating new task', taskData);
  
  try {
    // Try to use background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.createTask === 'function') {
      const result = await backgroundPage.marvin.createTask(taskData);
      
      if (result && result.id) {
        // Add to active tasks
        activeTasks.push(result);
        
        // Notify listeners
        notifyTaskListeners({
          activeTasks,
          completedTasks,
          changes: {
            completed: [],
            updated: [],
            created: [result]
          }
        });
        
        logger.debug('Task created successfully via background page:', result);
        return result;
      } else {
        throw new Error('Failed to create task via background page');
      }
    } else {
      // Fall back to API
      const response = await fetchAPI('/api/v1/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      
      if (response.success && response.data) {
        // Add to active tasks
        activeTasks.push(response.data);
        
        // Notify listeners
        notifyTaskListeners({
          activeTasks,
          completedTasks,
          changes: {
            completed: [],
            updated: [],
            created: [response.data]
          }
        });
        
        logger.debug('Task created successfully via API:', response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Unknown error creating task');
      }
    }
  } catch (error) {
    logger.error('Error creating task:', error);
    throw error;
  }
}

/**
 * Cancel a task
 * @param {string} taskId - ID of task to cancel
 * @returns {Promise<boolean>} Whether cancellation was successful
 */
async function cancelTask(taskId) {
  if (!taskId) {
    logger.warn('Attempted to cancel task with no ID');
    return false;
  }
  
  logger.info(`Cancelling task: ${taskId}`);
  
  try {
    // Try to use background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.cancelTask === 'function') {
      const result = await backgroundPage.marvin.cancelTask(taskId);
      
      if (result) {
        // Refresh tasks to update lists
        await refreshTasks();
        
        logger.debug(`Task ${taskId} cancelled successfully via background page`);
        return true;
      } else {
        throw new Error('Failed to cancel task via background page');
      }
    } else {
      // Fall back to API
      const response = await fetchAPI(`/api/v1/tasks/${taskId}/cancel`, {
        method: 'POST'
      });
      
      if (response.success) {
        // Refresh tasks to update lists
        await refreshTasks();
        
        logger.debug(`Task ${taskId} cancelled successfully via API`);
        return true;
      } else {
        throw new Error(response.error?.message || 'Unknown error cancelling task');
      }
    }
  } catch (error) {
    logger.error(`Error cancelling task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Retry a failed task
 * @param {string} taskId - ID of task to retry
 * @returns {Promise<boolean>} Whether retry was successful
 */
async function retryTask(taskId) {
  if (!taskId) {
    logger.warn('Attempted to retry task with no ID');
    return false;
  }
  
  logger.info(`Retrying task: ${taskId}`);
  
  try {
    // Try to use background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.retryTask === 'function') {
      const result = await backgroundPage.marvin.retryTask(taskId);
      
      if (result) {
        // Refresh tasks to update lists
        await refreshTasks();
        
        logger.debug(`Task ${taskId} retried successfully via background page`);
        return true;
      } else {
        throw new Error('Failed to retry task via background page');
      }
    } else {
      // Fall back to API
      const response = await fetchAPI(`/api/v1/tasks/${taskId}/retry`, {
        method: 'POST'
      });
      
      if (response.success) {
        // Refresh tasks to update lists
        await refreshTasks();
        
        logger.debug(`Task ${taskId} retried successfully via API`);
        return true;
      } else {
        throw new Error(response.error?.message || 'Unknown error retrying task');
      }
    }
  } catch (error) {
    logger.error(`Error retrying task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Get a task by ID
 * @param {string} taskId - ID of task to get
 * @returns {Object|null} Task object or null if not found
 */
function getTaskById(taskId) {
  if (!taskId) {
    return null;
  }
  
  return [...activeTasks, ...completedTasks].find(task => task.id === taskId) || null;
}

/**
 * Get all active tasks
 * @returns {Array} Array of active task objects
 */
function getActiveTasks() {
  return [...activeTasks];
}

/**
 * Get all completed tasks
 * @returns {Array} Array of completed task objects
 */
function getCompletedTasks() {
  return [...completedTasks];
}

/**
 * Register a task update listener
 * @param {Function} listener - Listener function
 * @returns {Function} Function to remove the listener
 */
function addTaskListener(listener) {
  if (typeof listener !== 'function') {
    logger.warn('Attempted to add non-function task listener');
    return () => {};
  }
  
  taskListeners.push(listener);
  
  logger.debug(`Task listener added, total listeners: ${taskListeners.length}`);
  
  // Return function to remove the listener
  return () => {
    taskListeners = taskListeners.filter(l => l !== listener);
    logger.debug(`Task listener removed, remaining listeners: ${taskListeners.length}`);
  };
}

/**
 * Notify all task listeners about updates
 * @param {Object} updateData - Update data
 * @returns {void}
 */
function notifyTaskListeners(updateData) {
  if (taskListeners.length === 0) {
    return;
  }
  
  logger.debug(`Notifying ${taskListeners.length} task listeners about updates`);
  
  // Call each listener with update data
  taskListeners.forEach(listener => {
    try {
      listener(updateData);
    } catch (error) {
      logger.error('Error in task listener:', error);
    }
  });
}

/**
 * Create and monitor a capture task
 * @param {Object} captureData - Capture data
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Task result
 */
async function createCaptureTask(captureData, progressCallback) {
  logger.info('Creating capture task', captureData);
  
  try {
    // Create task
    const task = await createTask({
      type: 'capture',
      data: captureData
    });
    
    if (!task || !task.id) {
      throw new Error('Failed to create capture task');
    }
    
    // Show notification
    const notification = showNotification(`Capturing ${captureData.url}...`, 'info', 0);
    
    // Monitor task progress
    return await monitorTaskProgress(task.id, (progress, status) => {
      // Update notification
      updateNotificationProgress(`Capturing: ${status}`, progress * 100);
      
      // Call progress callback if provided
      if (typeof progressCallback === 'function') {
        progressCallback(progress, status);
      }
    });
  } catch (error) {
    logger.error('Error creating capture task:', error);
    throw error;
  }
}

/**
 * Monitor a task's progress until completion
 * @param {string} taskId - ID of task to monitor
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<Object>} Task result
 */
async function monitorTaskProgress(taskId, progressCallback) {
  if (!taskId) {
    throw new Error('Invalid task ID');
  }
  
  logger.debug(`Monitoring progress for task ${taskId}`);
  
  // Get initial task
  let task = getTaskById(taskId);
  
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  // Call progress callback with initial status
  if (typeof progressCallback === 'function') {
    progressCallback(task.progress || 0, task.status);
  }
  
  // Return promise that resolves when task completes
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        // Refresh tasks
        await refreshTasks();
        
        // Get updated task
        task = getTaskById(taskId);
        
        if (!task) {
          clearInterval(checkInterval);
          reject(new Error(`Task ${taskId} disappeared`));
          return;
        }
        
        // Call progress callback with updated status
        if (typeof progressCallback === 'function') {
          progressCallback(task.progress || 0, task.status);
        }
        
        // Check if task is done
        if (task.status === 'complete' || task.status === 'error') {
          clearInterval(checkInterval);
          
          if (task.status === 'complete') {
            resolve(task.result || task);
          } else {
            reject(new Error(task.error || 'Task failed'));
          }
        }
      } catch (error) {
        logger.error(`Error monitoring task ${taskId}:`, error);
      }
    }, 1000); // Check every second
    
    // Set timeout to prevent hanging
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Task monitoring timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

// Export functions needed by other modules
export {
  initTaskService,
  refreshTasks,
  getTaskById,
  getActiveTasks,
  getCompletedTasks,
  addTaskListener,
  createCaptureTask,
  monitorTaskProgress
};