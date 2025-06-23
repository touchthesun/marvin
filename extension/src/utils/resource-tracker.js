 /**
 * ResourceTracker class for managing and cleaning up resources
 * Tracks event listeners, timeouts, intervals, and DOM references
 */
export class ResourceTracker {
    constructor() {
      this._eventListeners = new Map();
      this._timeouts = new WeakMap();
      this._intervals = new WeakMap();
      this._domRefs = new WeakSet();
      this._memoryMonitor = null;
      this._operations = new Map();
    }
  
    /**
     * Track an event listener for later cleanup
     * @param {EventTarget} target - The event target
     * @param {string} type - The event type
     * @param {Function} handler - The event handler
     */
    trackEventListener(target, type, handler) {
      if (!this._eventListeners.has(target)) {
        this._eventListeners.set(target, new Map());
      }
      const handlers = this._eventListeners.get(target);
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type).add(handler);
      target.addEventListener(type, handler);
    }
  
    /**
     * Track a timeout for later cleanup
     * @param {Function} callback - The timeout callback
     * @param {number} delay - The timeout delay
     * @returns {number} The timeout ID
     */
    trackTimeout(callback, delay) {
      const id = setTimeout(callback, delay);
      this._timeouts.set(callback, id);
      return id;
    }
  
    /**
     * Track an interval for later cleanup
     * @param {Function} callback - The interval callback
     * @param {number} delay - The interval delay
     * @returns {number} The interval ID
     */
    trackInterval(callback, delay) {
      const id = setInterval(callback, delay);
      this._intervals.set(callback, id);
      return id;
    }
  
    /**
     * Track a DOM element for later cleanup
     * @param {Element} element - The DOM element to track
     */
    trackDOMElement(element) {
      this._domRefs.add(element);
    }

    /**
     * Track an async operation for monitoring and cleanup
     * @param {string} name - The name of the operation
     * @param {Function} operation - The async operation to track
     * @returns {Promise} The result of the operation
     */
    async trackOperation(name, operation) {
      const startTime = performance.now();
      const startMemory = performance.memory?.usedJSHeapSize;
      
      try {
        const result = await operation();
        return result;
      } finally {
        const endTime = performance.now();
        const endMemory = performance.memory?.usedJSHeapSize;
        
        this._operations.set(name, {
          duration: endTime - startTime,
          memoryDelta: endMemory - startMemory,
          timestamp: Date.now()
        });
      }
    }


    async cleanupNonEssential() {
      // Clear non-critical resources
      for (const [target, handlers] of this._eventListeners) {
        for (const [type, typeHandlers] of handlers) {
          if (!this._isCriticalEvent(type)) {
            for (const handler of typeHandlers) {
              target.removeEventListener(type, handler);
            }
            handlers.delete(type);
          }
        }
      }
    }

    _isCriticalEvent(type, context) {
      const criticalEvents = new Set([
        'error', 'unload', 'beforeunload', 'visibilitychange',
        'storage', 'message', 'focus', 'blur', 'resize', 'scroll'
      ]);
      
      return criticalEvents.has(type) || 
             (context && context.isCritical && context.isCritical(type));
    }
  
    /**
     * Clean up all tracked resources
     */
    async cleanup() {
      // Remove event listeners
      for (const [target, handlers] of this._eventListeners) {
        for (const [type, typeHandlers] of handlers) {
          for (const handler of typeHandlers) {
            target.removeEventListener(type, handler);
          }
        }
      }
      this._eventListeners.clear();
      this._timeouts = new WeakMap();
      this._intervals = new WeakMap();
      this._domRefs = new WeakSet();
      this._operations.clear();
    }

    
  
    /**
     * Get the number of tracked resources
     * @returns {Object} Counts of tracked resources
     */
    getResourceCount() {
      return {
        eventListeners: Array.from(this._eventListeners.values())
          .reduce((sum, handlers) => sum + handlers.size, 0),
        timeouts: this._timeouts.size,
        intervals: this._intervals.size,
        domRefs: this._domRefs.size,
        operations: this._operations.size
      };
    }
  }