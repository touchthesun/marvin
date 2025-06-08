// tests/components/base.test.js
import { jest } from '@jest/globals';
import { BaseComponent } from '../../src/core/base-component.js';
import { createMockSystem } from '../utils/mock-system';

// First create the mocks
jest.mock('../../src/utils/log-manager.js', () => ({
  LogManager: jest.fn()
}));

jest.mock('../../src/utils/memory-monitor.js', () => ({
  MemoryMonitor: jest.fn()
}));

jest.mock('../../src/utils/resource-tracker.js', () => ({
  ResourceTracker: jest.fn()
}));

jest.mock('../../src/core/dependency-container', () => ({
  container: {
    getService: jest.fn()
  }
}));

// Then create and set up the mock system
const mockSystem = createMockSystem();

// Update mock implementations after creation
const { LogManager } = require('../../src/utils/log-manager.js');
const { MemoryMonitor } = require('../../src/utils/memory-monitor.js');
const { ResourceTracker } = require('../../src/utils/resource-tracker.js');
const { container } = require('../../src/core/dependency-container');

LogManager.mockImplementation(() => mockSystem.logger);
MemoryMonitor.mockImplementation(() => mockSystem.memoryMonitor);
ResourceTracker.mockImplementation(() => mockSystem.resourceTracker);
container.getService = mockSystem.container.getService;

describe('BaseComponent', () => {
  let component;

  beforeEach(() => {
    // Reset mock system
    mockSystem.reset();

    // Create test component
    component = new BaseComponent();
    component._eventListeners = [];
    component._timeouts = [];
    component._intervals = [];
    component._domElements = [];
    component.logger = mockSystem.logger;
    component._memoryMonitor = mockSystem.memoryMonitor;
    component._resourceTracker = mockSystem.resourceTracker;
  });

  describe('Initialization', () => {
    test('should initialize with default state', () => {
      expect(component.initialized).toBe(false);
      expect(component._eventListeners).toEqual([]);
      expect(component._timeouts).toEqual([]);
      expect(component._intervals).toEqual([]);
      expect(component._domElements).toEqual([]);
    });

    test('should create logger with correct context', () => {
      // Create new instance to trigger logger creation
      const newComponent = new BaseComponent();
      
      // Verify the constructor was called with correct args
      expect(LogManager).toHaveBeenCalledWith({
        context: 'BaseComponent',
        maxEntries: 500
      });
    });
  
    test('should initialize memory monitor with correct options', () => {
      // Create new instance to trigger monitor creation
      const newComponent = new BaseComponent();
      
      // Verify the constructor was called with correct args
      expect(MemoryMonitor).toHaveBeenCalledWith({
        threshold: 0.8,
        interval: 5000
      });
    });
  });

  describe('Resource Tracking', () => {
    test('should track event listeners', () => {
      const element = document.createElement('div');
      const handler = jest.fn();
      
      component.trackEventListener(element, 'click', handler);
      
      expect(mockSystem.resourceTracker.trackEventListener).toHaveBeenCalledWith(
        element, 'click', handler
      );
    });

    test('should track timeouts', () => {
      const callback = jest.fn();
      const timeoutId = component.trackTimeout(callback, 1000);
      
      expect(mockSystem.resourceTracker.trackTimeout).toHaveBeenCalledWith(
        callback, 1000
      );
    });

    test('should track intervals', () => {
      const callback = jest.fn();
      const intervalId = component.trackInterval(callback, 1000);
      
      expect(mockSystem.resourceTracker.trackInterval).toHaveBeenCalledWith(
        callback, 1000
      );
    });

    test('should track DOM elements', () => {
      const element = document.createElement('div');
      component.trackDOMElement(element);
      
      expect(mockSystem.resourceTracker.trackDOMElement).toHaveBeenCalledWith(element);
    });
  });

  describe('Service Management', () => {
    test('should get service from container', () => {
      const mockService = { test: true };
      mockSystem.container.getService.mockReturnValue(mockService);
      
      const result = component.getService('testService');
      
      expect(mockSystem.container.getService).toHaveBeenCalledWith('testService');
      expect(result).toBe(mockService);
    });

    test('should return fallback when service not available', () => {
      const fallback = { fallback: true };
      mockSystem.container.getService.mockImplementation(() => {
        throw new Error('Service not found');
      });
      
      const result = component.getService('testService', fallback);
      
      expect(result).toBe(fallback);
      expect(mockSystem.logger.warn).toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    test('should handle memory pressure - high', async () => {
      const snapshot = {
        usedJSHeapSize: 900,
        jsHeapSizeLimit: 1000
      };
      
      await component._handleMemoryPressure(snapshot);
      
      expect(mockSystem.logger.warn).toHaveBeenCalledWith(
        'Memory pressure detected: high'
      );
      expect(mockSystem.resourceTracker.cleanup).toHaveBeenCalled();
    });

    test('should handle memory pressure - medium', async () => {
      const snapshot = {
        usedJSHeapSize: 800,
        jsHeapSizeLimit: 1000
      };
      
      await component._handleMemoryPressure(snapshot);
      
      expect(mockSystem.logger.warn).toHaveBeenCalledWith(
        'Memory pressure detected: medium'
      );
      expect(mockSystem.resourceTracker.cleanupNonEssential).toHaveBeenCalled();
    });

    test('should update memory metrics', () => {
      const snapshot = {
        usedJSHeapSize: 500,
        jsHeapSizeLimit: 1000
      };
      
      component._updateMemoryMetrics(snapshot);
      
      expect(component._memoryMetrics.lastSnapshot).toBe(snapshot);
      expect(component._memoryMetrics.peakUsage).toBe(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization error', async () => {
      const error = new Error('Test error');
      component._performInitialization = jest.fn().mockRejectedValue(error);
      
      // Mock cleanup to be async
      component.cleanup = jest.fn().mockResolvedValue(undefined);
      
      await expect(component.initialize()).rejects.toThrow('Test error');
      
      // Verify error was logged
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error initializing component:',
        error
      );
      
      // Verify cleanup was called
      expect(component.cleanup).toHaveBeenCalled();
    });
  
    test('should handle cleanup error', async () => {
      const error = new Error('Test error');
      
      // Mock initialization to succeed
      component._performInitialization = jest.fn().mockResolvedValue(undefined);
      // Mock cleanup to fail
      component._performCleanup = jest.fn().mockRejectedValue(error);
      
      // Initialize first
      await component.initialize();
      
      // Then test cleanup error
      await expect(component.cleanup()).rejects.toThrow('Test error');
      expect(mockSystem.logger.error).toHaveBeenCalledWith(
        'Error during cleanup:',
        error
      );
    });
  });

  describe('Abstract Methods', () => {
    test('should throw error for unimplemented _performInitialization', async () => {
      await expect(component._performInitialization()).rejects.toThrow(
        '_performInitialization() must be implemented by subclass'
      );
    });

    test('should throw error for unimplemented _performCleanup', async () => {
      await expect(component._performCleanup()).rejects.toThrow(
        '_performCleanup() must be implemented by subclass'
      );
    });
  });
});