// src/services/analysis-service.js
import { container } from '../core/dependency-container.js';

/**
 * AnalysisService - Manages page analysis operations and task monitoring
 */
export class AnalysisService {
  /**
   * Create a new AnalysisService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    this.activeTasks = new Map(); // Track active analysis tasks
    this.taskListeners = new Set(); // For notifying about task events
    
    // Bind methods that will be used as event handlers or callbacks
    this.checkTaskStatus = this.checkTaskStatus.bind(this);
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
      // Get logger instance
      this.logger = new (container.getUtil('LogManager'))({
        context: 'analysis-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing analysis service');
      
      // Register cleanup handler for when extension is unloaded
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          this.cleanup();
        });
      }
      
      this.initialized = true;
      this.logger.info('Analysis service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing analysis service:', error);
      } else {
        console.error('Error initializing analysis service:', error);
      }
      return false;
    }
  }
  
  /**
   * Clean up service resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up analysis service');
    
    // Clear all task monitoring
    this.activeTasks.clear();
    this.taskListeners.clear();
    
    this.initialized = false;
  }
  
  /**
   * Handle URL analysis using the documented Analysis API
   * @param {string} url - URL to analyze
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Analysis result
   */
  async analyzeUrl(url, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!url) {
      this.logger.warn('Attempted to analyze URL with no URL provided');
      return { success: false, error: 'No URL provided' };
    }
    
    this.logger.info(`Initiating analysis for URL: ${url}`);
    
    try {
      const apiService = container.getService('apiService');
      if (!apiService) {
        throw new Error('API service not available');
      }
      
      // Use the documented Analysis API
      const response = await apiService.fetchAPI('/api/v1/analysis/analyze', {
        method: 'POST',
        body: JSON.stringify({
          url: url,
          context: options.context || "ACTIVE_TAB",
          tab_id: options.tabId,
          window_id: options.windowId,
          bookmark_id: options.bookmarkId
        })
      });
      
      // Start monitoring the task
      if (response.success && response.task_id) {
        this.monitorAnalysisTask(response.task_id);
        return { 
          success: true,
          taskId: response.task_id,
          status: response.status || 'enqueued'
        };
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      this.logger.error(`Error initiating analysis for ${url}:`, error);
      return { 
        success: false, 
        error: error.message || 'Unknown error' 
      };
    }
  }
  
  /**
   * Monitor an analysis task
   * @param {string} taskId - Task ID to monitor
   */
  monitorAnalysisTask(taskId) {
    if (!taskId) {
      this.logger.warn('Attempted to monitor task with no task ID');
      return;
    }
    
    // Create task state object if not already monitoring
    if (!this.activeTasks.has(taskId)) {
      this.activeTasks.set(taskId, {
        id: taskId,
        status: 'pending',
        progress: 0,
        attempts: 0,
        lastChecked: Date.now(),
        error: null
      });
      
      // Start checking status
      this.checkTaskStatus(taskId);
      
      this.logger.debug(`Started monitoring task: ${taskId}`);
    } else {
      this.logger.debug(`Already monitoring task: ${taskId}`);
    }
  }
  
  /**
   * Check status of a task
   * @param {string} taskId - Task ID to check
   * @private
   */
  async checkTaskStatus(taskId) {
    if (!this.activeTasks.has(taskId)) {
      return; // No longer monitoring this task
    }
    
    const taskState = this.activeTasks.get(taskId);
    taskState.attempts++;
    taskState.lastChecked = Date.now();
    
    try {
      const apiService = container.getService('apiService');
      if (!apiService) {
        throw new Error('API service not available');
      }
      
      // Use the documented Analysis Status API
      const response = await apiService.fetchAPI(`/api/v1/analysis/status/${taskId}`);
      
      if (response.success) {
        // Update task state
        const previousStatus = taskState.status;
        taskState.status = response.status;
        taskState.progress = response.progress || 0;
        taskState.error = response.error || null;
        
        this.logger.debug(`Task ${taskId} status: ${response.status}, progress: ${response.progress}`);
        
        // Notify listeners of status change
        if (previousStatus !== response.status) {
          this.notifyTaskListeners(taskId, taskState);
        }
        
        // Handle completed/error tasks
        if (response.status === 'completed') {
          this.logger.info(`Analysis task ${taskId} completed successfully`);
          this.onAnalysisCompleted(taskId, response);
          
          // Stop monitoring after handling completion
          this.activeTasks.delete(taskId);
          return;
        } else if (response.status === 'error') {
          this.logger.error(`Analysis task ${taskId} failed: ${response.error}`);
          this.onAnalysisError(taskId, response);
          
          // Stop monitoring after handling error
          this.activeTasks.delete(taskId);
          return;
        }
        
        // If task is still running, schedule next check with exponential backoff
        if (response.status === 'enqueued' || response.status === 'processing') {
          const maxAttempts = 30; // Cap at 30 attempts (several minutes)
          
          if (taskState.attempts < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(1.5, Math.min(taskState.attempts, 10)), 30000);
            setTimeout(() => this.checkTaskStatus(taskId), delay);
          } else {
            this.logger.warn(`Giving up monitoring task ${taskId} after ${taskState.attempts} attempts`);
            this.activeTasks.delete(taskId);
          }
        }
      } else {
        throw new Error(response.error || 'Failed to check task status');
      }
    } catch (error) {
      this.logger.error(`Error checking status for task ${taskId}:`, error);
      
      // Try again if within retry limit
      const maxAttempts = 5; // Fewer retries for actual errors
      
      if (taskState.attempts < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, taskState.attempts), 60000);
        setTimeout(() => this.checkTaskStatus(taskId), delay);
      } else {
        this.logger.error(`Giving up on task ${taskId} after ${taskState.attempts} failed attempts`);
        
        // Update task state to error
        taskState.status = 'error';
        taskState.error = error.message || 'Failed to check task status';
        
        // Notify listeners
        this.notifyTaskListeners(taskId, taskState);
        
        // Fire error handler
        this.onAnalysisError(taskId, {
          success: false,
          error: `Failed to check task status: ${error.message}`
        });
        
        // Stop monitoring
        this.activeTasks.delete(taskId);
      }
    }
  }
  
  /**
   * Get the current state of a task
   * @param {string} taskId - Task ID to get state for
   * @returns {object|null} Task state or null if not found
   */
  getTaskState(taskId) {
    if (!this.initialized) {
      this.initialize();
    }
    
    return this.activeTasks.has(taskId) ? { ...this.activeTasks.get(taskId) } : null;
  }
  
  /**
   * Get all active analysis tasks
   * @returns {Array} Array of task state objects
   */
  getAllTasks() {
    if (!this.initialized) {
      this.initialize();
    }
    
    return Array.from(this.activeTasks.values()).map(task => ({ ...task }));
  }
  
  /**
   * Add a task listener to be notified of task events
   * @param {Function} listener - Listener function
   * @returns {Function} Function to remove the listener
   */
  addTaskListener(listener) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (typeof listener !== 'function') {
      this.logger.warn('Attempted to add non-function task listener');
      return () => {};
    }
    
    this.taskListeners.add(listener);
    this.logger.debug(`Task listener added, total listeners: ${this.taskListeners.size}`);
    
    // Return function to remove the listener
    return () => {
      this.taskListeners.delete(listener);
      this.logger.debug(`Task listener removed, remaining listeners: ${this.taskListeners.size}`);
    };
  }
  
  /**
   * Notify all task listeners about task updates
   * @param {string} taskId - Task ID
   * @param {object} taskState - Current task state
   * @private
   */
  notifyTaskListeners(taskId, taskState) {
    if (this.taskListeners.size === 0) {
      return;
    }
    
    const eventData = {
      taskId,
      status: taskState.status,
      progress: taskState.progress,
      error: taskState.error
    };
    
    this.logger.debug(`Notifying ${this.taskListeners.size} task listeners about task ${taskId} update`);
    
    // Call each listener with event data
    this.taskListeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        this.logger.error('Error in task listener:', error);
      }
    });
  }
  
  /**
   * Handle analysis task completion
   * @param {string} taskId - Task ID
   * @param {object} response - API response
   * @private
   */
  onAnalysisCompleted(taskId, response) {
    try {
      // Get notification service from container
      const notificationService = container.getService('notificationService');
      if (notificationService) {
        notificationService.showNotification(
          'Analysis Complete',
          'The page analysis has been completed successfully.',
          'success'
        );
      }
      
      // Emit event for other services
      if (typeof document !== 'undefined') {
        const event = new CustomEvent('analysisCompleted', {
          detail: { taskId, result: response }
        });
        document.dispatchEvent(event);
      }
      
      this.logger.info(`Analysis task ${taskId} completion handled successfully`);
    } catch (error) {
      this.logger.error(`Error handling completion of task ${taskId}:`, error);
    }
  }
  
  /**
   * Handle analysis task error
   * @param {string} taskId - Task ID
   * @param {object} response - API response
   * @private
   */
  onAnalysisError(taskId, response) {
    try {
      // Get notification service from container
      const notificationService = container.getService('notificationService');
      if (notificationService) {
        notificationService.showNotification(
          'Analysis Failed',
          `Error: ${response.error || 'Unknown error'}`,
          'error'
        );
      }
      
      // Emit event for other services
      if (typeof document !== 'undefined') {
        const event = new CustomEvent('analysisError', {
          detail: { taskId, error: response.error }
        });
        document.dispatchEvent(event);
      }
      
      this.logger.info(`Analysis task ${taskId} error handled`);
    } catch (error) {
      this.logger.error(`Error handling failure of task ${taskId}:`, error);
    }
  }
  
  /**
   * Cancel an analysis task
   * @param {string} taskId - Task ID to cancel
   * @returns {Promise<boolean>} Whether cancellation was successful
   */
  async cancelAnalysisTask(taskId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!taskId) {
      this.logger.warn('Attempted to cancel task with no task ID');
      return false;
    }
    
    this.logger.info(`Attempting to cancel analysis task: ${taskId}`);
    
    try {
      const apiService = container.getService('apiService');
      if (!apiService) {
        throw new Error('API service not available');
      }
      
      // This is a speculative endpoint - it might not exist yet but follows API convention
      const response = await apiService.fetchAPI(`/api/v1/analysis/cancel/${taskId}`, {
        method: 'POST'
      });
      
      if (response.success) {
        // Update task state if still monitoring
        if (this.activeTasks.has(taskId)) {
          const taskState = this.activeTasks.get(taskId);
          taskState.status = 'cancelled';
          this.notifyTaskListeners(taskId, taskState);
          this.activeTasks.delete(taskId);
        }
        
        this.logger.info(`Successfully cancelled task ${taskId}`);
        return true;
      } else {
        throw new Error(response.error || 'Failed to cancel task');
      }
    } catch (error) {
      this.logger.error(`Error cancelling task ${taskId}:`, error);
      
      // If the API endpoint doesn't exist, at least clean up local task state
      if (this.activeTasks.has(taskId)) {
        this.activeTasks.delete(taskId);
      }
      
      return false;
    }
  }
}