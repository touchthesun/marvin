/**
 * TDD for Broken Systems: Tasks Panel Debug Test
 * This test will expose the root cause of Tasks Panel failures
 */

import { container } from '../src/core/dependency-container.js';
import { containerInitializer } from '../src/core/container-init.js';

describe('Tasks Panel TDD Debug', () => {
  beforeAll(async () => {
    // Initialize container system
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
  });

  test('1. Container has apiService', () => {
    // Test: Does the container have apiService?
    expect(container.services.has('apiService')).toBe(true);
  });

  test('2. Can get apiService instance', async () => {
    // Test: Can we actually get the apiService?
    const apiService = await container.getService('apiService');
    expect(apiService).toBeDefined();
    expect(typeof apiService.getTasks).toBe('function');
  });

  test('3. API service can make requests', async () => {
    // Test: Can apiService make basic requests?
    const apiService = await container.getService('apiService');
    
    try {
      // Try a simple request that should work
      const response = await apiService.getStats();
      expect(response).toBeDefined();
    } catch (error) {
      // If this fails, we know the API service itself is broken
      console.log('API Service Error:', error.message);
      throw error;
    }
  });

  test('4. Tasks API endpoint exists', async () => {
    // Test: Does the /tasks endpoint actually exist?
    const apiService = await container.getService('apiService');
    
    try {
      const response = await apiService.getTasks();
      expect(response).toBeDefined();
    } catch (error) {
      // If this fails, the /tasks endpoint doesn't exist or is broken
      console.log('Tasks API Error:', error.message);
      throw error;
    }
  });

  test('5. Tasks Panel can access services', async () => {
    // Test: Can Tasks Panel access the container services?
    const { TasksPanel } = await import('../src/components/panels/tasks/tasks-panel.js');
    
    // Mock logger
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Test the getService method
    const apiService = TasksPanel.getService(mockLogger, 'apiService', null);
    expect(apiService).toBeDefined();
  });
});
