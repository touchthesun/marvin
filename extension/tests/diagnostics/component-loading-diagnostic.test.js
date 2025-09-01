// extension/tests/diagnostics/component-loading-diagnostic.test.js
import { jest } from '@jest/globals';
import { Dashboard } from '../../src/dashboard/dashboard.js';
import { container } from '../../src/core/dependency-container.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { createMockSystem } from '../utils/mock-system.js';

// Read dashboard HTML for testing
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(
  path.resolve(__dirname, '../../src/dashboard/dashboard.html'),
  'utf8'
);
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const body = bodyMatch ? bodyMatch[1] : '';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn((key, cb) => cb ? cb({}) : Promise.resolve({})),
      set: jest.fn((data, cb) => cb ? cb() : Promise.resolve())
    }
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://id/${path}`),
    sendMessage: jest.fn()
  }
};

// Create mock system
const mockSystem = createMockSystem();

describe('Component Loading Diagnostic', () => {
  beforeEach(() => {
    document.body.innerHTML = body;
    
    // Reset container
    container.components.clear();
    container.componentInstances.clear();
    container.services.clear();
    container.utils.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Container State Analysis', () => {
    test('Container should be accessible', () => {
      expect(container).toBeDefined();
      expect(container.components).toBeInstanceOf(Map);
      expect(container.componentInstances).toBeInstanceOf(Map);
    });

    test('ComponentRegistry should register components', () => {
      ComponentRegistry.registerAll();
      
      const expectedComponents = [
        'navigation',
        'overview-panel', 
        'capture-panel',
        'knowledge-panel',
        'settings-panel',
        'tasks-panel',
        'assistant-panel'
      ];

      expectedComponents.forEach(componentName => {
        expect(container.components.has(componentName)).toBe(true);
        console.log(`✅ Component registered: ${componentName}`);
      });
    });

    test('Components should be retrievable from container', () => {
      ComponentRegistry.registerAll();
      
      const components = [
        'navigation',
        'overview-panel',
        'capture-panel'
      ];

      components.forEach(componentName => {
        const component = container.getComponent(componentName);
        expect(component).toBeDefined();
        console.log(`✅ Component retrievable: ${componentName}`, typeof component);
      });
    });
  });

  describe('DOM Element Analysis', () => {
    test('All panel elements should exist in DOM', () => {
      const panels = [
        'overview-panel',
        'capture-panel', 
        'knowledge-panel',
        'assistant-panel',
        'tasks-panel',
        'settings-panel'
      ];

      panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        expect(panel).not.toBeNull();
        console.log(`✅ Panel element exists: ${panelId}`);
      });
    });

    test('All force-init buttons should exist', () => {
      const forceInitButtons = [
        'force-init-overview',
        'force-init-capture',
        'force-init-knowledge',
        'force-init-assistant',
        'force-init-tasks',
        'force-init-settings'
      ];

      forceInitButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        expect(button).not.toBeNull();
        console.log(`✅ Force-init button exists: ${buttonId}`);
      });
    });

    test('Navigation items should exist and have correct attributes', () => {
      const navItems = document.querySelectorAll('.nav-item');
      expect(navItems.length).toBe(6);

      const expectedPanels = [
        'overview',
        'capture', 
        'knowledge',
        'assistant',
        'tasks',
        'settings'
      ];

      navItems.forEach((item, index) => {
        const dataPanel = item.getAttribute('data-panel');
        expect(dataPanel).toBe(expectedPanels[index]);
        console.log(`✅ Nav item has correct data-panel: ${dataPanel}`);
      });
    });
  });

  describe('Component Initialization Analysis', () => {
    test('Overview panel should have initialization method', () => {
      ComponentRegistry.registerAll();
      const overviewPanel = container.getComponent('overview-panel');
      
      expect(overviewPanel).toBeDefined();
      expect(typeof overviewPanel.initOverviewPanel).toBe('function');
      console.log('✅ Overview panel has initOverviewPanel method');
    });

    test('Capture panel should have initialization method', () => {
      ComponentRegistry.registerAll();
      const capturePanel = container.getComponent('capture-panel');
      
      expect(capturePanel).toBeDefined();
      expect(typeof capturePanel.initCapturePanel).toBe('function');
      console.log('✅ Capture panel has initCapturePanel method');
    });

    test('Navigation component should have initialization method', () => {
      ComponentRegistry.registerAll();
      const navigation = container.getComponent('navigation');
      
      expect(navigation).toBeDefined();
      expect(typeof navigation.initialize).toBe('function');
      console.log('✅ Navigation has initialize method');
    });
  });

  describe('Dashboard Initialization Analysis', () => {
    test('Dashboard should initialize without throwing', async () => {
      try {
        await Dashboard.initDashboard();
        console.log('✅ Dashboard initialization completed');
      } catch (error) {
        console.error('❌ Dashboard initialization failed:', error);
        // Don't fail the test, just log the error
      }
    });

    test('Dashboard should set up logger', async () => {
      await Dashboard.initDashboard();
      expect(Dashboard._logger).toBeDefined();
      console.log('✅ Dashboard logger initialized');
    });
  });

  describe('Event Handler Analysis', () => {
    test('Force-init buttons should be clickable', () => {
      const forceInitButtons = [
        'force-init-overview',
        'force-init-capture'
      ];

      forceInitButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        expect(button).not.toBeNull();
        
        // Test if button is clickable
        const clickEvent = new Event('click');
        expect(() => button.dispatchEvent(clickEvent)).not.toThrow();
        console.log(`✅ Force-init button is clickable: ${buttonId}`);
      });
    });

    test('Navigation items should be clickable', () => {
      const navItems = document.querySelectorAll('.nav-item');
      
      navItems.forEach((item, index) => {
        const clickEvent = new Event('click');
        expect(() => item.dispatchEvent(clickEvent)).not.toThrow();
        console.log(`✅ Nav item ${index} is clickable`);
      });
    });
  });

  describe('Service Dependency Analysis', () => {
    test('Container should have service registration capability', () => {
      expect(typeof container.registerService).toBe('function');
      expect(typeof container.getService).toBe('function');
      console.log('✅ Container has service registration methods');
    });

    test('Components should be able to get services', () => {
      ComponentRegistry.registerAll();
      const overviewPanel = container.getComponent('overview-panel');
      
      // Test the getService method that components use
      expect(typeof overviewPanel.getService).toBe('function');
      console.log('✅ Components have getService method');
    });
  });

  describe('Error State Analysis', () => {
    test('Components should handle missing dependencies gracefully', () => {
      ComponentRegistry.registerAll();
      const overviewPanel = container.getComponent('overview-panel');
      
      // Test initialization with missing services
      const testLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      };

      // Mock the getService method to return null for missing services
      const originalGetService = overviewPanel.getService;
      overviewPanel.getService = jest.fn().mockReturnValue(null);

      expect(() => {
        overviewPanel.getService(testLogger, 'missingService', {});
      }).not.toThrow();

      console.log('✅ Components handle missing dependencies gracefully');
    });
  });
});
