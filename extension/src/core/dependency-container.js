// src/core/dependency-container.js
import { LogManager } from '../utils/log-manager';

export class DependencyContainer {
  constructor() {
    this.services = new Map();
    this.components = new Map();
    this.componentInstances = new Map();
    this.utils = new Map();
    this.serviceInstances = new Map();
    this.serviceMetadata = new Map(); 
    this.dependencyGraph = new Map();
    this.initializationInProgress = new Set(); // Track services being initialized
  }

  // Reset all container state
  async reset() {
    // Clear instances in reverse dependency order
    const order = this._getCleanupOrder();
    
    for (const name of order) {
      const instance = this.serviceInstances.get(name);
      if (instance && typeof instance.cleanup === 'function') {
        try {
          await instance.cleanup();
        } catch (error) {
          console.error(`Error cleaning up service ${name}:`, error);
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
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
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
      dependencies: options.dependencies || [] // Track dependencies at registration
    });
    return this;
  }

  async getService(name) {
    if (!this.services.has(name)) {
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
      
      // Initialize the service
      if (!metadata.lazy && typeof instance.initialize === 'function') {
        await instance.initialize();
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