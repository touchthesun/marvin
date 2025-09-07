/**
 * TDD for Capture → Task Data Flow Investigation
 * This test will trace the complete flow from capture button to task storage
 */

import { container } from '../src/core/dependency-container.js';
import { containerInitializer } from '../src/core/container-init.js';

describe('Capture to Task Data Flow Investigation', () => {
  beforeAll(async () => {
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
  });

  test('1. TaskService initial state', async () => {
    // Test: What is the initial state of TaskService?
    const taskService = await container.getService('taskService');
    
    console.log('TaskService initialized:', taskService._initialized);
    console.log('TaskService active tasks map size:', taskService._taskServiceActiveTasks?.size);
    console.log('TaskService completed tasks map size:', taskService._taskServiceCompletedTasks?.size);
    
    const activeTasks = await taskService.getActiveTasks();
    const completedTasks = await taskService.getCompletedTasks();
    
    console.log('Active tasks array:', activeTasks);
    console.log('Completed tasks array:', completedTasks);
    
    expect(Array.isArray(activeTasks)).toBe(true);
    expect(Array.isArray(completedTasks)).toBe(true);
  });

  test('2. TaskService createTask method', async () => {
    // Test: Can we create a task directly via TaskService?
    const taskService = await container.getService('taskService');
    
    const testTaskData = {
      url: 'https://test.com',
      context: 'active_tab',
      type: 'capture'
    };
    
    console.log('Creating test task with data:', testTaskData);
    
    try {
      const result = await taskService.createTask(testTaskData);
      console.log('Task creation result:', result);
      
      // Check if task was added to active tasks
      const activeTasks = await taskService.getActiveTasks();
      console.log('Active tasks after creation:', activeTasks.length);
      console.log('Active tasks data:', activeTasks);
      
      expect(result).toBeDefined();
      expect(activeTasks.length).toBeGreaterThan(0);
      
    } catch (error) {
      console.log('Task creation error:', error.message);
      throw error;
    }
  });

  test('3. Capture Panel task creation flow', async () => {
    // Test: How does Capture Panel create tasks?
    const { CapturePanel } = await import('../src/components/panels/capture/capture-panel.js');
    
    // Mock the required DOM elements and methods
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Check if Capture Panel has task creation methods
    console.log('Capture Panel methods:', Object.getOwnPropertyNames(CapturePanel));
    
    // Look for task-related methods
    const taskMethods = Object.getOwnPropertyNames(CapturePanel).filter(name => 
      name.toLowerCase().includes('task') || name.toLowerCase().includes('capture')
    );
    console.log('Task-related methods in Capture Panel:', taskMethods);
  });

  test('4. Background script task handling', async () => {
    // Test: How does the background script handle task creation?
    
    // Check if we can access background page methods
    try {
      // This will fail in test environment, but let's see what happens
      const backgroundPage = chrome?.extension?.getBackgroundPage?.();
      console.log('Background page available:', !!backgroundPage);
      
      if (backgroundPage && backgroundPage.marvin) {
        console.log('Background marvin methods:', Object.getOwnPropertyNames(backgroundPage.marvin));
      }
    } catch (error) {
      console.log('Background page access error (expected in tests):', error.message);
    }
  });

  test('5. Message passing for task creation', async () => {
    // Test: How are tasks created via message passing?
    const messageService = await container.getService('messageService');
    
    console.log('MessageService available:', !!messageService);
    console.log('MessageService initialized:', messageService._initialized);
    
    // Check what message handlers are available
    if (messageService._serviceHandlers) {
      console.log('Available message handlers:', Array.from(messageService._serviceHandlers.keys()));
    }
    
    // Try to send a task creation message (will fail but shows the flow)
    try {
      const response = await messageService.sendMessage({
        action: 'createTask',
        data: {
          url: 'https://test.com',
          context: 'active_tab'
        }
      });
      console.log('Task creation message response:', response);
    } catch (error) {
      console.log('Task creation message error (expected):', error.message);
    }
  });
});
