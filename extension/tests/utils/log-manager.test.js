/**
 * Log Manager Tests
 * 
 * Tests to verify that LogManager handles early message sends gracefully
 * and doesn't cause connection errors.
 */

import { LogManager } from '../../src/utils/log-manager.js';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
    id: 'test-extension-id'
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  }
};

global.chrome = mockChrome;

describe('Log Manager', () => {
  let logManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Mock window to simulate browser environment
    global.window = { document: {} };
    
    // Create log manager for dashboard context
    logManager = new LogManager({
      context: 'test',
      isBackgroundScript: false,
      maxEntries: 100
    });
  });

  afterEach(() => {
    if (logManager && typeof logManager.cleanup === 'function') {
      logManager.cleanup();
    }
    
    // Cleanup global mocks
    delete global.window;
  });

  describe('Early Message Handling', () => {
    test('should handle background script not available gracefully', () => {
      // Arrange - Mock chrome.runtime.sendMessage to simulate connection error
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        mockChrome.runtime.lastError = {
          message: 'Could not establish connection. Receiving end does not exist.'
        };
        if (callback) callback();
      });
      
      // Act - Create a log entry that would trigger background message
      logManager.info('Test message');
      
      // Assert - Should not throw and should handle error gracefully
      expect(() => {
        logManager.info('Another test message');
      }).not.toThrow();
    });

    test('should not send messages when not in extension context', () => {
      // Arrange - Remove chrome context
      const originalChrome = global.chrome;
      global.chrome = undefined;
      
      // Act - Create log entries
      logManager.info('Test message 1');
      logManager.warn('Test message 2');
      logManager.error('Test message 3');
      
      // Assert - Should not try to send messages
      expect(() => {
        logManager.info('Another message');
      }).not.toThrow();
      
      // Cleanup
      global.chrome = originalChrome;
    });

    test('should handle missing chrome.runtime gracefully', () => {
      // Arrange - Mock chrome without runtime
      const originalChrome = global.chrome;
      global.chrome = { id: 'test' }; // No runtime property
      
      // Act - Create log entries
      logManager.info('Test message');
      
      // Assert - Should not throw
      expect(() => {
        logManager.warn('Another message');
      }).not.toThrow();
      
      // Cleanup
      global.chrome = originalChrome;
    });

    test('should handle successful background communication', () => {
      // Arrange - Mock successful message send
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (callback) callback({ success: true });
      });
      
      // Act - Create log entries
      logManager.info('Test message');
      
      // Assert - Should send message successfully
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marvin_log_entry',
          entry: expect.objectContaining({
            level: 'info',
            context: 'test'
          })
        }),
        expect.any(Function)
      );
    });

    test('should limit message size for background communication', () => {
      // Arrange - Create a very long message
      const longMessage = 'A'.repeat(1000);
      
      // Act - Log the long message
      logManager.info(longMessage);
      
      // Assert - Message should be truncated
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          entry: expect.objectContaining({
            message: expect.stringMatching(/^A{500}\.\.\. \[truncated, \d+ more characters\]$/)
          })
        }),
        expect.any(Function)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle runtime errors without crashing', () => {
      // Arrange - Mock chrome.runtime.sendMessage to throw
      mockChrome.runtime.sendMessage.mockImplementation(() => {
        throw new Error('Runtime error');
      });
      
      // Act & Assert - Should not throw
      expect(() => {
        logManager.info('Test message');
      }).not.toThrow();
    });

    test('should handle different error types gracefully', () => {
      // Arrange - Mock different error types
      const errorTypes = [
        'Could not establish connection. Receiving end does not exist.',
        'Extension context invalidated.',
        'A network error occurred.',
        'The message port closed before a response was received.'
      ];
      
      errorTypes.forEach((errorMessage, index) => {
        mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
          mockChrome.runtime.lastError = { message: errorMessage };
          if (callback) callback();
        });
        
        // Act & Assert - Should handle each error type gracefully
        expect(() => {
          logManager.info(`Test message ${index}`);
        }).not.toThrow();
      });
    });
  });
});
