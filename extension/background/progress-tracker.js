// progress-tracker.js
// Utility for tracking progress of background tasks and operations

/**
 * Class for tracking progress of asynchronous operations
 */
export class ProgressTracker {
  /**
   * Create a new progress tracker
   * @param {string} id - Unique identifier for this tracker
   * @param {object} options - Configuration options
   * @param {string[]} options.stages - Named stages for this operation
   * @param {boolean} options.persistence - Whether to persist state to storage (default: true)
   */
  constructor(id, options = {}) {
    this.id = id;
    this.stages = options.stages || [];
    this.currentStage = 0;
    this.progress = 0;
    this.status = 'pending';
    this.startTime = Date.now();
    this.listeners = [];
    this.history = [];
    this.persistenceEnabled = options.persistence !== false;
    
    if (this.persistenceEnabled) {
      this._loadFromStorage();
    }
  }
  
  /**
   * Update progress and notify listeners
   * @param {number} progress - Progress value (0-100)
   * @param {number|null} stage - Stage index (optional)
   * @param {string|null} status - Status string (optional)
   * @returns {object} Update data
   */
  update(progress, stage = null, status = null) {
    this.progress = progress;
    if (stage !== null) this.currentStage = stage;
    if (status !== null) this.status = status;
    
    const update = {
      id: this.id,
      progress: this.progress,
      stage: this.currentStage,
      stageName: this.stages[this.currentStage] || '',
      status: this.status,
      timestamp: Date.now()
    };
    
    this.history.push(update);
    this._notifyListeners(update);
    
    if (this.persistenceEnabled) {
      this._saveToStorage();
    }
    
    return update;
  }
  
  /**
   * Add a listener for progress updates
   * @param {function} callback - Function to call on updates
   * @returns {ProgressTracker} this instance for chaining
   */
  addListener(callback) {
    this.listeners.push(callback);
    return this;
  }
  
  /**
   * Remove a listener
   * @param {function} callback - Listener to remove
   * @returns {ProgressTracker} this instance for chaining
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
    return this;
  }
  
  /**
   * Get current status information
   * @returns {object} Current status
   */
  getStatus() {
    return {
      id: this.id,
      progress: this.progress,
      stage: this.currentStage,
      stageName: this.stages[this.currentStage] || '',
      status: this.status,
      startTime: this.startTime,
      elapsedTime: Date.now() - this.startTime,
      history: this.history
    };
  }
  
  /**
   * Mark the operation as complete
   * @param {string} message - Optional completion message
   * @returns {object} Update data
   */
  complete(message = 'Completed successfully') {
    return this.update(100, this.stages.length - 1, 'complete');
  }
  
  /**
   * Mark the operation as failed
   * @param {string} error - Error message or object
   * @returns {object} Update data
   */
  fail(error) {
    const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
    this.errors = this.errors || [];
    this.errors.push({
      message: errorMessage,
      timestamp: Date.now(),
      stage: this.currentStage
    });
    
    return this.update(this.progress, this.currentStage, 'error');
  }
  
  /**
   * Attempt to retry a failed operation
   * @returns {object} Update data
   */
  retry() {
    if (this.status !== 'error') {
      return this.getStatus();
    }
    
    this.retryCount = (this.retryCount || 0) + 1;
    return this.update(this.progress, this.currentStage, 'retrying');
  }
  
  /**
   * Reset the progress tracker to initial state
   * @returns {object} Update data
   */
  reset() {
    this.progress = 0;
    this.currentStage = 0;
    this.status = 'pending';
    this.startTime = Date.now();
    this.history = [];
    this.errors = [];
    this.retryCount = 0;
    
    const update = {
      id: this.id,
      progress: 0,
      stage: 0,
      stageName: this.stages[0] || '',
      status: 'pending',
      timestamp: Date.now()
    };
    
    this._notifyListeners(update);
    
    if (this.persistenceEnabled) {
      this._saveToStorage();
    }
    
    return update;
  }
  
  /**
   * Cancel the operation
   * @param {string} reason - Reason for cancellation
   * @returns {object} Update data
   */
  cancel(reason = 'User cancelled') {
    this.cancelReason = reason;
    return this.update(this.progress, this.currentStage, 'cancelled');
  }
  
  /**
   * Notify all listeners of update
   * @private
   * @param {object} update - Update data
   */
  _notifyListeners(update) {
    this.listeners.forEach(callback => {
      try {
        callback(update);
      } catch (e) {
        console.error('Error in progress listener:', e);
      }
    });
  }
  
  /**
   * Save state to storage
   * @private
   */
  _saveToStorage() {
    try {
      const key = `progress_${this.id}`;
      chrome.storage.local.set({ [key]: this.getStatus() });
    } catch (e) {
      console.error('Error saving progress to storage:', e);
    }
  }
  
  /**
   * Load state from storage
   * @private
   */
  _loadFromStorage() {
    try {
      const key = `progress_${this.id}`;
      chrome.storage.local.get(key, (result) => {
        if (result && result[key]) {
          const status = result[key];
          this.progress = status.progress;
          this.currentStage = status.stage;
          this.status = status.status;
          this.startTime = status.startTime;
          this.history = status.history || [];
          this.errors = status.errors || [];
          this.retryCount = status.retryCount || 0;
          
          // Notify listeners of restored state
          this._notifyListeners(this.getStatus());
        }
      });
    } catch (e) {
      console.error('Error loading progress from storage:', e);
    }
  }
  
  /**
   * Factory method to get or create a tracker by ID
   * @static
   * @param {string} id - Tracker ID
   * @param {object} options - Options for new tracker if created
   * @returns {Promise<ProgressTracker>} Tracker instance
   */
  static async getTracker(id, options = {}) {
    return new Promise((resolve) => {
      const key = `progress_${id}`;
      
      chrome.storage.local.get(key, (result) => {
        if (result && result[key]) {
          // Existing tracker - recreate it
          const tracker = new ProgressTracker(id, options);
          resolve(tracker);
        } else {
          // New tracker
          const tracker = new ProgressTracker(id, options);
          resolve(tracker);
        }
      });
    });
  }
  
  /**
   * Get all active trackers
   * @static
   * @returns {Promise<string[]>} List of active tracker IDs
   */
  static async getActiveTrackers() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const trackerIds = Object.keys(items)
          .filter(key => key.startsWith('progress_'))
          .map(key => key.replace('progress_', ''));
          
        resolve(trackerIds);
      });
    });
  }
}