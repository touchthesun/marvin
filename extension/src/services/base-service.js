import { ResourceTracker } from '../utils/resource-tracker.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';

/**
 * BaseService class that provides common functionality for all services
 * Implements resource tracking, memory monitoring, and lifecycle management
 */
export class BaseService {
  constructor(options = {}) {
    this._resourceTracker = new ResourceTracker();
    this._memoryMonitor = new MemoryMonitor(options.memoryMonitor || {});
    this._initialized = false;
    this._dependencies = new Map();
    
    // Task state management
    this._activeTasks = new WeakMap();
    this._taskTimers = new WeakMap();
    this._taskListeners = new WeakSet();
    
    // Memory management
    this._maxTaskAge = options.maxTaskAge || 300000; // 5 minutes
    this._maxActiveTasks = options.maxActiveTasks || 100;
    this._maxRetryAttempts = options.maxRetryAttempts || 5;
    this._retryBackoffBase = options.retryBackoffBase || 1000;
    this._retryBackoffMax = options.retryBackoffMax || 60000;
    
    // Circuit breaker
    this._failureCount = 0;
    this._lastFailureTime = 0;
    this._circuitBreakerThreshold = options.circuitBreakerThreshold || 5;
    this._circuitBreakerTimeout = options.circuitBreakerTimeout || 60000; // 1 minute
    
    // Error boundaries
    this._errorBoundaries = new Map();
  }

  static _DEFAULT_CONFIG = {
    maxResources: 1000,
    maxMemoryUsage: 0.8,
    maxDependencyDepth: 3,
    maxCacheSize: 1000,
    maxEventListeners: 100,
    maxTimeouts: 50,
    maxIntervals: 20
  };

  _validateResourceLimits() {
    const counts = this._resourceTracker.getResourceCounts();
    const config = this.constructor._DEFAULT_CONFIG;
    
    return {
      isValid: true,
      violations: [
        counts.eventListeners > config.maxEventListeners && 'Event listener limit exceeded',
        counts.timeouts > config.maxTimeouts && 'Timeout limit exceeded',
        counts.intervals > config.maxIntervals && 'Interval limit exceeded',
        counts.cacheSize > config.maxCacheSize && 'Cache size limit exceeded'
      ].filter(Boolean)
    };
  }

  /**
   * Initialize the service
   * @throws {Error} If initialization fails
   */
  async initialize() {
    if (this._initialized) return;
    
    try {
      this._memoryMonitor.start();
      this._memoryMonitor.onMemoryPressure(this._handleMemoryPressure.bind(this));
      
      // Set up error boundaries
      this._setupErrorBoundaries();
      
      await this._performInitialization();
      this._initialized = true;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  _validateDependencies() {
    for (const [name, dep] of this._dependencies) {
      if (!dep) {
        this._logger.warn(`Missing dependency: ${name}`);
      }
    }
  }

  /**
   * Clean up the service and its resources
   */
  async cleanup() {
    if (!this._initialized) return;
    
    try {
      this._memoryMonitor.stop();
      await this._resourceTracker.cleanup();
      await this._cleanupTasks();
      await this._performCleanup();
    } finally {
      this._initialized = false;
      this._resetCircuitBreaker();
    }
  }

  /**
   * Service-specific initialization
   * Override in subclasses
   * @protected
   */
  async _performInitialization() {
    // Override in subclasses
  }

  /**
   * Service-specific cleanup
   * Override in subclasses
   * @protected
   */
  async _performCleanup() {
    // Override in subclasses
  }

  /**
   * Handle memory pressure
   * @param {Object} snapshot - Memory usage snapshot
   * @protected
   */
  async _handleMemoryPressure(snapshot) {
    const usageRatio = snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit;
    const pressureLevel = usageRatio > 0.9 ? 'high' : usageRatio > 0.8 ? 'medium' : 'low';
    
    this._logger?.warn(`Memory pressure detected (${pressureLevel})`);
    
    // Call service-specific cleanup first
    await this._performServiceSpecificCleanup(pressureLevel);
    
    // Then perform base cleanup
    switch (pressureLevel) {
      case 'high':
        await this._cleanupNonEssentialResources();
        await this._cleanupTasks();
        break;
      case 'medium':
        await this._cleanupNonEssentialResources();
        break;
    }
  }

  // Template method for service-specific cleanup
  async _performServiceSpecificCleanup(pressureLevel) {
    // Override in subclasses
  }

  /**
   * Clean up non-essential resources
   * @protected
   */
  async _cleanupNonEssentialResources() {
    // Call service-specific cleanup first
    await this._performServiceSpecificCleanup();
    
    // Then perform base cleanup
    await this._cleanupTasks();
    await this._resourceTracker.cleanupNonEssential();
  }

  /**
   * Clean up tasks and their associated resources
   * @protected
   */
  async _cleanupTasks() {
    const now = Date.now();
    
    // Clear old tasks
    for (const [task, state] of this._activeTasks) {
      if (now - state.lastChecked > this._maxTaskAge) {
        this._activeTasks.delete(task);
        const timerId = this._taskTimers.get(task);
        if (timerId) {
          clearTimeout(timerId);
          this._taskTimers.delete(task);
        }
      }
    }
    
    // Clear completed/error tasks
    for (const [task, state] of this._activeTasks) {
      if (state.status === 'completed' || state.status === 'error') {
        this._activeTasks.delete(task);
        const timerId = this._taskTimers.get(task);
        if (timerId) {
          clearTimeout(timerId);
          this._taskTimers.delete(task);
        }
      }
    }
  }

  /**
   * Track a new task
   * @param {Object} task - Task object
   * @param {Object} initialState - Initial task state
   * @protected
   */
  _trackTask(task, initialState) {
    if (this._activeTasks.size >= this._maxActiveTasks) {
      this._cleanupTasks(); // Try to make room
      if (this._activeTasks.size >= this._maxActiveTasks) {
        throw new Error('Maximum number of active tasks reached');
      }
    }
    
    const state = {
      ...initialState,
      lastChecked: Date.now(),
      attempts: 0
    };
    
    this._activeTasks.set(task, state);
    return state;
  }

  /**
   * Schedule a task retry with exponential backoff
   * @param {Object} task - Task object
   * @param {Function} retryFn - Function to retry
   * @protected
   */
  _scheduleTaskRetry(task, retryFn) {
    const state = this._activeTasks.get(task);
    if (!state) return;
    
    if (state.attempts >= this._maxRetryAttempts) {
      this._activeTasks.delete(task);
      return;
    }
    
    const delay = Math.min(
      this._retryBackoffBase * Math.pow(2, state.attempts),
      this._retryBackoffMax
    );
    
    const timerId = setTimeout(() => {
      this._taskTimers.delete(task);
      retryFn();
    }, delay);
    
    this._taskTimers.set(task, timerId);
    state.attempts++;
  }

  /**
   * Check circuit breaker status
   * @returns {boolean} True if circuit is open
   * @protected
   */
  _isCircuitBreakerOpen() {
    const now = Date.now();
    if (now - this._lastFailureTime > this._circuitBreakerTimeout) {
      this._resetCircuitBreaker();
      return false;
    }
    return this._failureCount >= this._circuitBreakerThreshold;
  }

  /**
   * Record a failure for circuit breaker
   * @protected
   */
  _recordFailure(type = 'default') {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    this._logger?.warn(`Failure recorded (${type})`);
  }

  /**
   * Reset circuit breaker
   * @protected
   */
  _resetCircuitBreaker() {
    this._failureCount = 0;
    this._lastFailureTime = 0;
  }

  /**
   * Set up error boundaries
   * @protected
   */
  _setupErrorBoundaries() {
    if (typeof window !== 'undefined') {
      this._resourceTracker.trackEventListener(
        window,
        'error',
        this._handleGlobalError.bind(this)
      );
      
      this._resourceTracker.trackEventListener(
        window,
        'unhandledrejection',
        this._handleUnhandledRejection.bind(this)
      );
    }
  }

  /**
   * Handle global errors
   * @param {ErrorEvent} event - Error event
   * @protected
   */
  _handleGlobalError(event) {
    this._logger?.error('Global error caught:', event.error);
    this._recordFailure();
  }

  /**
   * Get the service's resource tracker
   * @returns {ResourceTracker} The resource tracker instance
   */
  get resourceTracker() {
    return this._resourceTracker;
  }

  /**
   * Get the service's memory monitor
   * @returns {MemoryMonitor} The memory monitor instance
   */
  get memoryMonitor() {
    return this._memoryMonitor;
  }

  /**
   * Check if the service is initialized
   * @returns {boolean} True if the service is initialized
   */
  get isInitialized() {
    return this._initialized;
  }

  /**
   * Get service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      initialized: this._initialized,
      memoryUsage: this._memoryMonitor.getLastSnapshot(),
      resourceCounts: this._resourceTracker.getResourceCounts(),
      activeTasks: this._activeTasks.size,
      circuitBreakerStatus: {
        failureCount: this._failureCount,
        isOpen: this._isCircuitBreakerOpen()
      }
    };
  }
}