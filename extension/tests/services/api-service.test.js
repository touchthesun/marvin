// extension/tests/services/api-service.test.js
import { jest } from '@jest/globals';

// Move mocks to module level (outside of describe blocks)
jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn()
  }))
}));

// Mock fetch globally
global.fetch = jest.fn();

/**
 * ApiService test following TDD for a broken system approach
 */
describe('ApiService', () => {
  let apiService;

  beforeEach(() => {
    // Mock fetch globally
    global.fetch = jest.fn();
    
    // Mock Chrome storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue()
        }
      }
    };

    // Create API service instance
    apiService = new (require('../../src/services/api-service.js').ApiService)();
  });

  afterEach(async () => {
    // Clean up
    if (apiService && apiService.initialized) {
      await apiService.cleanup();
    }
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should create API service instance', () => {
      expect(apiService).toBeDefined();
      expect(apiService).toBeInstanceOf(require('../../src/services/api-service.js').ApiService);
    });

    test('should start uninitialized', () => {
      expect(apiService.isInitialized).toBe(false);
    });

    test('should have API service specific properties', () => {
      expect(apiService._baseURL).toBeDefined();
      expect(apiService._activeRequests).toBeDefined();
      expect(apiService._stats).toBeDefined();
    });
  });

  describe('Service Properties', () => {
    test('should have required API service properties', () => {
      expect(apiService._baseURL).toBe('http://localhost:8000');
      expect(apiService._activeRequests).toBeDefined();
      expect(apiService._abortControllers).toBeDefined();
      expect(apiService._messagePorts).toBeDefined();
      expect(apiService._stats).toBeDefined();
      expect(apiService._config).toBeDefined();
    });
  });


  describe('API Requests', () => {
    test('should handle successful API requests', async () => {
      const mockResponse = { data: 'test response' };
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await apiService.fetchAPI('/test');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          })
        })
      );
    });

    test('should handle API errors (4xx/5xx)', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue({ error: 'Server error' })
      });

      const result = await apiService.fetchAPI('/error');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await apiService.fetchAPI('/network-error');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    test('should handle timeout errors', async () => {
      // Mock a request that rejects immediately to simulate timeout
      global.fetch.mockRejectedValue(new Error('Request timed out'));
  
      const result = await apiService.fetchAPI('/timeout');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('timed out');
    });

    test('should generate unique request IDs', async () => {
      const mockResponse = { data: 'test' };
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result1 = await apiService.fetchAPI('/test1');
      const result2 = await apiService.fetchAPI('/test2');
      
      // Verify different request IDs were generated
      expect(result1.requestId).toBeDefined();
      expect(result2.requestId).toBeDefined();
      expect(result1.requestId).not.toBe(result2.requestId);
    });

    test('should track request statistics', async () => {
      const mockResponse = { data: 'test' };
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const initialStats = { ...apiService._stats };
      
      await apiService.fetchAPI('/test');
      
      expect(apiService._stats.totalRequests).toBe(initialStats.totalRequests + 1);
      expect(apiService._stats.successfulRequests).toBe(initialStats.successfulRequests + 1);
    });
  });

  describe('Configuration Management', () => {
    test('should load configuration from storage', async () => {
      // Mock Chrome storage with configuration
      global.chrome = {
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({
              apiConfig: {
                baseURL: 'https://api.example.com',
                apiKey: 'test-key'
              }
            })
          }
        }
      };

      // Initialize the service first to ensure logger is available
      await apiService.initialize();
      
      // Now load configuration
      await apiService._loadConfiguration();
      
      expect(apiService._baseURL).toBe('https://api.example.com');
      expect(apiService._apiKey).toBe('test-key');
    });

    test('should use default configuration when storage is empty', async () => {
      // Mock empty Chrome storage
      global.chrome = {
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({})
          }
        }
      };

      // Initialize the service first
      await apiService.initialize();
      
      const originalBaseURL = apiService._baseURL;
      await apiService._loadConfiguration();
      
      // Should keep default values
      expect(apiService._baseURL).toBe(originalBaseURL);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Enable fake timers only for circuit breaker tests
      jest.useFakeTimers();
    });

    afterEach(() => {
      // Reset to real timers
      jest.useRealTimers();
    });

    test('should implement circuit breaker pattern', () => {
      expect(apiService._isCircuitBreakerOpen()).toBe(false);
      
      // Simulate multiple failures
      for (let i = 0; i < apiService._circuitBreakerThreshold; i++) {
        apiService._recordFailure();
      }
      
      expect(apiService._isCircuitBreakerOpen()).toBe(true);
    });

    test('should reset circuit breaker after timeout', () => {
      // Open circuit breaker
      for (let i = 0; i < apiService._circuitBreakerThreshold; i++) {
        apiService._recordFailure();
      }
      expect(apiService._isCircuitBreakerOpen()).toBe(true);
      
      // Fast forward time past timeout
      jest.advanceTimersByTime(apiService._circuitBreakerTimeout + 1000);
      
      expect(apiService._isCircuitBreakerOpen()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup active requests', async () => {
      // Start a request
      global.fetch.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );
      
      const requestPromise = apiService.fetchAPI('/test');
      
      // Cleanup should abort active requests
      await apiService.cleanup();
      
      expect(apiService._activeRequests.size).toBe(0);
    });
  });

  describe('ApiService Background Script Integration', () => {
    let apiService;
  
    beforeEach(() => {
      // Mock Chrome runtime for background script context
      global.chrome = {
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue()
          }
        },
        runtime: {
          onMessage: {
            addListener: jest.fn(),
            removeListener: jest.fn()
          }
        }
      };
  
      // Create API service instance
      apiService = new (require('../../src/services/api-service.js').ApiService)();
    });
  
    afterEach(async () => {
      if (apiService && apiService.initialized) {
        await apiService.cleanup();
      }
      jest.clearAllMocks();
    });
  
    test('should initialize in background script context', async () => {
      await apiService.initialize();
      
      expect(apiService._logger).toBeDefined();
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  
    test('should handle API requests via message passing', async () => {
      await apiService.initialize();
      
      const mockResponse = { data: 'test response' };
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse)
      });
  
      const result = await apiService.sendApiRequest('/test');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
    });
  
    test('should get service status via message passing', async () => {
      await apiService.initialize();
      
      const status = await apiService.getServiceStatus();
      
      expect(status.status).toBeDefined();
      expect(status.statistics).toBeDefined();
    });
  });
});