// src/core/dependency-container.js
export class DependencyContainer {
  constructor() {
    this.services = new Map();
    this.components = new Map();
    this.componentInstances = new Map();
    this.utils = new Map();
    this.serviceInstances = new Map();
  }
  
  // Register a service class (not instance)
  registerService(name, ServiceClass) {
    this.services.set(name, ServiceClass);
    return this;
  }
  
  // Get a service instance (create if needed)
  getService(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service not found: ${name}`);
    }
    
    // Return existing instance or create new one
    if (!this.serviceInstances.has(name)) {
      const ServiceClass = this.services.get(name);
      const instance = new ServiceClass();
      this.serviceInstances.set(name, instance);
    }
    
    return this.serviceInstances.get(name);
  }
  
  // Register a component
  registerComponent(name, component) {
    this.components.set(name, component);
    return this;
  }
  
  // Get a component
  getComponent(name) {
    if (!this.components.has(name)) {
      throw new Error(`Component not found: ${name}`);
    }
    
    // Return existing instance or create new one
    if (!this.componentInstances.has(name)) {
      const Component = this.components.get(name);
      // Create a new instance if it's a class, otherwise use the object directly
      const instance = typeof Component === 'function' ? new Component() : Component;
      this.componentInstances.set(name, instance);
    }
    
    return this.componentInstances.get(name);
  }
  
  // Register a utility
  registerUtil(name, utility) {
    this.utils.set(name, utility);
    return this;
  }
  
  // Get a utility
  getUtil(name) {
    if (!this.utils.has(name)) {
      // Special case for LogManager to prevent crashes during initialization
      if (name === 'LogManager') {
        try {
          // Try to dynamically import LogManager
          // Use dynamic import() for compatibility
          import('../utils/log-manager.js').then(module => {
            this.registerUtil('LogManager', module.LogManager);
          }).catch(err => {
            console.error('Failed to auto-import LogManager:', err);
          });
          
          // Return a minimal logger implementation while waiting for import
          return class MinimalLogger {
            constructor(options) {
              this.context = options?.context || 'unknown';
            }
            
            debug(...args) { console.debug(`[${this.context}]`, ...args); }
            info(...args) { console.info(`[${this.context}]`, ...args); }
            warn(...args) { console.warn(`[${this.context}]`, ...args); }
            error(...args) { console.error(`[${this.context}]`, ...args); }
            log(...args) { console.log(`[${this.context}]`, ...args); }
          };
        } catch (e) {
          console.warn('Attempted to auto-handle LogManager but failed:', e);
        }
      }
      throw new Error(`Utility not found: ${name}`);
    }
    return this.utils.get(name);
  }

  // Clear component instance (for testing or reinitialization)
  clearComponentInstance(name) {
    this.componentInstances.delete(name);
    return this;
  }
  
  // Clear all component instances
  clearAllComponentInstances() {
    this.componentInstances.clear();
    return this;
  }
}

// Export a singleton instance
export const container = new DependencyContainer();