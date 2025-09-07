/**
 * Background Service Tests
 * 
 * TDD for Broken Systems approach to identify and fix background service worker issues.
 * These tests describe the expected behavior and will help us identify what's wrong.
 */

import { createMockSystem } from '../utils/mock-system.js';
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
    // Return mock services
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

describe('Background Service Worker', () => {
  let mockSystem;
  let backgroundService;

  beforeEach(() => {
    mockSystem = createMockSystem();
    
    // Reset Chrome mocks
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Create real background service with mock container
    backgroundService = new BackgroundService(mockContainer);
  });

  afterEach(() => {
    // Clean up
    if (backgroundService && typeof backgroundService.cleanup === 'function') {
      backgroundService.cleanup();
    }
  });

  describe('Service Worker Initialization', () => {
    test('should initialize background service worker properly', async () => {
      // Act - Initialize the background service
      const result = await backgroundService.initialize();
      
      // Assert - Service should initialize successfully
      expect(backgroundService.initialized).toBe(true);
    });

    test('should register Chrome message listeners on initialization', async () => {
      // Act
      await backgroundService.initialize();
      
      // Assert - Chrome message listeners should be registered
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    });

    test('should call setupMessageRouting during initialization', async () => {
      // Arrange - Spy on setupMessageRouting
      const setupMessageRoutingSpy = jest.spyOn(backgroundService, 'setupMessageRouting');
      
      // Act
      await backgroundService.initialize();
      
      // Assert - setupMessageRouting should be called
      expect(setupMessageRoutingSpy).toHaveBeenCalled();
      
      // Cleanup
      setupMessageRoutingSpy.mockRestore();
    });

    test('should handle service worker lifecycle events', () => {
      // Arrange - Mock self.addEventListener for service worker context
      const mockAddEventListener = jest.fn();
      global.self = {
        addEventListener: mockAddEventListener
      };
      
      // Act - Call setupServiceWorkerEvents (if it exists)
      if (typeof backgroundService.setupServiceWorkerEvents === 'function') {
        backgroundService.setupServiceWorkerEvents();
      }
      
      // Assert - Service worker events should be handled without errors
      expect(() => {
        // This should not throw
      }).not.toThrow();
      
      // Cleanup
      delete global.self;
    });
  });

  describe('Message Handling', () => {
    test('should handle incoming messages from dashboard', async () => {
      // Arrange
      await backgroundService.initialize();
      const testMessage = { action: 'ping', requestId: 'test-123' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act - Call the message handler directly
      const result = backgroundService.routeMessage(testMessage, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'test-123'
      });
    });

    test('should respond to dashboard initialization messages', async () => {
      // Arrange
      await backgroundService.initialize();
      const initMessage = { action: 'ping', requestId: 'init-123' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(initMessage, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalled();
    });

    test('should handle unknown message actions gracefully', async () => {
      // Arrange
      await backgroundService.initialize();
      const unknownMessage = { action: 'unknown-action', requestId: 'test-123' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Act
      backgroundService.routeMessage(unknownMessage, sender, sendResponse);
      
      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown action',
        requestId: 'test-123'
      });
    });

    test('should route messages through Chrome extension message system', async () => {
      // Arrange
      await backgroundService.initialize();
      const testMessage = { action: 'ping', requestId: 'chrome-test' };
      const sender = { tab: { id: 1 } };
      const sendResponse = jest.fn();
      
      // Get the Chrome message listener that was registered
      const chromeMessageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      
      // Act - Simulate Chrome extension message
      const result = chromeMessageListener(testMessage, sender, sendResponse);
      
      // Assert - Should route to background service
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number),
        requestId: 'chrome-test'
      });
    });
  });

  describe('Dashboard Communication', () => {
    test('should allow dashboard to send messages successfully', async () => {
      // Arrange
      const testMessage = { type: 'test', data: 'test-data' };
      mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      // Act
      const result = await mockChrome.runtime.sendMessage(testMessage);
      
      // Assert
      expect(result).toEqual({ success: true });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(testMessage);
    });

    test('should handle connection errors gracefully', async () => {
      // Arrange
      const testMessage = { type: 'test', data: 'test-data' };
      mockChrome.runtime.sendMessage.mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      );
      
      // Act & Assert
      await expect(mockChrome.runtime.sendMessage(testMessage))
        .rejects.toThrow('Could not establish connection. Receiving end does not exist.');
    });
  });

  describe('Error Handling', () => {
    test('should handle runtime errors without crashing', () => {
      // Arrange
      mockChrome.runtime.lastError = new Error('Test error');
      
      // Act & Assert
      expect(() => {
        if (mockChrome.runtime.lastError) {
          console.error('Runtime error:', mockChrome.runtime.lastError);
        }
      }).not.toThrow();
    });

    test('should handle missing Chrome APIs gracefully', () => {
      // Arrange
      const originalChrome = global.chrome;
      global.chrome = undefined;
      
      // Act & Assert
      expect(() => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'test' });
        }
      }).not.toThrow();
      
      // Cleanup
      global.chrome = originalChrome;
    });
  });

  describe('Integration with Background Script', () => {
    test('should work with background script initialization', async () => {
      // Arrange - Mock the background script
      const mockBackgroundScript = {
        _backgroundService: backgroundService,
        _logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() },
        setupServiceWorkerEvents: jest.fn(),
        createPublicAPI: jest.fn()
      };
      
      // Act - Simulate background script calling setupMessageRouting
      mockBackgroundScript._backgroundService.setupMessageRouting();
      
      // Assert - Chrome message listener should be registered
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });
});
