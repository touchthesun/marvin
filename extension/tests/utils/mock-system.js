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
      
      // Register LogManager BEFORE clearing maps
      container.registerUtil('LogManager', mockLogger);
      
      // Then clear all maps
      container.utils.clear();
      container.services.clear();
      container.components.clear();
      container.serviceInstances.clear();
      container.componentInstances.clear();
      container.serviceMetadata.clear();
    }
  };

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
      trackTimeout: jest.fn(),
      trackInterval: jest.fn(),
      trackDOMElement: jest.fn(),
      cleanup: jest.fn(),
      cleanupNonEssential: jest.fn(),
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
    reset() {
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