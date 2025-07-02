// tests/core/container-init.test.js
import { createMockSystem } from '../utils/mock-system';
import { containerInitializer } from '../../src/core/container-init';
import { container } from '../../src/core/dependency-container.js';
import { ServiceRegistry } from '../../src/core/service-registry.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import fs from 'fs';
import path from 'path';

const DEBUG_MODE = process.env.DEBUG_TESTS === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const debugLog = (...args) => {
  if (DEBUG_MODE && LOG_LEVEL === 'debug') {
    console.debug(...args);
  }
};

const infoLog = (...args) => {
  if (DEBUG_MODE && ['debug', 'info'].includes(LOG_LEVEL)) {
    console.info(...args);
  }
};


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
  
    // Reset the real container before each test
    await container.reset();
  
    // Register mock implementations for all services in the real registry
    class MockService { async initialize() {}; async cleanup() {}; }
    class MockComponent { async initialize() {}; async cleanup() {}; }
  
    // Register all core and optional services
    ServiceRegistry.getCoreServices().forEach(service => {
      container.registerService(service.name, MockService);
    });
  
    // Register all core and optional components
    const componentsToRegister = await ComponentRegistry.registerAll();
    Object.keys(componentsToRegister).forEach(name => {
      container.registerComponent(name, MockComponent);
    });
  
    // LOGGING
    console.log('--- Service Registry Contents ---');
    console.log(JSON.stringify(ServiceRegistry.getCoreServices(), null, 2));
    console.log('--- Component Registry Contents ---');
    console.log(JSON.stringify(Object.keys(componentsToRegister), null, 2));
  
    try {
      writeLog('Starting Container Initialization', { test: testName });
      // Use the real container for initialization
      initResult = await containerInitializer.initialize({
        isBackgroundScript: false,
        context: 'test'
      });
  
      if (!initResult.initialized) {
        throw new Error('Container initialization failed');
      }
  
      // Update logging to use the real container
      infoLog('Container state after initialization:', {
        services: Array.from(container.services.entries()),
        components: Array.from(container.components.entries())
      });
  
      const status = containerInitializer.getStatus();
      infoLog('Container status:', status);
  
      if (!status.initialized) {
        throw new Error('Container not properly initialized');
      }
  
      writeLog('Initialization Result', {
        initialized: initResult.initialized,
        serviceCount: container.services.size,
        utilCount: container.utils.size,
        componentCount: container.components.size
      });
    } catch (error) {
      writeLog('Initialization Error', {
        message: error.message,
        containerState: {
          serviceCount: container.services.size,
          utilCount: container.utils.size,
          componentCount: container.components.size
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
    // mockSystem.reset();
    
    // Debug logging after mockSystem.reset
    // infoLog('After mockSystem.reset - Container state:', {
    //   services: Array.from(mockSystem.container.services.entries()),
    //   components: Array.from(mockSystem.container.components.entries())
    // });
    
    jest.clearAllMocks();
    logMemoryUsage('afterEach');
  });

  afterAll(async () => {
    writeLog('Test Suite End', { 
      timestamp: new Date().toISOString()
    });
    
    // Final cleanup
    await clearAllReferences();
    
    // Clear all timeouts and intervals to prevent Jest from hanging
    const activeTimeouts = [];
    const activeIntervals = [];
    
    // Find all active timeouts and intervals
    for (let i = 1; i <= 1000; i++) {
      try {
        clearTimeout(i);
        activeTimeouts.push(i);
      } catch (e) {
        // Timeout doesn't exist
      }
      
      try {
        clearInterval(i);
        activeIntervals.push(i);
      } catch (e) {
        // Interval doesn't exist
      }
    }
    
    if (activeTimeouts.length > 0 || activeIntervals.length > 0) {
      console.log(`Cleared ${activeTimeouts.length} timeouts and ${activeIntervals.length} intervals`);
    }
    
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
      if (!initResult?.initialized || !container.utils.has('LogManager')) {
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
      
      container.registerService('serviceA', class {
        async cleanup() {
          cleanupOrder.push('serviceA');
        }
      });
      
      container.registerService('serviceB', class {
        async cleanup() {
          cleanupOrder.push('serviceB');
        }
      });
      
      await container.getService('serviceA');
      await container.getService('serviceB');
      
      // Use containerInitializer.reset() instead of container.reset()
      await containerInitializer.reset();
      await forceGC();
      
      expect(cleanupOrder).toEqual(['serviceB', 'serviceA']);
    });
  
    test('handles cleanup errors gracefully', async () => {
      container.registerService('failingService', class {
        async cleanup() {
          throw new Error('Cleanup failed');
        }
      });
      
      await container.getService('failingService');
      
      // Use containerInitializer.reset() instead of container.reset()
      await expect(containerInitializer.reset()).resolves.not.toThrow();
      await forceGC();
      
      expect(container.serviceInstances.has('failingService')).toBe(false);
      expect(mockSystem.logger.error).toHaveBeenCalled();
    });
  });
})