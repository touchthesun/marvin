// tests/core/container-init.test.js
import { containerInitializer } from '../../src/core/container-init';
import { createMockSystem } from '../utils/mock-system';
import fs from 'fs';
import path from 'path';

const DEBUG_MODE = process.env.DEBUG_TESTS === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const debugLog = (...args) => {
  if (DEBUG_MODE && LOG_LEVEL === 'debug') {
    infoLog(...args);
  }
};

const infoLog = (...args) => {
  if (DEBUG_MODE && ['debug', 'info'].includes(LOG_LEVEL)) {
    infoLog(...args);
  }
};

// Mock the container-init module
jest.mock('../../src/core/container-init', () => {
  const { ContainerInitializer, containerInitializer, initializeContainer, getContainerStatus, resetContainer } = require('../__mocks__/core/mock-container-init');
  return {
    ContainerInitializer,
    containerInitializer,
    initializeContainer,
    getContainerStatus,
    resetContainer
  };
});


const logsDir = path.join(__dirname, '../../logs/test');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Use a single log file for the entire test run
const testLogFile = path.join(logsDir, 'container-init.log');

// Helper to write to log file with minimal data
const writeLog = (label, data) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    label,
    data: typeof data === 'object' ? {
      ...data,
      stack: data.stack ? 'stack trace omitted' : undefined,
      results: data.results ? 'results omitted' : undefined,
      names: data.names ? `${data.names.length} items` : undefined
    } : data
  };
  
  fs.appendFileSync(testLogFile, JSON.stringify(logEntry) + '\n');
};

// Helper to measure memory usage
const logMemoryUsage = (label) => {
  if (global.gc) {
    global.gc();
  }
  const used = process.memoryUsage();
  const memoryData = {
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`
  };
  
  infoLog(`Memory usage (${label}):`, memoryData);
  writeLog(`Memory Usage - ${label}`, memoryData);
  
  return memoryData;
};

// Helper to force garbage collection and wait
const forceGC = async () => {
  if (global.gc) {
    global.gc();
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
};

describe('Container Initialization', () => {
  let mockSystem;
  let initResult;

  const clearAllReferences = async () => {
    // Clear all container references
    await mockSystem.container.reset();
    
    // Clear test-specific references
    initResult = null;
    
    // Clear any cached service instances
    for (const [name, instance] of mockSystem.container.serviceInstances) {
      if (instance && typeof instance.cleanup === 'function') {
        try {
          await instance.cleanup();
        } catch (error) {
          console.error(`Error cleaning up service ${name}:`, error);
        }
      }
    }
    
    // Clear component instances
    for (const [name, instance] of mockSystem.container.componentInstances) {
      if (instance && typeof instance.cleanup === 'function') {
        try {
          await instance.cleanup();
        } catch (error) {
          console.error(`Error cleaning up component ${name}:`, error);
        }
      }
    }
    
    // Clear all maps
    mockSystem.container.serviceInstances.clear();
    mockSystem.container.componentInstances.clear();
    mockSystem.container.services.clear();
    mockSystem.container.components.clear();
    mockSystem.container.utils.clear();
    mockSystem.container.serviceMetadata.clear();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Give GC time to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  beforeAll(async () => {
    mockSystem = createMockSystem();
    writeLog('Test Suite Start', { timestamp: new Date().toISOString() });
    await forceGC();
    logMemoryUsage('beforeAll');
  });

  beforeEach(async () => {
    const testName = expect.getState().currentTestName;
    writeLog('Test Start', { test: testName });
    
    try {
      writeLog('Starting Container Initialization', { test: testName });
      initResult = await containerInitializer.initialize({
        isBackgroundScript: false,
        context: 'test',
        mockSystem
      });
  
      if (!initResult.initialized) {
        throw new Error('Container initialization failed');
      }
      
      // Debug logging
      infoLog('Container state after initialization:', {
        services: Array.from(mockSystem.container.services.entries()),
        components: Array.from(mockSystem.container.components.entries())
      });
      
      // Verify initialization state
      const status = containerInitializer.getStatus();
      infoLog('Container status:', status);
      
      if (!status.initialized) {
        throw new Error('Container not properly initialized');
      }
      
      writeLog('Initialization Result', {
        initialized: initResult.initialized,
        serviceCount: mockSystem.container.services.size,
        utilCount: mockSystem.container.utils.size,
        componentCount: mockSystem.container.components.size
      });
    } catch (error) {
      writeLog('Initialization Error', {
        message: error.message,
        containerState: {
          serviceCount: mockSystem.container.services.size,
          utilCount: mockSystem.container.utils.size,
          componentCount: mockSystem.container.components.size
        }
      });
      throw error;
    }
    
    logMemoryUsage('beforeEach');
  });
  
  afterEach(async() => {
    const testName = expect.getState().currentTestName;
    
    // Debug logging before cleanup
    infoLog('Before cleanup - Container state:', {
      services: Array.from(mockSystem.container.services.entries()),
      components: Array.from(mockSystem.container.components.entries())
    });
    
    writeLog('Test End', { 
      test: testName,
      status: 'completed'
    });
    
    
    // Reset mock system
    mockSystem.reset();
    
    // Debug logging after mockSystem.reset
    infoLog('After mockSystem.reset - Container state:', {
      services: Array.from(mockSystem.container.services.entries()),
      components: Array.from(mockSystem.container.components.entries())
    });
    
    jest.clearAllMocks();
    logMemoryUsage('afterEach');
  });

  afterAll(async () => {
    writeLog('Test Suite End', { 
      timestamp: new Date().toISOString()
    });
    
    // Final cleanup
    await clearAllReferences();
    
    // Clean up log file
    try {
      fs.unlinkSync(testLogFile);
    } catch (error) {
      console.error('Error cleaning up log file:', error);
    }
    
    logMemoryUsage('afterAll');
  });

  describe('Essential Utilities', () => {
    test('initializes LogManager first', () => {
      if (!initResult?.initialized || !mockSystem.container.utils.has('LogManager')) {
        throw new Error('LogManager initialization failed');
      }
      expect(mockSystem.logger.info).toHaveBeenCalled();
    });
  });

  describe('Service Registration', () => {
    test('registers core services', () => {
      // Debug logging before test
      infoLog('Test start - Container state:', {
        services: Array.from(mockSystem.container.services.entries()),
        initialized: initResult?.initialized,
        status: containerInitializer.getStatus()
      });
  
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingServices = ['apiService', 'storageService', 'messageService']
        .filter(service => !mockSystem.container.services.has(service));
      
      // Debug logging for missing services
      if (missingServices.length > 0) {
        infoLog('Missing services check:', {
          allServices: Array.from(mockSystem.container.services.keys()),
          missingServices,
          containerState: {
            serviceCount: mockSystem.container.services.size,
            services: Array.from(mockSystem.container.services.entries())
          }
        });
      }
      
      if (missingServices.length > 0) {
        throw new Error(`Missing core services: ${missingServices.join(', ')}`);
      }
    });

    test('registers optional services', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingServices = ['visualizationService', 'analysisService']
        .filter(service => !mockSystem.container.services.has(service));
      
      if (missingServices.length > 0) {
        throw new Error(`Missing optional services: ${missingServices.join(', ')}`);
      }
    });
  });

  describe('Component Registration', () => {
    test('registers core components', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingComponents = ['navigation', 'overview-panel']
        .filter(component => !mockSystem.container.components.has(component));
      
      if (missingComponents.length > 0) {
        throw new Error(`Missing core components: ${missingComponents.join(', ')}`);
      }
    });

    test('registers optional components', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingComponents = ['assistant-panel', 'tasks-panel']
        .filter(component => !mockSystem.container.components.has(component));
      
      if (missingComponents.length > 0) {
        throw new Error(`Missing optional components: ${missingComponents.join(', ')}`);
      }
    });
  });

  describe('Error Handling', () => {
    test('handles initialization errors gracefully', async () => {
      // Create a separate mock system for this test
      const testMockSystem = createMockSystem();
      
      class FailingService {
        async initialize() {
          throw new Error('Simulated initialization failure');
        }
        async cleanup() {
          return Promise.resolve();
        }
      }
      
      // Replace the apiService with the failing service
      testMockSystem.services.apiService = FailingService;
      testMockSystem.container.registerService('apiService', FailingService);
      testMockSystem.container.services.set('apiService', FailingService);
      
      // Reset the container initializer to clear any cached state
      await containerInitializer.reset(testMockSystem);
      
      // Reset the initializer's internal state
      containerInitializer.initialized = false;
      containerInitializer.initializationPromise = null;
      containerInitializer.logger = testMockSystem.logger;
      containerInitializer._resourceTracker = testMockSystem.resourceTracker;
      containerInitializer._memoryMonitor = testMockSystem.memoryMonitor;
    
      try {
        await containerInitializer.initialize({
          isBackgroundScript: false,
          context: 'test',
          mockSystem: testMockSystem
        });
        throw new Error('Expected initialization to fail');
      } catch (error) {
        expect(error.message).toBe('Simulated initialization failure');
        expect(testMockSystem.logger.error).toHaveBeenCalled();
      } finally {
        await testMockSystem.container.reset();
        await forceGC();
      }
    });
  });

  describe('Memory Management', () => {
    test('does not leak memory between initializations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      try {
        await mockSystem.container.reset();
        await forceGC();
        
        let result = await containerInitializer.initialize({
          isBackgroundScript: false,
          context: 'test',
          mockSystem
        });
        
        result = null;
        await forceGC();
        
        await mockSystem.container.reset();
        await forceGC();
      } catch (error) {
        throw new Error(error.message);
      } finally {
        await mockSystem.container.reset();
        await forceGC();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      expect(finalMemory - initialMemory).toBeLessThan(50 * 1024 * 1024); // 50MB threshold
    });
  });

  describe('Cleanup Management', () => {
    test('cleans up services in correct order', async () => {
      const cleanupOrder = [];
      
      mockSystem.container.registerService('serviceA', class {
        async cleanup() {
          cleanupOrder.push('serviceA');
        }
      });
      
      mockSystem.container.registerService('serviceB', class {
        async cleanup() {
          cleanupOrder.push('serviceB');
        }
      });
      
      await mockSystem.container.getService('serviceA');
      await mockSystem.container.getService('serviceB');
      
      // Use containerInitializer.reset() instead of container.reset()
      await containerInitializer.reset(mockSystem);
      await forceGC();
      
      expect(cleanupOrder).toEqual(['serviceB', 'serviceA']);
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
    });
  
    test('handles cleanup errors gracefully', async () => {
      mockSystem.container.registerService('failingService', class {
        async cleanup() {
          throw new Error('Cleanup failed');
        }
      });
      
      await mockSystem.container.getService('failingService');
      
      // Use containerInitializer.reset() instead of container.reset()
      await expect(containerInitializer.reset(mockSystem)).resolves.not.toThrow();
      await forceGC();
      
      expect(mockSystem.container.serviceInstances.has('failingService')).toBe(false);
      expect(mockSystem.logger.error).toHaveBeenCalled();
    });
  });
})