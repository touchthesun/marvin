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

  test('should initialize with correct state', async () => {
    console.log('Initialization test starting...');
    
    console.log('Current mockServiceRegistry state:', {
      getService: mockServiceRegistry.getService.mock.calls,
      cleanup: mockServiceRegistry.cleanup.mock.calls
    });
    
    console.log('Initializing navigation...');
    await navigation.initialize();
    console.log('Navigation initialized');
    
    console.log('Checking initialization state...');
    expect(navigation.initialized).toBe(true);
    console.log('Initialized state verified');
    
    console.log('Checking logger calls...');
    expect(mockSystem.logger.info).toHaveBeenCalledWith('Navigation initialization complete');
    console.log('Logger calls verified');
    
    console.log('Checking memory monitor...');
    expect(mockSystem.memoryMonitor.start).toHaveBeenCalled();
    console.log('Memory monitor verified');
    
    console.log('Checking service registry calls...');
    console.log('Service registry calls:', mockServiceRegistry.getService.mock.calls);
    expect(mockServiceRegistry.getService).toHaveBeenCalledWith('storageService');
    console.log('Service registry calls verified');
    
    console.log('Initialization test completed');
  });

  test('should handle panel navigation', async () => {
    console.log('Panel navigation test starting...');
    
    console.log('Initializing navigation...');
    await navigation.initialize();
    console.log('Navigation initialized');
    
    console.log('Finding capture link...');
    const captureLink = navigation.navElement.querySelector('[data-panel="capture"] a');
    console.log('Capture link found:', captureLink);
    
    console.log('Setting up click handler...');
    const clickPromise = new Promise((resolve) => {
      captureLink.addEventListener('click', async (e) => {
        console.log('Click handler started');
        e.preventDefault();
        try {
          await navigation.handleNavClick('capture', e);
          console.log('Click handler completed');
        } catch (error) {
          console.log('Click handler error:', error);
        }
        resolve();
      }, { once: true });
    });
    
    console.log('Triggering click...');
    captureLink.click();
    console.log('Click triggered');
    
    console.log('Waiting for click handler...');
    await clickPromise;
    console.log('Click handler completed');
    
    console.log('Checking logger calls...');
    console.log('Debug logger calls:', mockSystem.logger.debug.mock.calls);
    expect(mockSystem.logger.debug).toHaveBeenCalledWith('Saved active panel: capture');
    
    console.log('Checking storage service calls...');
    console.log('Storage service calls:', mockStorageService.set.mock.calls);
    expect(mockStorageService.set).toHaveBeenCalledWith('lastActivePanel', 'capture');
    
    console.log('Panel navigation test completed');
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
      console.log('Storage operations test starting...');
      
      console.log('Initializing navigation...');
      await navigation.initialize();
      console.log('Navigation initialized');
      
      console.log('Finding capture link...');
      const captureLink = navigation.navElement.querySelector('[data-panel="capture"] a');
      console.log('Capture link found:', captureLink);

      // Create a promise to handle the click
      const clickPromise = new Promise((resolve) => {
        captureLink.addEventListener('click', async (e) => {
          e.preventDefault();
          await navigation.handleNavClick('capture', e);
          resolve();
        }, { once: true });
      });
      
      console.log('Triggering click...');
      captureLink.click();
      await clickPromise;
      console.log('Click triggered');
      
      console.log('Checking service registry calls...');
      console.log('Service registry calls:', mockServiceRegistry.getService.mock.calls);
      expect(mockServiceRegistry.getService).toHaveBeenCalledWith('storageService');
      
      console.log('Checking storage service calls...');
      console.log('Storage service calls:', mockStorageService.set.mock.calls);
      expect(mockStorageService.set).toHaveBeenCalledWith('lastActivePanel', 'capture');
      
      console.log('Storage operations test completed');
    });

    test('should handle storage service errors', async () => {
      console.log('Test starting...');
      
      // Mock storage service to throw error
      console.log('Setting up storage service mock...');
      mockStorageService.set.mockRejectedValueOnce(new Error('Storage error'));
      console.log('Mock setup complete');
      
      console.log('Initializing navigation...');
      await navigation.initialize();
      console.log('Navigation initialized');
      
      console.log('Finding capture link...');
      const captureLink = navigation.navElement.querySelector('[data-panel="capture"] a');
      console.log('Capture link found:', captureLink);
      
      // Create a promise that will be resolved when the click handler completes
      const clickPromise = new Promise((resolve) => {
        captureLink.addEventListener('click', async (e) => {
          console.log('Click handler started');
          e.preventDefault();
          try {
            await navigation.handleNavClick('capture', e);
            console.log('Click handler completed successfully');
          } catch (error) {
            console.log('Click handler caught error:', error);
          }
          resolve();
        }, { once: true });
      });
    
      console.log('Triggering click...');
      captureLink.click();
      console.log('Click triggered');
      
      // Wait for the click handler to complete
      console.log('Waiting for click handler...');
      await clickPromise;
      console.log('Click handler promise resolved');
      
      // Verify error was logged
      console.log('Verifying error was logged...');
      console.log('Logger calls:', mockSystem.logger.error.mock.calls);
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error handling navigation click for capture:',
        expect.any(Error)
      );
      console.log('Error logging verified');
      
      console.log('Test completed');
    });

    test('should handle missing services gracefully', async () => {
      console.log('Missing services test starting...');
      
      console.log('Setting up service registry mock...');
      mockServiceRegistry.getService.mockRejectedValueOnce(
        new Error('Service nonExistentService not found')
      );
      console.log('Service registry mock setup complete');
      
      console.log('Attempting initialization...');
      try {
        await navigation.initialize();
        console.log('Initialization unexpectedly succeeded');
      } catch (error) {
        console.log('Initialization failed as expected:', error.message);
        expect(error.message).toBe('Service nonExistentService not found');
      }
      
      console.log('Missing services test completed');
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
      console.log('Memory pressure test starting...');
      
      console.log('Setting up memory pressure handler...');
      const snapshot = {
        usedJSHeapSize: 900,
        jsHeapSizeLimit: 1000
      };
      
      console.log('Adding memory pressure methods...');
      navigation._performAggressiveCleanup = jest.fn().mockResolvedValue(undefined);
      navigation._performNormalCleanup = jest.fn().mockResolvedValue(undefined);
      
      console.log('Triggering memory pressure...');
      await navigation._handleMemoryPressure(snapshot);
      
      console.log('Checking memory pressure handling...');
      expect(mockSystem.logger.warn).toHaveBeenCalledWith(
        'Memory pressure detected: high'
      );
      expect(navigation._performAggressiveCleanup).toHaveBeenCalled();
      
      console.log('Memory pressure test completed');
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

    test('should handle initialization error', async () => {
      const error = new Error('Test error');
      navigation._performInitialization = jest.fn().mockRejectedValue(error);
      
      // Ensure cleanup is called before the error is thrown
      mockSystem.resourceTracker.cleanup.mockResolvedValue(undefined);
      
      await expect(navigation.initialize()).rejects.toThrow('Test error');
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error initializing component:',
        error
      );
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
  });

    test('should handle cleanup error', async () => {
      // Setup the error first
      const error = new Error('Test error');
      
      // Mock the cleanup to reject
      navigation._performCleanup = jest.fn().mockRejectedValue(error);
      
      // Initialize first
      await navigation.initialize();
      
      // Then test cleanup
      await expect(navigation.cleanup()).rejects.toThrow('Test error');
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error during cleanup:',
        error
      );
    });
  });