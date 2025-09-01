/**
 * Background Service Syntax Test
 * 
 * Tests to verify the background service can be instantiated
 * and identify syntax issues.
 */

import { BackgroundService } from '../../src/background/background-service.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    sendMessage: jest.fn(),
    lastError: null,
    id: 'test-extension-id',
    getManifest: jest.fn().mockReturnValue({ manifest_version: 3 })
  },
  storage: {
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  tabs: {
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    query: jest.fn()
  },
  bookmarks: {
    getTree: jest.fn()
  },
  history: {
    search: jest.fn()
  }
};

global.chrome = mockChrome;

// Mock container
const mockContainer = {
  getService: jest.fn().mockImplementation((serviceName) => {
    const mockServices = {
      apiService: { 
        fetchAPI: jest.fn().mockResolvedValue({ success: true })
      },
      taskService: { 
        createCaptureTask: jest.fn().mockResolvedValue({ taskId: 'test-task' }),
        getActiveTasks: jest.fn().mockResolvedValue([]),
        cancelTask: jest.fn().mockResolvedValue({ success: true }),
        retryTask: jest.fn().mockResolvedValue({ success: true })
      },
      statusService: { 
        registerContentScript: jest.fn(),
        updateTabStatus: jest.fn(),
        registerTab: jest.fn(),
        setTabRelationship: jest.fn(),
        setNetworkStatus: jest.fn()
      },
      storageService: { 
        updateSettings: jest.fn().mockResolvedValue({}),
        getSettings: jest.fn().mockResolvedValue({}),
        getStats: jest.fn().mockResolvedValue({}),
        getCaptureHistory: jest.fn().mockResolvedValue([]),
        clearCache: jest.fn().mockResolvedValue({})
      },
      notificationService: { 
        showNotification: jest.fn()
      }
    };
    return mockServices[serviceName] || {};
  }),
  registerService: jest.fn(),
  services: new Map([
    ['messageService', {}],
    ['apiService', {}],
    ['taskService', {}],
    ['storageService', {}],
    ['statusService', {}],
    ['notificationService', {}]
  ]),
  components: new Map(),
  utils: new Map(),
  serviceInstances: new Map()
};

describe('Background Service - Syntax and Instantiation', () => {
  test('should be able to instantiate BackgroundService', () => {
    // This test will fail if there are syntax errors
    expect(() => {
      const backgroundService = new BackgroundService(mockContainer);
      expect(backgroundService).toBeDefined();
      expect(backgroundService.constructor.name).toBe('BackgroundService');
    }).not.toThrow();
  });

  test('should have required methods', () => {
    const backgroundService = new BackgroundService(mockContainer);
    
    // Test that required methods exist
    expect(typeof backgroundService.initialize).toBe('function');
    expect(typeof backgroundService.setupMessageRouting).toBe('function');
    expect(typeof backgroundService.routeMessage).toBe('function');
  });

  test('should be able to register message handlers', () => {
    const backgroundService = new BackgroundService(mockContainer);
    
    // This should not throw if the class structure is correct
    expect(() => {
      backgroundService.registerMessageHandlers();
    }).not.toThrow();
  });
});
