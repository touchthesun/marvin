// src/core/dependency-container.js
import { LogManager } from '../utils/log-manager.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';
import { ResourceTracker } from '../utils/resource-tracker.js';
import { UtilsRegistry } from './utils-registry.js';

export class DependencyContainer {
  constructor() {
    // Initialize logger
    this.logger = new LogManager({
      context: 'dependency-container',
      maxEntries: 500
    });

    // Core collections
    this.services = new Map();
    this.components = new Map();
    this.componentInstances = new Map();
    this.utils = new Map();
    this.serviceInstances = new Map();
    this.serviceMetadata = new Map(); 
    this.dependencyGraph = new Map();
    this.initializationInProgress = new Set();

    // Resource tracking
    this._resourceTracker = new ResourceTracker();
    
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

    this.logger.debug('DependencyContainer initialized');
  }

  // Reset all container state
  async reset() {
    this.logger.debug('Starting container reset');
    
    // Track the entire reset operation
    await this._resourceTracker.trackOperation('containerReset', async () => {
      // Clear instances in reverse dependency order
      const order = this._getCleanupOrder();
      
      for (const name of order) {
        const instance = this.serviceInstances.get(name);
        if (instance && typeof instance.cleanup === 'function') {
          try {
            this.logger.debug(`Cleaning up service: ${name}`);
            const startMemory = performance.memory?.usedJSHeapSize;
            await instance.cleanup();
            const endMemory = performance.memory?.usedJSHeapSize;
            
            // Track cleanup memory impact
            const metadata = this.serviceMetadata.get(name);
            if (metadata) {
              metadata.cleanupMemory = {
                before: startMemory,
                after: endMemory,
                delta: endMemory - startMemory
              };
            }
          } catch (error) {
            this.logger.error(`Error cleaning up service ${name}:`, error);
          }
        }
      }
      
      // Clear all maps
      this.serviceInstances.clear();
      this.componentInstances.clear();
      this.services.clear();
      this.components.clear();
      this.utils.clear();
      this.serviceMetadata.clear();
      this.dependencyGraph.clear();
      this.initializationInProgress.clear();
      
      // Reset memory metrics
      this._memoryMetrics = {
        peakUsage: 0,
        lastSnapshot: null,
        cleanupCount: 0
      };
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
    });
  
    this.logger.debug('Container reset complete');
  }

  _getCleanupOrder() {
    const visited = new Set();
    const order = [];
    
    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);
      
      const metadata = this.serviceMetadata.get(name);
      if (metadata) {
        for (const dep of metadata.dependencies) {
          visit(dep);
        }
      }
      
      order.push(name);
    };
    
    for (const name of this.serviceInstances.keys()) {
      visit(name);
    }
    
    return order.reverse();
  }

  registerService(name, ServiceClass, options = {}) {
    this.services.set(name, ServiceClass);
    this.serviceMetadata.set(name, {
      lazy: options.lazy || false,
      phase: options.phase || 'core',
      initialized: false,
      dependencies: options.dependencies || [],
      memoryUsage: null,
      cleanupMemory: null,
      lastAccess: Date.now(),
      accessCount: 0
    });
    return this;
  }

  async getService(name) {
    this.logger.debug(`Getting service: ${name}`);

    if (!this.services.has(name)) {
      this.logger.error(`Service not found: ${name}`);
      throw new Error(`Service not found: ${name}`);
    }
    
    // Return existing instance if available
    if (this.serviceInstances.has(name)) {
      return this.serviceInstances.get(name);
    }
    
    // Prevent circular initialization
    if (this.initializationInProgress.has(name)) {
      throw new Error(`Circular dependency detected: ${name} is already being initialized`);
    }
    
    this.initializationInProgress.add(name);
    
    try {
      const metadata = this.serviceMetadata.get(name);
      const ServiceClass = this.services.get(name);
      const instance = new ServiceClass();
      
      // Initialize dependencies first
      for (const depName of metadata.dependencies) {
        await this.getService(depName);
      }
      
      // Initialize the service with memory monitoring
      if (!metadata.lazy && typeof instance.initialize === 'function') {
        const startMemory = performance.memory?.usedJSHeapSize;
        await instance.initialize();
        const endMemory = performance.memory?.usedJSHeapSize;
        
        // Track memory usage
        metadata.memoryUsage = {
          initial: startMemory,
          current: endMemory,
          delta: endMemory - startMemory
        };
        
        metadata.initialized = true;
      }
      
      this.serviceInstances.set(name, instance);
      return instance;
    } finally {
      this.initializationInProgress.delete(name);
    }
  }

  _isCircularDependency(name, visited = new Set()) {
    if (visited.has(name)) return true;
    visited.add(name);
    
    const metadata = this.serviceMetadata.get(name);
    if (!metadata) return false;
    
    for (const dep of metadata.dependencies) {
      if (this._isCircularDependency(dep, visited)) return true;
    }
    
    visited.delete(name);
    return false;
  }

  // Initialize a specific service
  async initializeService(name) {
    const instance = await this.getService(name);
    const metadata = this.serviceMetadata.get(name);
    
    if (!metadata.initialized && typeof instance.initialize === 'function') {
      await instance.initialize();
      metadata.initialized = true;
    }
    
    return instance;
  }

  // Get services by phase
  getServicesByPhase(phase) {
    return Array.from(this.serviceMetadata.entries())
      .filter(([_, metadata]) => metadata.phase === phase)
      .map(([name]) => name);
  }
  
  // Rest of the existing methods remain unchanged...
  registerComponent(name, component) {
    this.components.set(name, component);
    return this;
  }
  
  getComponent(name) {
    if (!this.components.has(name)) {
      throw new Error(`Component not found: ${name}`);
    }
    
    if (!this.componentInstances.has(name)) {
      const Component = this.components.get(name);
      const instance = typeof Component === 'function' ? new Component() : Component;
      this.componentInstances.set(name, instance);
    }
    
    return this.componentInstances.get(name);
  }
  
  registerUtil(name, utility) {
    this.utils.set(name, utility);
    return this;
  }
  
  getUtil(name) {
    if (!this.utils.has(name)) {
      throw new Error(`Utility not found: ${name}`);
    }
    return this.utils.get(name);
  }

  clearComponentInstance(name) {
    this.componentInstances.delete(name);
    return this;
  }
  
  clearAllComponentInstances() {
    this.componentInstances.clear();
    return this;
  }
}

// Export a singleton instance
export const container = new DependencyContainer();