 /**
 * MemoryMonitor class for tracking memory usage and detecting memory pressure
 * Implements memory monitoring with configurable thresholds and callbacks
 */
export class MemoryMonitor {
    constructor(options = {}) {
      this._threshold = options.threshold || 0.8; // 80% memory usage threshold
      this._interval = options.interval || 5000;  // 5 second check interval
      this._callbacks = new Set();
      this._intervalId = null;
      this._lastSnapshot = null;
    }
  
    /**
     * Start monitoring memory usage
     */
    start() {
      if (this._intervalId) return;
      
      this._intervalId = setInterval(() => {
        const snapshot = this._takeSnapshot();
        this._analyzeMemoryUsage(snapshot);
      }, this._interval);
    }
  
    /**
     * Stop monitoring memory usage
     */
    stop() {
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
    }
  
    /**
     * Register a callback to be called when memory pressure is detected
     * @param {Function} callback - Function to call with memory snapshot when pressure is detected
     * @returns {Function} - Function to unregister the callback
     */
    onMemoryPressure(callback) {
      this._callbacks.add(callback);
      return () => this._callbacks.delete(callback);
    }
  
    /**
     * Take a snapshot of current memory usage
     * @returns {Object|null} Memory usage snapshot or null if not available
     * @private
     */
    _takeSnapshot() {
      if (!performance?.memory) return null;
      
      return {
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
  
    /**
     * Analyze memory usage and trigger callbacks if pressure is detected
     * @param {Object} snapshot - Memory usage snapshot
     * @private
     */
    _analyzeMemoryUsage(snapshot) {
      if (!snapshot) return;
      
      const usageRatio = snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit;
      if (usageRatio > this._threshold) {
        this._callbacks.forEach(callback => callback(snapshot));
      }
      
      this._lastSnapshot = snapshot;
    }
  
    /**
     * Get the last memory snapshot
     * @returns {Object|null} Last memory snapshot or null if none available
     */
    getLastSnapshot() {
      return this._lastSnapshot;
    }
  
    /**
     * Get current memory usage
     * @returns {Object|null} Current memory usage or null if not available
     */
    getCurrentMemoryUsage() {
      return this._takeSnapshot();
    }
  }