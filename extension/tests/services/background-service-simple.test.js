/**
 * Simple Background Service Test
 * 
 * Tests to verify the basic functionality of the background service
 * and identify core design issues.
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

describe('Background Service - Core Functionality', () => {
  let backgroundService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    backgroundService = new BackgroundService(mockContainer);
  });

  afterEach(() => {
    if (backgroundService && typeof backgroundService.cleanup === 'function') {
      backgroundService.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      // Act
      await backgroundService.initialize();
      
      // Assert
      expect(backgroundService.initialized).toBe(true);
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    test('should set up message routing', async () => {
      // Act
      await backgroundService.initialize();
      
      // Assert
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('Message Routing', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    test('should handle ping messages', () => {
      // Arrange
      const message = { action: 'ping', requestId: 'test-123' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'test-123'
      });
    });

    test('should handle unknown actions gracefully', () => {
      // Arrange
      const message = { action: 'unknown_action', requestId: 'test-123' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown action',
        requestId: 'test-123'
      });
    });

    test('should handle captureUrl messages', async () => {
      // Arrange
      const message = { 
        action: 'captureUrl', 
        url: 'https://example.com',
        requestId: 'test-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { taskId: 'test-task' },
        requestId: 'test-123'
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    test('should handle service unavailability gracefully', async () => {
      // Arrange
      mockContainer.getService.mockReturnValue(null);
      const message = { 
        action: 'captureUrl', 
        url: 'https://example.com',
        requestId: 'test-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Task service not available',
        requestId: 'test-123'
      });
    });
  });
});
