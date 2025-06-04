// src/services/analysis-service.js
import { LogManager } from '../utils/log-manager.js';
import { BaseService } from '../core/base-service.js';

/**
 * AnalysisService - Manages page analysis operations and task monitoring
 */
export class AnalysisService extends BaseService {
  /**
   * Create a new AnalysisService instance
   * @param {Object} options - Service options
   * @param {LogManager} [options.logger] - Logger instance
   * @param {Object} [options.apiService] - API service instance
   * @param {Object} [options.notificationService] - Notification service instance
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 5,
      retryBackoffBase: 1000,
      retryBackoffMax: 60000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });
    
    // Private properties
    this._logger = options.logger || new LogManager({
      context: 'analysis-service',
      isBackgroundScript: false,
      maxEntries: 1000
    });

    this._apiService = options.apiService || null;
    this._notificationService = options.notificationService || null;
    
    // Bind methods that will be used as event handlers or callbacks
    this._handleBeforeUnload = this._handleBeforeUnload.bind(this);
    this._handleTaskEvent = this._handleTaskEvent.bind(this);
  }

  /**
   * Service-specific initialization
   * @protected
   */
  async _performInitialization() {
    try {
      this._logger.info('Initializing analysis service');
      
      // Validate required dependencies
      if (!this._apiService) {
        throw new Error('API service is required');
      }
      
      // Set up event listeners using resource tracker
      this._setupEventListeners();
      
      this._logger.info('Analysis service initialized successfully');
    } catch (error) {
      this._logger.error('Error initializing analysis service:', error);
      throw error;
    }
  }

  /**
   * Service-specific cleanup
   * @protected
   */
  async _performCleanup() {
    try {
      this._logger.info('Cleaning up analysis service');
      
      // Clear service references
      this._apiService = null;
      this._notificationService = null;
      
      this._logger.info('Analysis service cleaned up successfully');
    } catch (error) {
      this._logger.error('Error during analysis service cleanup:', error);
      throw error;
    }
  }

  /**
   * Handle memory pressure
   * @param {Object} snapshot - Memory usage snapshot
   * @protected
   */
  async _handleMemoryPressure(snapshot) {
    this._logger.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
  }

  /**
   * Set up event listeners using resource tracker
   * @private
   */
  _setupEventListeners() {
    if (typeof window !== 'undefined') {
      // Register cleanup handler for when extension is unloaded
      this._resourceTracker.trackEventListener(
        window,
        'beforeunload',
        this._handleBeforeUnload
      );
      
      // Add custom event listeners for task events
      this._resourceTracker.trackEventListener(
        document,
        'analysisTaskCreated',
        this._handleTaskEvent
      );
      this._resourceTracker.trackEventListener(
        document,
        'analysisTaskUpdated',
        this._handleTaskEvent
      );
    }
    
    this._logger.debug('Event listeners set up');
  }

  /**
   * Handle beforeunload event
   * @private
   */
  _handleBeforeUnload() {
    this.cleanup();
  }
  
  /**
   * Handle task events
   * @param {CustomEvent} event - Task event
   * @private
   */
  _handleTaskEvent(event) {
    if (event && event.detail && event.detail.taskId) {
      const { taskId, action } = event.detail;
      
      this._logger.debug(`Received task event for task ${taskId}: ${event.type}`);
      
      if (event.type === 'analysisTaskCreated') {
        this.monitorAnalysisTask(taskId);
      }
    }
  }

  /**
   * Monitor an analysis task
   * @param {string} taskId - Task ID to monitor
   */
  monitorAnalysisTask(taskId) {
    if (!taskId) {
      this._logger.warn('Attempted to monitor task with no task ID');
      return;
    }
    
    // Create task state object if not already monitoring
    const task = { id: taskId };
    if (!this._activeTasks.has(task)) {
      const state = this._trackTask(task, {
        id: taskId,
        status: 'pending',
        progress: 0,
        error: null
      });
      
      // Start checking status with a small initial delay
      this._scheduleTaskRetry(task, () => this._checkTaskStatus(taskId));
      
      this._logger.debug(`Started monitoring task: ${taskId}`);
    } else {
      this._logger.debug(`Already monitoring task: ${taskId}`);
    }
  }

  /**
   * Check status of a task
   * @param {string} taskId - Task ID to check
   * @private
   */
  async _checkTaskStatus(taskId) {
    const task = { id: taskId };
    const state = this._activeTasks.get(task);
    if (!state) return; // No longer monitoring this task
    
    try {
      if (this._isCircuitBreakerOpen()) {
        throw new Error('Circuit breaker is open');
      }

      if (!this._apiService) {
        throw new Error('API service not available');
      }
      
      // Use the documented Analysis Status API
      const response = await this._apiService.fetchAPI(`/api/v1/analysis/status/${taskId}`);
      
      if (response.success) {
        // Update task state
        const previousStatus = state.status;
        state.status = response.status;
        state.progress = response.progress || 0;
        state.error = response.error || null;
        
        this._logger.debug(`Task ${taskId} status: ${response.status}, progress: ${response.progress}`);
        
        // Notify listeners of status change
        if (previousStatus !== response.status) {
          this._notifyTaskListeners(taskId, state);
        }
        
        // Handle completed/error tasks
        if (response.status === 'completed') {
          this._logger.info(`Analysis task ${taskId} completed successfully`);
          this._onAnalysisCompleted(taskId, response);
          return;
        } else if (response.status === 'error') {
          this._logger.error(`Analysis task ${taskId} failed: ${response.error}`);
          this._onAnalysisError(taskId, response);
          return;
        }
        
        // If task is still running, schedule next check
        if (response.status === 'enqueued' || response.status === 'processing') {
          this._scheduleTaskRetry(task, () => this._checkTaskStatus(taskId));
        }
      } else {
        throw new Error(response.error || 'Failed to check task status');
      }
    } catch (error) {
      this._logger.error(`Error checking status for task ${taskId}:`, error);
      this._recordFailure();
      this._scheduleTaskRetry(task, () => this._checkTaskStatus(taskId));
    }
  }

  /**
   * Notify all task listeners about task updates
   * @param {string} taskId - Task ID
   * @param {object} taskState - Current task state
   * @private
   */
  _notifyTaskListeners(taskId, taskState) {
    const eventData = {
      taskId,
      status: taskState.status,
      progress: taskState.progress,
      error: taskState.error
    };
    
    this._logger.debug(`Notifying task listeners about task ${taskId} update`);
    
    // Call each listener with event data
    this._taskListeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        this._logger.error('Error in task listener:', error);
      }
    });
  }

  /**
   * Handle analysis task completion
   * @param {string} taskId - Task ID
   * @param {object} response - API response
   * @private
   */
  _onAnalysisCompleted(taskId, response) {
    try {
      if (this._notificationService) {
        this._notificationService.showNotification(
          'Analysis Complete',
          'The page analysis has been completed successfully.',
          'success'
        );
      }
      
      if (typeof document !== 'undefined') {
        const event = new CustomEvent('analysisCompleted', {
          detail: { taskId, result: response }
        });
        document.dispatchEvent(event);
      }
      
      this._logger.info(`Analysis task ${taskId} completion handled successfully`);
    } catch (error) {
      this._logger.error(`Error handling completion of task ${taskId}:`, error);
    }
  }

  /**
   * Handle analysis task error
   * @param {string} taskId - Task ID
   * @param {object} response - API response
   * @private
   */
  _onAnalysisError(taskId, response) {
    try {
      if (this._notificationService) {
        this._notificationService.showNotification(
          'Analysis Failed',
          `Error: ${response.error || 'Unknown error'}`,
          'error'
        );
      }
      
      if (typeof document !== 'undefined') {
        const event = new CustomEvent('analysisError', {
          detail: { taskId, error: response.error }
        });
        document.dispatchEvent(event);
      }
      
      this._logger.info(`Analysis task ${taskId} error handled`);
    } catch (error) {
      this._logger.error(`Error handling failure of task ${taskId}:`, error);
    }
  }

  /**
   * Get service status
   * @returns {object} Service status information
   */
  getStatus() {
    return {
      ...super.getMetrics(),
      hasLogger: !!this._logger,
      hasDependencies: !!this._apiService
    };
  }
}