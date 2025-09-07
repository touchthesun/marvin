// extension/tests/utils/service-mock-system.js
import { jest } from '@jest/globals';

/**
 * Service-specific mock system following established patterns
 * Based on the proven mock-system.js pattern from the testing guide
 */
export function createServiceMockSystem() {
  return {
    // Core service dependencies
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    },
    
    // Resource management
    resourceTracker: {
      cleanup: jest.fn(),
      cleanupNonEssential: jest.fn(),
      trackEventListener: jest.fn(),
      trackTimeout: jest.fn(),
      trackInterval: jest.fn(),
      trackDOMElement: jest.fn(),
      getResourceCount: jest.fn(() => ({
        eventListeners: 0,
        timeouts: 0,
        intervals: 0,
        cacheSize: 0
      }))
    },
    
    // Memory management
    memoryMonitor: {
      start: jest.fn(),
      stop: jest.fn(),
      onMemoryPressure: jest.fn(),
      getLastSnapshot: jest.fn(() => ({
        usedJSHeapSize: 1000000,
        totalJSHeapSize: 2000000,
        jsHeapSizeLimit: 4000000
      }))
    },
    
    // Service dependencies
    apiService: {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      fetchAPI: jest.fn()
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
    },
    
    // Container mock
    container: {
      getService: jest.fn(),
      registerService: jest.fn(),
      hasService: jest.fn(),
      getServices: jest.fn(() => []),
      cleanup: jest.fn()
    },
    
    // Chrome API mocks
    chrome: {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
          clear: jest.fn()
        },
        sync: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
          clear: jest.fn()
        },
        onChanged: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        }
      },
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        }
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn()
      }
    },
    
    // Reset function following established pattern
    reset() {
      Object.values(this).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          Object.values(value).forEach(fn => {
            if (typeof fn === 'function' && fn.mockReset) {
              fn.mockReset();
            }
          });
        }
      });
    }
  };
}