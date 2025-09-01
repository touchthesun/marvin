/**
 * Background Connection Test
 * 
 * Tests to verify that the new background script properly handles
 * messages and resolves the "Could not establish connection" errors.
 */

// Set up mocks before any imports
beforeAll(() => {
  // Mock Chrome APIs for testing
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
    tabs: {
      onUpdated: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      },
      onCreated: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      }
    }
  };

  global.chrome = mockChrome;

  // Mock self for service worker context - ensure these are Jest mocks
  global.self = {
    addEventListener: jest.fn(),
    skipWaiting: jest.fn(),
    clients: {
      claim: jest.fn()
    }
  };
});

describe('Background Script - Connection Handling', () => {
  let messageListener;
  let sendResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    global.chrome.runtime.lastError = null;
    
    // Ensure mocks are properly set up before loading the script
    // Reset the mocks but preserve the object structure
    global.self.addEventListener = jest.fn();
    global.self.skipWaiting = jest.fn();
    global.self.clients = {
      claim: jest.fn()
    };
    
    // Capture the message listener function
    global.chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });
    
    // Mock sendResponse function
    sendResponse = jest.fn();
    
    // Clear module cache to ensure fresh load
    jest.resetModules();
    
    // Import and initialize the background script
    require('../../src/background/background.js');
  });

  afterEach(() => {
    // Clean up
    if (global.self.removeEventListener) {
      global.self.removeEventListener('install', expect.any(Function));
      global.self.removeEventListener('activate', expect.any(Function));
    }
  });

  describe('Message Handling', () => {
    test('should handle ping messages', () => {
      // Arrange
      const message = { action: 'ping' };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number)
      });
    });

    test('should handle marvin_log_entry messages', () => {
      // Arrange
      const message = { 
        action: 'marvin_log_entry',
        entry: { level: 'info', message: 'Test log' }
      };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number)
      });
    });

    test('should handle contentScriptPing messages', () => {
      // Arrange
      const message = { action: 'contentScriptPing' };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        timestamp: expect.any(Number)
      });
    });

    test('should handle pageVisible messages', () => {
      // Arrange
      const message = { action: 'pageVisible', url: 'https://example.com' };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: true
      });
    });

    test('should handle pageHidden messages', () => {
      // Arrange
      const message = { action: 'pageHidden', url: 'https://example.com' };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: true
      });
    });

    test('should handle unknown actions gracefully', () => {
      // Arrange
      const message = { action: 'unknown_action' };
      const sender = { tab: { id: 1 } };
      
      // Act
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown action'
      });
    });

    test('should handle malformed messages gracefully', () => {
      // Arrange
      const message = null; // Malformed message
      const sender = { tab: { id: 1 } };
      
      // Mock sendResponse to be a normal function
      const sendResponse = jest.fn();
      
      // Act - the background script should handle malformed messages gracefully
      const result = messageListener(message, sender, sendResponse);
      
      // Assert
      expect(result).toBe(true); // Should keep port open
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String)
      });
    });
  });

  describe('Service Worker Lifecycle', () => {
    test('should set up install event listener', () => {
      // Check if the mock was called at all
      expect(global.self.addEventListener).toHaveBeenCalled();
      // Check if it was called with 'install' as first argument
      const calls = global.self.addEventListener.mock.calls;
      const installCall = calls.find(call => call[0] === 'install');
      expect(installCall).toBeDefined();
    });

    test('should set up activate event listener', () => {
      // Check if the mock was called at all
      expect(global.self.addEventListener).toHaveBeenCalled();
      // Check if it was called with 'activate' as first argument
      const calls = global.self.addEventListener.mock.calls;
      const activateCall = calls.find(call => call[0] === 'activate');
      expect(activateCall).toBeDefined();
    });

    test('should set up Chrome extension event listeners', () => {
      expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(global.chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
      expect(global.chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(global.chrome.tabs.onCreated.addListener).toHaveBeenCalled();
    });
  });
});
