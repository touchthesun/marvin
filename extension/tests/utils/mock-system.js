// extension/tests/utils/mock-system.js
import { jest } from '@jest/globals';

// REMOVED: Mock LogManager - we want to use the real LogManager
// This will expose real issues that need fixing

export const createMockSystem = () => {
  // Track cleanup order for services
  const cleanupOrder = [];
  
  // Define all our mock services
  const services = {
    apiService: class {
      async initialize() { return true; }
      async cleanup() {
        cleanupOrder.push('apiService');
        return true;
      }
    },
    storageService: class {
      async initialize() { return true; }
      async cleanup() {
        cleanupOrder.push('storageService');
        return true;
      }
    },
    messageService: class {
      async initialize() { return true; }
      async cleanup() {
        cleanupOrder.push('messageService');
        return true;
      }
    },
    visualizationService: class {
      async initialize() { return true; }
      async cleanup() {
        cleanupOrder.push('visualizationService');
        return true;
      }
    },
    analysisService: class {
      async initialize() { return true; }
      async cleanup() {
        cleanupOrder.push('analysisService');
        return true;
      }
    }
  };

  // Define all our mock components
  const components = {
    navigation: class {
      async initialize() { return true; }
      async cleanup() { return true; }
    },
    'overview-panel': class {
      async initialize() { return true; }
      async cleanup() { return true; }
    },
    'assistant-panel': class {
      async initialize() { return true; }
      async cleanup() { return true; }
    },
    'tasks-panel': class {
      async initialize() { return true; }
      async cleanup() { return true; }
    }
  };

  // Create a simple mock container for now (avoid circular dependency)
  const container = {
    utils: new Map(),
    services: new Map(),
    components: new Map(),
    serviceInstances: new Map(),
    componentInstances: new Map(),
    serviceMetadata: new Map(),
    
    registerUtil: function(name, util) { 
      this.utils.set(name, util);
      return util;
    },
    
    registerService: function(name, ServiceClass) {
      this.services.set(name, ServiceClass);
      this.serviceMetadata.set(name, { initialized: false });
      return ServiceClass;
    },
    
    registerComponent: function(name, ComponentClass) {
      this.components.set(name, ComponentClass);
      return ComponentClass;
    },
    
    // Make getService a Jest mock
    getService: jest.fn().mockImplementation(function(name) {
      if (!this.services.has(name)) {
        throw new Error(`Service not found: ${name}`);
      }
      if (!this.serviceInstances.has(name)) {
        const ServiceClass = this.services.get(name);
        const instance = new ServiceClass();
        this.serviceInstances.set(name, instance);
      }
      return this.serviceInstances.get(name);
    }),
    
    // Add the sync version for testing
    getServiceSync: jest.fn().mockImplementation(function(name) {
      if (!this.services.has(name)) {
        return null;
      }
      if (!this.serviceInstances.has(name)) {
        const ServiceClass = this.services.get(name);
        const instance = new ServiceClass();
        this.serviceInstances.set(name, instance);
      }
      return this.serviceInstances.get(name);
    }),
    
    async reset() {
      // Call cleanup on service instances in reverse order
      const serviceInstances = Array.from(this.serviceInstances.entries());
      for (let i = serviceInstances.length - 1; i >= 0; i--) {
        const [name, instance] = serviceInstances[i];
        if (instance && typeof instance.cleanup === 'function') {
          try {
            await instance.cleanup();
          } catch (error) {
            console.error(`Error cleaning up service ${name}:`, error);
          }
        }
      }
      
      // Clear all maps
      this.utils.clear();
      this.services.clear();
      this.components.clear();
      this.serviceInstances.clear();
      this.componentInstances.clear();
      this.serviceMetadata.clear();
      
      // Reset Jest mocks
      if (this.getService.mockReset) this.getService.mockReset();
      if (this.getServiceSync.mockReset) this.getServiceSync.mockReset();
    }
  };

  // Register all expected services in the container
  Object.entries(services).forEach(([name, ServiceClass]) => {
    container.registerService(name, ServiceClass);
  });

  // Register all expected components in the container
  Object.entries(components).forEach(([name, ComponentClass]) => {
    container.registerComponent(name, ComponentClass);
  });

  // Create the complete mock system
  const mockSystem = {
    // REMOVED: mockLogger - we're using real LogManager now
    memoryMonitor: {
      start: jest.fn(),
      stop: jest.fn(),
      onMemoryPressure: jest.fn(),
      getLastSnapshot: jest.fn().mockReturnValue({
        timestamp: Date.now(),
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0
      })
    },
    resourceTracker: {
      trackOperation: jest.fn().mockImplementation(async (name, operation) => {
        return operation();
      }),
      trackEventListener: jest.fn(),
      trackChromeListener: jest.fn(),
      trackTimeout: jest.fn(),
      trackInterval: jest.fn(),
      trackDOMElement: jest.fn(),
      cleanup: jest.fn(),
      cleanupNonEssential: jest.fn(),
      clearAllTimers: jest.fn(),
      getResourceCount: jest.fn().mockReturnValue({
        eventListeners: 0,
        timeouts: 0,
        intervals: 0,
        domRefs: 0,
        operations: 0
      })
    },
    services,
    components,
    container,
    cleanupOrder,
    async reset() {
      await this.container.reset();
      
      // Reset all Jest mocks
      Object.values(this).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          Object.values(value).forEach(fn => {
            if (typeof fn === 'function' && fn.mockReset) {
              fn.mockReset();
            }
          });
        }
      });
      
      // Clear cleanup order
      cleanupOrder.length = 0;
    }
  };

  return mockSystem;
};