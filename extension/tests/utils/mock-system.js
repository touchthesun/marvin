// extension/tests/utils/mock-system.js
import { jest } from '@jest/globals';

// Create a mock logger that will be used by LogManager
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  cleanup: jest.fn().mockResolvedValue(true)
};

// Mock LogManager at module level
jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn().mockImplementation(() => mockLogger)
}));

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

  // Create the container with Jest mocks
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
    
    getService: function(name) {
      if (!this.services.has(name)) {
        throw new Error(`Service not found: ${name}`);
      }
      if (!this.serviceInstances.has(name)) {
        const ServiceClass = this.services.get(name);
        const instance = new ServiceClass();
        this.serviceInstances.set(name, instance);
      }
      return this.serviceInstances.get(name);
    },
    
reset() {
  return (async () => {
    // Call cleanup on service instances in reverse order
    const serviceInstances = Array.from(this.serviceInstances.entries());
    for (let i = serviceInstances.length - 1; i >= 0; i--) {
      const [name, instance] = serviceInstances[i];
      if (instance && typeof instance.cleanup === 'function') {
        try {
          await instance.cleanup();
        } catch (error) {
          // Use logger instead of console.error
          if (this.utils.has('LogManager')) {
            this.utils.get('LogManager').error(`Error cleaning up service ${name}:`, error);
          }
        }
      }
    }
    
    // Call cleanup on component instances
    const componentInstances = Array.from(this.componentInstances.entries());
    for (let i = componentInstances.length - 1; i >= 0; i--) {
      const [name, instance] = componentInstances[i];
      if (instance && typeof instance.cleanup === 'function') {
        try {
          await instance.cleanup();
        } catch (error) {
          console.error(`Error cleaning up component ${name}:`, error);
        }
      }
    }
    
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
    
    // Register LogManager BEFORE clearing maps
    this.registerUtil('LogManager', mockLogger);
    
    // Then clear all maps
    this.utils.clear();
    this.services.clear();
    this.components.clear();
    this.serviceInstances.clear();
    this.componentInstances.clear();
    this.serviceMetadata.clear();
  })();
}}

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
    logger: mockLogger,
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
    cleanupOrder, // Expose cleanup order for testing
    async reset() {
      // Reset the container first
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
      
      // Re-register LogManager after reset
      container.registerUtil('LogManager', mockLogger);
    }}

  return mockSystem;
};