// src/core/dependency-container.js
export class DependencyContainer {
  constructor() {
    this.services = new Map();
    this.components = new Map();
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
    return this.components.get(name);
  }
  
  // Register a utility
  registerUtil(name, utility) {
    this.utils.set(name, utility);
    return this;
  }
  
  // Get a utility
  getUtil(name) {
    if (!this.utils.has(name)) {
      throw new Error(`Utility not found: ${name}`);
    }
    return this.utils.get(name);
  }
}

// Export a singleton instance
export const container = new DependencyContainer();