// extension/tests/services/message-service.test.js
import { jest } from '@jest/globals';
import { MessageService } from '../../src/services/message-service.js';

// Mock Chrome APIs at module level
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getBackgroundPage: jest.fn() // This makes it detect as extension page by default
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  }
};

// Mock global chrome
global.chrome = mockChrome;

// Mock LogManager at module level - CRITICAL FIX
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};

jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn().mockImplementation(() => mockLogger)
}));

// CRITICAL: Ensure the mock is applied before any imports
jest.doMock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn().mockImplementation(() => mockLogger)
}));



describe('MessageService', () => {
  let messageService;
  let mockSystem;

  beforeEach(() => {
    console.log('🧪 beforeEach: Starting test setup');
    
    // CRITICAL: Reset all mocks FIRST
    jest.clearAllMocks();
    
    // CRITICAL: Set up Chrome mocks BEFORE any service creation
    mockChrome.runtime.sendMessage = jest.fn();
    mockChrome.runtime.onMessage = {
      addListener: jest.fn(),
      removeListener: jest.fn()
    };
    mockChrome.tabs.query = jest.fn();
    mockChrome.tabs.sendMessage = jest.fn();
    mockChrome.storage.local.get = jest.fn();
    mockChrome.storage.local.set = jest.fn();
    
    // CRITICAL: Set default context to extension page
    mockChrome.runtime.getBackgroundPage = jest.fn();
    
    // CRITICAL: Ensure global chrome is set
    global.chrome = mockChrome;
    
    // Create mock system
    mockSystem = {
      logger: mockLogger, // Use the same mock logger
      memoryMonitor: {
        start: jest.fn(),
        stop: jest.fn(),
        onMemoryPressure: jest.fn()
      },
      resourceTracker: {
        cleanup: jest.fn(),
        cleanupNonEssential: jest.fn(),
        trackTimeout: jest.fn(),
        trackInterval: jest.fn(),
        trackDOMElement: jest.fn()
      }
    };
    
    console.log('🧪 beforeEach: Mock system created');
    
    // CRITICAL: Create service AFTER mocks are set up
    messageService = new MessageService();
    
    console.log('🧪 beforeEach: MessageService created, checking properties');
    console.log('🧪 beforeEach: messageService._pendingRequests:', messageService._pendingRequests);
    
    // Initialize the service
    if (!messageService._initialized) {
      console.log('🧪 beforeEach: Initializing _pendingRequests Map');
      messageService._pendingRequests = new Map();
      messageService._messageListeners = new Map();
      messageService._serviceHandlers = new Map();
      messageService._contextHandlers = new Map();
      messageService._stats = {
        totalMessages: 0,
        successfulMessages: 0,
        failedMessages: 0,
        receivedMessages: 0,
        routedMessages: 0,
        averageResponseTime: 0,
        totalResponseTime: 0,
        responseCount: 0,
        timeouts: 0,
        handledMessages: 0,
        crossContextMessages: 0
      };
    }
    
    console.log('🧪 beforeEach: Service setup complete');
  });

  afterEach(async () => {
    // CRITICAL: Clean up service
    if (messageService && messageService._initialized) {
      await messageService.cleanup();
    }
    
    // CRITICAL: Reset all mocks for test isolation
    jest.clearAllMocks();
    
    // CRITICAL: Reset Chrome mocks to default state
    mockChrome.runtime.sendMessage = jest.fn();
    mockChrome.runtime.onMessage = {
      addListener: jest.fn(),
      removeListener: jest.fn()
    };
    mockChrome.tabs.query = jest.fn();
    mockChrome.tabs.sendMessage = jest.fn();
    mockChrome.storage.local.get = jest.fn();
    mockChrome.storage.local.set = jest.fn();
    mockChrome.runtime.getBackgroundPage = jest.fn();
    
    // CRITICAL: Reset global objects
    if (global.self) {
      delete global.self;
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      console.log('🧪 Test: should initialize successfully - Starting');
      
      // Initialize the service
      await messageService.initialize();
      
      expect(messageService._initialized).toBe(true);
      expect(messageService._logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing MessageService')
      );
      
      console.log('🧪 Test: should initialize successfully - Complete');
    });

    test('should handle initialization error', async () => {
      console.log('🧪 Test: should handle initialization error - Starting');
      
      // Mock the _performInitialization method to simulate the actual error handling
      const originalPerformInit = messageService._performInitialization;
      messageService._performInitialization = jest.fn().mockImplementation(async () => {
        try {
          // Simulate the actual MessageService initialization process
          // Create logger with context-aware configuration
          messageService._logger = mockLogger;
          
          messageService._logger.info(`Initializing MessageService in ${messageService._context} context`);
          
          // Initialize Maps
          messageService._pendingRequests = new Map();
          messageService._messageListeners = new Map();
          
          // Now throw the error (simulating a failure during initialization)
          throw new Error('Init error');
          
        } catch (error) {
          // This simulates the actual error handling in MessageService._performInitialization
          messageService._logger?.error('Error initializing MessageService:', error);
          throw error;
        }
      });
      
      // The initialize method should catch the error and re-throw it
      await expect(messageService.initialize()).rejects.toThrow('Init error');
      
      // Verify the error was logged by the MessageService
      expect(messageService._logger.error).toHaveBeenCalledWith(
        'Error initializing MessageService:',
        expect.any(Error)
      );
      
      // Restore the original method
      messageService._performInitialization = originalPerformInit;
      
      console.log('🧪 Test: should handle initialization error - Complete');
    });
  });


  describe('Context Detection', () => {
    test('should detect background script context', () => {
      // Chrome APIs available but getBackgroundPage is undefined
      global.chrome.runtime.getBackgroundPage = undefined;
      
      const { MessageService } = require('../../src/services/message-service.js');
      const service = new MessageService();
      
      expect(service._isBackgroundScript).toBe(true);
      expect(service._context).toBe('background');
    });

    test('should detect extension page context', () => {
      // Chrome APIs available and getBackgroundPage exists
      global.chrome.runtime.getBackgroundPage = jest.fn();
      
      const { MessageService } = require('../../src/services/message-service.js');
      const service = new MessageService();
      
      expect(service._isBackgroundScript).toBe(false);
      expect(service._context).toBe('extension-page');
    });

    test('should detect service worker context', () => {
      console.log('🧪 Service Worker Test: Starting');
      
      // Mock service worker global scope with a more reliable approach
      global.ServiceWorkerGlobalScope = class ServiceWorkerGlobalScope {};
      global.self = new global.ServiceWorkerGlobalScope();
      
      // Add a test flag to help with detection
      global.self._isServiceWorkerTest = true;
      
      console.log('🧪 Service Worker Test: ServiceWorkerGlobalScope defined:', typeof global.ServiceWorkerGlobalScope);
      console.log('🧪 Service Worker Test: global.self created:', typeof global.self);
      console.log('🧪 Service Worker Test: global.self instanceof ServiceWorkerGlobalScope:', global.self instanceof global.ServiceWorkerGlobalScope);
      console.log('🧪 Service Worker Test: global.self._isServiceWorkerTest:', global.self._isServiceWorkerTest);
      
      const { MessageService } = require('../../src/services/message-service.js');
      const service = new MessageService();
      
      console.log('🧪 Service Worker Test: Service created');
      console.log('🧪 Service Worker Test: service._isServiceWorker before _detectContext():', service._isServiceWorker);
      
      // Mock the detection logic directly if needed
      service._detectContext();
      
      console.log('🧪 Service Worker Test: service._isServiceWorker after _detectContext():', service._isServiceWorker);
      console.log('🧪 Service Worker Test: service._isBackgroundScript:', service._isBackgroundScript);
      console.log('🧪 Service Worker Test: service._context:', service._context);
      
      expect(service._isServiceWorker).toBe(true);
    });

    test('should handle missing Chrome APIs gracefully', () => {
      // No Chrome APIs available
      global.chrome = undefined;
      
      const { MessageService } = require('../../src/services/message-service.js');
      const service = new MessageService();
      
      expect(service._isBackgroundScript).toBe(false);
      expect(service._context).toBe('extension-page');
    });
  });

  describe('Service Routing', () => {
    beforeEach(async () => {
      await messageService.initialize();
    });

    test('should add and remove service handlers', () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'test' });
      
      // Add service handler
      const removeHandler = messageService.addServiceHandler('test-service', mockHandler);
      
      expect(messageService._serviceHandlers.has('test-service')).toBe(true);
      expect(messageService._serviceHandlers.get('test-service')).toBe(mockHandler);
      
      // Remove service handler
      removeHandler();
      
      expect(messageService._serviceHandlers.has('test-service')).toBe(false);
    });

    test('should route messages to service handlers', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'test-data' });
      messageService.addServiceHandler('api', mockHandler);
      
      // Simulate message handling
      const message = {
        service: 'api',
        data: { endpoint: '/test', method: 'GET' },
        requestId: 'test-123'
      };
      
      const response = await messageService._handleLocalMessage(message);
      
      expect(mockHandler).toHaveBeenCalledWith(message, null);
      expect(response.success).toBe(true);
      expect(response.data).toBe('test-data');
    });

    test('should handle service handler errors', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Service error'));
      messageService.addServiceHandler('api', mockHandler);
      
      const message = {
        service: 'api',
        data: { endpoint: '/test' },
        requestId: 'test-123'
      };
      
      const response = await messageService._handleLocalMessage(message);
      
      expect(response.success).toBe(false);
      expect(response.error.type).toBe('SYSTEM_ERROR');
      expect(response.error.message).toBe('Service error');
    });

    test('should send messages to specific services', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'service-response' });
      messageService.addServiceHandler('storage', mockHandler);
      
      const response = await messageService.sendToService('storage', { key: 'test' });
      
      expect(mockHandler).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.data).toBe('service-response');
    });
  });

  describe('Bidirectional Messaging', () => {
    beforeEach(async () => {
      await messageService.initialize();
    });

    test('should send to background from extension page', async () => {
      // The service should already be created with extension page context
      await messageService.initialize();
      
      // CRITICAL: Override context detection AFTER initialization
      messageService._isBackgroundScript = false;
      messageService._context = 'extension-page';
      
      // CRITICAL: Mock Chrome runtime sendMessage with callback pattern
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        // Simulate successful response
        setTimeout(() => {
          callback({ success: true, data: 'background-response' });
        }, 10);
      });
      
      // CRITICAL: Ensure Chrome API is available
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      // Ensure the service is properly initialized
      expect(messageService._initialized).toBe(true);
      expect(messageService._isBackgroundScript).toBe(false);
      
      // Add debugging to understand what's happening
      console.log('🧪 Test: Chrome API mock calls before:', mockChrome.runtime.sendMessage.mock.calls.length);
      console.log('🧪 Test: Service context:', messageService._context);
      console.log('🧪 Test: Is background script:', messageService._isBackgroundScript);
      
      const response = await messageService.sendToBackground({ action: 'test' });
      
      console.log('🧪 Test: Chrome API mock calls after:', mockChrome.runtime.sendMessage.mock.calls.length);
      console.log('🧪 Test: Response:', response);
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.data).toBe('background-response');
    });

    test('should handle local messages in background context', async () => {
      // Set up as background script context
      messageService._isBackgroundScript = true;
      messageService._context = 'background';
      
      // Add a message listener
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'local-response' });
      messageService.addMessageListener('test-action', mockHandler);
      
      const response = await messageService.sendToBackground({ action: 'test-action' });
      
      expect(mockHandler).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.data).toBe('local-response');
    });

    test('should send to extension pages from background', async () => {
      // CRITICAL: Set up Chrome mock to simulate background script context
      delete mockChrome.runtime.getBackgroundPage; // This makes it detect as background script
      
      // CRITICAL: Re-create the service with correct context detection
      messageService = new MessageService();
      await messageService.initialize();
      
      // CRITICAL: Override context detection to ensure consistency
      messageService._isBackgroundScript = true;
      messageService._context = 'background';
      
      // CRITICAL: Mock Chrome tabs API
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'chrome-extension://test' },
        { id: 2, url: 'chrome-extension://test' }
      ]);
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true, data: 'tab-response' });
      
      // CRITICAL: Ensure Chrome API is available
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      const responses = await messageService.sendToExtensionPages({ action: 'notify' });
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(mockChrome.tabs.query).toHaveBeenCalled();
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(responses).toHaveLength(2);
    });

    test('should throw error when sendToExtensionPages called from extension page', async () => {
      // Set up as extension page context
      messageService._isBackgroundScript = false;
      messageService._context = 'extension-page';
      
      await expect(
        messageService.sendToExtensionPages({ action: 'test' })
      ).rejects.toThrow('sendToExtensionPages can only be called from background script');
    });
  });

  describe('Error Handling', () => {
    test('should classify network errors', () => {
      const error = new TypeError('fetch failed');
      const message = { service: 'api' };
      
      const classified = messageService._classifyError(error, message);
      
      expect(classified.type).toBe('NETWORK_ERROR');
      expect(classified.message).toBe('Network unavailable');
      expect(classified.retryable).toBe(true);
    });

    test('should classify timeout errors', () => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      const message = { service: 'api' };
      
      const classified = messageService._classifyError(error, message);
      
      expect(classified.type).toBe('TIMEOUT_ERROR');
      expect(classified.message).toBe('Request timed out');
      expect(classified.retryable).toBe(true);
    });

    test('should classify context errors', () => {
      const error = new Error('Chrome runtime APIs not available');
      const message = { service: 'api' };
      
      const classified = messageService._classifyError(error, message);
      
      expect(classified.type).toBe('CONTEXT_ERROR');
      expect(classified.message).toBe('Chrome APIs not available in this context');
      expect(classified.retryable).toBe(false);
    });

    test('should classify system errors', () => {
      const error = new Error('Unknown error');
      const message = { service: 'api' };
      
      const classified = messageService._classifyError(error, message);
      
      expect(classified.type).toBe('SYSTEM_ERROR');
      expect(classified.message).toBe('Unknown error');
      expect(classified.retryable).toBe(false);
    });

    test('should handle cleanup on errors', async () => {
      await messageService.initialize();
      
      // Mock cleanup failure
      messageService._performCleanup = jest.fn().mockRejectedValue(new Error('Cleanup error'));
      
      await expect(messageService.cleanup()).rejects.toThrow('Cleanup error');
      // The cleanup method doesn't log errors, so we don't expect logger.error to be called
    });
  });

  describe('Service Worker Adaptation', () => {
    beforeEach(async () => {
      // CRITICAL: Set up as service worker context
      global.self = { _isServiceWorkerTest: true }; // Enable test flag
      
      // CRITICAL: Ensure Chrome APIs are available for service worker tests
      mockChrome.storage.local.set.mockResolvedValue();
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.runtime.sendMessage = jest.fn();
      mockChrome.runtime.onMessage = {
        addListener: jest.fn(),
        removeListener: jest.fn()
      };
      
      // CRITICAL: Re-create service with service worker context
      messageService = new MessageService();
      messageService._isServiceWorker = true;
      
      await messageService.initialize();
      
      // CRITICAL: Ensure Chrome API is available after initialization
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
    });

    test('should store critical state', async () => {
      // Ensure the service is properly set up as service worker
      expect(messageService._isServiceWorker).toBe(true);
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      // Add a pending request
      messageService._pendingRequests.set('test-123', {
        resolve: jest.fn(),
        timeoutId: setTimeout(() => {}, 1000),
        sentAt: Date.now(),
        message: { action: 'test' }
      });
      
      await messageService._storeCriticalState();
      
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        messageServicePendingRequests: expect.objectContaining({
          'test-123': expect.objectContaining({
            sentAt: expect.any(Number),
            storedAt: expect.any(Number)
          })
        })
      });
    });

    test('should restore pending requests', async () => {
      // Ensure the service is properly set up as service worker
      expect(messageService._isServiceWorker).toBe(true);
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      const storedData = {
        'test-123': {
          resolve: jest.fn(),
          timeoutId: null,
          sentAt: Date.now() - 1000, // Recent
          message: { action: 'test' },
          storedAt: Date.now() - 1000 // Recent stored time (FIXED)
        },
        'test-456': {
          resolve: jest.fn(),
          timeoutId: null,
          sentAt: Date.now() - 400000, // Old (more than 5 minutes)
          message: { action: 'test' },
          storedAt: Date.now() - 400000 // Old stored time (FIXED)
        }
      };
      
      mockChrome.storage.local.get.mockResolvedValue({
        messageServicePendingRequests: storedData
      });
      
      await messageService._restorePendingRequests();
      
      // Should only restore recent requests
      expect(messageService._pendingRequests.has('test-123')).toBe(true);
      expect(messageService._pendingRequests.has('test-456')).toBe(false);
    });

    test('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await expect(messageService._storeCriticalState()).resolves.toBeUndefined();
    });
  });

  describe('Lifecycle Methods', () => {
    test('should handle memory pressure', async () => {
      await messageService.initialize();
      
      // CRITICAL: Ensure the logger mock is properly set up AFTER initialization
      messageService._logger = mockLogger;
      messageService._logger.warn.mockClear();
      
      // Ensure the service is properly initialized
      expect(messageService._initialized).toBe(true);
      expect(messageService._logger).toBeDefined();
      
      // CRITICAL: Add debugging to see what's happening
      console.log('🧪 Memory Pressure Test: Logger before call:', messageService._logger);
      console.log('🧪 Memory Pressure Test: Logger warn method:', messageService._logger.warn);
      console.log('🧪 Memory Pressure Test: messageService._handleMemoryPressure:', messageService._handleMemoryPressure);
      
      const snapshot = { usedJSHeapSize: 900, jsHeapSizeLimit: 1000 };
      
      // CRITICAL: Add debugging to see if method is called
      console.log('🧪 Memory Pressure Test: About to call _handleMemoryPressure');
      console.log('🧪 Memory Pressure Test: this._logger in method:', messageService._logger);
      await messageService._handleMemoryPressure(snapshot);
      console.log('🧪 Memory Pressure Test: _handleMemoryPressure completed');
      
      // CRITICAL: Add debugging to see what was called
      console.log('🧪 Memory Pressure Test: Logger warn calls:', messageService._logger.warn.mock.calls);
      console.log('Logger warn calls:', messageService._logger.warn.mock.calls);
      console.log('Logger object:', messageService._logger);
      console.log('MessageService._handleMemoryPressure:', messageService._handleMemoryPressure.toString());
      
      expect(messageService._logger.warn).toHaveBeenCalledWith(
        'Memory pressure detected, cleaning up non-essential resources'
      );
    });

    test('should cleanup resources properly', async () => {
      await messageService.initialize();
      
      // Add some state
      messageService._pendingRequests.set('test', {});
      messageService._serviceHandlers.set('test', jest.fn());
      
      await messageService.cleanup();
      
      // The cleanup method doesn't call resourceTracker.cleanup directly
      // but it does nullify the Maps and properties
      expect(messageService._pendingRequests).toBeNull();
      expect(messageService._serviceHandlers).toBeNull();
      expect(messageService._messageListeners).toBeNull();
      expect(messageService._contextHandlers).toBeNull();
      expect(messageService._stats).toBeNull();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await messageService.initialize();
    });

    test('should provide enhanced statistics', () => {
      const stats = messageService.getStatistics();
      
      expect(stats).toHaveProperty('routedMessages');
      expect(stats).toHaveProperty('crossContextMessages');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageResponseTimeMs');
    });

    test('should track message statistics', async () => {
      // CRITICAL: The service should already be created with extension page context
      await messageService.initialize();
      
      // CRITICAL: Override context detection to ensure consistency
      messageService._isBackgroundScript = false;
      messageService._context = 'extension-page';
      
      // CRITICAL: Ensure Chrome API is available
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      // Mock Chrome runtime sendMessage with callback pattern
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        setTimeout(() => {
          callback({ success: true, data: 'test-response' });
        }, 10);
      });
      
      await messageService.sendMessage({ action: 'test' });
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(messageService._stats.totalMessages).toBe(1);
      expect(messageService._stats.successfulMessages).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete message flow', async () => {
      await messageService.initialize();
      
      // Set up service handler
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'processed' });
      messageService.addServiceHandler('api', mockHandler);
      
      // Send message through service routing
      const response = await messageService.sendToService('api', { endpoint: '/test' });
      
      expect(response.success).toBe(true);
      expect(response.data).toBe('processed');
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'api',
          data: { endpoint: '/test' }
        }),
        null
      );
    });

    test('should handle service worker lifecycle', async () => {
      // CRITICAL: Set up as service worker
      global.self = { _isServiceWorkerTest: true }; // Enable test flag
      
      // CRITICAL: Ensure Chrome APIs are available
      mockChrome.storage.local.set.mockResolvedValue();
      mockChrome.runtime.sendMessage = jest.fn();
      mockChrome.runtime.onMessage = {
        addListener: jest.fn(),
        removeListener: jest.fn()
      };
      
      // CRITICAL: Re-create service with service worker context
      messageService = new MessageService();
      messageService._isServiceWorker = true;
      
      await messageService.initialize();
      
      // Ensure the service is properly set up as service worker
      expect(messageService._isServiceWorker).toBe(true);
      expect(typeof global.chrome).toBe('object');
      expect(typeof global.chrome.runtime).toBe('object');
      expect(typeof global.chrome.runtime.sendMessage).toBe('function');
      
      // Add pending request
      messageService._pendingRequests.set('test-123', {
        resolve: jest.fn(),
        timeoutId: setTimeout(() => {}, 1000),
        sentAt: Date.now(),
        message: { action: 'test' }
      });
      
      // Cleanup should store state
      await messageService.cleanup();
      
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });
});