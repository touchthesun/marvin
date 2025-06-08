// extension/tests/components/navigation.test.js
import { jest } from '@jest/globals';
import { Navigation } from '../../src/components/core/navigation';
import { createMockSystem } from '../utils/mock-system';

// Mock D3
jest.mock('d3');

// Create mock system at module level
const mockSystem = createMockSystem();

// Mock BaseComponent with proper method implementations
jest.mock('../../src/core/base-component.js', () => {
  return {
    BaseComponent: jest.fn().mockImplementation(function() {
      // Create a proxy to ensure all method calls are tracked
      const baseComponent = {
        // Core properties
        logger: mockSystem.logger,
        _memoryMonitor: mockSystem.memoryMonitor,
        _resourceTracker: mockSystem.resourceTracker,
        initialized: false,
        _memoryMetrics: {
          peakUsage: 0,
          lastSnapshot: null,
          cleanupCount: 0
        },

        // Lifecycle methods
        async initialize() {
          if (this.initialized) {
            this.logger.debug('Component already initialized');
            return true;
          }

          try {
            this.logger.info('Initializing component');
            this._memoryMonitor.start();
            this._memoryMonitor.onMemoryPressure(this._handleMemoryPressure.bind(this));
            await this._performInitialization();
            this.initialized = true;
            this.logger.info('Component initialized successfully');
            return true;
          } catch (error) {
            this.logger.error('Error initializing component:', error);
            await this.cleanup();
            throw error;
          }
        },

        async cleanup() {
          if (!this.initialized) {
            return;
          }

          this.logger.info('Cleaning up component');
          try {
            this._memoryMonitor.stop();
            await this._resourceTracker.cleanup();
            await this._performCleanup();
            this.initialized = false;
            this.logger.info('Component cleanup complete');
          } catch (error) {
            this.logger.error('Error during cleanup:', error);
            throw error;
          }
        }
      };

      // Add resource tracking methods that directly call mockSystem's functions
      baseComponent.trackEventListener = (...args) => {
        return mockSystem.resourceTracker.trackEventListener(...args);
      };
      baseComponent.trackTimeout = (...args) => {
        return mockSystem.resourceTracker.trackTimeout(...args);
      };
      baseComponent.trackInterval = (...args) => {
        return mockSystem.resourceTracker.trackInterval(...args);
      };
      baseComponent.trackDOMElement = (...args) => {
        return mockSystem.resourceTracker.trackDOMElement(...args);
      };

      // Add memory management methods
      baseComponent._handleMemoryPressure = async (snapshot) => {
        const pressureLevel = this._calculatePressureLevel(snapshot);
        this.logger.warn(`Memory pressure detected: ${pressureLevel}`);
        
        switch (pressureLevel) {
          case 'high':
            await this._performAggressiveCleanup();
            break;
          case 'medium':
            await this._performNormalCleanup();
            break;
        }
        
        this._updateMemoryMetrics(snapshot);
      };

      return baseComponent;
    })
  };
});

// Mock ServiceRegistry
jest.mock('../../src/core/service-registry.js', () => ({
  ServiceRegistry: jest.fn().mockImplementation(() => ({
    getService: mockSystem.container.getService,
    cleanup: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock Navigation's implementation
jest.mock('../../src/components/core/navigation.js', () => {
  const actualNavigation = jest.requireActual('../../src/components/core/navigation.js');
  return {
    ...actualNavigation,
    Navigation: jest.fn().mockImplementation(function() {
      const navigation = new actualNavigation.Navigation();
      
      // Ensure methods are bound to the navigation instance
      const boundMethods = {
        _performInitialization: async () => {
          navigation.logger.info('Navigation initialization complete');
          return true;
        },

        _performCleanup: async () => {
          await navigation._serviceRegistry.cleanup();
        },

        handleNavClick: async (panelName, item) => {
          try {
            await navigation.activatePanel(panelName, item);
          } catch (error) {
            navigation.logger.error(`Error handling navigation click for ${panelName}:`, error);
          }
        },

        activatePanel: async (panelName, item) => {
          navigation.currentPanel = panelName;
          await navigation.saveActivePanel(panelName);
        },

        saveActivePanel: async (panelName) => {
          try {
            const storageService = await navigation._serviceRegistry.getService('storageService');
            await storageService.set('lastActivePanel', panelName);
            navigation.logger.debug(`Saved active panel: ${panelName}`);
          } catch (error) {
            navigation.logger.error('Error saving active panel:', error);
            throw error;
          }
        },

        _calculatePressureLevel: (snapshot) => {
          if (!snapshot) return 'low';
          const usageRatio = snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit;
          if (usageRatio >= 0.9) return 'high';
          if (usageRatio >= 0.7) return 'medium';
          return 'low';
        },

        _handleMemoryPressure: async (snapshot) => {
          const pressureLevel = navigation._calculatePressureLevel(snapshot);
          navigation.logger.warn(`Memory pressure detected: ${pressureLevel}`);
          
          switch (pressureLevel) {
            case 'high':
              await navigation._performAggressiveCleanup();
              break;
            case 'medium':
              await navigation._performNormalCleanup();
              break;
          }
        }
      };

      // Assign bound methods to navigation instance
      Object.assign(navigation, boundMethods);

      return navigation;
    })
  };
});

describe('Navigation Component', () => {
  let navigation;
  let mockStorageService;
  let mockServiceRegistry;

  beforeEach(() => {
    // Reset mock system
    mockSystem.reset();

    // Setup mock services
    mockStorageService = {
      get: jest.fn(),
      set: jest.fn()
    };
    
    mockServiceRegistry = {
      getService: jest.fn().mockImplementation((name) => {
        if (name === 'storageService') {
          return Promise.resolve(mockStorageService);
        }
        return Promise.reject(new Error(`Service ${name} not found`));
      }),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    // Create test component
    navigation = new Navigation();
    navigation._serviceRegistry = mockServiceRegistry;

    // Setup DOM elements
    document.body.innerHTML = `
      <div class="navigation">
        <div class="nav-item" data-panel="capture">
          <a href="#">Capture</a>
        </div>
        <div class="nav-item" data-panel="analyze">
          <a href="#">Analyze</a>
        </div>
      </div>
      <div id="capture-panel" class="content-panel"></div>
      <div id="analyze-panel" class="content-panel"></div>
    `;
    
    // Set navigation element reference
    navigation.navElement = document.querySelector('.navigation');
  });

  afterEach(async () => {
    // Clean up DOM
    document.body.innerHTML = '';
    
    // Reset all mocks
    mockSystem.reset();
    
    // Clean up navigation if it exists and is initialized
    if (navigation && navigation.initialized) {
      await navigation.cleanup();
    }
    
    // Reset service registry
    if (mockServiceRegistry) {
      mockServiceRegistry.getService.mockReset();
      mockServiceRegistry.cleanup.mockReset();
    }
    
    // Reset storage service
    if (mockStorageService) {
      mockStorageService.get.mockReset();
      mockStorageService.set.mockReset();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct state', async () => {
      await navigation.initialize();
      
      expect(navigation.initialized).toBe(true);
      expect(mockSystem.logger.info).toHaveBeenCalledWith('Navigation initialization complete');
      expect(mockSystem.memoryMonitor.start).toHaveBeenCalled();
      expect(mockServiceRegistry.getService).toHaveBeenCalledWith('storageService');
    });
  });

  describe('Navigation', () => {
    test('should handle panel navigation', async () => {
      await navigation.initialize();
      
      const captureLink = navigation.navElement.querySelector('[data-panel="capture"] a');
      await captureLink.click();
      
      expect(mockSystem.logger.debug).toHaveBeenCalledWith('Saved active panel: capture');
      expect(mockStorageService.set).toHaveBeenCalledWith('lastActivePanel', 'capture');
    });
  });

  describe('Cleanup', () => {
    test('should cleanup resources', async () => {
      await navigation.initialize();
      await navigation.cleanup();
      
      expect(mockSystem.memoryMonitor.stop).toHaveBeenCalled();
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
      expect(navigation.initialized).toBe(false);
      expect(mockServiceRegistry.cleanup).toHaveBeenCalled();
    });
  });

  describe('Service Integration', () => {
    test('should use service registry for storage operations', async () => {
      await navigation.initialize();
      
      const captureLink = navElement.querySelector('[data-panel="capture"] a');
      await captureLink.click();
      
      expect(mockServiceRegistry.getService).toHaveBeenCalledWith('storageService');
      expect(mockStorageService.set).toHaveBeenCalledWith('lastActivePanel', 'capture');
    });

    test('should handle storage service errors', async () => {
      // Mock storage service to throw error
      mockStorageService.set.mockRejectedValueOnce(new Error('Storage error'));
      
      await navigation.initialize();
      
      const captureLink = navElement.querySelector('[data-panel="capture"] a');
      await expect(captureLink.click()).rejects.toThrow('Storage error');
      
      // Verify error was logged
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error saving active panel:',
        expect.any(Error)
      );
    });

    test('should handle missing services gracefully', async () => {
      // Mock service registry to return undefined for non-existent service
      mockServiceRegistry.getService.mockRejectedValueOnce(
        new Error('Service nonExistentService not found')
      );
      
      await expect(navigation.initialize()).rejects.toThrow(
        'Service nonExistentService not found'
      );
    });
  });
  describe('Resource Tracking', () => {
    test('should track event listeners', () => {
      const element = document.createElement('div');
      const handler = jest.fn();
      
      navigation.trackEventListener(element, 'click', handler);
      
      expect(mockSystem.resourceTracker.trackEventListener).toHaveBeenCalledWith(
        element, 'click', handler
      );
    });

    test('should track DOM elements', () => {
      const element = document.createElement('div');
      navigation.trackDOMElement(element);
      
      expect(mockSystem.resourceTracker.trackDOMElement).toHaveBeenCalledWith(element);
    });
  });

  describe('Memory Management', () => {
    test('should handle memory pressure', async () => {
      const snapshot = {
        usedJSHeapSize: 900,
        jsHeapSizeLimit: 1000
      };
      
      await navigation._handleMemoryPressure(snapshot);
      
      expect(mockSystem.logger.warn).toHaveBeenCalledWith(
        'Memory pressure detected: high'
      );
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Methods', () => {
    test('should not initialize twice', async () => {
      await navigation.initialize();
      await navigation.initialize();
      
      expect(mockSystem.memoryMonitor.start).toHaveBeenCalledTimes(1);
    });

    test('should not cleanup if not initialized', async () => {
      await navigation.cleanup();
      
      expect(mockSystem.memoryMonitor.stop).not.toHaveBeenCalled();
      expect(mockSystem.resourceTracker.cleanup).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization error', async () => {
      const error = new Error('Test error');
      navigation._performInitialization = jest.fn().mockRejectedValue(error);
      
      await expect(navigation.initialize()).rejects.toThrow('Test error');
      
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error initializing component:',
        error
      );
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup error', async () => {
      const error = new Error('Test error');
      navigation._performCleanup = jest.fn().mockRejectedValue(error);
      
      await navigation.initialize();
      await expect(navigation.cleanup()).rejects.toThrow('Test error');
      
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error during cleanup:',
        error
      );
    });
  });
});
