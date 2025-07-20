// tests/services/graph-service.test.js
import { GraphService } from '../../src/services/graph-service.js';

// Mock Chrome APIs
const mockChrome = {
  storage: {
    local: {
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
  }
};

// Mock global objects
global.chrome = mockChrome;
global.self = {};

// Mock ApiService
const mockApiService = {
  fetchAPI: jest.fn(),
  isInitialized: true,
  initialize: jest.fn().mockResolvedValue(true)
};

// Mock ResourceTracker with all required methods
const mockResourceTracker = {
  cacheItem: jest.fn(),
  getCachedItem: jest.fn(),
  removeCachedItem: jest.fn(),
  clearCache: jest.fn(),
  getCacheSize: jest.fn(),
  getAllCachedItems: jest.fn(),
  trackTimeout: jest.fn(),
  trackInterval: jest.fn(),
  trackEventListener: jest.fn(),
  trackDOMElement: jest.fn(),
  cleanup: jest.fn().mockResolvedValue() // Add missing cleanup method
};

// Mock LogManager
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

// Mock the LogManager module
jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn().mockImplementation(() => mockLogger)
}));

describe('GraphService', () => {
  let graphService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset global state
    global.self = {};
    
    // Setup Chrome storage mocks
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    
    // Setup ResourceTracker mocks
    mockResourceTracker.getCacheSize.mockResolvedValue(0);
    mockResourceTracker.getAllCachedItems.mockResolvedValue(new Map());
    
    // Create service instance
    graphService = new GraphService({
      apiService: mockApiService
    });
    
    // Mock the resource tracker and logger
    graphService._resourceTracker = mockResourceTracker;
    graphService._logger = mockLogger;
  });

  afterEach(async () => {
    if (graphService && graphService.isInitialized) {
      await graphService.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid configuration', async () => {
      const result = await graphService.initialize();
      
      expect(result).toBe(true);
      expect(graphService.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing graph service');
      expect(mockLogger.info).toHaveBeenCalledWith('Graph service initialized successfully');
    });

    test('should require ApiService in constructor', () => {
      expect(() => new GraphService({})).toThrow('ApiService is required');
    });

    test('should validate cache configuration', () => {
      expect(() => new GraphService({
        apiService: mockApiService,
        config: {
          cache: {
            timeoutMs: -1
          }
        }
      })).toThrow('Cache timeout must be positive');
      
      expect(() => new GraphService({
        apiService: mockApiService,
        config: {
          cache: {
            maxSize: 0
          }
        }
      })).toThrow('Cache max size must be at least 1');
      
      expect(() => new GraphService({
        apiService: mockApiService,
        config: {
          cache: {
            pruneThreshold: 1.5
          }
        }
      })).toThrow('Cache prune threshold must be between 0 and 1');
    });

    test('should load configuration from Chrome storage', async () => {
      const mockConfig = {
        graphServiceConfig: {
          cacheEnabled: false,
          cacheTimeoutMs: 10000
        }
      };
      
      chrome.storage.local.get.mockResolvedValue(mockConfig);
      
      await graphService.initialize();
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith('graphServiceConfig');
      expect(graphService._cacheConfig.enabled).toBe(false);
      expect(graphService._cacheConfig.timeoutMs).toBe(10000);
    });

    test('should handle configuration loading errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await graphService.initialize();
      
      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load configuration, using defaults:',
        expect.any(Error)
      );
    });
  });

  describe('Graph Operations', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should get related pages successfully', async () => {
      const mockResponse = {
        success: true,
        nodes: [{ id: '1', url: 'https://example.com' }],
        relationships: [{ id: '1', type: 'RELATES_TO' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await graphService.getRelatedPages('https://example.com', {
        depth: 2,
        relationshipTypes: ['RELATES_TO']
      });
      
      expect(result.success).toBe(true);
      expect(result.nodes).toEqual(mockResponse.nodes);
      expect(result.relationships).toEqual(mockResponse.relationships);
      expect(result.timestamp).toBeDefined();
      
      expect(mockApiService.fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/graph/related/')
      );
    });

    test('should search graph successfully', async () => {
      const mockResponse = {
        success: true,
        nodes: [{ id: '1', title: 'Test Node' }],
        relationships: []
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await graphService.searchGraph('test query', {
        limit: 50
      });
      
      expect(result.success).toBe(true);
      expect(result.nodes).toEqual(mockResponse.nodes);
      expect(result.timestamp).toBeDefined();
      
      expect(mockApiService.fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/graph/search')
      );
    });

    test('should get node by ID successfully', async () => {
      const mockResponse = {
        success: true,
        node: { id: '1', title: 'Test Node' },
        relationships: []
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await graphService.getNode('1', {
        includeRelationships: true
      });
      
      expect(result.success).toBe(true);
      expect(result.node).toEqual(mockResponse.node);
      expect(result.relationships).toEqual(mockResponse.relationships);
      expect(result.timestamp).toBeDefined();
      
      expect(mockApiService.fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/graph/node/1')
      );
    });

    test('should handle API errors gracefully', async () => {
      mockApiService.fetchAPI.mockResolvedValue({
        success: false,
        error: 'API Error'
      });
      
      const result = await graphService.getRelatedPages('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    test('should handle network errors gracefully', async () => {
      mockApiService.fetchAPI.mockRejectedValue(new Error('Network error'));
      
      const result = await graphService.getRelatedPages('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should validate required parameters', async () => {
      const result1 = await graphService.getRelatedPages('');
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('URL is required');
      
      const result2 = await graphService.searchGraph('');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Query is required');
      
      const result3 = await graphService.getNode('');
      expect(result3.success).toBe(false);
      expect(result3.error).toBe('Node ID is required');
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should cache successful results', async () => {
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      mockResourceTracker.cacheItem.mockResolvedValue();
      
      await graphService.getRelatedPages('https://example.com');
      
      expect(mockResourceTracker.cacheItem).toHaveBeenCalledWith(
        expect.stringContaining('related:https://example.com'),
        expect.objectContaining({
          success: true,
          nodes: [{ id: '1' }],
          timestamp: expect.any(Number)
        })
      );
    });

    test('should return cached results when available', async () => {
      const cachedResult = {
        success: true,
        nodes: [{ id: '1' }],
        timestamp: Date.now()
      };
      
      mockResourceTracker.getCachedItem.mockResolvedValue(cachedResult);
      
      const result = await graphService.getRelatedPages('https://example.com');
      
      expect(result).toEqual(cachedResult);
      expect(mockApiService.fetchAPI).not.toHaveBeenCalled();
    });

    test('should bypass cache when requested', async () => {
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      await graphService.getRelatedPages('https://example.com', {
        bypassCache: true
      });
      
      expect(mockResourceTracker.getCachedItem).not.toHaveBeenCalled();
      expect(mockApiService.fetchAPI).toHaveBeenCalled();
    });

    test('should handle cache operation timeouts', async () => {
      mockResourceTracker.getCachedItem.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );
      
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await graphService.getRelatedPages('https://example.com');
      
      expect(result.success).toBe(true);
      expect(mockApiService.fetchAPI).toHaveBeenCalled();
    });

    test('should prune cache when size exceeds limit', async () => {
      mockResourceTracker.getCacheSize.mockResolvedValue(150);
      mockResourceTracker.getAllCachedItems.mockResolvedValue(new Map([
        ['key1', { timestamp: Date.now() - 10000 }],
        ['key2', { timestamp: Date.now() - 20000 }]
      ]));
      
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      await graphService.getRelatedPages('https://example.com');
      
      expect(mockResourceTracker.removeCachedItem).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should update configuration successfully', async () => {
      chrome.storage.local.set.mockResolvedValue();
      
      const result = await graphService.updateConfiguration({
        cacheEnabled: false,
        cacheTimeoutMs: 10000
      });
      
      expect(result.success).toBe(true);
      expect(graphService._cacheConfig.enabled).toBe(false);
      expect(graphService._cacheConfig.timeoutMs).toBe(10000);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should clear cache when disabled', async () => {
      const result = await graphService.updateConfiguration({
        cacheEnabled: false
      });
      
      expect(result.success).toBe(true);
      expect(mockResourceTracker.clearCache).toHaveBeenCalled();
    });

    test('should handle configuration save errors', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Save error'));
      
      const result = await graphService.updateConfiguration({
        cacheEnabled: false
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update configuration');
    });
  });

  describe('Statistics and Status', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should provide cache statistics', () => {
      const stats = graphService.getCacheStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('timeoutMs');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });

    test('should provide service status', () => {
      const status = graphService.getStatus();
      
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('hasLogger');
      expect(status).toHaveProperty('hasDependencies');
      expect(status).toHaveProperty('cacheEnabled');
      expect(status).toHaveProperty('cacheStats');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should handle initialization failures gracefully', async () => {
      const failingService = new GraphService({
        apiService: mockApiService
      });
      
      // Mock initialization to fail
      failingService._performInitialization = jest.fn().mockRejectedValue(
        new Error('Init failed')
      );
      
      const result = await failingService.initialize();
      
      expect(result).toBe(false);
      expect(failingService.isInitialized).toBe(false);
    });

    test('should handle cache errors gracefully', async () => {
      mockResourceTracker.cacheItem.mockRejectedValue(new Error('Cache error'));
      
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await graphService.getRelatedPages('https://example.com');
      
      expect(result.success).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error caching result for key',
        expect.any(String),
        expect.any(Error)
      );
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await graphService.initialize();
    });

    test('should cleanup resources on shutdown', async () => {
      await graphService.cleanup();
      
      expect(mockResourceTracker.clearCache).toHaveBeenCalled();
      expect(graphService._apiService).toBeNull();
      expect(graphService._cacheConfig.enabled).toBe(false);
    });

    test('should handle memory pressure', async () => {
      const snapshot = { used: 100, total: 1000 };
      
      await graphService._handleMemoryPressure(snapshot);
      
      expect(mockResourceTracker.clearCache).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Memory pressure detected, cleaning up non-essential resources'
      );
    });
  });

  describe('Service Worker Context', () => {
    test('should work in service worker context', async () => {
      // Create service in service worker context
      const swGraphService = new GraphService({
        apiService: mockApiService
      });
      
      // Patch service worker context detection
      swGraphService._isServiceWorkerContext = true;
      
      const result = await swGraphService.initialize();
      
      expect(result).toBe(true);
      expect(swGraphService.isInitialized).toBe(true);
      expect(swGraphService._isServiceWorkerContext).toBe(true);
    });

    test('should handle cache operations in service worker context', async () => {
      const swGraphService = new GraphService({
        apiService: mockApiService
      });
      
      swGraphService._isServiceWorkerContext = true;
      swGraphService._resourceTracker = mockResourceTracker;
      swGraphService._logger = mockLogger;
      
      await swGraphService.initialize();
      
      const mockResponse = {
        success: true,
        nodes: [{ id: '1' }]
      };
      
      mockApiService.fetchAPI.mockResolvedValue(mockResponse);
      
      const result = await swGraphService.getRelatedPages('https://example.com');
      
      expect(result.success).toBe(true);
      // Cache operations should work in service worker context
      expect(mockResourceTracker.cacheItem).toHaveBeenCalled();
    });
  });
});
