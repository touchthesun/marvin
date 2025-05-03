// analysis-queue.js
// Manages queue of URL analysis tasks
import { ProgressTracker } from './progress-tracker.js';
import { ApiClient } from './api-client.js';

/**
 * Manages a queue of analysis tasks
 */
export class AnalysisQueue {
  /**
   * Create a new analysis queue
   * @param {ApiClient} apiClient - API client instance
   * @param {object} options - Configuration options
   */
  constructor(apiClient, options = {}) {
    this.apiClient = apiClient;
    this.maxConcurrent = options.maxConcurrent || 2;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    this.activeTaskIds = new Set();
    this.queue = [];
    this.isProcessing = false;
    
    // Load state from storage
    this._loadState();
    
    // Start monitoring active tasks
    this._startMonitoring();
  }
  
  /**
   * Queue a URL for analysis
   * @param {string} url - URL to analyze
   * @param {object} options - Analysis options
   * @returns {Promise<string>} Task ID
   */
  async queueUrl(url, options = {}) {
    // Generate a task ID
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create a progress tracker
    const stages = ['queued', 'preparing', 'analyzing', 'embedding', 'complete'];
    const tracker = new ProgressTracker(taskId, { stages });
    
    // Initial update
    tracker.update(0, 0, 'queued');
    
    // Queue the task
    const task = {
      id: taskId,
      url,
      options,
      retries: 0,
      queuedAt: Date.now(),
      tracker
    };
    
    this.queue.push(task);
    this._saveState();
    
    // Start processing if not already
    if (!this.isProcessing) {
      this._processQueue();
    }
    
    return taskId;
  }
  
  /**
   * Queue multiple URLs for analysis
   * @param {string[]} urls - URLs to analyze
   * @param {object} options - Analysis options
   * @returns {Promise<string[]>} Array of task IDs
   */
  async queueBatch(urls, options = {}) {
    // Create a batch ID
    const batchId = `batch_${Date.now()}`;
    
    // Queue each URL
    const taskIds = [];
    
    for (const url of urls) {
      const taskId = await this.queueUrl(url, {
        ...options,
        batchId
      });
      
      taskIds.push(taskId);
    }
    
    // Create a batch tracker
    const batchTracker = new ProgressTracker(batchId, {
      stages: ['queuing', 'processing', 'complete']
    });
    
    batchTracker.update(0, 0, 'queuing');
    
    // Save batch info
    await chrome.storage.local.set({
      [`batch_${batchId}`]: {
        id: batchId,
        taskIds,
        createdAt: Date.now(),
        status: 'queued'
      }
    });
    
    // Update batch status
    batchTracker.update(100, 1, 'processing');
    
    return {
      batchId,
      taskIds
    };
  }
  
  /**
   * Get status of a task
   * @param {string} taskId - Task ID
   * @returns {Promise<object>} Task status
   */
  async getTaskStatus(taskId) {
    // Check if we have a tracker for this task
    const tracker = await ProgressTracker.getTracker(taskId);
    return tracker.getStatus();
  }
  
  /**
   * Get status of a batch
   * @param {string} batchId - Batch ID
   * @returns {Promise<object>} Batch status
   */
  async getBatchStatus(batchId) {
    return new Promise((resolve) => {
      chrome.storage.local.get([`batch_${batchId}`], async (result) => {
        const batchData = result[`batch_${batchId}`];
        
        if (!batchData) {
          resolve({ error: 'Batch not found' });
          return;
        }
        
        // Get status of each task
        const taskStatuses = [];
        
        for (const taskId of batchData.taskIds) {
          const status = await this.getTaskStatus(taskId);
          taskStatuses.push(status);
        }
        
        // Calculate overall progress
        const totalProgress = taskStatuses.reduce(
          (sum, status) => sum + status.progress, 
          0
        );
        
        const averageProgress = taskStatuses.length > 0 
          ? totalProgress / taskStatuses.length 
          : 0;
        
        // Determine batch status
        let batchStatus = 'processing';
        const completedTasks = taskStatuses.filter(s => s.status === 'complete').length;
        const errorTasks = taskStatuses.filter(s => s.status === 'error').length;
        
        if (completedTasks === taskStatuses.length) {
          batchStatus = 'complete';
        } else if (errorTasks > 0) {
          batchStatus = 'partial';
        }
        
        resolve({
          id: batchId,
          status: batchStatus,
          progress: averageProgress,
          taskCount: taskStatuses.length,
          completedCount: completedTasks,
          errorCount: errorTasks,
          tasks: taskStatuses
        });
      });
    });
  }
  
  /**
   * Get all active analysis tasks
   * @returns {Promise<object[]>} Array of task statuses
   */
  async getActiveTasks() {
    const taskIds = Array.from(this.activeTaskIds);
    const queuedTasks = this.queue.map(task => task.id);
    
    const allTaskIds = [...new Set([...taskIds, ...queuedTasks])];
    
    const statuses = [];
    
    for (const taskId of allTaskIds) {
      const status = await this.getTaskStatus(taskId);
      statuses.push(status);
    }
    
    return statuses;
  }
  
  /**
   * Cancel a task
   * @param {string} taskId - Task ID to cancel
   * @returns {Promise<boolean>} Success
   */
  async cancelTask(taskId) {
    // Remove from queue if not started
    const queueIndex = this.queue.findIndex(task => task.id === taskId);
    
    if (queueIndex !== -1) {
      const task = this.queue[queueIndex];
      task.tracker.cancel('User cancelled');
      this.queue.splice(queueIndex, 1);
      this._saveState();
      return true;
    }
    
    // If active, try to cancel on server
    if (this.activeTaskIds.has(taskId)) {
      try {
        // Get tracker
        const tracker = await ProgressTracker.getTracker(taskId);
        
        // Mark as cancelled in our tracking
        tracker.cancel('User cancelled');
        
        // Try to cancel on server - this may or may not be supported by the API
        try {
          await this.apiClient.request('POST', `/api/v1/analysis/cancel/${taskId}`);
        } catch (e) {
          console.warn('Server does not support cancellation, but task marked as cancelled locally');
        }
        
        // Remove from active tasks
        this.activeTaskIds.delete(taskId);
        return true;
      } catch (e) {
        console.error('Error cancelling task:', e);
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Retry a failed task
   * @param {string} taskId - Task ID to retry
   * @returns {Promise<boolean>} Success
   */
  async retryTask(taskId) {
    try {
      // Get tracker
      const tracker = await ProgressTracker.getTracker(taskId);
      const status = tracker.getStatus();
      
      // Only retry failed tasks
      if (status.status !== 'error') {
        return false;
      }
      
      // Check if we still have the original task details
      const taskData = await this._getTaskData(taskId);
      
      if (!taskData) {
        console.error('Cannot retry task: original task data not found');
        return false;
      }
      
      // Reset tracker
      tracker.reset();
      tracker.update(0, 0, 'queued');
      
      // Re-queue the task
      const task = {
        id: taskId,
        url: taskData.url,
        options: taskData.options,
        retries: (taskData.retries || 0) + 1,
        queuedAt: Date.now(),
        tracker
      };
      
      this.queue.push(task);
      this._saveState();
      
      // Start processing if not already
      if (!this.isProcessing) {
        this._processQueue();
      }
      
      return true;
    } catch (e) {
      console.error('Error retrying task:', e);
      return false;
    }
  }
  
  /**
   * Process the queue
   * @private
   */
  async _processQueue() {
    if (this.queue.length === 0 || this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Process tasks until queue is empty
      while (this.queue.length > 0) {
        // Check if we can start more tasks
        if (this.activeTaskIds.size >= this.maxConcurrent) {
          // Wait for active tasks to complete
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
          continue;
        }
        
        // Get next task
        const task = this.queue.shift();
        this._saveState();
        
        // Start task
        this._startTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Start a task
   * @private
   * @param {object} task - Task to start
   */
  async _startTask(task) {
    const { id, url, options, tracker } = task;
    
    try {
      // Update tracker
      tracker.update(10, 1, 'preparing');
      
      // Save task data for potential retries
      await this._saveTaskData(id, { url, options, retries: task.retries });
      
      // Mark as active
      this.activeTaskIds.add(id);
      
      // Prepare request data
      const requestData = {
        url,
        context: options.context || 'EXTENSION'
      };
      
      // Add browser context information if available
      if (options.tabId) requestData.tab_id = options.tabId;
      if (options.windowId) requestData.window_id = options.windowId;
      if (options.content) requestData.content = options.content;
      
      // Submit to analysis API
      tracker.update(20, 1, 'submitting');
      
      const response = await this.apiClient.request(
        'POST', 
        '/api/v1/analysis/analyze', 
        requestData
      );
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Analysis request failed');
      }
      
      // Get task ID from response
      const analysisTaskId = response.data.task_id;
      
      // Save API task ID for monitoring
      await this._saveTaskData(id, { 
        ...await this._getTaskData(id),
        analysisTaskId 
      });
      
      // Update tracker
      tracker.update(30, 2, 'analyzing');
      
      // Start monitoring task
      this._monitorTask(id, analysisTaskId);
      
    } catch (e) {
      console.error(`Error starting analysis task ${id}:`, e);
      
      // Update tracker
      tracker.fail(e.message || 'Failed to start analysis');
      
      // Remove from active tasks
      this.activeTaskIds.delete(id);
      
      // Retry if possible
      if (task.retries < this.maxRetries) {
        console.log(`Retrying task ${id} (${task.retries + 1}/${this.maxRetries})`);
        
        // Re-queue with increased retry count
        this.queue.push({
          ...task,
          retries: task.retries + 1,
          queuedAt: Date.now()
        });
        
        this._saveState();
      }
    }
  }
  
  /**
   * Monitor a running task
   * @private
   * @param {string} taskId - Local task ID
   * @param {string} analysisTaskId - Server task ID
   */
  async _monitorTask(taskId, analysisTaskId) {
    try {
      // Get tracker
      const tracker = await ProgressTracker.getTracker(taskId);
      
      // Poll for status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes at 5 second intervals
      
      while (!completed && attempts < maxAttempts) {
        try {
          // Check status
          const response = await this.apiClient.request(
            'GET',
            `/api/v1/analysis/status/${analysisTaskId}`
          );
          
          if (!response.success) {
            throw new Error(response.error?.message || 'Status check failed');
          }
          
          const status = response.data;
          
          // Map status to our tracking
          let mappedStatus = status.status;
          if (mappedStatus === 'completed') mappedStatus = 'complete';
          
          // Calculate stage
          let stage = 2; // Analyzing by default
          
          if (mappedStatus === 'complete') {
            stage = 4; // Complete
          } else if (status.progress > 0.7) {
            stage = 3; // Embedding
          }
          
          // Update tracker
          tracker.update(
            status.progress * 100,
            stage,
            mappedStatus
          );
          
          // Check if completed or failed
          if (mappedStatus === 'complete' || mappedStatus === 'error') {
            completed = true;
            
            // If error, capture the message
            if (mappedStatus === 'error') {
              tracker.fail(status.message || 'Analysis failed');
            }
            
            // Additional processing for completion if needed
            if (mappedStatus === 'complete') {
              // Optional: Trigger embedding generation directly if needed
              // await this._triggerEmbedding(taskId, analysisTaskId);
            }
          }
        } catch (e) {
          console.error(`Error checking status for task ${taskId}:`, e);
          
          // Incrementing attempts but continuing to retry
          attempts++;
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
          continue;
        }
        
        if (!completed) {
          // Wait before checking again
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
          attempts++;
        }
      }
      
      // Handle timeout
      if (!completed && attempts >= maxAttempts) {
        tracker.fail('Monitoring timed out');
      }
      
      // Clean up
      this.activeTaskIds.delete(taskId);
      
      // Update batch status if this was part of a batch
      await this._updateBatchStatus(taskId);
      
    } catch (e) {
      console.error(`Error monitoring task ${taskId}:`, e);
      
      // Clean up
      this.activeTaskIds.delete(taskId);
      
      // Get tracker and mark as failed
      try {
        const tracker = await ProgressTracker.getTracker(taskId);
        tracker.fail(e.message || 'Monitoring failed');
      } catch (trackerError) {
        console.error(`Error updating tracker for task ${taskId}:`, trackerError);
      }
    }
  }
  
  /**
   * Update batch status when a task completes
   * @private
   * @param {string} taskId - Task ID
   */
  async _updateBatchStatus(taskId) {
    // Find the batch this task belongs to
    const taskData = await this._getTaskData(taskId);
    
    if (!taskData || !taskData.options || !taskData.options.batchId) {
      return; // Not part of a batch
    }
    
    const batchId = taskData.options.batchId;
    
    // Get batch data
    const batchStatus = await this.getBatchStatus(batchId);
    
    // If all tasks are complete, update batch status
    if (batchStatus.status === 'complete') {
      const batchTracker = await ProgressTracker.getTracker(batchId);
      batchTracker.complete('All tasks completed');
    }
  }
  
  /**
   * Save queue state to storage
   * @private
   */
  _saveState() {
    // Only save minimal information
    const queueState = this.queue.map(task => ({
      id: task.id,
      url: task.url,
      options: task.options,
      retries: task.retries,
      queuedAt: task.queuedAt
    }));
    
    chrome.storage.local.set({
      'analysis_queue_state': {
        queue: queueState,
        activeTaskIds: Array.from(this.activeTaskIds),
        lastUpdated: Date.now()
      }
    });
  }
  
  /**
   * Load queue state from storage
   * @private
   */
  _loadState() {
    chrome.storage.local.get(['analysis_queue_state'], async (result) => {
      if (result && result.analysis_queue_state) {
        const state = result.analysis_queue_state;
        
        // Restore queue
        this.queue = [];
        
        for (const task of state.queue) {
          const tracker = await ProgressTracker.getTracker(task.id);
          
          this.queue.push({
            ...task,
            tracker
          });
        }
        
        // Restore active tasks
        this.activeTaskIds = new Set(state.activeTaskIds || []);
        
        // Resume processing
        if (this.queue.length > 0 && !this.isProcessing) {
          this._processQueue();
        }
      }
    });
  }
  
  /**
   * Save task data for potential retries
   * @private
   * @param {string} taskId - Task ID
   * @param {object} data - Task data
   */
  async _saveTaskData(taskId, data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [`task_data_${taskId}`]: data }, resolve);
    });
  }
  
  /**
   * Get saved task data
   * @private
   * @param {string} taskId - Task ID
   * @returns {Promise<object|null>} Task data or null
   */
  async _getTaskData(taskId) {
    return new Promise((resolve) => {
      chrome.storage.local.get([`task_data_${taskId}`], (result) => {
        resolve(result[`task_data_${taskId}`] || null);
      });
    });
  }
  
  /**
   * Start monitoring active tasks
   * @private
   */
  _startMonitoring() {
    // Check for any tasks that were active before restart
    setInterval(() => {
      this._checkForStalledTasks();
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Check for stalled tasks
   * @private
   */
  async _checkForStalledTasks() {
    // Get all active trackers
    try {
      const activeTrackerIds = await ProgressTracker.getActiveTrackers();
      
      for (const trackerId of activeTrackerIds) {
        // Skip non-task trackers
        if (!trackerId.startsWith('task_')) {
          continue;
        }
        
        // Get tracker
        const tracker = await ProgressTracker.getTracker(trackerId);
        const status = tracker.getStatus();
        
        // Check if task is stalled (in processing state for too long)
        if (status.status === 'analyzing' || status.status === 'processing') {
          const elapsedTime = Date.now() - status.startTime;
          const maxProcessingTime = 10 * 60 * 1000; // 10 minutes
          
          if (elapsedTime > maxProcessingTime) {
            // Task appears to be stalled
            console.warn(`Task ${trackerId} appears to be stalled`);
            
            // Check if we have task data
            const taskData = await this._getTaskData(trackerId);
            
            if (taskData && taskData.analysisTaskId) {
              // Try to check status on server
              try {
                const response = await this.apiClient.request(
                  'GET',
                  `/api/v1/analysis/status/${taskData.analysisTaskId}`
                );
                
                if (response.success) {
                  // Update tracker with latest status
                  const serverStatus = response.data;
                  
                  // Map status
                  let mappedStatus = serverStatus.status;
                  if (mappedStatus === 'completed') mappedStatus = 'complete';
                  
                  // Update tracker
                  tracker.update(
                    serverStatus.progress * 100,
                    status.stage,
                    mappedStatus
                  );
                } else {
                  // Could not get status, consider failed
                  tracker.fail('Task appears to be stalled');
                  this.activeTaskIds.delete(trackerId);
                }
              } catch (e) {
                console.error(`Error checking server status for task ${trackerId}:`, e);
                // Mark as failed if we can't check status
                tracker.fail('Failed to check status: ' + e.message);
                this.activeTaskIds.delete(trackerId);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error checking for stalled tasks:', e);
    }
  }}
