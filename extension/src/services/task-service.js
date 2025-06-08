// src/services/task-service.js
import { BaseService } from '../services/base-service.js'
import { LogManager } from '../utils/log-manager.js';

/**
 * TaskService - Manages background tasks, polling, and status updates
 */
export class TaskService extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    // Task Management
    pollingInterval: 5000,      // 5 seconds
    maxTaskAge: 300000,         // 5 minutes
    maxActiveTasks: 50,
    maxTaskHistory: 100,
    maxConcurrentTasks: 10,
    taskTimeout: 300000,        // 5 minutes

    // Retry Configuration
    maxRetryAttempts: 3,
    retryBackoffBase: 1000,     // 1 second
    retryBackoffMax: 30000,     // 30 seconds

    // Circuit Breaker
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000, // 1 minute

    // Memory Management
    memoryPressureThreshold: 0.8,
    cleanupInterval: 300000,    // 5 minutes
    statePersistenceInterval: 60000, // 1 minute
    
    // Cache Configuration
    maxCacheSize: 1000,
    cacheEvictionPolicy: 'lru'
  };

    /**
   * Task error codes
   * @private
   */
    static _ERROR_CODES = {
        INITIALIZATION_FAILED: 'INITIALIZATION_FAILED',
        TASK_NOT_FOUND: 'TASK_NOT_FOUND',
        TASK_TIMEOUT: 'TASK_TIMEOUT',
        CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
        MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
        INVALID_TASK_STATE: 'INVALID_TASK_STATE',
        API_ERROR: 'API_ERROR',
        STORAGE_ERROR: 'STORAGE_ERROR'
      };

    /**
   * Task error class
   * @private
   */
  static _TaskError = class TaskError extends Error {
    constructor(message, code, details = {}) {
      super(message);
      this.name = 'TaskError';
      this.code = code;
      this.details = details;
    }
  };

  /**
   * Create a new TaskService instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super();

    // Initialize configuration
    this._config = {
      ...TaskService._DEFAULT_CONFIG,
      ...options
    };

    // Initialize state tracking
    this._activeTasks = new WeakMap();
    this._completedTasks = new WeakMap();
    this._taskListeners = new WeakMap();
    this._taskTimeouts = new WeakMap();
    this._taskRetries = new WeakMap();
    this._messagePorts = new WeakSet();
    this._webSockets = new WeakSet();
    this._circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false
    };

    // Initialize memory tracking
    this._memoryMetrics = {
        peakUsage: 0,
        lastSnapshot: null,
        cleanupCount: 0
        };

    // Initialize polling state
    this._isPolling = false;
    this._pollingIntervalId = null;
    this._statePersistenceIntervalId = null;
    this._lastStatePersist = 0;

    // Initialize statistics
    this._stats = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      lastPollTime: 0,
      lastTaskUpdate: 0,
      circuitBreakerTrips: 0,
      retryAttempts: 0
    };

    // Initialize logger
    this._logger = new LogManager({
      context: 'task-service',
      isBackgroundScript: false,
      maxEntries: 1000
    });
  }

    _trackWebSocket(ws) {
        this._webSockets.add(ws);
        this._resourceTracker.trackWebSocket(ws);
    }

    _trackMessagePort(port) {
        this._messagePorts.add(port);
        this._resourceTracker.trackMessagePort(port);
    }
    

    /**
     * Initialize the service
     * @returns {Promise<boolean>} Success state
     * @private
     */
    async _performInitialization() {
        try {
            this._logger.info('Initializing task service');
        
        // Resolve dependencies
        await this._resolveDependencies();
        
        // Load persisted state
        await this._loadPersistedState();
        
        // Start polling
        this._startTaskPolling();
        
        // Start state persistence
        this._startStatePersistence();
        
        this._logger.info('Task service initialized successfully');
        return true;
        } catch (error) {
            this._logger.error('Error initializing task service:', error);
            throw error;
        }
    }

    /**
     * Start state persistence interval
     * @private
     */
    _startStatePersistence() {
        if (this._statePersistenceIntervalId) {
            this._logger.debug('State persistence already active, skipping');
            return;
        }

        this._logger.debug('Starting state persistence');
        
        // Clear any existing interval first
        if (this._statePersistenceIntervalId) {
            clearInterval(this._statePersistenceIntervalId);
            this._statePersistenceIntervalId = null;
        }
        
        // Set up interval using resource tracker
        this._statePersistenceIntervalId = this._resourceTracker.trackInterval(
            this._persistState.bind(this),
            this._config.statePersistenceInterval
        );
    }

    /**
     * Stop state persistence interval
     * @private
     */
    _stopStatePersistence() {
        if (this._statePersistenceIntervalId) {
            clearInterval(this._statePersistenceIntervalId);
            this._statePersistenceIntervalId = null;
        }
    }
    
    /**
     * Resolve service dependencies
     * @private
     */
    async _resolveDependencies() {
        try {
        // Required dependencies
        this._apiService = this._container.getService('apiService');
        if (!this._apiService) {
            throw new Error('Required dependency apiService not available');
        }
        
        // Optional dependencies
        try {
            this._notificationService = this._container.getService('notificationService');
        } catch (error) {
            this._logger.warn('Optional dependency notificationService not available');
        }
        
        try {
            this._storageService = this._container.getService('storageService');
        } catch (error) {
            this._logger.warn('Optional dependency storageService not available');
        }
        } catch (error) {
        this._logger.error('Error resolving dependencies:', error);
        throw error;
        }
    }
    
    /**
     * Start polling for task updates
     * @private
     */
    _startTaskPolling() {
        if (this._isPolling) {
        this._logger.debug('Task polling already active, skipping');
        return;
        }
        
        this._logger.debug('Starting task polling');
        
        // Clear any existing interval first
        if (this._pollingIntervalId) {
        clearInterval(this._pollingIntervalId);
        this._pollingIntervalId = null;
        }
        
        this._isPolling = true;
        
        // Set up interval using resource tracker
        this._pollingIntervalId = this._resourceTracker.trackInterval(
        this._pollTasks.bind(this),
        this._config.pollingInterval
        );
    }
    
    /**
     * Poll for task updates
     * @private
     */
    async _pollTasks() {
        try {
        // Only poll if we have active tasks
        if (this._activeTasks.size > 0) {
            this._logger.debug(`Polling for updates on ${this._activeTasks.size} active tasks`);
            await this._refreshTasks();
        }
        } catch (error) {
        this._logger.error('Error during task polling:', error);
        }
    }
    
    /**
     * Stop polling for task updates
     * @private
     */
    _stopTaskPolling() {
        if (!this._isPolling) {
        return;
        }
        
        this._logger.debug('Stopping task polling');
        
        if (this._pollingIntervalId) {
        clearInterval(this._pollingIntervalId);
        this._pollingIntervalId = null;
        }
        
        this._isPolling = false;
    }
    
    /**
     * Refresh tasks from background or API
     * @private
     */
    async _refreshTasks() {
        this._logger.debug('Refreshing tasks');
        
        try {
        // Try to get tasks from background page first
        const backgroundPage = chrome.extension.getBackgroundPage();
        
        if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.getActiveTasks === 'function') {
            // Use background page
            const tasks = await backgroundPage.marvin.getActiveTasks();
            this._processTaskUpdates(tasks);
        } else {
            // Fall back to API
            await this._fetchTasksFromApi();
        }
        } catch (error) {
        this._logger.error('Error refreshing tasks:', error);
        
        // Try API as fallback if background page failed
        try {
            await this._fetchTasksFromApi();
        } catch (apiError) {
            this._logger.error('Error fetching tasks from API:', apiError);
            // Don't throw here to prevent breaking polling
        }
        }
    }
    
    /**
     * Fetch tasks from API
     * @private
     */
    async _fetchTasksFromApi() {
        this._logger.debug('Fetching tasks from API');
        
        try {
            if (!this._apiService) {
                throw new Error('API service not available');
            }
            
            // Add WebSocket tracking if using WebSocket
            if (this._config.useWebSocket) {
                const ws = new WebSocket(this._config.wsUrl);
                this._resourceTracker.trackWebSocket(ws);
                
                // Set up WebSocket event handlers
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this._processTaskUpdates(data.tasks || []);
                };
                
                ws.onerror = (error) => {
                    this._logger.error('WebSocket error:', error);
                    ws.close();
                };
            }
            
            // Existing API call
            const response = await this._apiService.fetchAPI('/api/v1/tasks');
            
            if (response && response.success) {
                this._processTaskUpdates(response.data?.tasks || []);
                this._logger.debug(`Fetched ${response.data?.tasks?.length || 0} tasks from API`);
            } else {
                throw new Error((response?.error?.message) || 'Unknown error fetching tasks');
            }
        } catch (error) {
            this._logger.error('Error fetching tasks from API:', error);
            throw error;
        }
    }
    


    /**
     * Process task updates and notify listeners
     * @param {Array} tasks - Array of tasks
     * @private
     */
    _processTaskUpdates(tasks) {
        if (!Array.isArray(tasks)) {
        this._logger.warn('Received non-array tasks data:', tasks);
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
        const statusChanges = this._findStatusChanges(
        Array.from(this._activeTasks.keys()),
        newActiveTasks,
        newCompletedTasks
        );
        
        // Update task maps
        this._activeTasks = new WeakMap(newActiveTasks.map(task => [task, Date.now()]));
        this._completedTasks = new WeakMap(newCompletedTasks.map(task => [task, Date.now()]));
        
        // Show notifications for completed tasks
        if (this._notificationService) {
        statusChanges.completed.forEach(task => {
            if (task.status === 'complete') {
            this._notificationService.showNotification(
                `Task completed: ${task.title || 'Unknown task'}`,
                'success'
            );
            } else if (task.status === 'error') {
            this._notificationService.showNotification(
                `Task failed: ${task.title || 'Unknown task'}`,
                'error'
            );
            }
        });
        }
        
        // Notify listeners about changes
        if (statusChanges.completed.length > 0 || statusChanges.updated.length > 0) {
        this._notifyTaskListeners({
            activeTasks: Array.from(this._activeTasks.keys()),
            completedTasks: Array.from(this._completedTasks.keys()),
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
     * @private
     */
    _findStatusChanges(oldActiveTasks, newActiveTasks, newCompletedTasks) {
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
        if (!this._initialized) {
          try {
            await this.initialize();
          } catch (error) {
            throw new TaskService._TaskError(
              'Failed to initialize task service',
              TaskService._ERROR_CODES.INITIALIZATION_FAILED,
              { originalError: error }
            );
          }
        }
    
        this._logger.info('Creating new task', taskData);
    
        try {
          // Try to use background page
          const backgroundPage = chrome.extension.getBackgroundPage();
          
          if (backgroundPage && backgroundPage.marvin && typeof backgroundPage.marvin.createTask === 'function') {
            const result = await backgroundPage.marvin.createTask(taskData);
            
            if (result && result.id) {
              // Add to active tasks
              this._activeTasks.set(result, Date.now());
              
              // Update stats
              this._stats.tasksCreated++;
              
              // Notify listeners
              this._notifyTaskListeners({
                activeTasks: Array.from(this._activeTasks.keys()),
                completedTasks: Array.from(this._completedTasks.keys()),
                changes: {
                  completed: [],
                  updated: [],
                  created: [result]
                }
              });
              
              this._logger.debug('Task created successfully via background page:', result);
              return result;
            } else {
              throw new TaskService._TaskError(
                'Failed to create task via background page',
                TaskService._ERROR_CODES.API_ERROR
              );
            }
          } else {
            // Fall back to API
            if (!this._apiService) {
              throw new TaskService._TaskError(
                'API service not available',
                TaskService._ERROR_CODES.API_ERROR
              );
            }
            
            const response = await this._apiService.fetchAPI('/api/v1/tasks', {
              method: 'POST',
              body: JSON.stringify(taskData)
            });
            
            if (response && response.success && response.data) {
              // Add to active tasks
              this._activeTasks.set(response.data, Date.now());
              
              // Update stats
              this._stats.tasksCreated++;
              
              // Notify listeners
              this._notifyTaskListeners({
                activeTasks: Array.from(this._activeTasks.keys()),
                completedTasks: Array.from(this._completedTasks.keys()),
                changes: {
                  completed: [],
                  updated: [],
                  created: [response.data]
                }
              });
              
              this._logger.debug('Task created successfully via API:', response.data);
              return response.data;
            } else {
              throw new TaskService._TaskError(
                (response?.error?.message) || 'Unknown error creating task',
                TaskService._ERROR_CODES.API_ERROR,
                { response }
              );
            }
          }
        } catch (error) {
          this._logger.error('Error creating task:', error);
          if (error instanceof TaskService._TaskError) {
            throw error;
          }
          throw new TaskService._TaskError(
            'Failed to create task',
            TaskService._ERROR_CODES.API_ERROR,
            { originalError: error }
          );
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
        if (!this._initialized) {
          try {
            const success = await this.initialize();
            if (!success) {
              throw new TaskService._TaskError(
                'Task service failed to initialize',
                TaskService._ERROR_CODES.INITIALIZATION_FAILED
              );
            }
          } catch (error) {
            if (error instanceof TaskService._TaskError) {
              throw error;
            }
            throw new TaskService._TaskError(
              'Error initializing task service',
              TaskService._ERROR_CODES.INITIALIZATION_FAILED,
              { originalError: error }
            );
          }
        }
        
        if (!taskId) {
          throw new TaskService._TaskError(
            'Invalid task ID',
            TaskService._ERROR_CODES.INVALID_TASK_STATE
          );
        }
        
        const task = [...this._activeTasks.keys(), ...this._completedTasks.keys()]
          .find(task => task.id === taskId);
        
        if (!task) {
          throw new TaskService._TaskError(
            `Task ${taskId} not found`,
            TaskService._ERROR_CODES.TASK_NOT_FOUND
          );
        }
        
        return task;
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
    if (!this._initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new TaskService._TaskError(
            'Failed to initialize task service',
            TaskService._ERROR_CODES.INITIALIZATION_FAILED
          );
        }
      } catch (error) {
        if (error instanceof TaskService._TaskError) {
          throw error;
        }
        throw new TaskService._TaskError(
          'Error initializing task service',
          TaskService._ERROR_CODES.INITIALIZATION_FAILED,
          { originalError: error }
        );
      }
    }

    if (!taskId) {
      throw new TaskService._TaskError(
        'Invalid task ID',
        TaskService._ERROR_CODES.INVALID_TASK_STATE
      );
    }

    this._logger.debug(`Monitoring progress for task ${taskId}`);

    // Get initial task
    let task = await this.getTaskById(taskId);

    if (!task) {
      throw new TaskService._TaskError(
        `Task ${taskId} not found`,
        TaskService._ERROR_CODES.TASK_NOT_FOUND
      );
    }

    // Call progress callback with initial status
    if (typeof progressCallback === 'function') {
      progressCallback(task.progress || 0, task.status);
    }

    // Return promise that resolves when task completes
    return new Promise((resolve, reject) => {
      let checkInterval;
      let timeout;

      // Add message port tracking
      const port = chrome.runtime.connect({ name: 'task-monitor' });
      this._trackMessagePort(port);

      const cleanupTimers = () => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        // Add port cleanup
        port.disconnect();
        this._messagePorts.delete(port);
      };

      const checkTaskStatus = async () => {
        try {
          // Refresh tasks
          await this._refreshTasks();

          // Get updated task
          task = await this.getTaskById(taskId);

          if (!task) {
            cleanupTimers();
            reject(new TaskService._TaskError(
              `Task ${taskId} disappeared`,
              TaskService._ERROR_CODES.TASK_NOT_FOUND
            ));
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
              reject(new TaskService._TaskError(
                task.error || 'Task failed',
                TaskService._ERROR_CODES.TASK_TIMEOUT,
                { task }
              ));
            }
          }
        } catch (error) {
          this._logger.error(`Error monitoring task ${taskId}:`, error);
          if (error instanceof TaskService._TaskError) {
            cleanupTimers();
            reject(error);
          }
        }
      };

      // Set interval to check task status
      checkInterval = this._resourceTracker.trackInterval(
        checkTaskStatus,
        1000 // Check every second
      );

      // Set timeout to prevent hanging
      timeout = this._resourceTracker.trackTimeout(() => {
        cleanupTimers();
        reject(new TaskService._TaskError(
          'Task monitoring timed out after 5 minutes',
          TaskService._ERROR_CODES.TASK_TIMEOUT,
          { taskId }
        ));
      }, 5 * 60 * 1000);
    });
  }

    /**
     * Handle memory pressure
     * @param {object} snapshot - Memory snapshot
     * @private
     */
    async _handleMemoryPressure(snapshot) {
        this._logger.warn('Memory pressure detected in task service');
        
        // Update memory metrics before cleanup
        this._updateMemoryMetrics();
        
        // Let base implementation handle pressure level calculation and cleanup orchestration
        await super._handleMemoryPressure(snapshot);
    }

    _updateMemoryMetrics() {
        if (!performance?.memory) return;
        
        const currentUsage = performance.memory.usedJSHeapSize;
        this._memoryMetrics.peakUsage = Math.max(this._memoryMetrics.peakUsage, currentUsage);
        this._memoryMetrics.lastSnapshot = {
            timestamp: Date.now(),
            usedJSHeapSize: currentUsage,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
    }

    /**
     * Clear task cache
     * @private
     */
    _clearTaskCache() {
        this._logger.debug('Clearing task cache');
        
        // Clear completed tasks beyond history limit
        if (this._completedTasks.size > this._config.maxTaskHistory) {
            const tasks = Array.from(this._completedTasks.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(this._config.maxTaskHistory);
            
            for (const [task] of tasks) {
                this._completedTasks.delete(task);
            }
        }
        
        // Clear old task timeouts
        const now = Date.now();
        for (const [task, timeout] of this._taskTimeouts) {
            if (now - timeout.timestamp > this._config.maxTaskAge) {
                clearTimeout(timeout.id);
                this._taskTimeouts.delete(task);
            }
        }
    }

    /**
     * Clean up non-essential resources
     * @private
     */
    async _cleanupNonEssentialResources() {
        // Clear completed tasks beyond history limit
        if (this._completedTasks.size > this._config.maxTaskHistory) {
            const tasks = Array.from(this._completedTasks.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(this._config.maxTaskHistory);
            
            for (const [task] of tasks) {
                this._completedTasks.delete(task);
            }
        }
        
        // Clear old task timeouts
        const now = Date.now();
        for (const [task, timeout] of this._taskTimeouts) {
            if (now - timeout.timestamp > this._config.maxTaskAge) {
                clearTimeout(timeout.id);
                this._taskTimeouts.delete(task);
            }
        }
        
        // Clear old retry records
        for (const [task, retry] of this._taskRetries) {
            if (now - retry.lastAttempt > this._config.maxTaskAge) {
                this._taskRetries.delete(task);
            }
        }
    }


    /**
     * Persist current state to storage
     * @private
     */
    async _persistState() {
        if (!this._storageService) {
            this._logger.debug('Storage service not available, skipping state persistence');
            return;
        }

        try {
            const state = {
                activeTasks: Array.from(this._activeTasks.entries()),
                completedTasks: Array.from(this._completedTasks.entries()),
                stats: this._stats,
                circuitBreaker: this._circuitBreaker
            };

            // Validate state before persisting
            if (!this._validateState(state)) {
                this._logger.error('Invalid state detected, skipping persistence');
                return;
            }

            await this._storageService.set('taskServiceState', state);
            this._lastStatePersist = Date.now();
            
            this._logger.debug('State persisted successfully');
        } catch (error) {
            this._logger.error('Error persisting state:', error);
        }
    }

    /**
     * Validate state before persistence
     * @param {Object} state - State to validate
     * @returns {boolean} Whether state is valid
     * @private
     */
    _validateState(state) {
        if (!state || typeof state !== 'object') {
            this._logger.warn('Invalid state: not an object');
            return false;
        }

        // Validate required fields
        const requiredFields = ['activeTasks', 'completedTasks', 'stats', 'circuitBreaker'];
        for (const field of requiredFields) {
            if (!(field in state)) {
                this._logger.warn(`Invalid state: missing required field ${field}`);
                return false;
            }
        }

        // Validate task arrays
        if (!Array.isArray(state.activeTasks) || !Array.isArray(state.completedTasks)) {
            this._logger.warn('Invalid state: task arrays must be arrays');
            return false;
        }

        // Validate stats
        if (typeof state.stats !== 'object') {
            this._logger.warn('Invalid state: stats must be an object');
            return false;
        }

        // Validate circuit breaker
        if (typeof state.circuitBreaker !== 'object') {
            this._logger.warn('Invalid state: circuitBreaker must be an object');
            return false;
        }

        return true;
    }
    /**
     * Validate task state
     * @param {Object} task - Task to validate
     * @returns {boolean} Whether task state is valid
     * @private
     */
    _validateTaskState(task) {
        if (!task) {
          throw new TaskService._TaskError(
            'Task is null or undefined',
            TaskService._ERROR_CODES.INVALID_TASK_STATE
          );
        }
    
        if (!task.id) {
          throw new TaskService._TaskError(
            'Task missing required field: id',
            TaskService._ERROR_CODES.INVALID_TASK_STATE
          );
        }
    
        if (!task.status) {
          throw new TaskService._TaskError(
            `Task ${task.id} missing required field: status`,
            TaskService._ERROR_CODES.INVALID_TASK_STATE
          );
        }
    
        const validStatuses = ['pending', 'processing', 'analyzing', 'complete', 'error'];
        if (!validStatuses.includes(task.status)) {
          throw new TaskService._TaskError(
            `Task ${task.id} has invalid status: ${task.status}`,
            TaskService._ERROR_CODES.INVALID_TASK_STATE
          );
        }
    
        if (task.progress !== undefined) {
          if (typeof task.progress !== 'number' || task.progress < 0 || task.progress > 1) {
            throw new TaskService._TaskError(
              `Task ${task.id} has invalid progress: ${task.progress}`,
              TaskService._ERROR_CODES.INVALID_TASK_STATE
            );
          }
        }
    
        return true;
      }

    /**
     * Clean up old tasks
     * @private
     */
    async _cleanupOldTasks() {
        const now = Date.now();
        const maxAge = this._config.maxTaskAge;
    
        // Clean up completed tasks
        for (const [task, timestamp] of this._completedTasks) {
          if (now - timestamp > maxAge) {
            this._completedTasks.delete(task);
            this._logger.debug(`Cleaned up old completed task: ${task.id}`);
          }
        }
    
        // Clean up active tasks that have timed out
        for (const [task, timestamp] of this._activeTasks) {
          if (now - timestamp > this._config.taskTimeout) {
            this._activeTasks.delete(task);
            this._logger.warn(`Cleaned up timed out active task: ${task.id}`);
          }
        }
    
        // Clean up old retry records
        for (const [task, retry] of this._taskRetries) {
          if (now - retry.lastAttempt > maxAge) {
            this._taskRetries.delete(task);
          }
        }
    
        this._logger.debug('Completed old task cleanup');
      }

    /**
     * Check if circuit breaker is open
     * @returns {boolean} Whether circuit breaker is open
     * @private
     */
    _checkCircuitBreaker() {
        const now = Date.now();
        
        // Reset circuit breaker if timeout has passed
        if (this._circuitBreaker.isOpen && 
            now - this._circuitBreaker.lastFailure > this._config.circuitBreakerTimeout) {
            this._logger.info('Circuit breaker timeout passed, resetting');
            this._circuitBreaker.isOpen = false;
            this._circuitBreaker.failures = 0;
            return false;
        }
        
        // Check if we should open circuit breaker
        if (!this._circuitBreaker.isOpen && 
            this._circuitBreaker.failures >= this._config.circuitBreakerThreshold) {
            this._logger.warn('Opening circuit breaker due to failure threshold');
            this._circuitBreaker.isOpen = true;
            this._circuitBreaker.lastFailure = now;
            this._stats.circuitBreakerTrips++;
            return true;
        }
        
        return this._circuitBreaker.isOpen;
    }

    /**
     * Record a failure for circuit breaker
     * @private
     */
    _recordFailure() {
        this._circuitBreaker.failures++;
        this._circuitBreaker.lastFailure = Date.now();
        
        this._logger.debug(`Recorded failure, total: ${this._circuitBreaker.failures}`);
        
        // Check if we should open circuit breaker
        if (this._circuitBreaker.failures >= this._config.circuitBreakerThreshold) {
            this._checkCircuitBreaker();
        }
    }

    /**
     * Calculate retry delay using exponential backoff
     * @param {number} attempt - Current retry attempt number
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateRetryDelay(attempt) {
        if (attempt <= 0) return 0;
        
        // Calculate exponential backoff with jitter
        const baseDelay = this._config.retryBackoffBase;
        const maxDelay = this._config.retryBackoffMax;
        
        // Exponential backoff: base * 2^(attempt-1)
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        
        // Add jitter: ±20% of the delay
        const jitter = exponentialDelay * 0.2;
        const jitteredDelay = exponentialDelay + (Math.random() * jitter * 2 - jitter);
        
        // Cap at max delay
        return Math.min(jitteredDelay, maxDelay);
    }

    /**
     * Determine if a task should be retried
     * @param {Object} task - Task to check
     * @param {Error} error - Error that occurred
     * @returns {boolean} Whether task should be retried
     * @private
     */
    _shouldRetryTask(task, error) {
        // Don't retry if we've exceeded max attempts
        const retryInfo = this._taskRetries.get(task) || { attempts: 0 };
        if (retryInfo.attempts >= this._config.maxRetryAttempts) {
            this._logger.warn(`Task ${task.id} exceeded max retry attempts`);
            return false;
        }
        
        // Don't retry if circuit breaker is open
        if (this._checkCircuitBreaker()) {
            this._logger.warn('Circuit breaker open, not retrying task');
            return false;
        }
        
        // Don't retry certain error types
        if (error.name === 'ValidationError' || 
            error.name === 'AuthenticationError' || 
            error.name === 'AuthorizationError') {
            this._logger.warn(`Not retrying task ${task.id} due to error type: ${error.name}`);
            return false;
        }
        
        // Don't retry if task is already complete or cancelled
        if (task.status === 'complete' || task.status === 'cancelled') {
            this._logger.warn(`Not retrying ${task.status} task ${task.id}`);
            return false;
        }
        
        // Update retry info
        retryInfo.attempts++;
        retryInfo.lastAttempt = Date.now();
        this._taskRetries.set(task, retryInfo);
        this._stats.retryAttempts++;
        
        return true;
    }


    
    /**
     * Clean up resources
     * @private
     */
    async _performCleanup() {
        this._logger.info('Cleaning up task service');
        
        // Stop polling and persistence
        this._stopTaskPolling();
        this._stopStatePersistence();
        
        // Clean up task tracking
        this._activeTasks = new WeakMap();
        this._completedTasks = new WeakMap();
        this._taskListeners = new WeakMap();
        this._taskTimeouts = new WeakMap();
        this._taskRetries = new WeakMap();
        
        // Clear circuit breaker
        this._circuitBreaker = {
            failures: 0,
            lastFailure: 0,
            isOpen: false
        };
        
        // Clear statistics
        this._stats = {
            tasksCreated: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            lastPollTime: 0,
            lastTaskUpdate: 0,
            circuitBreakerTrips: 0,
            retryAttempts: 0
        };
        
        // Clear service references
        this._apiService = null;
        this._notificationService = null;
        this._storageService = null;
    }
}


