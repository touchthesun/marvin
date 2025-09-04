/**
 * TDD for Tasks Panel Initialization Issues
 * This test will expose why the Tasks Panel fails to initialize
 */

import { container } from '../src/core/dependency-container.js';
import { containerInitializer } from '../src/core/container-init.js';

// Mock DOM elements that Tasks Panel expects
const mockDOM = () => {
  // Create the DOM elements that tasks-panel.js expects
  const elements = {
    'active-tasks-list': document.createElement('div'),
    'completed-tasks-list': document.createElement('div'),
    'active-count': document.createElement('span'),
    'completed-count': document.createElement('span'),
    'refreshBtn': document.createElement('button'),
    'cancelAllBtn': document.createElement('button'),
    'clearCompletedBtn': document.createElement('button'),
    'task-details': document.createElement('div')
  };

  // Mock getElementById to return our elements
  const originalGetElementById = document.getElementById;
  document.getElementById = jest.fn((id) => {
    return elements[id] || null;
  });

  return () => {
    document.getElementById = originalGetElementById;
  };
};

describe('Tasks Panel Initialization Debug', () => {
  let cleanup;

  beforeAll(async () => {
    // Initialize container system
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Set up DOM mocks
    cleanup = mockDOM();
  });

  afterAll(() => {
    if (cleanup) cleanup();
  });

  test('1. Tasks Panel can be imported', async () => {
    // Test: Can we import the Tasks Panel?
    const { TasksPanel } = await import('../src/components/panels/tasks/tasks-panel.js');
    expect(TasksPanel).toBeDefined();
    expect(typeof TasksPanel.initialize).toBe('function');
  });

  test('2. Tasks Panel can access required DOM elements', async () => {
    // Test: Are all required DOM elements available?
    const requiredElements = [
      'active-tasks-list',
      'completed-tasks-list', 
      'active-count',
      'completed-count',
      'refreshBtn',
      'cancelAllBtn',
      'clearCompletedBtn',
      'task-details'
    ];

    requiredElements.forEach(id => {
      const element = document.getElementById(id);
      expect(element).toBeTruthy();
    });
  });

  test('3. Tasks Panel initialization succeeds', async () => {
    // Test: Does the Tasks Panel initialize without errors?
    const { TasksPanel } = await import('../src/components/panels/tasks/tasks-panel.js');
    
    // Mock logger
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    try {
      const result = await TasksPanel.initialize(mockLogger);
      expect(result).toBe(true);
      expect(TasksPanel.initialized).toBe(true);
    } catch (error) {
      console.log('Initialization Error:', error.message);
      console.log('Error Stack:', error.stack);
      throw error;
    }
  });

  test('4. API service getTasks method works', async () => {
    // Test: Does the getTasks API call work?
    const apiService = await container.getService('apiService');
    
    try {
      const response = await apiService.getTasks();
      console.log('getTasks response:', response);
      expect(response).toBeDefined();
    } catch (error) {
      console.log('getTasks Error:', error.message);
      // This might fail if the API server isn't running, but we want to see the error
      expect(error.message).toContain('fetch'); // Should be a network error, not a code error
    }
  });

  test('5. Tasks Panel refreshAllTasks method works', async () => {
    // Test: Does refreshAllTasks work when called directly?
    const { TasksPanel } = await import('../src/components/panels/tasks/tasks-panel.js');
    
    // Mock logger
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    try {
      await TasksPanel.refreshAllTasks(mockLogger);
      // If this succeeds, the method works
      expect(true).toBe(true);
    } catch (error) {
      console.log('refreshAllTasks Error:', error.message);
      console.log('Error Stack:', error.stack);
      throw error;
    }
  });
});
