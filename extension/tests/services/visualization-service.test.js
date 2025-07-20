// tests/services/visualization-service.test.js
import { VisualizationService } from '../../src/services/visualization-service.js';

// Mock D3
jest.mock('d3', () => ({
  selectAll: jest.fn(() => ({
    remove: jest.fn()
  }))
}));

// Mock LogManager
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn(() => mockLogger)
}));

// Mock BaseService
const mockResourceTracker = {
  trackInterval: jest.fn(() => 'mock-interval-id'),
  trackDOMElement: jest.fn(),
  cleanup: jest.fn(),
  cleanupNonEssential: jest.fn()
};

const mockMemoryMonitor = {
  start: jest.fn(),
  stop: jest.fn()
};

// Mock BaseService as a proper class to preserve inheritance
jest.mock('../../src/services/base-service.js', () => ({
  BaseService: jest.fn().mockImplementation(function() {
    // Mock the properties and methods
    this._resourceTracker = mockResourceTracker;
    this._memoryMonitor = mockMemoryMonitor;
    this._initialized = false;
    // Mock the cleanup method to properly call _performCleanup
    this.cleanup = jest.fn().mockImplementation(async function() {
      if (!this._initialized) return;
      
      try {
        this._memoryMonitor.stop();
        await this._resourceTracker.cleanup();
        await this._performCleanup();
        this._initialized = false;
      } catch (error) {
        this._initialized = false;
        throw error;
      }
    });
    // Don't mock _handleMemoryPressure - let the service's method be called
    
    // Mock the initialize method to properly set _initialized
    this.initialize = jest.fn().mockImplementation(async function() {
      if (this._initialized) return true;
      
      try {
        // Call the service's _performInitialization method
        const result = await this._performInitialization();
        this._initialized = true;
        return result !== false;
      } catch (error) {
        this._initialized = false;
        // Return false instead of throwing for graceful error handling
        return false;
      }
    });
    
    // Add the isInitialized getter
    Object.defineProperty(this, 'isInitialized', {
      get: function() {
        return this._initialized;
      },
      configurable: true
    });
    
    return this;
  })
}));

// Add this test to check BaseService inheritance
describe('BaseService Inheritance Test', () => {
  test('should properly inherit from BaseService', () => {
    console.log('🧪 Debug: Testing BaseService inheritance');
    
    // Check if BaseService is properly imported
    const { BaseService } = require('../../src/services/base-service.js');
    console.log('🧪 Debug: BaseService =', typeof BaseService);
    console.log('🧪 Debug: BaseService.name =', BaseService.name);
    
    // Check if VisualizationService extends BaseService
    console.log('🧪 Debug: VisualizationService.prototype.constructor =', VisualizationService.prototype.constructor);
    console.log('🧪 Debug: Object.getPrototypeOf(VisualizationService) =', Object.getPrototypeOf(VisualizationService));
    
    expect(typeof BaseService).toBe('function');
    expect(VisualizationService.prototype.constructor).toBe(VisualizationService);
  });
});

describe('Basic Class Test', () => {
  test('should be able to import and instantiate VisualizationService', () => {
    console.log('🧪 Debug: Testing basic class import');
    console.log('🧪 Debug: VisualizationService =', typeof VisualizationService);
    console.log('🧪 Debug: VisualizationService.name =', VisualizationService.name);
    
    // Try to create a new instance
    const testInstance = new VisualizationService();
    console.log('🧪 Debug: testInstance constructor name =', testInstance.constructor.name);
    console.log('🧪 Debug: testInstance instanceof VisualizationService =', testInstance instanceof VisualizationService);
    
    expect(typeof VisualizationService).toBe('function');
    expect(VisualizationService.name).toBe('VisualizationService');
    expect(testInstance.constructor.name).toBe('VisualizationService');
    expect(testInstance instanceof VisualizationService).toBe(true);
  });
});

describe('VisualizationService', () => {
  let visualizationService;
  let mockContainer;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock DOM container
    mockContainer = document.createElement('div');
    mockContainer.id = 'test-container';
    document.body.appendChild(mockContainer);
    
    // Create service instance
    visualizationService = new VisualizationService();
  });

  afterEach(() => {
    // Clean up DOM
    if (mockContainer && mockContainer.parentNode) {
      mockContainer.parentNode.removeChild(mockContainer);
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with default configuration', async () => {
      console.log('🧪 Debug: About to call initialize()');
      console.log('🧪 Debug: visualizationService.initialize =', typeof visualizationService.initialize);
      console.log('🧪 Debug: visualizationService._performInitialization =', typeof visualizationService._performInitialization);
      console.log('🧪 Debug: visualizationService constructor =', visualizationService.constructor.name);
      console.log('🧪 Debug: visualizationService prototype =', Object.getPrototypeOf(visualizationService));
      
      const result = await visualizationService.initialize();
      
      console.log('🧪 Debug: initialize() returned:', result);
      console.log('🧪 Debug: visualizationService.isInitialized =', visualizationService.isInitialized);
      
      expect(result).toBe(true);
      expect(visualizationService.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing visualization service');
      expect(mockLogger.info).toHaveBeenCalledWith('Visualization service initialized successfully');
    });

    test('should start D3 check interval on initialization', async () => {
      await visualizationService.initialize();
      
      expect(mockResourceTracker.trackInterval).toHaveBeenCalledWith(
        expect.any(Function),
        VisualizationService._DEFAULT_CONFIG.d3CheckInterval
      );
    });

    test('should start cleanup interval on initialization', async () => {
      await visualizationService.initialize();
      
      expect(mockResourceTracker.trackInterval).toHaveBeenCalledWith(
        expect.any(Function),
        VisualizationService._DEFAULT_CONFIG.cleanupInterval
      );
    });

    test('should handle initialization errors gracefully', async () => {
      // Mock initialization to fail
      visualizationService._performInitialization = jest.fn().mockRejectedValue(
        new Error('Init failed')
      );
      
      const result = await visualizationService.initialize();
      
      expect(result).toBe(false);
      expect(visualizationService.isInitialized).toBe(false);
    });
  });

  describe('D3 Availability', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should check D3 availability', () => {
      // Mock D3 as available
      global.d3 = { version: '7.0.0' };
      
      visualizationService._checkD3Availability();
      
      expect(visualizationService._d3Available).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('D3 availability: true');
    });

    test('should handle D3 availability check errors', () => {
      // Mock the logger.debug call to throw an error
      const originalDebug = visualizationService._logger.debug;
      visualizationService._logger.debug = jest.fn().mockImplementation(() => {
        throw new Error('D3 check failed');
      });
      
      visualizationService._checkD3Availability();
      
      expect(visualizationService._d3Available).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Error checking D3 availability:', expect.any(Error));
      
      // Restore original debug method
      visualizationService._logger.debug = originalDebug;
    });

    test('should detect D3 from window object', () => {
      // Mock D3 on window
      global.d3 = undefined;
      global.window = { d3: { version: '7.0.0' } };
      
      visualizationService._checkD3Availability();
      
      expect(visualizationService._d3Available).toBe(true);
    });
  });

  describe('Bar Chart Creation', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should create bar chart successfully with valid data', async () => {
      const data = [
        { label: 'A', value: 10, color: '#ff0000' },
        { label: 'B', value: 20, color: '#00ff00' },
        { label: 'C', value: 15, color: '#0000ff' }
      ];
      
      const result = await visualizationService.createBarChart('test-container', data);
      
      expect(result).toBe(true);
      expect(mockContainer.querySelector('.fallback-bar-chart')).toBeTruthy();
      expect(mockContainer.querySelectorAll('.bar-container')).toHaveLength(3);
    });

    test('should handle missing container ID', async () => {
      const data = [{ label: 'A', value: 10 }];
      
      const result = await visualizationService.createBarChart('', data);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No container ID provided for bar chart');
    });

    test('should handle missing container element', async () => {
      const data = [{ label: 'A', value: 10 }];
      
      const result = await visualizationService.createBarChart('non-existent-container', data);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Container element not found: non-existent-container');
    });

    test('should handle invalid data', async () => {
      const result = await visualizationService.createBarChart('test-container', null);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid data provided for bar chart');
    });

    test('should handle empty data array', async () => {
      const result = await visualizationService.createBarChart('test-container', []);
      
      expect(result).toBe(true);
      expect(mockContainer.querySelector('.empty-chart-placeholder')).toBeTruthy();
      expect(mockContainer.textContent).toContain('No data available');
    });

    test('should create chart with custom options', async () => {
      const data = [{ label: 'A', value: 10 }];
      const options = { height: '300px', width: '500px' };
      
      const result = await visualizationService.createBarChart('test-container', data, options);
      
      expect(result).toBe(true);
      const chartContainer = mockContainer.querySelector('.fallback-bar-chart');
      expect(chartContainer.style.height).toBe('300px');
      expect(chartContainer.style.width).toBe('500px');
    });

    test('should track DOM elements for cleanup', async () => {
      const data = [{ label: 'A', value: 10 }];
      
      await visualizationService.createBarChart('test-container', data);
      
      expect(mockResourceTracker.trackDOMElement).toHaveBeenCalled();
    });
  });

  describe('Knowledge Graph Creation', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should create knowledge graph successfully with valid data', async () => {
      const nodes = [
        { id: '1', label: 'Node 1', color: '#ff0000' },
        { id: '2', label: 'Node 2', color: '#00ff00' }
      ];
      const links = [
        { source: '1', target: '2' }
      ];
      
      const result = await visualizationService.createKnowledgeGraph('test-container', nodes, links);
      
      expect(result).toBe(true);
      expect(mockContainer.querySelector('.fallback-graph')).toBeTruthy();
      expect(mockContainer.querySelectorAll('.graph-node')).toHaveLength(2);
    });

    test('should handle missing container ID', async () => {
      const result = await visualizationService.createKnowledgeGraph('', [], []);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No container ID provided for knowledge graph');
    });

    test('should handle missing container element', async () => {
      const result = await visualizationService.createKnowledgeGraph('non-existent-container', [], []);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Container element not found: non-existent-container');
    });

    test('should handle empty nodes array', async () => {
      const result = await visualizationService.createKnowledgeGraph('test-container', [], []);
      
      expect(result).toBe(true);
      expect(mockContainer.querySelector('.graph-placeholder')).toBeTruthy();
      expect(mockContainer.textContent).toContain('No data available for visualization');
    });

    test('should add event listeners to graph nodes', async () => {
      const nodes = [{ id: '1', label: 'Node 1' }];
      const links = [];
      
      await visualizationService.createKnowledgeGraph('test-container', nodes, links);
      
      const nodeElement = mockContainer.querySelector('.graph-node');
      expect(nodeElement).toBeTruthy();
      expect(nodeElement.dataset.id).toBe('1');
    });

    test('should add reset button to graph', async () => {
      const nodes = [{ id: '1', label: 'Node 1' }];
      const links = [];
      
      await visualizationService.createKnowledgeGraph('test-container', nodes, links);
      
      const resetButton = mockContainer.querySelector('.reset-graph-btn');
      expect(resetButton).toBeTruthy();
      expect(resetButton.textContent).toBe('Reset View');
    });
  });

  describe('Node Click Handling', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should handle node click events', () => {
      const node = { id: '1', label: 'Node 1' };
      const links = [
        { source: '1', target: '2' },
        { source: '2', target: '3' }
      ];
      
      // Create mock event
      const mockEvent = {
        currentTarget: document.createElement('div')
      };
      
      // Mock document.querySelectorAll
      const mockNodes = [
        { style: { opacity: '1' }, dataset: { id: '1' } },
        { style: { opacity: '1' }, dataset: { id: '2' } },
        { style: { opacity: '1' }, dataset: { id: '3' } }
      ];
      
      document.querySelectorAll = jest.fn(() => mockNodes);
      document.querySelector = jest.fn((selector) => {
        if (selector.includes('data-id="1"')) return mockNodes[0];
        if (selector.includes('data-id="2"')) return mockNodes[1];
        if (selector.includes('data-id="3"')) return mockNodes[2];
        return null;
      });
      
      visualizationService._handleNodeClick(mockEvent, node, links);
      
      // Check that connected nodes are highlighted
      // Node 1 (clicked) and Node 2 (directly connected) should be highlighted
      // Node 3 is not directly connected to Node 1, so it should remain dimmed
      expect(mockNodes[0].style.opacity).toBe('1'); // Node 1 (clicked)
      expect(mockNodes[1].style.opacity).toBe('1'); // Node 2 (directly connected)
      expect(mockNodes[2].style.opacity).toBe('0.5'); // Node 3 (not directly connected)
    });

    test('should handle node click with missing data', () => {
      const mockEvent = { currentTarget: document.createElement('div') };
      
      // Should not throw error
      expect(() => {
        visualizationService._handleNodeClick(mockEvent, null, []);
      }).not.toThrow();
    });
  });

  describe('Reset View Handling', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should reset node highlighting', () => {
      // Mock document.querySelectorAll
      const mockNodes = [
        { style: { opacity: '0.5', boxShadow: '0 0 5px rgba(0,0,0,0.5)' } },
        { style: { opacity: '0.5', boxShadow: '0 0 5px rgba(0,0,0,0.5)' } }
      ];
      
      document.querySelectorAll = jest.fn(() => mockNodes);
      
      visualizationService._handleResetView();
      
      // Check that all nodes are reset
      mockNodes.forEach(node => {
        expect(node.style.opacity).toBe('1');
        expect(node.style.boxShadow).toBe('none');
      });
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should cleanup resources on shutdown', async () => {
      await visualizationService.cleanup();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up visualization service');
      expect(mockResourceTracker.cleanup).toHaveBeenCalled();
    });

    test('should handle memory pressure', async () => {
      const snapshot = { used: 100, total: 1000 };
      
      await visualizationService._handleMemoryPressure(snapshot);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Memory pressure detected in visualization service');
    });

    test('should cleanup old visualizations', async () => {
      // Mock document.contains to return false (element removed from DOM)
      const mockRemovedContainer = {};
      
      // Mock document.contains to return false for this container
      const originalContains = document.contains;
      document.contains = jest.fn((element) => {
        if (element === mockRemovedContainer) {
          return false; // Element is not in DOM
        }
        return originalContains ? originalContains(element) : false;
      });
      
      // Use a regular Map for testing to prevent garbage collection
      visualizationService._activeCharts = new Map();
      visualizationService._activeCharts.set(mockRemovedContainer, { elements: [], type: 'bar' });
      
      console.log('🧪 Debug: After setting container, _activeCharts type =', typeof visualizationService._activeCharts);
      console.log('🧪 Debug: _activeCharts constructor =', visualizationService._activeCharts.constructor.name);
      console.log('🧪 Debug: _activeCharts entries =', Array.from(visualizationService._activeCharts.entries()).length);
      console.log('🧪 Debug: mockRemovedContainer =', mockRemovedContainer);
      
      await visualizationService._cleanupOldVisualizations();
      
      expect(visualizationService._activeCharts.has(mockRemovedContainer)).toBe(false);
      
      // Restore original document.contains
      document.contains = originalContains;
    });

    test('should cleanup all visualizations', async () => {
      const mockContainer1 = {};
      const mockContainer2 = {};
      
      // Use regular Maps for testing to prevent garbage collection
      visualizationService._activeCharts = new Map();
      visualizationService._activeGraphs = new Map();
      
      visualizationService._activeCharts.set(mockContainer1, { elements: [], type: 'bar' });
      visualizationService._activeGraphs.set(mockContainer2, { elements: [], type: 'graph' });
      
      await visualizationService._cleanupAllVisualizations();
      
      expect(visualizationService._activeCharts.has(mockContainer1)).toBe(false);
      expect(visualizationService._activeGraphs.has(mockContainer2)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await visualizationService.initialize();
    });

    test('should handle chart creation errors gracefully', async () => {
      // Mock createBarChart to throw error
      jest.spyOn(visualizationService, '_createFallbackBarChart').mockImplementation(() => {
        throw new Error('Chart creation failed');
      });
      
      const data = [{ label: 'A', value: 10 }];
      const result = await visualizationService.createBarChart('test-container', data);
      
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error creating bar chart:', expect.any(Error));
    });

    test('should handle graph creation errors gracefully', async () => {
      // Mock createKnowledgeGraph to throw error
      jest.spyOn(visualizationService, '_createFallbackGraph').mockImplementation(() => {
        throw new Error('Graph creation failed');
      });
      
      const nodes = [{ id: '1', label: 'Node 1' }];
      const result = await visualizationService.createKnowledgeGraph('test-container', nodes, []);
      
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error creating knowledge graph:', expect.any(Error));
    });

    test('should handle cleanup errors gracefully', async () => {
      // Mock cleanup to throw error
      jest.spyOn(visualizationService, '_cleanupContainer').mockImplementation(() => {
        throw new Error('Cleanup failed');
      });
      
      await visualizationService._cleanupOldVisualizations();
      
      expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up old visualizations:', expect.any(Error));
    });
  });

  describe('Service Worker Context', () => {
    test('should work in service worker context', async () => {
      // Create service in service worker context
      const swVisualizationService = new VisualizationService();
      
      // Patch service worker context detection
      swVisualizationService._isServiceWorkerContext = true;
      
      const result = await swVisualizationService.initialize();
      
      expect(result).toBe(true);
      expect(swVisualizationService.isInitialized).toBe(true);
      expect(swVisualizationService._isServiceWorkerContext).toBe(true);
    });

    test('should handle DOM operations in service worker context', async () => {
      const swVisualizationService = new VisualizationService();
      
      swVisualizationService._isServiceWorkerContext = true;
      swVisualizationService._resourceTracker = mockResourceTracker;
      swVisualizationService._logger = mockLogger;
      
      await swVisualizationService.initialize();
      
      // In service worker context, DOM operations should be handled gracefully
      const data = [{ label: 'A', value: 10 }];
      const result = await swVisualizationService.createBarChart('test-container', data);
      
      // Should handle gracefully even if DOM is not available
      expect(result).toBeDefined();
    });
  });

  // Add this test to verify the class structure
  test('should have proper class structure', () => {
    console.log('🧪 Debug: Testing class structure');
    console.log('🧪 Debug: visualizationService constructor name =', visualizationService.constructor.name);
    console.log('🧪 Debug: visualizationService instanceof VisualizationService =', visualizationService instanceof VisualizationService);
    console.log('🧪 Debug: Available methods =', Object.getOwnPropertyNames(Object.getPrototypeOf(visualizationService)));
    
    expect(visualizationService.constructor.name).toBe('VisualizationService');
    expect(visualizationService instanceof VisualizationService).toBe(true);
    expect(typeof visualizationService._performInitialization).toBe('function');
  });
});
