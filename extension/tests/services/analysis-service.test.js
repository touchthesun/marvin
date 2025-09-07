// tests/services/analysis-service.test.js
import { AnalysisService } from '../../src/services/analysis-service.js';

// Mock only external dependencies
jest.mock('../../src/utils/log-manager.js');

describe('AnalysisService', () => {
  let analysisService;
  let mockLogger;
  let mockApiService;
  let mockNotificationService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create mock API service
    mockApiService = {
      fetchAPI: jest.fn()
    };

    // Create mock notification service
    mockNotificationService = {
      showNotification: jest.fn()
    };

    // Mock window and document for event listeners
    global.window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    global.document = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    };

    // Mock LogManager constructor
    const { LogManager } = require('../../src/utils/log-manager.js');
    LogManager.mockImplementation(() => mockLogger);

    // Create service instance with real AnalysisService
    analysisService = new AnalysisService({
      logger: mockLogger,
      apiService: mockApiService,
      notificationService: mockNotificationService
    });
  });

  afterEach(() => {
    // Clean up any global mocks
    if (global.document) {
      global.document.removeEventListener = jest.fn();
    }
    if (global.window) {
      global.window.removeEventListener = jest.fn();
    }
  });

  describe('BaseService Inheritance Test', () => {
    test('should properly inherit from BaseService', () => {
      expect(analysisService).toBeInstanceOf(AnalysisService);
      expect(analysisService._resourceTracker).toBeDefined();
      expect(analysisService._activeTasks).toBeDefined();
      expect(analysisService._taskListeners).toBeDefined();
    });
  });

  describe('Basic Class Test', () => {
    test('should be able to import and instantiate AnalysisService', () => {
      expect(AnalysisService).toBeDefined();
      expect(analysisService).toBeDefined();
      expect(analysisService.constructor.name).toBe('AnalysisService');
    });
  });

  describe('AnalysisService', () => {
    test('should have proper class structure', () => {
      console.log('🧪 Debug: Testing class structure');
      console.log('🧪 Debug: analysisService constructor name =', analysisService.constructor.name);
      console.log('🧪 Debug: analysisService instanceof AnalysisService =', analysisService instanceof AnalysisService);
      
      const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(analysisService));
      console.log('🧪 Debug: Available methods =', availableMethods);
      
      expect(analysisService.constructor.name).toBe('AnalysisService');
      expect(analysisService instanceof AnalysisService).toBe(true);
      expect(availableMethods).toContain('_performInitialization');
      expect(availableMethods).toContain('_performCleanup');
      expect(availableMethods).toContain('monitorAnalysisTask');
    });

    describe('Initialization', () => {
      test('should initialize successfully with valid dependencies', async () => {
        const result = await analysisService.initialize();
        
        expect(result).toBe(true);
        expect(mockLogger.info).toHaveBeenCalledWith('Initializing analysis service');
        expect(mockLogger.info).toHaveBeenCalledWith('Analysis service initialized successfully');
      });

      test('should fail initialization without API service', async () => {
        const serviceWithoutApi = new AnalysisService({
          logger: mockLogger,
          notificationService: mockNotificationService
        });

        // The service should throw an error during initialization
        await expect(serviceWithoutApi.initialize()).rejects.toThrow('API service is required');
      });

      test('should set up event listeners during initialization', async () => {
        // Mock the resource tracker
        analysisService._resourceTracker.trackEventListener = jest.fn();
        
        await analysisService.initialize();
        
        // Check that event listeners were set up
        expect(analysisService._resourceTracker.trackEventListener).toHaveBeenCalled();
      });

      test('should handle initialization errors gracefully', async () => {
        // Mock _setupEventListeners to throw an error
        jest.spyOn(analysisService, '_setupEventListeners').mockImplementation(() => {
          throw new Error('Event setup failed');
        });

        // The service should throw an error during initialization
        await expect(analysisService.initialize()).rejects.toThrow('Event setup failed');
      });
    });

    describe('Cleanup', () => {
      test('should cleanup resources on shutdown', async () => {
        // Mock the BaseService cleanup to call our _performCleanup
        jest.spyOn(analysisService, '_performCleanup').mockResolvedValue();
        
        // Mock the BaseService cleanup method to call our _performCleanup
        const originalCleanup = analysisService.cleanup;
        analysisService.cleanup = jest.fn().mockImplementation(async () => {
          await analysisService._performCleanup();
        });
        
        await analysisService.cleanup();
        
        expect(analysisService._performCleanup).toHaveBeenCalled();
        
        // Restore original cleanup
        analysisService.cleanup = originalCleanup;
      });

      test('should handle cleanup errors gracefully', async () => {
        // Ensure service is initialized first
        await analysisService.initialize();
        
        // Mock _performCleanup to throw an error
        const originalPerformCleanup = analysisService._performCleanup;
        analysisService._performCleanup = jest.fn().mockImplementation(() => {
          throw new Error('Cleanup failed');
        });

        // The service should complete cleanup even with errors (BaseService catches them)
        await analysisService.cleanup();
        
        // Verify that _performCleanup was called
        expect(analysisService._performCleanup).toHaveBeenCalled();
        
        // Verify the service is marked as not initialized after cleanup
        expect(analysisService.isInitialized).toBe(false);
        
        // Restore original method
        analysisService._performCleanup = originalPerformCleanup;
      });
    });

    describe('Memory Pressure Handling', () => {
      test('should handle memory pressure', async () => {
        const snapshot = { used: 100, total: 1000 };
        
        await analysisService._handleMemoryPressure(snapshot);
        
        expect(mockLogger.warn).toHaveBeenCalledWith('Memory pressure detected, cleaning up non-essential resources');
      });
    });

    describe('Task Monitoring', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should start monitoring a new analysis task', () => {
        const taskId = 'test-task-123';
        
        analysisService.monitorAnalysisTask(taskId);
        
        expect(mockLogger.debug).toHaveBeenCalledWith(`Started monitoring task: ${taskId}`);
      });

      test('should not monitor task with empty task ID', () => {
        analysisService.monitorAnalysisTask('');
        
        expect(mockLogger.warn).toHaveBeenCalledWith('Attempted to monitor task with no task ID');
      });

      test('should not monitor task with null task ID', () => {
        analysisService.monitorAnalysisTask(null);
        
        expect(mockLogger.warn).toHaveBeenCalledWith('Attempted to monitor task with no task ID');
      });

      test('should not duplicate monitoring for same task', () => {
        const taskId = 'test-task-123';
        
        // First call
        analysisService.monitorAnalysisTask(taskId);
        // Second call
        analysisService.monitorAnalysisTask(taskId);
        
        expect(mockLogger.debug).toHaveBeenCalledWith(`Already monitoring task: ${taskId}`);
      });
    });

    describe('Task Status Checking', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should check task status successfully', async () => {
        const taskId = 'test-task-123';
        const mockResponse = {
          success: true,
          status: 'processing',
          progress: 50
        };
        
        mockApiService.fetchAPI.mockResolvedValue(mockResponse);
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockApiService.fetchAPI).toHaveBeenCalledWith(`/api/v1/analysis/status/${taskId}`);
        expect(mockLogger.debug).toHaveBeenCalledWith(`Task ${taskId} status: processing, progress: 50`);
      });

      test('should handle completed task status', async () => {
        const taskId = 'test-task-123';
        const mockResponse = {
          success: true,
          status: 'completed',
          progress: 100
        };
        
        mockApiService.fetchAPI.mockResolvedValue(mockResponse);
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} completed successfully`);
      });

      test('should handle error task status', async () => {
        const taskId = 'test-task-123';
        const mockResponse = {
          success: true,
          status: 'error',
          error: 'Analysis failed'
        };
        
        mockApiService.fetchAPI.mockResolvedValue(mockResponse);
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockLogger.error).toHaveBeenCalledWith(`Analysis task ${taskId} failed: Analysis failed`);
      });

      test('should handle API service unavailability', async () => {
        const taskId = 'test-task-123';
        
        analysisService._apiService = null;
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockLogger.error).toHaveBeenCalledWith(`Error checking status for task ${taskId}:`, expect.any(Error));
      });

      test('should handle circuit breaker open', async () => {
        const taskId = 'test-task-123';
        
        // Mock circuit breaker to be open
        analysisService._isCircuitBreakerOpen = jest.fn().mockReturnValue(true);
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockLogger.error).toHaveBeenCalledWith(`Error checking status for task ${taskId}:`, expect.any(Error));
      });

      test('should handle API errors gracefully', async () => {
        const taskId = 'test-task-123';
        const mockResponse = {
          success: false,
          error: 'API error'
        };
        
        mockApiService.fetchAPI.mockResolvedValue(mockResponse);
        
        // Set up task state
        const state = { id: taskId, status: 'pending', progress: 0, error: null };
        analysisService._activeTasks.set(taskId, state);
        
        await analysisService._checkTaskStatus(taskId);
        
        expect(mockLogger.error).toHaveBeenCalledWith(`Error checking status for task ${taskId}:`, expect.any(Error));
      });
    });

    describe('Event Handling', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should handle task creation events', () => {
        const taskId = 'test-task-123';
        const event = new CustomEvent('analysisTaskCreated', {
          detail: { taskId, action: 'create' }
        });
        
        analysisService._handleTaskEvent(event);
        
        expect(mockLogger.debug).toHaveBeenCalledWith(`Received task event for task ${taskId}: analysisTaskCreated`);
      });

      test('should handle task update events', () => {
        const taskId = 'test-task-123';
        const event = new CustomEvent('analysisTaskUpdated', {
          detail: { taskId, action: 'update' }
        });
        
        analysisService._handleTaskEvent(event);
        
        expect(mockLogger.debug).toHaveBeenCalledWith(`Received task event for task ${taskId}: analysisTaskUpdated`);
      });

      test('should handle events without task ID', () => {
        const event = new CustomEvent('analysisTaskCreated', {
          detail: { action: 'create' }
        });
        
        // Clear previous debug calls from initialization
        mockLogger.debug.mockClear();
        
        analysisService._handleTaskEvent(event);
        
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      test('should handle beforeunload event', () => {
        // Mock the cleanup method
        analysisService.cleanup = jest.fn();
        
        analysisService._handleBeforeUnload();
        
        expect(analysisService.cleanup).toHaveBeenCalled();
      });
    });

    describe('Task Completion Handling', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should handle analysis completion successfully', () => {
        const taskId = 'test-task-123';
        const response = { result: 'analysis data' };
        
        analysisService._onAnalysisCompleted(taskId, response);
        
        expect(mockNotificationService.showNotification).toHaveBeenCalledWith(
          'Analysis Complete',
          'The page analysis has been completed successfully.',
          'success'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} completion handled successfully`);
      });

      test('should handle analysis completion without notification service', () => {
        const taskId = 'test-task-123';
        const response = { result: 'analysis data' };
        
        analysisService._notificationService = null;
        
        analysisService._onAnalysisCompleted(taskId, response);
        
        expect(mockNotificationService.showNotification).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} completion handled successfully`);
      });

      test('should handle analysis completion without document', () => {
        const taskId = 'test-task-123';
        const response = { result: 'analysis data' };
        
        // Remove document from global
        const originalDocument = global.document;
        global.document = undefined;
        
        analysisService._onAnalysisCompleted(taskId, response);
        
        expect(mockNotificationService.showNotification).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} completion handled successfully`);
        
        // Restore document
        global.document = originalDocument;
      });
    });

    describe('Task Error Handling', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should handle analysis errors successfully', () => {
        const taskId = 'test-task-123';
        const response = { error: 'Analysis failed' };
        
        analysisService._onAnalysisError(taskId, response);
        
        expect(mockNotificationService.showNotification).toHaveBeenCalledWith(
          'Analysis Failed',
          'Error: Analysis failed',
          'error'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} error handled`);
      });

      test('should handle analysis errors without notification service', () => {
        const taskId = 'test-task-123';
        const response = { error: 'Analysis failed' };
        
        analysisService._notificationService = null;
        
        analysisService._onAnalysisError(taskId, response);
        
        expect(mockNotificationService.showNotification).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(`Analysis task ${taskId} error handled`);
      });

      test('should handle analysis errors with unknown error', () => {
        const taskId = 'test-task-123';
        const response = {};
        
        // Mock document.dispatchEvent
        const mockDispatchEvent = jest.fn();
        global.document = {
          dispatchEvent: mockDispatchEvent
        };
        
        analysisService._onAnalysisError(taskId, response);
        
        expect(mockNotificationService.showNotification).toHaveBeenCalledWith(
          'Analysis Failed',
          'Error: Unknown error',
          'error'
        );
      });
    });

    describe('Task Listener Notification', () => {
      beforeEach(async () => {
        await analysisService.initialize();
      });

      test('should notify task listeners of status changes', () => {
        const taskId = 'test-task-123';
        const taskState = {
          status: 'completed',
          progress: 100,
          error: null
        };
        
        const mockListener = jest.fn();
        analysisService._taskListeners.add(mockListener);
        
        analysisService._notifyTaskListeners(taskId, taskState);
        
        expect(mockLogger.debug).toHaveBeenCalledWith(`Notifying task listeners about task ${taskId} update`);
        expect(mockListener).toHaveBeenCalledWith({
          taskId,
          status: 'completed',
          progress: 100,
          error: null
        });
      });

      test('should handle listener errors gracefully', () => {
        const taskId = 'test-task-123';
        const taskState = {
          status: 'completed',
          progress: 100,
          error: null
        };
        
        const mockListener = jest.fn().mockImplementation(() => {
          throw new Error('Listener error');
        });
        analysisService._taskListeners.add(mockListener);
        
        analysisService._notifyTaskListeners(taskId, taskState);
        
        expect(mockLogger.error).toHaveBeenCalledWith('Error in task listener:', expect.any(Error));
      });
    });

    describe('Service Status', () => {
      test('should return service status information', () => {
        const status = analysisService.getStatus();
        
        expect(status).toHaveProperty('hasLogger');
        expect(status).toHaveProperty('hasDependencies');
        expect(status.hasLogger).toBe(true);
        expect(status.hasDependencies).toBe(true);
      });

      test('should return status without dependencies', () => {
        analysisService._apiService = null;
        
        const status = analysisService.getStatus();
        
        expect(status.hasDependencies).toBe(false);
      });
    });

    describe('Error Handling', () => {
      test('should handle initialization errors gracefully', async () => {
        // Mock _performInitialization to throw error
        jest.spyOn(analysisService, '_performInitialization').mockImplementation(() => {
          throw new Error('Initialization failed');
        });

        // The service should throw an error during initialization
        await expect(analysisService.initialize()).rejects.toThrow('Initialization failed');
      });

      test('should handle cleanup errors gracefully', async () => {
        // Ensure service is initialized first
        await analysisService.initialize();
        
        // Mock _performCleanup to throw error
        const originalPerformCleanup = analysisService._performCleanup;
        analysisService._performCleanup = jest.fn().mockImplementation(() => {
          throw new Error('Cleanup failed');
        });

        // The service should complete cleanup even with errors (BaseService catches them)
        await analysisService.cleanup();
        
        // Verify that _performCleanup was called
        expect(analysisService._performCleanup).toHaveBeenCalled();
        
        // Restore original method
        analysisService._performCleanup = originalPerformCleanup;
      });
    });

    describe('Service Worker Context', () => {
      test('should work in service worker context', async () => {
        // Mock service worker context - no DOM APIs available
        const originalWindow = global.window;
        const originalDocument = global.document;
        global.window = undefined;
        global.document = undefined;
        
        // Mock ResourceTracker to avoid DOM API calls
        const originalTrackEventListener = analysisService._resourceTracker.trackEventListener;
        analysisService._resourceTracker.trackEventListener = jest.fn();
        
        const swAnalysisService = new AnalysisService({
          logger: mockLogger,
          apiService: mockApiService,
          notificationService: mockNotificationService
        });
        
        // Mock ResourceTracker for the new service instance
        swAnalysisService._resourceTracker.trackEventListener = jest.fn();
        
        const result = await swAnalysisService.initialize();
        
        expect(result).toBe(true);
        expect(swAnalysisService.isInitialized).toBe(true);
        
        // Restore globals and original method
        global.window = originalWindow;
        global.document = originalDocument;
        analysisService._resourceTracker.trackEventListener = originalTrackEventListener;
      });

      test('should handle DOM operations in service worker context', async () => {
        // Mock service worker context - no DOM APIs available
        const originalWindow = global.window;
        const originalDocument = global.document;
        global.window = undefined;
        global.document = undefined;
        
        // Mock ResourceTracker to avoid DOM API calls
        const originalTrackEventListener = analysisService._resourceTracker.trackEventListener;
        analysisService._resourceTracker.trackEventListener = jest.fn();
        
        const swAnalysisService = new AnalysisService({
          logger: mockLogger,
          apiService: mockApiService,
          notificationService: mockNotificationService
        });
        
        // Mock ResourceTracker for the new service instance
        swAnalysisService._resourceTracker.trackEventListener = jest.fn();
        
        await swAnalysisService.initialize();
        
        // Should not throw errors when trying to access DOM APIs
        expect(() => {
          swAnalysisService._onAnalysisCompleted('test-task', {});
        }).not.toThrow();
        
        // Restore globals and original method
        global.window = originalWindow;
        global.document = originalDocument;
        analysisService._resourceTracker.trackEventListener = originalTrackEventListener;
      });
    });
  });
});
