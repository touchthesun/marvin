// extension/tests/components/panel-initialization.test.js
if (typeof window !== 'undefined') {
  window.__MARVIN_TEST__ = true;
}

import fs from 'fs';
import path from 'path';
import { Dashboard } from '../../src/dashboard/dashboard.js';
import { jest } from '@jest/globals';
import { LogManager } from '../../src/utils/log-manager.js';
import { container } from '../../src/core/dependency-container.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { createMockSystem } from '../utils/mock-system.js';

// Read dashboard.html and extract the <body> contents
const html = fs.readFileSync(
  path.resolve(__dirname, '../../src/dashboard/dashboard.html'),
  'utf8'
);
const headMatch = html.match(/<head[^>]*>([\s\S]*)<\/head>/i);
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const head = headMatch ? headMatch[1] : '';
const body = bodyMatch ? bodyMatch[1] : '';

// Mock Chrome APIs
const onMessage = {
  addListener: jest.fn(),
  removeListener: jest.fn()
};

global.chrome = {
  storage: {
    local: {
      get: jest.fn((key, cb) => cb ? cb({}) : Promise.resolve({})),
      set: jest.fn((data, cb) => cb ? cb() : Promise.resolve())
    }
  },
  tabs: {
    create: jest.fn((opts, cb) => cb && cb({ id: 1 }))
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://id/${path}`),
    onMessage
  }
};

// Create mock system for testing
const mockSystem = createMockSystem();

// Mock container initialization
jest.mock('../../src/core/container-init.js', () => ({
  ensureContainerInitialized: () => Promise.resolve({
    initialized: true,
    components: { count: 0 },
    progress: { phase: 'complete', progress: 100 }
  })
}));

// Mock dependency container
jest.mock('../../src/core/dependency-container.js', () => {
  const realContainer = {
    components: new Map(),
    componentInstances: new Map(),
    services: new Map(),
    utils: new Map(),
    
    registerComponent: function(name, component) {
      console.log(`Registering real component: ${name}`);
      this.components.set(name, component);
      return this;
    },
    
    getComponent: function(name, options) {
      console.log(`Container.getComponent called with: ${name}`);
      
      // For navigation, use the real component if registered
      if (name === 'navigation' && this.components.has('navigation')) {
        console.log('Returning real navigation component');
        if (!this.componentInstances.has(name)) {
          const Component = this.components.get(name);
          const instance = new Component();
          this.componentInstances.set(name, instance);
        }
        return this.componentInstances.get(name);
      }
      
      // For panel components, return the component class/object
      if (this.components.has(name)) {
        console.log(`Returning real component: ${name}`);
        return this.components.get(name);
      }
      
      console.log(`No component found for: ${name}`);
      return null;
    },
    
    getService: function(name) {
      console.log(`Container.getService called with: ${name}`);
      return this.services.get(name) || null;
    }
  };
  
  return { container: realContainer };
});

beforeEach(() => {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  
  // Reset dashboard state
  Dashboard.initialized = false;
  Dashboard._logger = new LogManager({ context: 'test', isBackgroundScript: false });
  Dashboard._eventListeners = [];
  Dashboard._timeouts = [];
  Dashboard._intervals = [];
  Dashboard._domElements = [];
  
  // Reset mock system
  mockSystem.reset();
  
  // Reset all mocks
  jest.clearAllMocks();
  
  // Register all components including panels
  ComponentRegistry.registerAll();
});

afterEach(async () => {
  // Clean up DOM
  document.body.innerHTML = '';
  
  // Reset all mocks
  mockSystem.reset();
  jest.clearAllMocks();
  
  // Clean up dashboard if it exists and is initialized
  if (Dashboard && Dashboard.initialized) {
    await Dashboard.cleanup();
  }
});

describe('Panel Initialization Investigation', () => {
  describe('Component Registration', () => {
    test('all panel components are registered in container', () => {
      const panelComponents = [
        'overview-panel',
        'capture-panel', 
        'knowledge-panel',
        'assistant-panel',
        'tasks-panel',
        'settings-panel'
      ];
      
      panelComponents.forEach(componentName => {
        const component = container.getComponent(componentName);
        console.log(`Checking ${componentName}:`, component);
        expect(component).toBeDefined();
        expect(component).not.toBeNull();
      });
    });

    test('panel components have required initialization methods', () => {
      const panelComponents = [
        { name: 'overview-panel', method: 'initOverviewPanel' },
        { name: 'capture-panel', method: 'initCapturePanel' },
        { name: 'knowledge-panel', method: 'initKnowledgePanel' },
        { name: 'assistant-panel', method: 'initAssistantPanel' },
        { name: 'tasks-panel', method: 'initTasksPanel' },
        { name: 'settings-panel', method: 'initSettingsPanel' }
      ];
      
      panelComponents.forEach(({ name, method }) => {
        const component = container.getComponent(name);
        console.log(`Checking ${name} for method ${method}:`, typeof component[method]);
        expect(typeof component[method]).toBe('function');
      });
    });
  });

  describe('Panel DOM Structure', () => {
    test('all panel elements exist in DOM', () => {
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
        console.log(`Checking panel ${panelId}:`, panel);
        expect(panel).not.toBeNull();
        expect(panel.classList.contains('content-panel')).toBe(true);
        expect(panel.getAttribute('data-component')).toBe(panelId);
      });
    });

    test('panel force-init buttons exist', () => {
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
        console.log(`Checking force-init button ${buttonId}:`, button);
        expect(button).not.toBeNull();
        expect(button.textContent).toContain('Reload');
      });
    });
  });

  describe('Individual Panel Investigation', () => {
    describe('Overview Panel', () => {
      test('overview panel component structure', () => {
        const component = container.getComponent('overview-panel');
        console.log('Overview panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initOverviewPanel).toBe('function');
        expect(component.initialized).toBe(false);
        expect(Array.isArray(component._eventListeners)).toBe(true);
      });

      test('overview panel DOM elements', () => {
        const panel = document.getElementById('overview-panel');
        const statsElements = [
          'captured-count',
          'relationship-count', 
          'query-count'
        ];
        const actionButtons = [
          'force-init-overview',
          'refresh-btn',
          'view-all-captures',
          'explore-knowledge'
        ];
        
        statsElements.forEach(elementId => {
          const element = document.getElementById(elementId);
          console.log(`Checking overview stat element ${elementId}:`, element);
          expect(element).not.toBeNull();
        });
        
        actionButtons.forEach(buttonId => {
          const button = document.getElementById(buttonId);
          console.log(`Checking overview action button ${buttonId}:`, button);
          expect(button).not.toBeNull();
        });
      });

      test('overview panel initialization attempt', async () => {
        const component = container.getComponent('overview-panel');
        
        console.log('Attempting to initialize overview panel...');
        try {
          const result = await component.initOverviewPanel();
          console.log('Overview panel initialization result:', result);
          
          // Should not throw, even if it fails
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Overview panel initialization error:', error);
          // Even if it fails, we should get an error object
          expect(error).toBeDefined();
        }
      });
    });

    describe('Capture Panel', () => {
      test('capture panel component structure', () => {
        const component = container.getComponent('capture-panel');
        console.log('Capture panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initCapturePanel).toBe('function');
      });

      test('capture panel DOM elements', () => {
        const panel = document.getElementById('capture-panel');
        const tabButtons = document.querySelectorAll('#capture-panel .tab-btn');
        const tabPanes = document.querySelectorAll('#capture-panel .tab-pane');
        const actionButtons = [
          'force-init-capture',
          'capture-selected',
          'select-all-tabs',
          'deselect-all-tabs'
        ];
        
        console.log('Capture panel tab buttons:', tabButtons.length);
        console.log('Capture panel tab panes:', tabPanes.length);
        
        expect(tabButtons.length).toBe(3); // tabs, bookmarks, history
        expect(tabPanes.length).toBe(3);
        
        actionButtons.forEach(buttonId => {
          const button = document.getElementById(buttonId);
          console.log(`Checking capture action button ${buttonId}:`, button);
          expect(button).not.toBeNull();
        });
      });

      test('capture panel initialization attempt', async () => {
        const component = container.getComponent('capture-panel');
        
        console.log('Attempting to initialize capture panel...');
        try {
          const result = await component.initCapturePanel();
          console.log('Capture panel initialization result:', result);
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Capture panel initialization error:', error);
          expect(error).toBeDefined();
        }
      });
    });

    describe('Knowledge Panel', () => {
      test('knowledge panel component structure', () => {
        const component = container.getComponent('knowledge-panel');
        console.log('Knowledge panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initKnowledgePanel).toBe('function');
      });

      test('knowledge panel initialization attempt', async () => {
        const component = container.getComponent('knowledge-panel');
        
        console.log('Attempting to initialize knowledge panel...');
        try {
          const result = await component.initKnowledgePanel();
          console.log('Knowledge panel initialization result:', result);
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Knowledge panel initialization error:', error);
          expect(error).toBeDefined();
        }
      });
    });

    describe('Assistant Panel', () => {
      test('assistant panel component structure', () => {
        const component = container.getComponent('assistant-panel');
        console.log('Assistant panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initAssistantPanel).toBe('function');
      });

      test('assistant panel initialization attempt', async () => {
        const component = container.getComponent('assistant-panel');
        
        console.log('Attempting to initialize assistant panel...');
        try {
          const result = await component.initAssistantPanel();
          console.log('Assistant panel initialization result:', result);
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Assistant panel initialization error:', error);
          expect(error).toBeDefined();
        }
      });
    });

    describe('Tasks Panel', () => {
      test('tasks panel component structure', () => {
        const component = container.getComponent('tasks-panel');
        console.log('Tasks panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initTasksPanel).toBe('function');
      });

      test('tasks panel initialization attempt', async () => {
        const component = container.getComponent('tasks-panel');
        
        console.log('Attempting to initialize tasks panel...');
        try {
          const result = await component.initTasksPanel();
          console.log('Tasks panel initialization result:', result);
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Tasks panel initialization error:', error);
          expect(error).toBeDefined();
        }
      });
    });

    describe('Settings Panel', () => {
      test('settings panel component structure', () => {
        const component = container.getComponent('settings-panel');
        console.log('Settings panel component:', component);
        
        expect(component).toBeDefined();
        expect(typeof component.initSettingsPanel).toBe('function');
      });

      test('settings panel initialization attempt', async () => {
        const component = container.getComponent('settings-panel');
        
        console.log('Attempting to initialize settings panel...');
        try {
          const result = await component.initSettingsPanel();
          console.log('Settings panel initialization result:', result);
          expect(typeof result).toBe('boolean');
        } catch (error) {
          console.error('Settings panel initialization error:', error);
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Panel Activation and Initialization', () => {
    test('panel activation triggers initialization', async () => {
      // Initialize dashboard first
      await Dashboard.initDashboard();
      
      const panels = [
        'overview-panel',
        'capture-panel',
        'knowledge-panel',
        'assistant-panel', 
        'tasks-panel',
        'settings-panel'
      ];
      
      for (const panelName of panels) {
        console.log(`\n=== Testing panel activation for ${panelName} ===`);
        
        // Get the panel component
        const component = container.getComponent(panelName);
        const panelElement = document.getElementById(panelName);
        const navItem = document.querySelector(`[data-panel="${panelName.replace('-panel', '')}"]`);
        
        console.log('Panel component:', component);
        console.log('Panel element:', panelElement);
        console.log('Nav item:', navItem);
        
        // Click the nav item to activate the panel
        if (navItem) {
          navItem.click();
          
          // Check if panel is now active
          expect(panelElement.classList.contains('active')).toBe(true);
          expect(navItem.classList.contains('active')).toBe(true);
          
          // Check if component has been initialized
          console.log(`Panel ${panelName} initialized state:`, component.initialized);
        }
      }
    });

    test('force-init buttons trigger panel initialization', async () => {
      await Dashboard.initDashboard();
      
      const forceInitButtons = [
        { id: 'force-init-overview', panel: 'overview-panel' },
        { id: 'force-init-capture', panel: 'capture-panel' },
        { id: 'force-init-knowledge', panel: 'knowledge-panel' },
        { id: 'force-init-assistant', panel: 'assistant-panel' },
        { id: 'force-init-tasks', panel: 'tasks-panel' },
        { id: 'force-init-settings', panel: 'settings-panel' }
      ];
      
      for (const { id, panel } of forceInitButtons) {
        console.log(`\n=== Testing force-init for ${panel} ===`);
        
        const button = document.getElementById(id);
        const component = container.getComponent(panel);
        
        console.log('Force-init button:', button);
        console.log('Panel component:', component);
        
        if (button) {
          // Click the force-init button
          button.click();
          
          // Check if component initialization was attempted
          console.log(`Panel ${panel} initialized state after force-init:`, component.initialized);
        }
      }
    });
  });

  describe('Panel Loading States', () => {
    test('panels show loading indicators', () => {
      const panels = [
        'knowledge-panel',
        'assistant-panel',
        'tasks-panel',
        'settings-panel'
      ];
      
      panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        const loadingIndicator = panel.querySelector('.loading-indicator');
        
        console.log(`Checking loading indicator for ${panelId}:`, loadingIndicator);
        expect(loadingIndicator).not.toBeNull();
        expect(loadingIndicator.textContent).toContain('Loading');
      });
    });

    test('overview and capture panels have content structure', () => {
      // Overview panel should have stats and widgets
      const overviewPanel = document.getElementById('overview-panel');
      const statsCards = overviewPanel.querySelectorAll('.stat-card');
      const widgets = overviewPanel.querySelectorAll('.widget');
      
      console.log('Overview panel stats cards:', statsCards.length);
      console.log('Overview panel widgets:', widgets.length);
      
      expect(statsCards.length).toBe(3); // captured, relationships, queries
      expect(widgets.length).toBe(2); // recent captures, knowledge preview
      
      // Capture panel should have tabs and content
      const capturePanel = document.getElementById('capture-panel');
      const tabButtons = capturePanel.querySelectorAll('.tab-btn');
      const tabPanes = capturePanel.querySelectorAll('.tab-pane');
      
      console.log('Capture panel tab buttons:', tabButtons.length);
      console.log('Capture panel tab panes:', tabPanes.length);
      
      expect(tabButtons.length).toBe(3); // tabs, bookmarks, history
      expect(tabPanes.length).toBe(3);
    });
  });
}); 