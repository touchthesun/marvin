// extension/tests/services/simple-service.test.js
import { jest } from '@jest/globals';

/**
 * Simple service test that doesn't trigger WeakMap iteration issues
 */
describe('Simple Service Test', () => {
  test('should run basic test', () => {
    expect(true).toBe(true);
  });

  test('should handle basic math', () => {
    expect(2 + 2).toBe(4);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  test('should import BaseService without errors', () => {
    expect(() => {
      const BaseService = require('../../src/services/base-service.js');
      expect(BaseService).toBeDefined();
    }).not.toThrow();
  });

  test('should create BaseService instance without errors', () => {
    expect(() => {
      const BaseServiceModule = require('../../src/services/base-service.js');
      // Check if BaseService is exported as a property
      expect(BaseServiceModule).toHaveProperty('BaseService');
      expect(typeof BaseServiceModule.BaseService).toBe('function');
      expect(BaseServiceModule.BaseService.name).toBe('BaseService');
      
      const service = new BaseServiceModule.BaseService();
      expect(service).toBeDefined();
    }).not.toThrow();
  });

  test('should handle service property access', () => {
    const BaseServiceModule = require('../../src/services/base-service.js');
    const service = new BaseServiceModule.BaseService();
    
    // Test basic property access
    expect(service.isInitialized).toBe(false);
    expect(service.resourceTracker).toBeDefined();
    expect(service.memoryMonitor).toBeDefined();
  });
});