// extension/tests/services/task-service.test.js
import { jest } from '@jest/globals';
import { TaskService } from '../../src/services/task-service.js';

// Mock Chrome APIs at module level
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    connect: jest.fn()
  },
  extension: {
    getBackgroundPage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};

// Mock global chrome
global.chrome = mockChrome;

// Mock LogManager at module level
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

describe('TaskService', () => {
  let taskService;
  let mockContainer;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up Chrome mocks
    mockChrome.runtime.sendMessage = jest.fn();
    mockChrome.runtime.onMessage = {
      addListener: jest.fn(),
      removeListener: jest.fn()
    };
    mockChrome.runtime.connect = jest.fn();
    mockChrome.extension.getBackgroundPage = jest.fn();
    mockChrome.storage.local.get = jest.fn();
    mockChrome.storage.local.set = jest.fn();
    
    // Ensure global chrome is set
    global.chrome = mockChrome;
    
    // Create mock container with required services
    mockContainer = {
      getService: jest.fn((serviceName) => {
        switch (serviceName) {
          case 'apiService':
            return {
              fetchAPI: jest.fn().mockResolvedValue({
                success: true,
                data: { tasks: [] }
              })
            };
          case 'notificationService':
            return {
              showNotification: jest.fn(),
              hideNotification: jest.fn()
            };
          case 'storageService':
            return {
              get: jest.fn(),
              set: jest.fn(),
              remove: jest.fn()
            };
          default:
            return null;
        }
      })
    };
    
    // Create service with real BaseService and mock container
    taskService = new TaskService({ container: mockContainer });
    
  });

  afterEach(async () => {
    // Clean up service
    if (taskService && taskService._initialized) {
      await taskService.cleanup();
    }
    
    // Reset all mocks for test isolation
    jest.clearAllMocks();
  });

  // ============================================================================
  // TASK LIFECYCLE TESTS
  // ============================================================================

  describe('Task Lifecycle', () => {
    beforeEach(async () => {
      await taskService.initialize();
    });

    test('should create a new task and add to active tasks', async () => {
      // Mock background page response
      const mockBackgroundPage = {
        marvin: {
          createTask: jest.fn().mockResolvedValue({
            id: 'test-task-123',
            status: 'pending',
            title: 'Test Task'
          })
        }
      };
      mockChrome.extension.getBackgroundPage.mockReturnValue(mockBackgroundPage);

      const taskData = {
        type: 'capture',
        url: 'https://example.com',
        title: 'Test Task'
      };

      const result = await taskService.createTask(taskData);

      // Verify background page was called
      expect(mockBackgroundPage.marvin.createTask).toHaveBeenCalledWith(taskData);
      
      // Verify task is added to active tasks
      expect(taskService._taskServiceActiveTasks.has(result)).toBe(true);
      
      // Verify task object is returned
      expect(result).toEqual({
        id: 'test-task-123',
        status: 'pending',
        title: 'Test Task'
      });
      
      // Verify stats are updated
      expect(taskService._stats.tasksCreated).toBe(1);
    });

    test('should fallback to API when background page unavailable', async () => {
      // Mock background page as unavailable
      mockChrome.extension.getBackgroundPage.mockReturnValue(null);
      
      // Mock API service response
      const mockApiResponse = {
        success: true,
        data: {
          id: 'test-task-456',
          status: 'pending',
          title: 'API Task'
        }
      };
      
      // Mock the API service method
      taskService._apiService = {
        fetchAPI: jest.fn().mockResolvedValue(mockApiResponse)
      };

      const taskData = {
        type: 'capture',
        url: 'https://example.com',
        title: 'API Task'
      };

      const result = await taskService.createTask(taskData);

      // Verify API was called
      expect(taskService._apiService.fetchAPI).toHaveBeenCalledWith('/api/v1/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      
      // Verify task is added to active tasks
      expect(taskService._taskServiceActiveTasks.has(result)).toBe(true);
      
      // Verify task object is returned
      expect(result).toEqual({
        id: 'test-task-456',
        status: 'pending',
        title: 'API Task'
      });
    });

    test('should cancel a task and remove from active tasks', async () => {
      // Create a task first
      const mockTask = {
        id: 'test-task-789',
        status: 'pending',
        title: 'Task to Cancel'
      };
      taskService._taskServiceActiveTasks.set(mockTask, Date.now());
      taskService._stats.tasksCreated = 1;

      // Mock background page response
      const mockBackgroundPage = {
        marvin: {
          cancelTask: jest.fn().mockResolvedValue(true)
        }
      };
      mockChrome.extension.getBackgroundPage.mockReturnValue(mockBackgroundPage);

      const result = await taskService.cancelTask('test-task-789');

      // Verify background page was called
      expect(mockBackgroundPage.marvin.cancelTask).toHaveBeenCalledWith('test-task-789');
      
      // Verify task is removed from active tasks
      expect(taskService._taskServiceActiveTasks.has(mockTask)).toBe(false);
      
      // Verify result is true
      expect(result).toBe(true);
    });

    test('should retry a failed task and update state', async () => {
      // Create a failed task
      const mockTask = {
        id: 'test-task-retry',
        status: 'error',
        title: 'Failed Task',
        error: 'Network error'
      };
      taskService._taskServiceCompletedTasks.set(mockTask, Date.now());

      // Mock background page response
      const mockBackgroundPage = {
        marvin: {
          retryTask: jest.fn().mockResolvedValue(true)
        }
      };
      mockChrome.extension.getBackgroundPage.mockReturnValue(mockBackgroundPage);

      const result = await taskService.retryTask('test-task-retry');

      // Verify background page was called
      expect(mockBackgroundPage.marvin.retryTask).toHaveBeenCalledWith('test-task-retry');
      
      // Verify result is true
      expect(result).toBe(true);
    });

    test('should retrieve task by ID from active tasks', async () => {
      // Create an active task
      const mockTask = {
        id: 'active-task-123',
        status: 'processing',
        title: 'Active Task'
      };
      taskService._taskServiceActiveTasks.set(mockTask, Date.now());

      const result = await taskService.getTaskById('active-task-123');

      // Verify correct task is returned
      expect(result).toBe(mockTask);
    });

    test('should retrieve task by ID from completed tasks', async () => {
      // Create a completed task
      const mockTask = {
        id: 'completed-task-456',
        status: 'complete',
        title: 'Completed Task'
      };
      taskService._taskServiceCompletedTasks.set(mockTask, Date.now());

      const result = await taskService.getTaskById('completed-task-456');

      // Verify correct task is returned
      expect(result).toBe(mockTask);
    });

    test('should return all active tasks', async () => {
      // Create multiple active tasks
      const task1 = { id: 'task1', status: 'pending' };
      const task2 = { id: 'task2', status: 'processing' };
      taskService._taskServiceActiveTasks.set(task1, Date.now());
      taskService._taskServiceActiveTasks.set(task2, Date.now());

      const result = await taskService.getActiveTasks();

      // Verify all active tasks are returned
      expect(result).toHaveLength(2);
      expect(result).toContain(task1);
      expect(result).toContain(task2);
    });

    test('should return all completed tasks', async () => {
      // Create multiple completed tasks
      const task1 = { id: 'task1', status: 'complete' };
      const task2 = { id: 'task2', status: 'error' };
      taskService._taskServiceCompletedTasks.set(task1, Date.now());
      taskService._taskServiceCompletedTasks.set(task2, Date.now());

      const result = await taskService.getCompletedTasks();

      // Verify all completed tasks are returned
      expect(result).toHaveLength(2);
      expect(result).toContain(task1);
      expect(result).toContain(task2);
    });

    test('should handle invalid task ID', async () => {
      // Try to get a non-existent task
      await expect(taskService.getTaskById('non-existent-task')).rejects.toThrow('Task non-existent-task not found');
    });

    test('should handle missing task data', async () => {
      // Try to create a task with missing data
      await expect(taskService.createTask(null)).rejects.toThrow();
    });

    test('should handle task creation failure', async () => {
      // Mock background page failure
      const mockBackgroundPage = {
        marvin: {
          createTask: jest.fn().mockRejectedValue(new Error('Creation failed'))
        }
      };
      mockChrome.extension.getBackgroundPage.mockReturnValue(mockBackgroundPage);

      const taskData = { type: 'capture', url: 'https://example.com' };

      await expect(taskService.createTask(taskData)).rejects.toThrow('Creation failed');
    });
  });
});