// src/services/task-service.js
import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';

/**
 * TaskService - Manages background tasks, polling, and status updates
 */
export class TaskService {
  /**
   * Create a new TaskService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    
    // Dependencies
    this.logger = null;
    this.apiService = null;
    this.notificationService = null;
    
    // Task tracking
    this.activeTasks = [];
    this.completedTasks = [];
    this.taskListeners = [];
    this.isPolling = false;
    this.POLLING_INTERVAL = 5000; // 5 seconds
    this.pollingIntervalId = null;
    
    // Bind methods for callbacks and event handlers
    this.pollTasks = this.pollTasks.bind(this);
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly
      this.logger = new LogManager({
        context: 'task-service',
        isBackgroundScript: false,
        storageKey: 'marvin_task_service_logs',
        maxEntries: 1000
      });
      
      this.logger.info('Initializing task service');
      
      // Resolve dependencies
      await this.resolveDependencies();
      
      // Load initial tasks from background or API
      await this.refreshTasks();
      
      // Start polling for task updates
      this.startTaskPolling();
      
      this.initialized = true;
      this.logger.info('Task service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing task service:', error);
      } else {
        console.error('Error initializing task service:', error);
      }
      return false;
    }
  }
  
  /**
   * Resolve service dependencies
   * @private
   */
  async resolveDependencies() {
    try {
      // Get API service (required for most operations)
      try {
        this.apiService = container.getService('apiService');
        this.logger.debug('API service resolved successfully');
      } catch (apiError) {
        this.logger.warn('API service not available, some task operations may fail');
        this.apiService = null;
      }
      
      // Get notification service (optional)
      try {
        this.notificationService = container.getService('notificationService');
        this.logger.debug('Notification service resolved successfully');
      } catch (notificationError) {
        this.logger.warn('Notification service not available, notifications will be disabled');
        this.notificationService = null;
      }
    } catch (error) {
      this.logger.warn('Error resolving dependencies:', error);
      // Ensure dependencies are explicitly null if resolution fails
      this.apiService = this.apiService || null;
      this.notificationService = this.notificationService || null;
    }
  }
  
  /**
   * Start polling for task updates
   * @returns {void}
   */
  startTaskPolling() {
    if (this.isPolling) {
      this.logger.debug('Task polling already active, skipping');
      return;
    }
    
    this.logger.debug('Starting task polling');
    
    // Clear any existing interval first
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
    
    this.isPolling = true;
    
    // Set up interval using bound method
    this.pollingIntervalId = setInterval(this.pollTasks, this.POLLING_INTERVAL);
  }
  
  /**
   * Poll for task updates (used by polling interval)
   * @returns {Promise<void>}
   */
  async pollTasks() {
    try {
      // Only poll if we have active tasks
      if (this.activeTasks.length > 0) {
        this.logger.debug(`Polling for updates on ${this.activeTasks.length} active tasks`);
        await this.refreshTasks();
      }
    } catch (error) {
      this.logger.error('Error during task polling:', error);
    }
  }
  
  /**
   * Stop polling for task updates
   * @returns {void}
   */
  stopTaskPolling() {
    if (!this.isPolling) {
      return;
    }
    
    this.logger.debug('Stopping task polling');
    
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
    
    this.isPolling = false;
  }
  
  /**
   * Refresh tasks from background or API
   * @returns {Promise<void>}
   */
  async refreshTasks() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    this.logger.debug('Refreshing tasks');
    
    try {
      // Try to get tasks from background page first
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.getActiveTasks === 'function') {
        // Use background page
        const tasks = await backgroundPage.marvin.getActiveTasks();
        this.processTaskUpdates(tasks);
      } else {
        // Fall back to API
        await this.fetchTasksFromApi();
      }
    } catch (error) {
      this.logger.error('Error refreshing tasks:', error);
      
      // Try API as fallback if background page failed
      try {
        await this.fetchTasksFromApi();
      } catch (apiError) {
        this.logger.error('Error fetching tasks from API:', apiError);
        // Don't throw here to prevent breaking polling
      }
    }
  }
  
  /**
   * Fetch tasks from API
   * @returns {Promise<void>}
   */
  async fetchTasksFromApi() {
    this.logger.debug('Fetching tasks from API');
    
    try {
      if (!this.apiService) {
        throw new Error('API service not available');
      }
      
      const response = await this.apiService.fetchAPI('/api/v1/tasks');
      
      if (response && response.success) {
        this.processTaskUpdates(response.data?.tasks || []);
        this.logger.debug(`Fetched ${response.data?.tasks?.length || 0} tasks from API`);
      } else {
        throw new Error((response?.error?.message) || 'Unknown error fetching tasks');
      }
    } catch (error) {
      this.logger.error('Error fetching tasks from API:', error);
      throw error;
    }
  }
  
  /**
   * Process task updates and notify listeners
   * @param {Array} tasks - Array of tasks
   * @returns {void}
   */
  processTaskUpdates(tasks) {
    if (!Array.isArray(tasks)) {
      this.logger.warn('Received non-array tasks data:', tasks);
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
    const statusChanges = this.findStatusChanges(this.activeTasks, newActiveTasks, newCompletedTasks);
    
    // Update task lists
    this.activeTasks = newActiveTasks;
    this.completedTasks = newCompletedTasks;
    
    // Show notifications for completed tasks
    if (this.notificationService) {
      statusChanges.completed.forEach(task => {
        if (task.status === 'complete') {
          this.notificationService.showNotification(`Task completed: ${task.title || 'Unknown task'}`, 'success');
        } else if (task.status === 'error') {
          this.notificationService.showNotification(`Task failed: ${task.title || 'Unknown task'}`, 'error');
        }
      });
    }
    
    // Notify listeners about changes
    if (statusChanges.completed.length > 0 || statusChanges.updated.length > 0) {
      this.notifyTaskListeners({
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
  findStatusChanges(oldActiveTasks, newActiveTasks, newCompletedTasks) {
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
  async createTask(taskData) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    this.logger.info('Creating new task', taskData);
    
    try {
      // Try to use background page
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.createTask === 'function') {
        const result = await backgroundPage.marvin.createTask(taskData);
        
        if (result && result.id) {
          // Add to active tasks
          this.activeTasks.push(result);
          
          // Notify listeners
          this.notifyTaskListeners({
            activeTasks: this.activeTasks,
            completedTasks: this.completedTasks,
            changes: {
              completed: [],
              updated: [],
              created: [result]
            }
          });
          
          this.logger.debug('Task created successfully via background page:', result);
          return result;
        } else {
          throw new Error('Failed to create task via background page');
        }
      } else {
        // Fall back to API
        if (!this.apiService) {
          throw new Error('API service not available');
        }
        
        const response = await this.apiService.fetchAPI('/api/v1/tasks', {
          method: 'POST',
          body: JSON.stringify(taskData)
        });
        
        if (response && response.success && response.data) {
          // Add to active tasks
          this.activeTasks.push(response.data);
          
          // Notify listeners
          this.notifyTaskListeners({
            activeTasks: this.activeTasks,
            completedTasks: this.completedTasks,
            changes: {
              completed: [],
              updated: [],
              created: [response.data]
            }
          });
          
          this.logger.debug('Task created successfully via API:', response.data);
          return response.data;
        } else {
          throw new Error((response?.error?.message) || 'Unknown error creating task');
        }
      }
    } catch (error) {
      this.logger.error('Error creating task:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a task
   * @param {string} taskId - ID of task to cancel
   * @returns {Promise<boolean>} Whether cancellation was successful
   */
  async cancelTask(taskId) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    if (!taskId) {
      this.logger.warn('Attempted to cancel task with no ID');
      return false;
    }
    
    this.logger.info(`Cancelling task: ${taskId}`);
    
    try {
      // Try to use background page
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.cancelTask === 'function') {
        const result = await backgroundPage.marvin.cancelTask(taskId);
        
        if (result) {
          // Refresh tasks to update lists
          await this.refreshTasks();
          
          this.logger.debug(`Task ${taskId} cancelled successfully via background page`);
          return true;
        } else {
          throw new Error('Failed to cancel task via background page');
        }
      } else {
        // Fall back to API
        if (!this.apiService) {
          throw new Error('API service not available');
        }
        
        const response = await this.apiService.fetchAPI(`/api/v1/tasks/${taskId}/cancel`, {
          method: 'POST'
        });
        
        if (response && response.success) {
          // Refresh tasks to update lists
          await this.refreshTasks();
          
          this.logger.debug(`Task ${taskId} cancelled successfully via API`);
          return true;
        } else {
          throw new Error((response?.error?.message) || 'Unknown error cancelling task');
        }
      }
    } catch (error) {
      this.logger.error(`Error cancelling task ${taskId}:`, error);
      throw error;
    }
  }
  
  /**
   * Retry a failed task
   * @param {string} taskId - ID of task to retry
   * @returns {Promise<boolean>} Whether retry was successful
   */
  async retryTask(taskId) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    if (!taskId) {
      this.logger.warn('Attempted to retry task with no ID');
      return false;
    }
    
    this.logger.info(`Retrying task: ${taskId}`);
    
    try {
      // Try to use background page
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.retryTask === 'function') {
        const result = await backgroundPage.marvin.retryTask(taskId);
        
        if (result) {
          // Refresh tasks to update lists
          await this.refreshTasks();
          
          this.logger.debug(`Task ${taskId} retried successfully via background page`);
          return true;
        } else {
          throw new Error('Failed to retry task via background page');
        }
      } else {
        // Fall back to API
        if (!this.apiService) {
          throw new Error('API service not available');
        }
        
        const response = await this.apiService.fetchAPI(`/api/v1/tasks/${taskId}/retry`, {
          method: 'POST'
        });
        
        if (response && response.success) {
          // Refresh tasks to update lists
          await this.refreshTasks();
          
          this.logger.debug(`Task ${taskId} retried successfully via API`);
          return true;
        } else {
          throw new Error((response?.error?.message) || 'Unknown error retrying task');
        }
      }
    } catch (error) {
      this.logger.error(`Error retrying task ${taskId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a task by ID
   * @param {string} taskId - ID of task to get
   * @returns {Object|null} Task object or null if not found
   */
  async getTaskById(taskId) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Task service failed to initialize');
          return null;
        }
      } catch (error) {
        console.error('Error initializing task service:', error);
        return null;
      }
    }
    
    if (!taskId) {
      return null;
    }
    
    return [...this.activeTasks, ...this.completedTasks].find(task => task.id === taskId) || null;
  }
  
  /**
   * Get all active tasks
   * @returns {Promise<Array>} Array of active task objects
   */
  async getActiveTasks() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Task service failed to initialize');
          return [];
        }
      } catch (error) {
        console.error('Error initializing task service:', error);
        return [];
      }
    }
    
    return [...this.activeTasks];
  }
  
  /**
   * Get all completed tasks
   * @returns {Promise<Array>} Array of completed task objects
   */
  async getCompletedTasks() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Task service failed to initialize');
          return [];
        }
      } catch (error) {
        console.error('Error initializing task service:', error);
        return [];
      }
    }
    
    return [...this.completedTasks];
  }
  
  /**
   * Register a task update listener
   * @param {Function} listener - Listener function
   * @returns {Function} Function to remove the listener
   */
  async addTaskListener(listener) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Task service failed to initialize');
          return () => {}; // Return no-op function on failure
        }
      } catch (error) {
        console.error('Error initializing task service:', error);
        return () => {}; // Return no-op function on error
      }
    }
    
    if (typeof listener !== 'function') {
      this.logger.warn('Attempted to add non-function task listener');
      return () => {};
    }
    
    this.taskListeners.push(listener);
    
    this.logger.debug(`Task listener added, total listeners: ${this.taskListeners.length}`);
    
    // Return function to remove the listener
    return () => {
      this.taskListeners = this.taskListeners.filter(l => l !== listener);
      this.logger.debug(`Task listener removed, remaining listeners: ${this.taskListeners.length}`);
    };
  }
  
  /**
   * Notify all task listeners about updates
   * @param {Object} updateData - Update data
   * @returns {void}
   */
  notifyTaskListeners(updateData) {
    if (!this.taskListeners || this.taskListeners.length === 0) {
      return;
    }
    
    this.logger.debug(`Notifying ${this.taskListeners.length} task listeners about updates`);
    
    // Call each listener with update data
    this.taskListeners.forEach(listener => {
      try {
        listener(updateData);
      } catch (error) {
        this.logger.error('Error in task listener:', error);
        // Continue notifying other listeners even if one fails
      }
    });
  }
  
  /**
   * Create and monitor a capture task
   * @param {Object} captureData - Capture data
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} Task result
   */
  async createCaptureTask(captureData, progressCallback) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    this.logger.info('Creating capture task', captureData);
    
    try {
      // Create task
      const task = await this.createTask({
        type: 'capture',
        data: captureData
      });
      
      if (!task || !task.id) {
        throw new Error('Failed to create capture task');
      }
      
      // Show notification
      let notificationId;
      
      if (this.notificationService) {
        notificationId = this.notificationService.showNotification(`Capturing ${captureData.url}...`, 'info', 0);
      }
      
      // Monitor task progress
      return await this.monitorTaskProgress(task.id, (progress, status) => {
        // Update notification
        if (this.notificationService && notificationId) {
          this.notificationService.updateNotificationProgress(`Capturing: ${status}`, progress * 100, notificationId);
        }
        
        // Call progress callback if provided
        if (typeof progressCallback === 'function') {
          progressCallback(progress, status);
        }
      });
    } catch (error) {
      this.logger.error('Error creating capture task:', error);
      throw error;
    }
  }
  
  /**
   * Monitor a task's progress until completion
   * @param {string} taskId - ID of task to monitor
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} Task result
   */
  async monitorTaskProgress(taskId, progressCallback) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize task service');
        }
      } catch (error) {
        this.logger?.error('Error initializing task service:', error);
        throw error;
      }
    }
    
    if (!taskId) {
      throw new Error('Invalid task ID');
    }
    
    this.logger.debug(`Monitoring progress for task ${taskId}`);
    
    // Get initial task
    let task = await this.getTaskById(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    // Call progress callback with initial status
    if (typeof progressCallback === 'function') {
      progressCallback(task.progress || 0, task.status);
    }
    
    // Return promise that resolves when task completes
    return new Promise((resolve, reject) => {
      let checkInterval;
      let timeout;
      
      const cleanupTimers = () => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };
      
      const checkTaskStatus = async () => {
        try {
          // Refresh tasks
          await this.refreshTasks();
          
          // Get updated task
          task = await this.getTaskById(taskId);
          
          if (!task) {
            cleanupTimers();
            reject(new Error(`Task ${taskId} disappeared`));
            return;
          }
          
          // Call progress callback with updated status
          if (typeof progressCallback === 'function') {
            progressCallback(task.progress || 0, task.status);
          }
          
          // Check if task is done
          if (task.status === 'complete' || task.status === 'error') {
            cleanupTimers();
            
            if (task.status === 'complete') {
              resolve(task.result || task);
            } else {
              reject(new Error(task.error || 'Task failed'));
            }
          }
        } catch (error) {
          this.logger.error(`Error monitoring task ${taskId}:`, error);
        }
      };
      
      // Set interval to check task status
      checkInterval = setInterval(checkTaskStatus, 1000); // Check every second
      
      // Set timeout to prevent hanging
      timeout = setTimeout(() => {
        cleanupTimers();
        reject(new Error('Task monitoring timed out after 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }
  
  /**
   * Cleanup service resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up task service');
    
    // Stop polling
    this.stopTaskPolling();
    
    // Clear task listeners
    this.taskListeners = [];
    
    // Clear task lists
    this.activeTasks = [];
    this.completedTasks = [];
    
    // Clear service references
    this.apiService = null;
    this.notificationService = null;
    
    this.initialized = false;
    this.logger.debug('Task service cleanup completed');
  }
}