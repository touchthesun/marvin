// extension/tests/services/base-service.test.js
import { jest } from '@jest/globals';

/**
 * Basic test to verify the service test configuration works
 * Following TDD for a broken system approach
 */
describe('BaseService', () => {
  let service;

  beforeEach(() => {
    service = new (require('../../src/services/base-service.js').BaseService)();
  });

  afterEach(async () => {
    if (service && typeof service.cleanup === 'function') {
      await service.cleanup();
    }
  });

  describe('Basic Functionality', () => {
    test('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(require('../../src/services/base-service.js').BaseService);
    });

    test('should start uninitialized', () => {
      expect(service.isInitialized).toBe(false);
    });

    test('should have resource tracker', () => {
      expect(service.resourceTracker).toBeDefined();
    });

    test('should have memory monitor', () => {
      expect(service.memoryMonitor).toBeDefined();
    });

    test('should provide metrics', () => {
      const metrics = service.getMetrics();
      expect(metrics).toHaveProperty('initialized');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('resourceCounts');
      expect(metrics).toHaveProperty('activeTasks');
      expect(metrics).toHaveProperty('circuitBreakerStatus');
    });
  });

  describe('Task Management', () => {
    test('should handle task tracking without iteration errors', () => {
      const mockTask = { id: 'test-task' };
      const initialState = { status: 'pending' };
      
      // This should work now that we're using Map instead of WeakMap
      expect(() => {
        service._trackTask(mockTask, initialState);
      }).not.toThrow();
      
      // Verify task was tracked
      expect(service._activeTasks.has(mockTask)).toBe(true);
    });

    test('should handle cleanup without iteration errors', async () => {
      // Add a task first
      const mockTask = { id: 'test-task' };
      service._trackTask(mockTask, { status: 'pending' });
      
      // This should work now that we're using Map instead of WeakMap
      expect(() => {
        service._cleanupTasks();
      }).not.toThrow();
    });

    test('should handle maximum task limit', () => {
      // Set a low limit for testing
      service._maxActiveTasks = 2;
      
      const task1 = { id: 'task1' };
      const task2 = { id: 'task2' };
      const task3 = { id: 'task3' };
      
      service._trackTask(task1, { status: 'pending' });
      service._trackTask(task2, { status: 'pending' });
      
      // Third task should trigger cleanup attempt and then throw
      expect(() => {
        service._trackTask(task3, { status: 'pending' });
      }).toThrow('Maximum number of active tasks reached');
    });
  });

  describe('Circuit Breaker', () => {
    test('should start with closed circuit breaker', () => {
      expect(service._isCircuitBreakerOpen()).toBe(false);
    });

    test('should record failures', () => {
      const initialFailures = service._failureCount;
      service._recordFailure();
      expect(service._failureCount).toBe(initialFailures + 1);
    });
  });

  describe('Service Properties', () => {
    test('should have required properties', () => {
      expect(service._activeTasks).toBeDefined();
      expect(service._taskTimers).toBeDefined();
      expect(service._taskListeners).toBeDefined();
      expect(service._maxTaskAge).toBeDefined();
      expect(service._maxActiveTasks).toBeDefined();
    });
  });
});