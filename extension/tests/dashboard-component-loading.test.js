/**
 * Dashboard Component Loading Test
 * Tests if dashboard can actually load and render components
 */

import { container } from '../src/core/dependency-container.js';
import { containerInitializer } from '../src/core/container-init.js';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    lastError: null,
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  }
};

// Mock DOM
global.document = {
  getElementById: jest.fn().mockReturnValue({
    innerHTML: '',
    appendChild: jest.fn(),
    addEventListener: jest.fn()
  }),
  createElement: jest.fn().mockReturnValue({
    innerHTML: '',
    appendChild: jest.fn(),
    addEventListener: jest.fn()
  }),
  querySelector: jest.fn().mockReturnValue(null)
};

global.window = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

global.navigator = { onLine: true };

describe('Dashboard Component Loading', () => {
  beforeEach(async () => {
    await container.reset();
  });

  afterEach(async () => {
    await container.reset();
  });

  test('container initializes with required components', async () => {
    console.log('🔍 TEST: Starting container initialization test');
    
    // Initialize container
    await containerInitializer.initialize({
      context: 'dashboard-test',
      isBackgroundScript: false
    });

    console.log('🔍 TEST: Container initialized, checking status');

    // Check that container is initialized
    expect(containerInitializer.initialized).toBe(true);

    // Check that required components are registered
    const requiredComponents = ['navigation', 'overview-panel', 'capture-panel'];
    console.log('🔍 TEST: Checking required components:', requiredComponents);
    console.log('🔍 TEST: Registered components:', Array.from(container.components.keys()));
    
    for (const componentName of requiredComponents) {
      expect(container.components.has(componentName)).toBe(true);
    }

    // Check that components are actually instantiated
    console.log('🔍 TEST: Instantiated components:', Array.from(container.componentInstances.keys()));
    
    for (const componentName of requiredComponents) {
      expect(container.componentInstances.has(componentName)).toBe(true);
    }
  });

  test('components can be retrieved and have required methods', async () => {
    console.log('🔍 TEST: Starting component retrieval test');
    
    // Initialize container
    await containerInitializer.initialize({
      context: 'dashboard-test',
      isBackgroundScript: false
    });

    // Test each component can be retrieved
    const componentNames = ['navigation', 'overview-panel', 'capture-panel'];
    
    for (const componentName of componentNames) {
      console.log(`🔍 TEST: Retrieving component: ${componentName}`);
      
      const component = container.getComponent(componentName);
      
      // Component should exist
      expect(component).toBeDefined();
      expect(component).not.toBeNull();
      
      // Component should have initialize method
      expect(typeof component.initialize).toBe('function');
      
      console.log(`✓ Component ${componentName} retrieved successfully`);
    }
  });

  test('dashboard container status shows components loaded', async () => {
    console.log('🔍 TEST: Starting container status test');
    
    // Initialize container
    await containerInitializer.initialize({
      context: 'dashboard-test',
      isBackgroundScript: false
    });

    // Get container status
    const status = containerInitializer.getStatus();
    
    console.log('🔍 TEST: Container status:', JSON.stringify(status, null, 2));
    
    // Should be initialized
    expect(status.initialized).toBe(true);
    
    // Should have no errors
    expect(status.errors).toHaveLength(0);
    
    // Should have components
    expect(status.components.count).toBeGreaterThan(0);
    expect(status.components.missing).toHaveLength(0);
  });
});
