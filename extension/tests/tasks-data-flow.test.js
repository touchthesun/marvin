/**
 * TDD for Tasks Data Flow Investigation
 * This test will expose issues in task data storage/retrieval
 */

import { container } from '../src/core/dependency-container.js';
import { containerInitializer } from '../src/core/container-init.js';

describe('Tasks Data Flow Investigation', () => {
  beforeAll(async () => {
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
  });

  test('1. API Service getTasks returns expected format', async () => {
    // Test: What does getTasks actually return?
    const apiService = await container.getService('apiService');
    const response = await apiService.getTasks();
    
    console.log('getTasks response:', JSON.stringify(response, null, 2));
    
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    expect(response.data.tasks).toBeDefined();
    expect(Array.isArray(response.data.tasks)).toBe(true);
  });

  test('2. Mock tasks have correct structure', async () => {
    // Test: Do mock tasks match expected format?
    const apiService = await container.getService('apiService');
    const response = await apiService.getTasks();
    const tasks = response.data.tasks;
    
    console.log('Mock tasks:', JSON.stringify(tasks, null, 2));
    
    expect(tasks.length).toBeGreaterThan(0);
    
    // Check first task structure
    const firstTask = tasks[0];
    console.log('First task structure:', Object.keys(firstTask));
    
    expect(firstTask).toHaveProperty('id');
    expect(firstTask).toHaveProperty('status');
    expect(firstTask).toHaveProperty('message');
    expect(firstTask).toHaveProperty('created_at');
  });

  test('3. Task filtering logic works correctly', async () => {
    // Test: Does the filtering logic work as expected?
    const apiService = await container.getService('apiService');
    const response = await apiService.getTasks();
    const tasks = response.data.tasks;
    
    // Apply same filtering logic as Tasks Panel
    const activeTasks = tasks.filter(task => task.status === 'running' || task.status === 'pending');
    const completedTasks = tasks.filter(task => task.status === 'completed' || task.status === 'error');
    
    console.log('Active tasks:', activeTasks.length);
    console.log('Completed tasks:', completedTasks.length);
    console.log('Active task statuses:', activeTasks.map(t => t.status));
    console.log('Completed task statuses:', completedTasks.map(t => t.status));
    
    expect(activeTasks.length + completedTasks.length).toBe(tasks.length);
  });

  test('4. Tasks Panel processes data correctly', async () => {
    // Test: Can Tasks Panel process the mock data?
    const { TasksPanel } = await import('../src/components/panels/tasks/tasks-panel.js');
    
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Call refreshAllTasks and check results
    try {
      await TasksPanel.refreshAllTasks(mockLogger);
      
      console.log('Tasks Panel active tasks:', TasksPanel.activeTasks.length);
      console.log('Tasks Panel completed tasks:', TasksPanel.completedTasks.length);
      console.log('Tasks Panel active tasks data:', TasksPanel.activeTasks);
      console.log('Tasks Panel completed tasks data:', TasksPanel.completedTasks);
      
      expect(TasksPanel.activeTasks).toBeDefined();
      expect(TasksPanel.completedTasks).toBeDefined();
      
    } catch (error) {
      console.log('Error in refreshAllTasks:', error);
      throw error;
    }
  });

  test('5. Real API endpoint investigation', async () => {
    // Test: What happens when we try the real API endpoint?
    const apiService = await container.getService('apiService');
    
    // Temporarily restore real API call
    const originalGetTasks = apiService.getTasks;
    apiService.getTasks = async function() {
      return this.fetchAPI('/tasks');
    };
    
    try {
      const response = await apiService.getTasks();
      console.log('Real API response:', response);
    } catch (error) {
      console.log('Real API error:', error.message);
      // This is expected if API server isn't running
    } finally {
      // Restore mock
      apiService.getTasks = originalGetTasks;
    }
  });
});
