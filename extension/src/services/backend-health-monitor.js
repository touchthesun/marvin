// extension/src/services/backend-health-monitor.js
import { BaseService } from '../services/base-service.js'
import { LogManager } from '../utils/log-manager.js';

/**
 * Backend Health Monitor - Monitors backend API health and status
 * Adapted from StatusService for background script context
 */
export class BackendHealthMonitor extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    healthCheckInterval: 60000,     // 1 minute
    maxHealthHistory: 50,           // Maximum entries in health history
    healthCheckTimeout: 5000,       // Health check timeout in ms
    minCheckInterval: 5000,         // Minimum allowed check interval
    maxRetryAttempts: 3,            // Maximum health check retry attempts
    retryBackoffBase: 1000,         // Base delay for retry backoff
    retryBackoffMax: 30000,         // Maximum retry delay
    circuitBreakerThreshold: 5,     // Number of failures before circuit breaker opens
    circuitBreakerTimeout: 60000    // Circuit breaker reset timeout
  };

  /**
   * Create a new BackendHealthMonitor instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 3,
      retryBackoffBase: 1000,
      retryBackoffMax: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });

    // State initialization
    this._config = {
      ...BackendHealthMonitor._DEFAULT_CONFIG,
      ...options
    };

    // Health state
    this._backendStatus = 'unknown';
    this._lastHealthCheck = 0;
    this._checkIntervalId = null;
    this._apiService = null;
    
    // Health history for tracking
    this._healthHistory = {
      backend: []
    };
    
    // Statistics
    this._stats = {
      healthChecks: 0,
      healthSuccesses: 0,
      healthFailures: 0,
      lastHealthChange: null
    };

    // Error tracking for circuit breaker
    this._errorCounts = new Map();
    this._lastErrorTime = null;
  }
  
  /**
   * Initialize the backend health monitor
   * @returns {Promise<boolean>} Success state
   * @private
   */
  async _performInitialization() {
    try {
      // Create logger for background script context
      this._logger = new LogManager({
        context: 'backend-health-monitor',
        isBackgroundScript: true,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing backend health monitor');
      
      // Resolve dependencies
      await this._resolveDependencies();
      
      // Set up health monitoring
      await this._setupHealthMonitoring();
      
      this._logger.info('Backend health monitor initialized successfully');
      return true;
    } catch (error) {
      this._logger?.error('Error initializing backend health monitor:', error);
      throw error;
    }
  }

  /**
   * Resolve service dependencies
   * @private
   */
  async _resolveDependencies() {
    try {
      // Get API service (required)
      try {
        this._apiService = this._container.getService('apiService');
        this._logger.debug('API service resolved successfully');
      } catch (error) {
        this._logger.warn('API service not available, health checks will be limited');
        this._apiService = null;
      }
    } catch (error) {
      this._logger.warn('Error resolving dependencies:', error);
      // Continue even if dependencies can't be resolved
    }
  }
  
  /**
   * Set up health monitoring
   * @private
   */
  async _setupHealthMonitoring() {
    this._logger.debug('Setting up backend health monitoring');
    
    // Start periodic health checks
    await this._setupHealthCheckInterval();
    
    // Perform initial health check
    await this._performHealthCheck();
  }
  
  /**
   * Set up periodic health check interval
   * @private
   */
  async _setupHealthCheckInterval() {
    if (this._checkIntervalId) {
      clearInterval(this._checkIntervalId);
    }
    
    this._checkIntervalId = this._resourceTracker.trackInterval(
      () => this._handleHealthCheckInterval(),
      this._config.healthCheckInterval
    );
    
    this._logger.debug(`Health check interval set to ${this._config.healthCheckInterval}ms`);
  }
  
  /**
   * Handle health check interval
   * @private
   */
  async _handleHealthCheckInterval() {
    try {
      await this._performHealthCheck();
    } catch (error) {
      this._logger.error('Error during health check interval:', error);
    }
  }
  
  /**
   * Perform a health check
   * @private
   */
  async _performHealthCheck() {
    const now = Date.now();
    
    // Prevent too frequent checks
    if (now - this._lastHealthCheck < this._config.minCheckInterval) {
      return;
    }
    
    this._lastHealthCheck = now;
    this._stats.healthChecks++;
    
    this._logger.debug('Performing backend health check');
    
    try {
      let isHealthy = false;
      
      if (this._apiService) {
        // Use API service to check health
        const response = await this._apiService.fetchAPI('/api/v1/health', {
          method: 'GET',
          timeout: this._config.healthCheckTimeout
        });
        
        isHealthy = response.success && response.data?.status === 'ok';
      } else {
        // Fallback: direct fetch to health endpoint
        const response = await fetch('http://localhost:8000/api/v1/health', {
          method: 'GET',
          signal: AbortSignal.timeout(this._config.healthCheckTimeout)
        });
        
        if (response.ok) {
          const data = await response.json();
          isHealthy = data.status === 'ok';
        }
      }
      
      // Update health status
      const newStatus = isHealthy ? 'healthy' : 'unhealthy';
      this._updateBackendStatus(newStatus, isHealthy ? 'Health check successful' : 'Health check failed');
      
      if (isHealthy) {
        this._stats.healthSuccesses++;
        this._recordSuccess();
      } else {
        this._stats.healthFailures++;
        this._recordFailure('health_check');
      }
      
    } catch (error) {
      this._logger.error('Health check failed:', error);
      
      this._stats.healthFailures++;
      this._recordFailure('health_check');
      
      this._updateBackendStatus('unhealthy', `Health check error: ${error.message}`);
    }
  }
  
  /**
   * Update backend health status
   * @param {string} status - New status
   * @param {string} reason - Reason for status change
   * @private
   */
  _updateBackendStatus(status, reason) {
    if (this._backendStatus !== status) {
      const oldStatus = this._backendStatus;
      this._backendStatus = status;
      
      this._trackHealthStatusChange(status, reason);
      
      this._logger.info(`Backend status changed from ${oldStatus} to ${status}: ${reason}`);
      
      // Update last change timestamp
      this._stats.lastHealthChange = Date.now();
    }
  }
  
  /**
   * Track health status change
   * @param {string} status - Health status
   * @param {string} reason - Reason for change
   * @private
   */
  _trackHealthStatusChange(status, reason) {
    const entry = {
      status,
      reason,
      timestamp: Date.now()
    };
    
    this._healthHistory.backend.push(entry);
    
    // Limit history size
    if (this._healthHistory.backend.length > this._config.maxHealthHistory) {
      this._healthHistory.backend.shift();
    }
  }
  
  /**
   * Record a success (for circuit breaker)
   * @private
   */
  _recordSuccess() {
    // Clear error counts on success
    this._errorCounts.clear();
  }
  
  /**
   * Record a failure (for circuit breaker)
   * @param {string} type - Type of failure
   * @private
   */
  _recordFailure(type) {
    const now = Date.now();
    this._errorCounts.set(type, (this._errorCounts.get(type) || 0) + 1);
    this._lastErrorTime = now;
  }
  
  /**
   * Check if circuit breaker is open
   * @returns {boolean} Whether circuit breaker is open
   * @private
   */
  _isCircuitBreakerOpen() {
    const now = Date.now();
    if (now - (this._lastErrorTime || 0) > this._circuitBreakerTimeout) {
      this._errorCounts.clear();
      return false;
    }
    
    return Array.from(this._errorCounts.values()).some(count => count >= this._circuitBreakerThreshold);
  }
  
  /**
   * Force a health check
   * @returns {Promise<object>} Health check result
   */
  async forceHealthCheck() {
    this._logger.info('Forcing health check');
    
    await this._performHealthCheck();
    
    return {
      status: this._backendStatus,
      timestamp: Date.now(),
      statistics: this.getStatistics()
    };
  }
  
  /**
   * Get backend health status
   * @returns {Promise<object>} Health status
   */
  async getBackendStatus() {
    return {
      status: this._backendStatus,
      lastCheck: this._lastHealthCheck,
      isCircuitBreakerOpen: this._isCircuitBreakerOpen()
    };
  }
  
  /**
   * Get health history
   * @returns {object} Health history
   */
  getHealthHistory() {
    return {
      backend: [...this._healthHistory.backend]
    };
  }
  
  /**
   * Get statistics
   * @returns {object} Statistics
   */
  getStatistics() {
    return {
      ...this._stats,
      successRate: this._stats.healthChecks > 0 
        ? Math.round((this._stats.healthSuccesses / this._stats.healthChecks) * 100) + '%'
        : '0%',
      isCircuitBreakerOpen: this._isCircuitBreakerOpen()
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      backendStatus: this._backendStatus,
      lastHealthCheck: this._lastHealthCheck,
      isCircuitBreakerOpen: this._isCircuitBreakerOpen(),
      statistics: this.getStatistics()
    };
  }
  
  /**
   * Update check interval
   * @param {number} interval - New interval in milliseconds
   * @returns {Promise<boolean>} Success status
   */
  async updateCheckInterval(interval) {
    if (interval < this._config.minCheckInterval) {
      this._logger.warn(`Interval ${interval}ms is below minimum ${this._config.minCheckInterval}ms`);
      return false;
    }
    
    this._config.healthCheckInterval = interval;
    
    // Restart interval with new timing
    await this._setupHealthCheckInterval();
    
    this._logger.info(`Health check interval updated to ${interval}ms`);
    return true;
  }
  
  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up backend health monitor');
    
    // Clear interval
    if (this._checkIntervalId) {
      clearInterval(this._checkIntervalId);
      this._checkIntervalId = null;
    }
    
    // Clear health history
    this._healthHistory = {
      backend: []
    };
    
    // Reset statistics
    this._stats = {
      healthChecks: 0,
      healthSuccesses: 0,
      healthFailures: 0,
      lastHealthChange: null
    };
    
    // Clear error tracking
    this._errorCounts.clear();
    this._lastErrorTime = null;
    
    // Reset status
    this._backendStatus = 'unknown';
    this._lastHealthCheck = 0;
  }
  
  /**
   * Handle memory pressure
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Clean up old health history
    this._cleanupOldHealthHistory();
  }
  
  /**
   * Clean up old health history
   * @private
   */
  _cleanupOldHealthHistory() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    this._healthHistory.backend = this._healthHistory.backend.filter(
      entry => entry.timestamp > cutoff
    );
  }
}