// extension/tests/setup/services.setup.js
import { jest } from '@jest/globals';

/**
 * Service-specific test setup
 * This file configures the test environment for service testing
 * Compatible with Manifest V3 and modern extension patterns
 */

// Global service test configuration
global.SERVICE_TEST_CONFIG = {
  // Mock service dependencies
  mockDependencies: true,
  
  // Service isolation settings
  isolateServices: true,
  
  // Memory monitoring settings
  enableMemoryMonitoring: false, // Disable in tests for performance
  
  // Circuit breaker settings for testing
  circuitBreakerThreshold: 3,
  circuitBreakerTimeout: 5000,
  
  // Resource limits for testing
  maxResources: 100,
  maxMemoryUsage: 0.5,
  maxCacheSize: 50,
  maxEventListeners: 20,
  maxTimeouts: 10,
  maxIntervals: 5
};

// Mock performance API for service testing
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByType: jest.fn(() => []),
  getEntriesByName: jest.fn(() => [])
};

// Mock memory API for service testing
global.memory = {
  usedJSHeapSize: 1000000,
  totalJSHeapSize: 2000000,
  jsHeapSizeLimit: 4000000
};

// Mock requestAnimationFrame for service testing
global.requestAnimationFrame = jest.fn((callback) => {
  return setTimeout(callback, 16); // 60fps simulation
});

global.cancelAnimationFrame = jest.fn((id) => {
  clearTimeout(id);
});

// Mock AbortController for service testing
global.AbortController = class AbortController {
  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
  }
  
  abort() {
    this.signal.aborted = true;
  }
};

// Mock fetch for service testing
global.fetch = jest.fn();

// Mock setTimeout and setInterval for better testing control
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;
const originalClearTimeout = global.clearTimeout;
const originalClearInterval = global.clearInterval;

global.setTimeout = jest.fn((callback, delay) => {
  return originalSetTimeout(callback, delay);
});

global.setInterval = jest.fn((callback, delay) => {
  return originalSetInterval(callback, delay);
});

global.clearTimeout = jest.fn((id) => {
  return originalClearTimeout(id);
});

global.clearInterval = jest.fn((id) => {
  return originalClearInterval(id);
});

// Service test utilities
global.createServiceTestContext = () => ({
  mockContainer: {
    getService: jest.fn(),
    registerService: jest.fn(),
    hasService: jest.fn(),
    getServices: jest.fn(() => []),
    cleanup: jest.fn()
  },
  mockLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn()
  },
  mockDependencies: {
    apiService: {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    },
    storageService: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    },
    notificationService: {
      show: jest.fn(),
      hide: jest.fn(),
      clear: jest.fn()
    },
    taskService: {
      createTask: jest.fn(),
      cancelTask: jest.fn(),
      getTaskStatus: jest.fn()
    }
  }
});

// Service test cleanup utilities
global.cleanupServiceTest = async (service) => {
  if (service && typeof service.cleanup === 'function') {
    await service.cleanup();
  }
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset fetch mock
  global.fetch.mockClear();
};

// Service test assertion utilities
global.expectServiceToBeInitialized = (service) => {
  expect(service.isInitialized).toBe(true);
  expect(service.resourceTracker).toBeDefined();
  expect(service.memoryMonitor).toBeDefined();
};

global.expectServiceToBeCleanedUp = (service) => {
  expect(service.isInitialized).toBe(false);
};

global.expectServiceToHaveMetrics = (service) => {
  const metrics = service.getMetrics();
  expect(metrics).toHaveProperty('initialized');
  expect(metrics).toHaveProperty('memoryUsage');
  expect(metrics).toHaveProperty('resourceCounts');
  expect(metrics).toHaveProperty('activeTasks');
  expect(metrics).toHaveProperty('circuitBreakerStatus');
};