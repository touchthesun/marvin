// extension/src/core/base-component.js
import { LogManager } from '../utils/log-manager.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';
import { ResourceTracker } from '../utils/resource-tracker.js';
import { container } from './dependency-container.js';

export class BaseComponent {
  constructor() {
    // Initialize logger
    this.logger = new LogManager({
      context: this.constructor.name,
      maxEntries: 500
    });

    // Resource tracking
    this._resourceTracker = new ResourceTracker();

    // State
    this.initialized = false;
    
    // Memory monitoring
    this._memoryMonitor = new MemoryMonitor({
      threshold: 0.8,
      interval: 5000
    });
    this._memoryMetrics = {
      peakUsage: 0,
      lastSnapshot: null,
      cleanupCount: 0
    };

    this.logger.debug('BaseComponent initialized');
  }

  async initialize() {
    if (this.initialized) {
      this.logger.debug('Component already initialized');
      return true;
    }

    try {
      this.logger.info('Initializing component');
      
      // Start memory monitoring
      this._memoryMonitor.start();
      this._memoryMonitor.onMemoryPressure(this._handleMemoryPressure.bind(this));
      
      // Perform component-specific initialization
      await this._performInitialization();
      
      this.initialized = true;
      this.logger.info('Component initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Error initializing component:', error);
      await this.cleanup();
      throw error;
    }
  }

  async cleanup() {
    if (!this.initialized) {
      return;
    }

    this.logger.info('Cleaning up component');
    
    try {
      // Stop memory monitoring
      this._memoryMonitor.stop();
      
      // Clean up resources
      await this._resourceTracker.cleanup();
      
      // Perform component-specific cleanup
      await this._performCleanup();
      
      this.initialized = false;
      this.logger.info('Component cleanup complete');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
      throw error;
    }
  }

  getService(serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      this.logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  }

  // Resource tracking methods now delegate to ResourceTracker
  trackEventListener(element, type, handler) {
    this._resourceTracker.trackEventListener(element, type, handler);
  }

  trackTimeout(callback, delay) {
    return this._resourceTracker.trackTimeout(callback, delay);
  }

  trackInterval(callback, delay) {
    return this._resourceTracker.trackInterval(callback, delay);
  }

  trackDOMElement(element) {
    this._resourceTracker.trackDOMElement(element);
  }

  async _handleMemoryPressure(snapshot) {
    const pressureLevel = this._calculatePressureLevel(snapshot);
    this.logger.warn(`Memory pressure detected: ${pressureLevel}`);
    
    switch (pressureLevel) {
      case 'high':
        await this._performAggressiveCleanup();
        break;
      case 'medium':
        await this._performNormalCleanup();
        break;
    }
    
    this._updateMemoryMetrics(snapshot);
  }

  _calculatePressureLevel(snapshot) {
    if (!snapshot) return 'low';
    
    const usageRatio = snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit;
    
    if (usageRatio >= 0.9) {
      return 'high';
    } else if (usageRatio >= 0.7) {
      return 'medium';
    }
    return 'low';
  }

  _updateMemoryMetrics(snapshot) {
    this._memoryMetrics.lastSnapshot = snapshot;
    this._memoryMetrics.peakUsage = Math.max(
      this._memoryMetrics.peakUsage,
      snapshot.usedJSHeapSize
    );
  }

  async _performAggressiveCleanup() {
    this.logger.warn('Performing aggressive cleanup');
    this._memoryMetrics.cleanupCount++;
    await this._resourceTracker.cleanup();
  }

  async _performNormalCleanup() {
    this.logger.debug('Performing normal cleanup');
    await this._resourceTracker.cleanupNonEssential();
  }

  async _performInitialization() {
    throw new Error('_performInitialization() must be implemented by subclass');
  }

  async _performCleanup() {
    throw new Error('_performCleanup() must be implemented by subclass');
  }
}