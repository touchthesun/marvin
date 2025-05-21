// src/components/panels/tasks/tasks-panel.js
import { LogManager } from '../../../utils/log-manager.js'; 
import { container } from '@core/dependency-container.js';

/**
 * Tasks Panel Component
 * Manages and displays task execution and monitoring
 */
const TasksPanel = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Panel state
  activeTasks: [],
  completedTasks: [],
  
  /**
   * Initialize the tasks panel
   * @returns {Promise<boolean>} Success state
   */
  async initTasksPanel() {
    // Create logger directly
    const logger = new LogManager({
      context: 'tasks-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.info('Initializing tasks panel');
    
    try {
      // Check if already initialized
      if (this.initialized) {
        logger.debug('Tasks panel already initialized');
        return true;
      }
      
      // Get dependencies with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      // Initialize state
      this.activeTasks = [];
      this.completedTasks = [];
      
      // Set up event listeners for task management
      this.setupTaskEventListeners(logger);
      
      // Initial load of tasks
      await this.refreshAllTasks(logger);
      
      this.initialized = true;
      logger.info('Tasks panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize tasks panel:', error);
      
      // Get notification service with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Failed to initialize tasks panel', 'error');
      return false;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(logger, serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Set up event listeners for task management buttons
   * @param {LogManager} logger - Logger instance
   */
  setupTaskEventListeners(logger) {
    logger.debug('Setting up task event listeners');
    
    try {
      // Set up refresh button
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        const refreshHandler = () => this.refreshData(logger);
        refreshBtn.addEventListener('click', refreshHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: refreshBtn,
          type: 'click',
          listener: refreshHandler
        });
        
        logger.debug('Refresh button listener attached');
      } else {
        logger.warn('Refresh button not found in DOM');
      }
      
      // Set up cancel all button
      const cancelAllBtn = document.getElementById('cancelAllBtn');
      if (cancelAllBtn) {
        const cancelAllHandler = () => this.cancelAllTasks(logger);
        cancelAllBtn.addEventListener('click', cancelAllHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: cancelAllBtn,
          type: 'click',
          listener: cancelAllHandler
        });
        
        logger.debug('Cancel all button listener attached');
      } else {
        logger.warn('Cancel all button not found in DOM');
      }
      
      // Set up clear completed button
      const clearCompletedBtn = document.getElementById('clearCompletedBtn');
      if (clearCompletedBtn) {
        const clearCompletedHandler = () => this.clearCompletedTasks(logger);
        clearCompletedBtn.addEventListener('click', clearCompletedHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: clearCompletedBtn,
          type: 'click',
          listener: clearCompletedHandler
        });
        
        logger.debug('Clear completed button listener attached');
      } else {
        logger.warn('Clear completed button not found in DOM');
      }
      
      logger.debug('Task event listeners set up successfully');
    } catch (error) {
      logger.error('Error setting up task event listeners:', error);
      throw error;
    }
  },
  
  /**
   * Refresh all tasks (active and completed)
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<boolean>} Success state
   */
  async refreshAllTasks(logger) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
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
      this.activeTasks = tasks.filter(task => 
        task.status === 'pending' || 
        task.status === 'processing' || 
        task.status === 'analyzing'
      );
      
      this.completedTasks = tasks.filter(task => 
        task.status === 'complete' || 
        task.status === 'error'
      );
      
      logger.debug(`Active tasks: ${this.activeTasks.length}, Completed tasks: ${this.completedTasks.length}`);
      
      // Update UI
      this.renderActiveTasks(logger);
      this.renderCompletedTasks(logger);
      
      // Update counts
      this.updateTaskCounts(logger);
      
      return true;
    } catch (error) {
      logger.error('Error refreshing tasks:', error);
      
      // Update UI with error state
      if (activeTasksList) {
        activeTasksList.innerHTML = `<div class="error">Error: ${error.message}</div>`;
      }
      
      if (completedTasksList) {
        completedTasksList.innerHTML = `<div class="error">Error: ${error.message}</div>`;
      }
      
      notificationService.showNotification(`Error refreshing tasks: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Update task count indicators in the UI
   * @param {LogManager} logger - Logger instance
   */
  updateTaskCounts(logger) {
    logger.debug('Updating task counts');
    
    try {
      const activeCountEl = document.getElementById('active-count');
      const completedCountEl = document.getElementById('completed-count');
      
      if (activeCountEl) {
        activeCountEl.textContent = this.activeTasks.length;
      }
      
      if (completedCountEl) {
        completedCountEl.textContent = this.completedTasks.length;
      }
      
      logger.debug(`Updated task counts: ${this.activeTasks.length} active, ${this.completedTasks.length} completed`);
    } catch (error) {
      logger.error('Error updating task counts:', error);
    }
  },
  
  /**
   * General data refresh function with notification feedback
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async refreshData(logger) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    logger.info('Manual refresh requested');
    
    notificationService.showNotification('Refreshing tasks...', 'info');
    
    try {
      await this.refreshAllTasks(logger);
      notificationService.showNotification('Tasks refreshed successfully', 'success');
    } catch (error) {
      logger.error('Error refreshing data:', error);
      notificationService.showNotification(`Error refreshing data: ${error.message}`, 'error');
    }
  },
  
  /**
   * Render active tasks in the UI
   * @param {LogManager} logger - Logger instance
   */
  renderActiveTasks(logger) {
    logger.debug(`Rendering ${this.activeTasks.length} active tasks`);
    
    try {
      const container = document.getElementById('active-tasks-list');
      if (!container) {
        logger.error('Active tasks container not found');
        return;
      }
      
      if (this.activeTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No active tasks</div>';
        return;
      }
      
      container.innerHTML = '';
      
      this.activeTasks.forEach(task => {
        try {
          const taskElement = this.createActiveTaskElement(logger, task);
          container.appendChild(taskElement);
        } catch (error) {
          logger.error(`Error rendering active task ${task.id}:`, error);
        }
      });
    } catch (error) {
      logger.error('Error rendering active tasks:', error);
    }
  },
  
  /**
   * Create DOM element for an active task
   * @param {LogManager} logger - Logger instance
   * @param {Object} task - Task data object
   * @returns {HTMLElement} Task DOM element
   */
  createActiveTaskElement(logger, task) {
    logger.debug(`Creating element for active task ${task.id}`);
    
    try {
      const taskElement = document.createElement('div');
      taskElement.className = 'task-item';
      taskElement.dataset.taskId = task.id;
      
      // Format progress
      const progress = task.progress || 0;
      const progressPercent = Math.round(progress * 100);
      
      // Format time
      const startTime = new Date(task.created_at || task.timestamp);
      const timeAgo = this.formatTimeAgo(startTime);
      
      // Create task HTML
      taskElement.innerHTML = `
        <div class="task-header">
          <div class="task-title">${this.truncateText(task.url || 'Unknown URL', 40)}</div>
          <div class="task-actions">
            <button class="btn-icon cancel-task" title="Cancel Task">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="task-details">
          <div class="task-status">${this.formatTaskStatus(task.status)}</div>
          <div class="task-time">${timeAgo}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      `;
      
      // Add event listeners
      const cancelButton = taskElement.querySelector('.cancel-task');
      if (cancelButton) {
        const cancelHandler = () => {
          this.cancelTask(logger, task.id);
        };
        
        cancelButton.addEventListener('click', cancelHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: cancelButton,
          type: 'click',
          listener: cancelHandler
        });
      }
      
      return taskElement;
    } catch (error) {
      logger.error(`Error creating active task element for ${task.id}:`, error);
      throw error;
    }
  },
  
  /**
   * Render completed tasks in the UI
   * @param {LogManager} logger - Logger instance
   */
  renderCompletedTasks(logger) {
    logger.debug(`Rendering ${this.completedTasks.length} completed tasks`);
    
    try {
      const container = document.getElementById('completed-tasks-list');
      if (!container) {
        logger.error('Completed tasks container not found');
        return;
      }
      
      if (this.completedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed tasks</div>';
        return;
      }
      
      container.innerHTML = '';
      
      // Sort by completion time (most recent first)
      const sortedTasks = [...this.completedTasks].sort((a, b) => {
        const timeA = new Date(a.completed_at || a.timestamp);
        const timeB = new Date(b.completed_at || b.timestamp);
        return timeB - timeA;
      });
      
      sortedTasks.forEach(task => {
        try {
          const taskElement = this.createCompletedTaskElement(logger, task);
          container.appendChild(taskElement);
        } catch (error) {
          logger.error(`Error rendering completed task ${task.id}:`, error);
        }
      });
    } catch (error) {
      logger.error('Error rendering completed tasks:', error);
    }
  },
  
  /**
   * Create DOM element for a completed task
   * @param {LogManager} logger - Logger instance
   * @param {Object} task - Task data object
   * @returns {HTMLElement} Task DOM element
   */
  createCompletedTaskElement(logger, task) {
    logger.debug(`Creating element for completed task ${task.id}`);
    
    try {
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
      const timeAgo = this.formatTimeAgo(completionTime);
      
      taskElement.innerHTML = `
        <div class="task-header">
          <div class="task-title">${this.truncateText(task.url || 'Unknown URL', 40)}</div>
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
          <div class="task-status">${this.formatTaskStatus(task.status)}</div>
          <div class="task-time">${timeAgo}</div>
        </div>
        ${task.status === 'error' ? 
          `<div class="task-error-message">${task.error || 'Unknown error'}</div>` : ''}
      `;
      
      // Add event listeners
      if (task.status === 'error') {
        const retryButton = taskElement.querySelector('.retry-task');
        if (retryButton) {
          const retryHandler = () => {
            this.retryTask(logger, task.id);
          };
          
          retryButton.addEventListener('click', retryHandler);
          
          // Track this listener for cleanup
          this._eventListeners.push({
            element: retryButton,
            type: 'click',
            listener: retryHandler
          });
        }
      }
      
      const removeButton = taskElement.querySelector('.remove-task');
      if (removeButton) {
        const removeHandler = () => {
          this.removeTask(logger, task.id);
        };
        
        removeButton.addEventListener('click', removeHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: removeButton,
          type: 'click',
          listener: removeHandler
        });
      }
      
      return taskElement;
    } catch (error) {
      logger.error(`Error creating completed task element for ${task.id}:`, error);
      throw error;
    }
  },
  
  /**
   * Format task status for display
   * @param {string} status - Raw task status
   * @returns {string} Formatted status text
   */
  formatTaskStatus(status) {
    if (!status) return 'Unknown';
    
    const statusMap = {
      'pending': 'Pending',
      'processing': 'Processing',
      'analyzing': 'Analyzing',
      'complete': 'Completed',
      'error': 'Failed'
    };
    
    return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
  },
  
  /**
   * Format time ago
   * @param {Date} date - Date to format
   * @returns {string} Formatted time ago string
   */
  formatTimeAgo(date) {
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
  },
  
  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  },
  
  /**
   * Cancel a task
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - ID of task to cancel
   * @returns {Promise<boolean>} Success state
   */
  async cancelTask(logger, taskId) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (!taskId) {
      logger.warn('Attempted to cancel task with no ID');
      return false;
    }
    
    logger.info(`Cancelling task: ${taskId}`);
    notificationService.showNotification(`Cancelling task...`, 'info');
    
    try {
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (!backgroundPage || !backgroundPage.marvin) {
        throw new Error('Background page or marvin object not available');
      }
      
      const result = await backgroundPage.marvin.cancelTask(taskId);
      
      if (result) {
        // Remove from active tasks
        this.activeTasks = this.activeTasks.filter(task => task.id !== taskId);
        this.renderActiveTasks(logger);
        
        // Update count
        this.updateTaskCounts(logger);
        
        // Show notification
        notificationService.showNotification('Task cancelled successfully', 'success');
        logger.info(`Task ${taskId} cancelled successfully`);
        return true;
      } else {
        throw new Error('Failed to cancel task');
      }
    } catch (error) {
      logger.error(`Error cancelling task ${taskId}:`, error);
      notificationService.showNotification(`Error cancelling task: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Retry a failed task
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - ID of task to retry
   * @returns {Promise<boolean>} Success state
   */
  async retryTask(logger, taskId) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (!taskId) {
      logger.warn('Attempted to retry task with no ID');
      return false;
    }
    
    logger.info(`Retrying task: ${taskId}`);
    notificationService.showNotification(`Retrying task...`, 'info');
    
    try {
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (!backgroundPage || !backgroundPage.marvin) {
        throw new Error('Background page or marvin object not available');
      }
      
      const result = await backgroundPage.marvin.retryTask(taskId);
      
      if (result) {
        // Remove from completed tasks
        this.completedTasks = this.completedTasks.filter(task => task.id !== taskId);
        this.renderCompletedTasks(logger);
        
        // Update count
        this.updateTaskCounts(logger);
        
        // Refresh active tasks to show the retried task
        await this.refreshAllTasks(logger);
        
        // Show notification
        notificationService.showNotification('Task retried successfully', 'success');
        logger.info(`Task ${taskId} retried successfully`);
        return true;
      } else {
        throw new Error('Failed to retry task');
      }
    } catch (error) {
      logger.error(`Error retrying task ${taskId}:`, error);
      notificationService.showNotification(`Error retrying task: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Remove a task from the completed list
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - ID of task to remove
   * @returns {boolean} Success state
   */
  removeTask(logger, taskId) {
    if (!taskId) {
      logger.warn('Attempted to remove task with no ID');
      return false;
    }
    
    logger.info(`Removing task from list: ${taskId}`);
    
    try {
      // Remove from completed tasks
      const previousLength = this.completedTasks.length;
      this.completedTasks = this.completedTasks.filter(task => task.id !== taskId);
      
      if (this.completedTasks.length === previousLength) {
        logger.warn(`Task ${taskId} not found in completed tasks`);
      }
      
      // Update UI
      this.renderCompletedTasks(logger);
      
      // Update count
      this.updateTaskCounts(logger);
      
      logger.debug(`Task ${taskId} removed from list`);
      return true;
    } catch (error) {
      logger.error(`Error removing task ${taskId}:`, error);
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      notificationService.showNotification(`Error removing task: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Cancel all active tasks
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<boolean>} Success state
   */
  async cancelAllTasks(logger) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (this.activeTasks.length === 0) {
      logger.info('No active tasks to cancel');
      notificationService.showNotification('No active tasks to cancel', 'info');
      return false;
    }
    
    logger.info(`Attempting to cancel all ${this.activeTasks.length} active tasks`);
    
    // Confirm with user
    if (!confirm(`Cancel all ${this.activeTasks.length} active tasks?`)) {
      logger.debug('User cancelled the operation');
      return false;
    }
    
    notificationService.showNotification(`Cancelling ${this.activeTasks.length} tasks...`, 'info', 0);
    let successCount = 0;
    
    try {
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (!backgroundPage || !backgroundPage.marvin) {
        throw new Error('Background page or marvin object not available');
      }
      
      // Process tasks one by one with progress updates
      for (let i = 0; i < this.activeTasks.length; i++) {
        const task = this.activeTasks[i];
        const progress = Math.round((i / this.activeTasks.length) * 100);
        
        notificationService.updateNotificationProgress(
          `Cancelling tasks (${i+1}/${this.activeTasks.length})...`, 
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
      await this.refreshAllTasks(logger);
      
      // Show final notification
      if (successCount === this.activeTasks.length) {
        notificationService.showNotification(`Successfully cancelled all ${successCount} tasks`, 'success');
      } else {
        notificationService.showNotification(
          `Cancelled ${successCount} of ${this.activeTasks.length} tasks`, 
          successCount > 0 ? 'warning' : 'error'
        );
      }
      
      logger.info(`Cancelled ${successCount} of ${this.activeTasks.length} tasks`);
      return successCount > 0;
    } catch (error) {
      logger.error('Error cancelling all tasks:', error);
      notificationService.showNotification(`Error cancelling tasks: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Clear all completed tasks from the UI
   * @param {LogManager} logger - Logger instance
   * @returns {boolean} Success state
   */
  clearCompletedTasks(logger) {
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (this.completedTasks.length === 0) {
      logger.info('No completed tasks to clear');
      notificationService.showNotification('No completed tasks to clear', 'info');
      return false;
    }
    
    logger.info(`Attempting to clear ${this.completedTasks.length} completed tasks`);
    
    // Confirm with user
    if (!confirm(`Clear all ${this.completedTasks.length} completed tasks?`)) {
      logger.debug('User cancelled the operation');
      return false;
    }
    
    try {
      // Clear completed tasks
      this.completedTasks = [];
      this.renderCompletedTasks(logger);
      
      // Update count
      this.updateTaskCounts(logger);
      
      // Show notification
      notificationService.showNotification('Completed tasks cleared', 'success');
      logger.info('Completed tasks cleared successfully');
      return true;
    } catch (error) {
      logger.error('Error clearing completed tasks:', error);
      notificationService.showNotification(`Error clearing tasks: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * View task result in detail
   * @param {string} taskId - ID of task to view
   * @returns {boolean} Success state
   */
  viewTaskResult(taskId) {
    const logger = new LogManager({
      context: 'tasks-panel',
      isBackgroundScript: false
    });
    
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (!taskId) {
      logger.warn('Attempted to view task with no ID');
      return false;
    }
    
    logger.info(`Viewing task result: ${taskId}`);
    
    try {
      // Find the task
      const task = [...this.activeTasks, ...this.completedTasks].find(t => t.id === taskId);
      
      if (!task) {
        logger.error(`Task not found: ${taskId}`);
        notificationService.showNotification('Task not found', 'error');
        return false;
      }
      
      // Show task details in a modal or detail view
      const detailsContainer = document.getElementById('task-details');
      if (!detailsContainer) {
        logger.error('Task details container not found');
        return false;
      }
      
      // Format dates
      const startTime = new Date(task.startTime || task.created_at || task.timestamp);
      const formattedStartTime = startTime.toLocaleString();
      
      // Create detail view
      detailsContainer.innerHTML = `
        <h2>${task.title || `Task ${task.id}`}</h2>
        <div class="detail-meta">
          <div>Status: ${this.formatTaskStatus(task.status)}</div>
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
        
        const closeHandler = () => {
          detailsContainer.style.display = 'none';
        };
        
        closeButton.addEventListener('click', closeHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: closeButton,
          type: 'click',
          listener: closeHandler
        });
        
        detailsContainer.appendChild(closeButton);
        
        // Track this element for cleanup
        this._domElements.push(closeButton);
      }
      
      logger.debug(`Task ${taskId} details displayed`);
      return true;
    } catch (error) {
      logger.error(`Error viewing task ${taskId}:`, error);
      notificationService.showNotification(`Error viewing task details: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Check if a task exists by ID
   * @param {string} taskId - ID of task to check
   * @returns {boolean} Whether the task exists
   */
  taskExists(taskId) {
    if (!taskId) return false;
    
    return [...this.activeTasks, ...this.completedTasks].some(task => task.id === taskId);
  },
  
  /**
   * Get a task by ID
   * @param {string} taskId - ID of task to get
   * @returns {Object|null} Task object or null if not found
   */
  getTaskById(taskId) {
    if (!taskId) return null;
    
    return [...this.activeTasks, ...this.completedTasks].find(task => task.id === taskId) || null;
  },
  
  /**
   * Get all active tasks
   * @returns {Array} Array of active task objects
   */
  getActiveTasks() {
    return [...this.activeTasks];
  },
  
  /**
   * Get all completed tasks
   * @returns {Array} Array of completed task objects
   */
  getCompletedTasks() {
    return [...this.completedTasks];
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'tasks-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Tasks panel not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up tasks panel resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        logger.warn(`Error clearing interval:`, error);
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
        logger.warn(`Error removing event listener:`, error);
      }
    });
    this._eventListeners = [];
    
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode && !el.id?.includes('panel')) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    this.initialized = false;
    logger.debug('Tasks panel cleanup completed');
  }
};

// Export using named export
export { TasksPanel };