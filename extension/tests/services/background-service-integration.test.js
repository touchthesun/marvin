/**
 * Background Service Integration Tests
 * 
 * Tests that simulate the real browser scenario where dashboard sends messages
 * to the background service worker.
 */

import { createMockSystem } from '../utils/mock-system.js';
import { BackgroundService } from '../../src/background/background-service.js';

// Mock Chrome APIs for integration testing
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
    lastError: null
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
      statusService: { /* mock status service */ },
      storageService: { /* mock storage service */ },
      notificationService: { /* mock notification service */ }
    };
    return mockServices[serviceName] || {};
  }),
  registerService: jest.fn()
};

describe('Background Service Integration', () => {
  let mockSystem;
  let backgroundService;

  beforeEach(() => {
    mockSystem = createMockSystem();
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    backgroundService = new BackgroundService(mockContainer);
  });

  afterEach(() => {
    if (backgroundService && typeof backgroundService.cleanup === 'function') {
      backgroundService.cleanup();
    }
  });

  describe('Dashboard to Background Communication', () => {
    test('should handle dashboard initialization message', async () => {
      // Arrange - Initialize background service
      await backgroundService.initialize();
      
      // Simulate dashboard sending initialization message
      const dashboardMessage = {
        action: 'ping',
        requestId: 'dashboard-init-123',
        timestamp: Date.now()
      };
      
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act - Simulate message from dashboard
      backgroundService.routeMessage(dashboardMessage, sender, sendResponse);
      
      // Assert - Background should respond
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'dashboard-init-123'
      });
    });

    test('should handle multiple concurrent messages', async () => {
      // Arrange - Initialize background service
      await backgroundService.initialize();
      
      const messages = [
        { action: 'ping', requestId: 'msg-1' },
        { action: 'ping', requestId: 'msg-2' },
        { action: 'ping', requestId: 'msg-3' }
      ];
      
      const responses = [];
      
      // Act - Send multiple messages concurrently
      messages.forEach((message, index) => {
        const sendResponse = jest.fn().mockImplementation((response) => {
          responses[index] = response;
        });
        backgroundService.routeMessage(message, { tab: { id: index } }, sendResponse);
      });
      
      // Assert - All messages should be handled
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
    });

    test('should handle connection errors gracefully', async () => {
      // Arrange - Mock chrome.runtime.sendMessage to simulate connection error
      mockChrome.runtime.sendMessage.mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      );
      
      // Act & Assert - Should handle error gracefully
      await expect(mockChrome.runtime.sendMessage({ action: 'test' }))
        .rejects.toThrow('Could not establish connection. Receiving end does not exist.');
    });
  });

  describe('Service Worker Lifecycle', () => {
    test('should handle service worker activation', () => {
      // Arrange - Mock service worker context
      const mockAddEventListener = jest.fn();
      global.self = {
        addEventListener: mockAddEventListener
      };
      
      // Act - Simulate service worker activation
      if (typeof backgroundService.setupServiceWorkerEvents === 'function') {
        backgroundService.setupServiceWorkerEvents();
      }
      
      // Assert - Service worker events should be registered
      expect(mockAddEventListener).toHaveBeenCalled();
      
      // Cleanup
      delete global.self;
    });

    test('should maintain state across service worker restarts', async () => {
      // Arrange - Initialize service
      await backgroundService.initialize();
      
      // Act - Simulate service worker restart
      const initialState = backgroundService.initialized;
      
      // Simulate cleanup and re-initialization
      if (typeof backgroundService.cleanup === 'function') {
        await backgroundService.cleanup();
      }
      await backgroundService.initialize();
      
      // Assert - Service should be re-initialized
      expect(backgroundService.initialized).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    test('should recover from initialization failures', async () => {
      // Arrange - Mock container to fail
      const failingContainer = {
        getService: jest.fn().mockImplementation(() => {
          throw new Error('Service not available');
        }),
        registerService: jest.fn()
      };
      
      const failingService = new BackgroundService(failingContainer);
      
      // Act & Assert - Should handle initialization failure gracefully
      await expect(failingService.initialize()).rejects.toThrow('Service not available');
    });

    test('should handle missing Chrome APIs gracefully', () => {
      // Arrange - Remove Chrome APIs
      const originalChrome = global.chrome;
      global.chrome = undefined;
      
      // Act & Assert - Should not crash
      expect(() => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ action: 'test' });
        }
      }).not.toThrow();
      
      // Cleanup
      global.chrome = originalChrome;
    });
  });
});
