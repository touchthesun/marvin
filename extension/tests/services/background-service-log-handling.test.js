/**
 * Background Service Log Handling Tests
 * 
 * Tests to verify that the background service properly handles
 * log entry messages and other missing handlers.
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
      apiService: { /* mock api service */ },
      taskService: { /* mock task service */ },
      statusService: { 
        registerContentScript: jest.fn()
      },
      storageService: { /* mock storage service */ },
      notificationService: { /* mock notification service */ }
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

describe('Background Service Log Handling', () => {
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

  describe('Log Entry Handling', () => {
    test('should handle marvin_log_entry messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const logMessage = {
        action: 'marvin_log_entry',
        entry: {
          level: 'info',
          context: 'test',
          message: 'Test log message',
          timestamp: new Date().toISOString()
        },
        requestId: 'log-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(logMessage, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'log-123'
      });
    });

    test('should handle log entry errors gracefully', async () => {
      // Arrange
      await backgroundService.initialize();
      const logMessage = {
        action: 'marvin_log_entry',
        entry: null, // Invalid entry
        requestId: 'log-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(logMessage, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'log-123'
      });
    });
  });

  describe('Content Script Message Handling', () => {
    test('should handle pageVisible messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const message = {
        action: 'pageVisible',
        url: 'https://example.com',
        requestId: 'page-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        requestId: 'page-123'
      });
    });

    test('should handle pageHidden messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const message = {
        action: 'pageHidden',
        url: 'https://example.com',
        requestId: 'page-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        requestId: 'page-123'
      });
    });

    test('should handle contentScriptPing messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const message = {
        action: 'contentScriptPing',
        requestId: 'ping-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'ping-123'
      });
    });

    test('should handle reinitialize messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const message = {
        action: 'reinitialize',
        requestId: 'reinit-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        requestId: 'reinit-123'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle unknown actions gracefully', async () => {
      // Arrange
      await backgroundService.initialize();
      const message = {
        action: 'unknown_action',
        requestId: 'unknown-123'
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(message, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown action',
        requestId: 'unknown-123'
      });
    });
  });
});
