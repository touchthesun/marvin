// src/core/container-init.js
import { LogManager } from '../utils/log-manager.js';
import { UtilsRegistry } from './utils-registry.js';
import { container } from './dependency-container.js';
import { ServiceRegistry } from './service-registry.js';
import { ComponentRegistry } from './component-registry.js';
import { ResourceTracker } from '../utils/resource-tracker.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';


export class ContainerInitializer {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.logger = null;
    this._resourceTracker = new ResourceTracker();
    this._memoryMonitor = new MemoryMonitor({
      threshold: 0.8,
      interval: 5000
    });
    this._memoryMetrics = {
      peakUsage: 0,
      lastSnapshot: null,
      cleanupCount: 0
    };
    this.initializationProgress = {
      phase: null,
      progress: 0,
      details: {},
      memoryUsage: null
    };
  }

  async initialize(options = {}) {
    // Always reset before initialization to ensure clean state
    await this.reset();
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initialized) {
      return this.getStatus();
    }

    this.initializationPromise = (async () => {
      let result = null;
      try {
        // Start memory monitoring
        this._memoryMonitor.start();
        this._memoryMonitor.onMemoryPressure(this._handleMemoryPressure.bind(this));
        
        result = await this._performPhasedInitialization(options);
        this.initialized = true;
        return result;
      } catch (error) {
        await this.reset();
        throw new Error(error.message);
      } finally {
        this._memoryMonitor.stop();
        this.initializationPromise = null;
        result = null;
      }
    })();
    
    return this.initializationPromise;
  }

  async reset() {
    // Clear initialization state
    this.initialized = false;
    this.initializationPromise = null;
    this.initializationProgress = {
      phase: null,
      progress: 0,
      details: {},
      memoryUsage: null
    };
    
    // Clean up resources
    await this._resourceTracker.cleanup();
    
    // Clear logger with proper cleanup
    if (this.logger) {
      try {
        await this.logger.cleanup();
      } catch (error) {
        console.error('Error cleaning up logger:', error);
      } finally {
        this.logger = null;
      }
    }
    
    // Reset container
    await container.reset();
    
    // Reset memory metrics
    this._memoryMetrics = {
      peakUsage: 0,
      lastSnapshot: null,
      cleanupCount: 0
    };
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Calculate memory pressure level based on memory usage
   * @param {Object} snapshot - Memory snapshot
   * @returns {string} Pressure level: 'low', 'medium', or 'high'
   * @private
   */
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

  /**
  * Handle memory pressure
  * @param {Object} snapshot - Memory snapshot
  * @private
  */
  async _handleMemoryPressure(snapshot) {
    const pressureLevel = this._calculatePressureLevel(snapshot);
    this.logger?.warn(`Memory pressure detected: ${pressureLevel}`);
    
    switch (pressureLevel) {
        case 'high':
            await this._performAggressiveCleanup();
            break;
        case 'medium':
            await this._performNormalCleanup();
            break;
        case 'low':
            // Just log warning
            break;
    }
    
    this._updateMemoryMetrics(snapshot);
  }

  _updateMemoryMetrics(snapshot) {
    this._memoryMetrics.lastSnapshot = snapshot;
    this._memoryMetrics.peakUsage = Math.max(
      this._memoryMetrics.peakUsage,
      snapshot.usedJSHeapSize
    );
  }

  async _performAggressiveCleanup() {
    this.logger?.warn('Performing aggressive cleanup');
    this._memoryMetrics.cleanupCount++;
    
    // Clear all non-essential resources
    await this._resourceTracker.cleanup();
    
    // Clear initialization progress details
    this.initializationProgress.details = {};
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  async _performNormalCleanup() {
    this.logger?.debug('Performing normal cleanup');
    
    // Clear only non-critical resources
    await this._resourceTracker.cleanupNonEssential();
  }

  async _performPhasedInitialization(options) {
    const { isBackgroundScript = false, context = 'container-init' } = options;
    
    try {
      // Phase 1: Essential utilities (including logger)
      this._updateProgress('essential-utilities', 0);
      await this._registerEssentialUtilities(isBackgroundScript, context);
      await this._validatePhase('essential-utilities');
      
      // Phase 2: Core utilities
      this._updateProgress('core-utilities', 20);
      await this._registerCoreUtilities();
      await this._validatePhase('core-utilities');
      
      // Phase 3: Core services (with dependency ordering)
      this._updateProgress('core-services', 40);
      await this._registerCoreServices();
      await this._validatePhase('core-services');
      
      // Phase 4: Initialize core services
      this._updateProgress('core-service-initialization', 60);
      await this._initializeCoreServices();
      await this._validatePhase('core-service-initialization');
      
      // Phase 5: Optional services
      this._updateProgress('optional-services', 80);
      await this._registerOptionalServices();
      
      // Phase 6: Components
      this._updateProgress('components', 90);
      await this._registerComponents();
      
      // Final validation
      this._updateProgress('validation', 100);
      const validationResult = await this._validateContainer();
      
      // Clean up validation result
      const result = { 
        initialized: validationResult.initialized,
        memoryMetrics: this._memoryMetrics
      };
      validationResult = null;
      
      return result;
    } catch (error) {
      this.logger?.error('Container initialization failed:', error);
      await this.reset();
      throw error;
    }
  }

  _updateProgress(phase, progress) {
    const memorySnapshot = this._memoryMonitor.getLastSnapshot();
    this.initializationProgress = {
        phase,
        progress,
        details: {
            ...this.initializationProgress.details,
            memoryUsage: memorySnapshot,
            resourceCount: this._resourceTracker.getResourceCount()
        },
        memoryUsage: memorySnapshot
    };
}

  async _registerCoreUtilities() {
    this.logger?.debug('Registering core utilities');
    
    if (UtilsRegistry.formatting) {
      container.registerUtil('formatting', UtilsRegistry.formatting);
    }
    if (UtilsRegistry.timeout) {
      container.registerUtil('timeout', UtilsRegistry.timeout);
    }
  }

  async _registerCoreServices() {
    this.logger?.debug('Registering core services');
    await this._resourceTracker.trackOperation('registerCoreServices', async () => {
        // Track each service registration
        for (const service of ServiceRegistry.getCoreServices()) {
            await this._resourceTracker.trackOperation(
                `registerService:${service.name}`,
                () => ServiceRegistry.register(service)
            );
        }
    });
}

  async _registerComponents() {
    this.logger?.debug('Registering components');
    const components = await ComponentRegistry.registerAll();
    
    // Register each component in the container
    for (const [name, component] of Object.entries(components)) {
      container.registerComponent(name, component);
    }
    
    this.logger?.debug('Components registered');
  }

  async _registerOptionalServices() {
    this.logger?.debug('Registering optional services');
    
    // Register optional services as lazy-loaded
    container.registerService('visualizationService', VisualizationService, { 
      phase: 'optional',
      lazy: true 
    });
    container.registerService('analysisService', AnalysisService, { 
      phase: 'optional',
      lazy: true 
    });
  }

  async _initializeCoreServices() {
    this.logger?.debug('Initializing core services');
    
    const coreServices = container.getServicesByPhase('core');
    for (const serviceName of coreServices) {
      try {
        await container.initializeService(serviceName);
      } catch (error) {
        this.logger?.error(`Failed to initialize service ${serviceName}:`, error);
        throw error;
      }
    }
  }

  async _validatePhase(phase) {
    this.logger?.debug(`Validating phase: ${phase}`);
    
    const errors = [];
    
    try {
      switch (phase) {
        case 'essential-utilities':
          if (!container.utils.has('LogManager')) {
            errors.push('Missing required utility: LogManager');
          }
          break;
          
        case 'core-utilities':
          if (!container.utils.has('formatting')) {
            errors.push('Missing required utility: formatting');
          }
          if (!container.utils.has('timeout')) {
            errors.push('Missing required utility: timeout');
          }
          break;
          
        case 'core-services':
          const requiredServices = ['apiService', 'storageService', 'messageService'];
          for (const service of requiredServices) {
            if (!container.services.has(service)) {
              errors.push(`Missing required service: ${service}`);
            }
          }
          break;
          
        case 'core-service-initialization':
          const coreServices = container.getServicesByPhase('core');
          for (const serviceName of coreServices) {
            const metadata = container.serviceMetadata.get(serviceName);
            if (!metadata?.initialized) {
              errors.push(`Service not initialized: ${serviceName}`);
            }
          }
          break;
          
        case 'components':
          const requiredComponents = ['navigation', 'overview-panel'];
          for (const component of requiredComponents) {
            if (!container.components.has(component)) {
              errors.push(`Missing required component: ${component}`);
            }
          }
          break;
      }
      
      if (errors.length > 0) {
        this.logger?.error(`Errors during ${phase}:`, errors);
        throw new Error(`Validation failed during ${phase}: ${errors.join(', ')}`);
      }
      
      return { initialized: this.initialized };
    } finally {
      errors.length = 0;
    }
  }

  async _registerEssentialUtilities(isBackgroundScript, context) {
    // Create logger first
    this.logger = new LogManager({
      isBackgroundScript,
      context: context || 'container-init',
      maxEntries: context === 'test' ? 100 : 500 // Lower limit for tests
    });
    
    // Now register it in the container
    if (!container.utils.has('LogManager')) {
      container.registerUtil('LogManager', LogManager);
      this.logger.debug('LogManager registered in container');
    }

    this.logger.info('Starting container initialization');
  }

  _validateContainer() {
    const status = {
      initialized: this.initialized,
      warnings: [],
      errors: [],
      utilities: {
        count: container.utils.size,
        required: ['LogManager'],
        missing: []
      },
      services: {
        count: container.services.size,
        required: ['apiService', 'storageService', 'messageService'],
        missing: []
      },
      components: {
        count: container.components.size,
        required: ['navigation', 'overview-panel'],
        missing: []
      },
      memory: {
        peakUsage: this._memoryMetrics.peakUsage,
        lastSnapshot: this._memoryMetrics.lastSnapshot,
        cleanupCount: this._memoryMetrics.cleanupCount
      }
    };

    // Check for required utilities
    status.utilities.required.forEach(util => {
      if (!container.utils.has(util)) {
        status.utilities.missing.push(util);
        status.errors.push(`Missing required utility: ${util}`);
      }
    });

    // Check for required services
    status.services.required.forEach(service => {
      if (!container.services.has(service)) {
        status.services.missing.push(service);
        status.errors.push(`Missing required service: ${service}`);
      }
    });

    // Check for required components
    status.components.required.forEach(component => {
      if (!container.components.has(component)) {
        status.components.missing.push(component);
        status.errors.push(`Missing required component: ${component}`);
      }
    });

    // Validate initialization state
    if (!this.initialized) {
      status.errors.push('Container not fully initialized');
    }

    return status;
  }

  getStatus() {
    if (!this.initialized) {
      return {
        initialized: false,
        message: 'Container not initialized',
        progress: this.initializationProgress,
        memoryMetrics: this._memoryMetrics
      };
    }

    const status = this._validateContainer();
    status.progress = this.initializationProgress;
    status.memoryMetrics = this._memoryMetrics;
    return status;
  }
}

// Export singleton and convenience functions as before
export const containerInitializer = new ContainerInitializer();

export async function initializeContainer(options = {}) {
  return containerInitializer.initialize(options);
}

export async function ensureContainerInitialized(options = {}) {
  return containerInitializer.ensureInitialized(options);
}

export function getContainerStatus() {
  return containerInitializer.getStatus();
}

export function resetContainer() {
  return containerInitializer.reset();
}