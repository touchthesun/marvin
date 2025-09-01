// src/core/container-init.js
import { LogManager } from '../utils/log-manager.js';
import { UtilsRegistry } from './utils-registry.js';
import { container } from './dependency-container.js';
import { ServiceRegistry } from './service-registry.js';
import { ComponentRegistry } from './component-registry.js';
import { ResourceTracker } from '../utils/resource-tracker.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';
import { VisualizationService } from '../services/visualization-service.js';
import { AnalysisService } from '../services/analysis-service.js';


export class ContainerInitializer {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.logger = null;
    this.mockSystem = null;
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
    // this.mockSystem = options.mockSystem;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
  
    if (this.initialized) {
      return this.getStatus();
    }
  
    this.initializationPromise = (async () => {
      try {
        // Start memory monitoring
        this._memoryMonitor.start();
        this._memoryMonitor.onMemoryPressure(this._handleMemoryPressure.bind(this));
        
        const result = await this._performPhasedInitialization(options);
        this.initialized = true;
        return result;
      } catch (error) {
        await this.reset();
        throw error; // Propagate the original error
      } finally {
        this._memoryMonitor.stop();
        this.initializationPromise = null;
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
    if (typeof global !== 'undefined' && global.gc) {
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
    if (typeof global !== 'undefined' && global.gc) {
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
    
    // Track the entire phased initialization
    return await this._resourceTracker.trackOperation('phasedInitialization', async () => {
      try {
        this.logger?.debug('=== STARTING PHASED INITIALIZATION ===');
        
        // Phase 1: Essential utilities (including logger)
        this.logger?.debug('=== PHASE 1: Essential utilities ===');
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
        this.logger?.debug('=== PHASE 6: Components ===');
        this._updateProgress('components', 90);
        await this._registerComponents();
        
        // Final validation
        this._updateProgress('validation', 100);
        const validationResult = await this._validateContainer();
        
        // Set initialized flag based on validation
        this.initialized = validationResult.initialized;
        
        // Return result
        return { 
          initialized: this.initialized,
          memoryMetrics: this._memoryMetrics
        };
        
      } catch (error) {
        this.logger?.error('Container initialization failed:', error);
        await this.reset();
        throw error;
      }
    });
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
    // Initialize ServiceRegistry first
    ServiceRegistry.initialize();
    
    // Register core services from ServiceRegistry
    const coreServices = ServiceRegistry.getCoreServices();
    for (const service of coreServices) {
      container.registerService(service.name, service.class, service.options);
    }
  }

  async _registerComponents() {
    try {
      console.log('🔍 DEBUG: _registerComponents() METHOD CALLED');
      this.logger?.debug('=== _registerComponents() METHOD CALLED ===');
      this.logger?.debug('Registering components');
      // ComponentRegistry.registerAll() handles registration internally
      ComponentRegistry.registerAll();
      this.logger?.debug('Components registered');
    
    // CRITICAL FIX: Instantiate components after registration
    console.log('🔍 DEBUG: Starting component instantiation');
    this.logger?.debug('=== STARTING COMPONENT INSTANTIATION ===');
    this.logger?.debug('Instantiating components');
    const componentNames = Array.from(container.components.keys());
    console.log('🔍 DEBUG: Found components to instantiate:', componentNames);
    this.logger?.debug(`Found ${componentNames.length} components to instantiate:`, componentNames);
    
    console.log('🔍 DEBUG: Starting component instantiation loop');
    for (const componentName of componentNames) {
      try {
        console.log(`🔍 DEBUG: Processing component: ${componentName}`);
        console.log(`🔍 DEBUG: About to get component definition for ${componentName}`);
        this.logger?.debug(`=== INSTANTIATING COMPONENT: ${componentName} ===`);
        
        // Log component details before instantiation
        console.log(`🔍 DEBUG: Calling container.components.get(${componentName})`);
        const componentDefinition = container.components.get(componentName);
        console.log(`🔍 DEBUG: Got component definition for ${componentName}:`, componentDefinition);
        this.logger?.debug(`Component definition type:`, typeof componentDefinition);
        this.logger?.debug(`Component definition:`, componentDefinition);
        
        // Check if component has initialize method
        console.log(`🔍 DEBUG: About to check component type for ${componentName}`);
        if (typeof componentDefinition === 'function') {
          console.log(`🔍 DEBUG: Component ${componentName} is a function/class`);
          const tempInstance = new componentDefinition();
          console.log(`🔍 DEBUG: Temp instance created for ${componentName}:`, !!tempInstance);
          this.logger?.debug(`Temp instance created:`, !!tempInstance);
          this.logger?.debug(`Has initialize method:`, typeof tempInstance.initialize === 'function');
          this.logger?.debug(`Has component-specific init method:`, typeof tempInstance[`init${componentName.charAt(0).toUpperCase() + componentName.slice(1).replace('-', '')}Panel`] === 'function');
        } else {
          console.log(`🔍 DEBUG: Component ${componentName} is NOT a function/class, it's:`, typeof componentDefinition);
        }
        
        // Try to get component instance (this should put it in componentInstances)
        console.log(`🔍 DEBUG: About to call container.getComponent(${componentName})`);
        this.logger?.debug(`Calling container.getComponent(${componentName})`);
        const instance = container.getComponent(componentName);
        console.log(`🔍 DEBUG: Component instance created for ${componentName}:`, !!instance);
        this.logger?.debug(`Component instance created:`, !!instance);
        this.logger?.debug(`Instance type:`, typeof instance);
        this.logger?.debug(`Instance methods:`, Object.getOwnPropertyNames(instance));
        
        // Verify it's in componentInstances
        console.log(`🔍 DEBUG: About to check if ${componentName} is in componentInstances`);
        const isInInstances = container.componentInstances.has(componentName);
        console.log(`🔍 DEBUG: Component ${componentName} in componentInstances:`, isInInstances);
        this.logger?.debug(`Component ${componentName} in componentInstances:`, isInInstances);
        
        // Let's also see what's actually in the map
        console.log(`🔍 DEBUG: componentInstances map contents:`, Array.from(container.componentInstances.keys()));
        
        this.logger?.debug(`=== COMPONENT ${componentName} INSTANTIATION COMPLETE ===`);
        
      } catch (error) {
        console.error(`🔍 ERROR: Failed to instantiate component ${componentName}:`, error);
        this.logger?.error(`=== FAILED TO INSTANTIATE COMPONENT ${componentName} ===`);
        this.logger?.error(`Error details:`, error);
        this.logger?.error(`Error stack:`, error.stack);
        throw error;
      }
    }
    
    // Log final state
    this.logger?.debug(`=== COMPONENT INSTANTIATION SUMMARY ===`);
    this.logger?.debug(`Components registered:`, Array.from(container.components.keys()));
    this.logger?.debug(`Components instantiated:`, Array.from(container.componentInstances.keys()));
    this.logger?.debug(`Component count mismatch:`, container.components.size - container.componentInstances.size);
    
    this.logger?.debug('All components processed');
    } catch (error) {
      console.error('🔍 ERROR: _registerComponents() failed:', error);
      this.logger?.error('_registerComponents() failed:', error);
      throw error;
    }
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
    this.logger.debug('Initializing core services');
    
    const coreServices = container.getServicesByPhase('core');
    for (const serviceName of coreServices) {
      try {
        this.logger.debug(`Initializing service: ${serviceName}`);
        await container.initializeService(serviceName);
      } catch (error) {
        this.logger.error(`Failed to initialize service ${serviceName}:`, error);
        throw error;
      }
    }
    
    // CRITICAL FIX: Ensure services are instantiated in serviceInstances map
    this.logger.debug('=== ENSURING SERVICES ARE INSTANTIATED ===');
    this.logger.debug(`Found ${coreServices.length} core services to check:`, coreServices);
    
    for (const serviceName of coreServices) {
      try {
        this.logger.debug(`=== CHECKING SERVICE: ${serviceName} ===`);
        
        // Log service details before instantiation
        const serviceMetadata = container.serviceMetadata.get(serviceName);
        this.logger.debug(`Service metadata:`, serviceMetadata);
        this.logger.debug(`Service already in serviceInstances:`, container.serviceInstances.has(serviceName));
        
        if (!container.serviceInstances.has(serviceName)) {
          this.logger.debug(`Creating service instance for: ${serviceName}`);
          const serviceInstance = await container.getService(serviceName);
          this.logger.debug(`Service instance created:`, !!serviceInstance);
          this.logger.debug(`Instance type:`, typeof serviceInstance);
          this.logger.debug(`Instance methods:`, Object.getOwnPropertyNames(serviceInstance));
          
          // Verify it's in serviceInstances
          const isInInstances = container.serviceInstances.has(serviceName);
          this.logger.debug(`Service ${serviceName} in serviceInstances:`, isInInstances);
        } else {
          this.logger.debug(`Service ${serviceName} already instantiated`);
        }
        
        this.logger.debug(`=== SERVICE ${serviceName} CHECK COMPLETE ===`);
        
      } catch (error) {
        this.logger.error(`=== FAILED TO CHECK SERVICE ${serviceName} ===`);
        this.logger.error(`Error details:`, error);
        this.logger.error(`Error stack:`, error.stack);
        throw error;
      }
    }
    
    // Log final state
    this.logger.debug(`=== SERVICE INSTANTIATION SUMMARY ===`);
    this.logger.debug(`Services registered:`, Array.from(container.services.keys()));
    this.logger.debug(`Services instantiated:`, Array.from(container.serviceInstances.keys()));
    this.logger.debug(`Service count mismatch:`, container.services.size - container.serviceInstances.size);
    
    this.logger.debug('All core services processed');
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
    // Initialize logger first
    this.logger = new LogManager({
      context,
      isBackgroundScript,
      maxEntries: 500
    });
    
    // Log initialization start
    this.logger.info('Initializing essential utilities');
    
    // Register logger with container
    container.registerUtil('LogManager', this.logger);
    
    // Register other essential utilities
    container.registerUtil('formatting', UtilsRegistry.formatting);
    container.registerUtil('timeout', UtilsRegistry.timeout);
    container.registerUtil('ui', UtilsRegistry.ui);
    
    // Log initialization complete
    this.logger.info('Essential utilities initialized');
  }

  _validateContainer() {
    const status = {
      initialized: false,
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
      } else {
        // Check if service is initialized
        const metadata = container.serviceMetadata.get(service);
        if (!metadata?.initialized) {
          status.errors.push(`Service not initialized: ${service}`);
        }
      }
    });

    // Check for required components
    status.components.required.forEach(component => {
      if (!container.components.has(component)) {
        status.components.missing.push(component);
        status.errors.push(`Missing required component: ${component}`);
      }
    });

    // Set initialized to true only if there are no errors
    status.initialized = status.errors.length === 0;

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

  async ensureInitialized(options = {}) {
    if (this.initialized) {
      return this.getStatus();
    }
    
    return await this.initialize(options);
  }
}

// Export singleton and convenience functions
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