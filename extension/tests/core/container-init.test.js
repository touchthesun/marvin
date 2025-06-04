// tests/core/container-init.test.js
import { containerInitializer } from '../../src/core/container-init';
import { container } from '../../src/core/dependency-container';
import { ServiceRegistry } from '../../src/core/service-registry';
import { ComponentRegistry } from '../../src/core/component-registry';
import fs from 'fs';
import path from 'path';

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
      // Remove large arrays and objects
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
  
  console.log(`Memory usage (${label}):`, memoryData);
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

// Track test results with minimal data
const testResults = new Map();

// Custom test reporter with minimal data retention
const originalTest = test;
global.test = (name, fn) => {
  return originalTest(name, async () => {
    const startTime = Date.now();
    try {
      await fn();
      testResults.set(name, { 
        passed: true, 
        duration: Date.now() - startTime
      });
    } catch (e) {
      testResults.set(name, { 
        passed: false, 
        error: e.message,
        duration: Date.now() - startTime
      });
      throw e;
    }
  });
};

describe('Container Initialization', () => {
  let initResult;

  beforeAll(async () => {
    writeLog('Test Suite Start', { timestamp: new Date().toISOString() });
    await forceGC();
    logMemoryUsage('beforeAll');
  });

  beforeEach(async () => {
    const testName = expect.getState().currentTestName;
    writeLog('Test Start', { test: testName });
    
    // Clear all references before starting new test
    await clearAllReferences();
    
    try {
      writeLog('Starting Container Initialization', { test: testName });
      initResult = await containerInitializer.initialize({
        isBackgroundScript: false,
        context: 'test'
      });
  
      if (!initResult.initialized) {
        throw new Error('Container initialization failed');
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
    const testResult = testResults.get(testName);
    
    writeLog('Test End', { 
      test: testName,
      status: testResult?.passed ? 'passed' : 'failed',
      duration: testResult?.duration
    });
    
    // Clear all references after test
    await clearAllReferences();
    
    jest.clearAllMocks();
    logMemoryUsage('afterEach');
  });

  afterAll(async () => {
    const summary = {
      total: testResults.size,
      passed: Array.from(testResults.values()).filter(r => r.passed).length,
      failed: Array.from(testResults.values()).filter(r => !r.passed).length
    };
    
    writeLog('Test Suite End', { 
      timestamp: new Date().toISOString(),
      summary
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

  // Test cases remain the same but with minimal logging
  describe('Essential Utilities', () => {
    test('initializes LogManager first', () => {
      if (!initResult?.initialized || !container.utils.has('LogManager')) {
        throw new Error('LogManager initialization failed');
      }
    });
  });

  describe('Service Registration', () => {
    test('registers core services', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingServices = ['apiService', 'storageService', 'messageService']
        .filter(service => !container.services.has(service));
      
      if (missingServices.length > 0) {
        throw new Error(`Missing core services: ${missingServices.join(', ')}`);
      }
    });

    test('registers optional services', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingServices = ['visualizationService', 'analysisService']
        .filter(service => !container.services.has(service));
      
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
        .filter(component => !container.components.has(component));
      
      if (missingComponents.length > 0) {
        throw new Error(`Missing core components: ${missingComponents.join(', ')}`);
      }
    });

    test('registers optional components', () => {
      if (!initResult?.initialized) {
        throw new Error('Container initialization failed');
      }
      
      const missingComponents = ['assistant-panel', 'tasks-panel']
        .filter(component => !container.components.has(component));
      
      if (missingComponents.length > 0) {
        throw new Error(`Missing optional components: ${missingComponents.join(', ')}`);
      }
    });
  });

  describe('Error Handling', () => {
    test('handles initialization errors gracefully', async () => {
      await container.reset();
      await forceGC();
      
      class FailingService {
        async initialize() {
          throw new Error('Simulated initialization failure');
        }
        async cleanup() {
          return Promise.resolve();
        }
      }
      
      container.registerService('failingService', FailingService);

      try {
        await containerInitializer.initialize({
          isBackgroundScript: false,
          context: 'test'
        });
        throw new Error('Expected initialization to fail');
      } catch (error) {
        expect(error.message).toBe('Simulated initialization failure');
      } finally {
        await container.reset();
        await forceGC();
      }
    });
  });

  describe('Memory Management', () => {
    test('does not leak memory between initializations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      try {
        await container.reset();
        await forceGC();
        
        const result = await containerInitializer.initialize({
          isBackgroundScript: false,
          context: 'test'
        });
        
        result = null;
        await forceGC();
        
        await container.reset();
        await forceGC();
      } catch (error) {
        throw new Error(error.message);
      } finally {
        await container.reset();
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
      
      await container.reset();
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
      await expect(container.reset()).resolves.not.toThrow();
      await forceGC();
      
      expect(container.serviceInstances.has('failingService')).toBe(false);
    });
  });
});

const clearAllReferences = async () => {
  // Clear all container references
  await container.reset();
  
  // Clear test-specific references
  initResult = null;
  testResults.clear();
  
  // Clear any cached service instances
  for (const [name, instance] of container.serviceInstances) {
    if (instance && typeof instance.cleanup === 'function') {
      try {
        await instance.cleanup();
      } catch (error) {
        console.error(`Error cleaning up service ${name}:`, error);
      }
    }
  }
  
  // Clear component instances
  for (const [name, instance] of container.componentInstances) {
    if (instance && typeof instance.cleanup === 'function') {
      try {
        await instance.cleanup();
      } catch (error) {
        console.error(`Error cleaning up component ${name}:`, error);
      }
    }
  }
  
  // Clear all maps
  container.serviceInstances.clear();
  container.componentInstances.clear();
  container.services.clear();
  container.components.clear();
  container.utils.clear();
  container.serviceMetadata.clear();
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
  
  // Give GC time to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
};