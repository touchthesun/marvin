// extension/tests/__mocks__/core/service-registry.js
export class ServiceRegistry {
    constructor() {
      this._services = new Map();
      this._dependencies = new Map();
    }
  
    _validateDependencies(name, dependencies) {
      // Mock implementation of dependency validation
      return true;
    }
  
    registerService(name, ServiceClass, options = {}) {
      if (options.dependencies) {
        this._validateDependencies(name, options.dependencies);
      }
      this._services.set(name, new ServiceClass());
      return this._services.get(name);
    }
  
    getService(name) {
      return Promise.resolve(this._services.get(name));
    }
  
    cleanup() {
      this._services.clear();
      this._dependencies.clear();
    }
  }
  
  export default ServiceRegistry;