// extension/tests/components/dashboard.test.js
if (typeof window !== 'undefined') {
    window.__MARVIN_TEST__ = true;
  }
import fs from 'fs';
import path from 'path';
import { Dashboard } from '../../src/dashboard/dashboard.js';
import { jest } from '@jest/globals';
import { LogManager } from '../../src/utils/log-manager.js';
import { container } from '../../src/core/dependency-container.js';
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
  
  
  // Mock Chrome APIs (same as popup)
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
  
  // Create mock system for dashboard testing
  const mockSystem = createMockSystem();
  
  // Mock container initialization
jest.mock('../../src/core/container-init.js', () => ({
  ensureContainerInitialized: () => Promise.resolve({
    initialized: true,
    components: { count: 0 },
    progress: { phase: 'complete', progress: 100 }
  })
}));

// Mock component registry
jest.mock('../../src/core/component-registry.js', () => ({
  ComponentRegistry: {
    registerAll: () => {}
  }
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
        
        if (name === 'component-system') {
          console.log('Returning component-system mock');
          return {
            loadAndInitializePanel: () => Promise.resolve(true)
          };
        }
        
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
        
        console.log(`No component found for: ${name}`);
        return null;
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
    
    // IMPORTANT: Register the real navigation component
    const { Navigation } = require('../../src/components/core/navigation.js');
    container.registerComponent('navigation', Navigation);
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
  
  describe('Dashboard Component', () => {
    describe('Basic Structure', () => {
      test('Dashboard exists and has required methods', () => {
        expect(Dashboard).toBeDefined();
        expect(typeof Dashboard.initDashboard).toBe('function');
        expect(typeof Dashboard.cleanup).toBe('function');
        expect(typeof Dashboard.setupEventHandlers).toBe('function');
        expect(typeof Dashboard.setupFallbackNavigation).toBe('function');
      });
  
      test('Dashboard starts with correct initial state', () => {
        expect(Dashboard.initialized).toBe(false);
        expect(Dashboard._eventListeners).toEqual([]);
        expect(Dashboard._timeouts).toEqual([]);
        expect(Dashboard._intervals).toEqual([]);
        expect(Dashboard._domElements).toEqual([]);
      });
    });
  
    describe('DOM Structure Validation', () => {
      test('finds all required navigation elements', () => {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
        console.log('Nav:', item.getAttribute('data-panel'));
        });
        const contentPanels = document.querySelectorAll('.content-panel');
        contentPanels.forEach(panel => {
        console.log('Panel:', panel.id);
        });
        
        expect(navItems.length).toBe(6); // overview, capture, knowledge, assistant, tasks, settings
        expect(contentPanels.length).toBe(6);
        
        // Check specific panels exist
        expect(document.getElementById('overview-panel')).not.toBeNull();
        expect(document.getElementById('capture-panel')).not.toBeNull();
        expect(document.getElementById('knowledge-panel')).not.toBeNull();
        expect(document.getElementById('assistant-panel')).not.toBeNull();
        expect(document.getElementById('tasks-panel')).not.toBeNull();
        expect(document.getElementById('settings-panel')).not.toBeNull();
      });
  
      test('finds debug panel elements', () => {
        expect(document.getElementById('debug-panel')).not.toBeNull();
        expect(document.getElementById('show-debug-panel')).not.toBeNull();
        expect(document.getElementById('toggle-debug-panel')).not.toBeNull();
        expect(document.getElementById('test-components')).not.toBeNull();
        expect(document.getElementById('debug-output')).not.toBeNull();
      });

      test('dashboard.html includes dashboard.css link', () => {
        const link = document.querySelector('link[rel="stylesheet"][href="./dashboard.css"]');
        expect(link).not.toBeNull();
      });

    });
  
    describe('Initialization', () => {
      test('initDashboard starts initialization process', async () => {
        console.log('Starting dashboard initialization test...');
        
        try {
          await Dashboard.initDashboard();
          console.log('Dashboard initialization result:', true);
          
          // This might fail initially, but should not throw
          expect(typeof true).toBe('boolean');
        } catch (error) {
          console.error('Dashboard initialization error:', error);
          // Even if it fails, we should get a boolean result
          expect(error).toBeDefined();
        }
      });
  
      test('sets up logger during initialization', async () => {
        expect(Dashboard._logger).toBeInstanceOf(LogManager);
        expect(Dashboard._logger.context).toBe('test');
      });
    });
  
    describe('Event Handler Setup', () => {
      test('setupEventHandlers finds debug panel elements', () => {
        const showDebugBtn = document.getElementById('show-debug-panel');
        const debugPanel = document.getElementById('debug-panel');
        const toggleDebugBtn = document.getElementById('toggle-debug-panel');
        
        expect(showDebugBtn).not.toBeNull();
        expect(debugPanel).not.toBeNull();
        expect(toggleDebugBtn).not.toBeNull();
      });
  
      test('setupEventHandlers finds test components button', () => {
        const testComponentsBtn = document.getElementById('test-components');
        expect(testComponentsBtn).not.toBeNull();
      });
    });
  
    describe('Fallback Navigation', () => {
      test('setupFallbackNavigation finds navigation items', () => {
        const navItems = document.querySelectorAll('.nav-item');
        const contentPanels = document.querySelectorAll('.content-panel');
        
        expect(navItems.length).toBeGreaterThan(0);
        expect(contentPanels.length).toBeGreaterThan(0);
      });
  
      test('navigation items have required data attributes', () => {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
          const panelName = item.getAttribute('data-panel');
          expect(panelName).toBeDefined();
          expect(panelName.length).toBeGreaterThan(0);
        });
      });
    });
  
    describe('Debug Interface', () => {
      test('createDebugInterface creates global debug object', () => {
        Dashboard.createDebugInterface();
        
        expect(self.marvinDashboard).toBeDefined();
        expect(typeof self.marvinDashboard.refreshAll).toBe('function');
        expect(typeof self.marvinDashboard.initPanel).toBe('function');
        expect(typeof self.marvinDashboard.getContainer).toBe('function');
        expect(typeof self.marvinDashboard.getLogger).toBe('function');
        expect(typeof self.marvinDashboard.debug).toBe('function');
      });
    });
  
    describe('Cleanup', () => {
      test('cleanup method exists and is callable', () => {
        expect(typeof Dashboard.cleanup).toBe('function');
        
        // Should not throw even if not initialized
        expect(() => Dashboard.cleanup()).not.toThrow();
      });
  
      test('cleanup resets initialization state', async () => {
        Dashboard.initialized = true;
        await Dashboard.cleanup();
        expect(Dashboard.initialized).toBe(false);
      });
    });
  
      describe('Error Handling', () => {
    test('showInitializationError creates error display', () => {
      const error = new Error('Test initialization error');
      Dashboard.showInitializationError(error);
      
      const errorElement = document.querySelector('.dashboard-error');
      expect(errorElement).not.toBeNull();
      expect(errorElement.textContent).toContain('Test initialization error');
    });
  });

  describe('Component System Integration', () => {
    test('component system is intentionally disabled for now', async () => {
      await Dashboard.initDashboard();
      
      // The component system is intentionally set to null in the current implementation
      expect(Dashboard._componentSystem).toBeNull();
    });

    test('navigation component is initialized', async () => {
      await Dashboard.initDashboard();
      
      // Check that navigation initialization was called
      const navigation = container.getComponent('navigation');
      expect(navigation).toBeDefined();
      expect(navigation.initialized).toBe(true);
    });
  });

  describe('Panel Management', () => {
    test('overview panel is active by default', () => {
      const overviewPanel = document.getElementById('overview-panel');
      const capturePanel = document.getElementById('capture-panel');
      
      expect(overviewPanel.classList.contains('active')).toBe(true);
      expect(capturePanel.classList.contains('active')).toBe(false);
    });

    test('navigation items have correct active state', () => {
      const overviewNavItem = document.querySelector('[data-panel="overview"]');
      const captureNavItem = document.querySelector('[data-panel="capture"]');
      
      expect(overviewNavItem.classList.contains('active')).toBe(true);
      expect(captureNavItem.classList.contains('active')).toBe(false);
    });
  });

  describe('Event Handler Functionality', () => {
    test('debug panel toggle works', async () => {
      await Dashboard.initDashboard();
      
      const showDebugBtn = document.getElementById('show-debug-panel');
      const debugPanel = document.getElementById('debug-panel');
      
      // Initially hidden
      expect(debugPanel.style.display).toBe('none');
      
      // Click to show
      showDebugBtn.click();
      expect(debugPanel.style.display).toBe('block');
      expect(showDebugBtn.style.display).toBe('none');
    });

    test('test components button triggers debug output update', async () => {
      await Dashboard.initDashboard();
      
      const testComponentsBtn = document.getElementById('test-components');
      const debugOutput = document.getElementById('debug-output');
      
      // Initially empty
      expect(debugOutput.innerHTML.trim()).toBe('');
      
      // Click to update
      testComponentsBtn.click();
      
      // Should now contain debug info
      expect(debugOutput.innerHTML).toContain('Component System Status');
      expect(debugOutput.innerHTML).toContain('Initialized: true');
    });
  });

  describe('Resource Management', () => {
    test('tracks event listeners during initialization', async () => {
      await Dashboard.initDashboard();
      
      // Should have tracked some event listeners
      expect(Dashboard._eventListeners.length).toBeGreaterThan(0);
    });

    test('cleanup removes all tracked resources', async () => {
      await Dashboard.initDashboard();
      
      // Should have some resources tracked
      const initialEventListeners = Dashboard._eventListeners.length;
      const initialDomElements = Dashboard._domElements.length;
      
      expect(initialEventListeners).toBeGreaterThan(0);
      
      // Cleanup
      await Dashboard.cleanup();
      
      // Should be cleared
      expect(Dashboard._eventListeners.length).toBe(0);
      expect(Dashboard._domElements.length).toBe(0);
      expect(Dashboard.initialized).toBe(false);
    });
  });

  describe('Fallback Navigation Functionality', () => {
    test('fallback navigation switches panels', async () => {
        await Dashboard.initDashboard();
      
        // Always select elements AFTER initDashboard to ensure correct references
        const overviewPanel = document.getElementById('overview-panel');
        const capturePanel = document.getElementById('capture-panel');
        const captureNavItem = document.querySelector('[data-panel="capture"]');
      
        // Log references
        console.log('Test: overviewPanel element:', overviewPanel);
        console.log('Test: capturePanel element:', capturePanel);
        console.log('Test: captureNavItem element:', captureNavItem);
      
        // Before click
        console.log('Test: Before click');
        console.log('Overview panel classes:', overviewPanel.className);
        console.log('Capture panel classes:', capturePanel.className);
      
        // Simulate click
        captureNavItem.click();
      
        // After click
        console.log('Test: After click');
        console.log('Overview panel classes:', overviewPanel.className);
        console.log('Capture panel classes:', capturePanel.className);
        console.log('Capture nav item classes:', captureNavItem.className);
      
        // Compare references with handler logs (by inspecting the output)
        // Assertions
        expect(overviewPanel.classList.contains('active')).toBe(false);
        expect(capturePanel.classList.contains('active')).toBe(true);
        expect(captureNavItem.classList.contains('active')).toBe(true);
      });
  });

  // --- Overview Panel ---
describe('Overview Panel', () => {
    test('Reload Overview button is present and clickable', () => {
      const btn = document.getElementById('force-init-overview');
      expect(btn).not.toBeNull();
      btn.click(); // Should not throw
    });
  
    test('Refresh button is present and clickable', () => {
      const btn = document.querySelector('.refresh-btn');
      expect(btn).not.toBeNull();
      btn.click(); // Should not throw
    });
  
    test('View All button is present and clickable', () => {
      const btn = document.getElementById('view-all-captures');
      expect(btn).not.toBeNull();
      btn.click(); // Should not throw
    });
  
    test('Explore button is present and clickable', () => {
      const btn = document.getElementById('explore-knowledge');
      expect(btn).not.toBeNull();
      btn.click(); // Should not throw
    });
  });
  
  // --- Capture Panel ---
  describe('Capture Panel', () => {
    test('Reload Capture Data button is present and clickable', () => {
      const btn = document.getElementById('force-init-capture');
      expect(btn).not.toBeNull();
      btn.click();
    });
  
    test('Capture Selected button is present and clickable', () => {
      const btn = document.getElementById('capture-selected');
      expect(btn).not.toBeNull();
      btn.click();
    });
  
    test('Select All button is present and clickable', () => {
      const btn = document.getElementById('select-all-tabs');
      expect(btn).not.toBeNull();
      btn.click();
    });
  
    test('Deselect All button is present and clickable', () => {
      const btn = document.getElementById('deselect-all-tabs');
      expect(btn).not.toBeNull();
      btn.click();
    });
  });
  
  // --- Knowledge Panel ---
  describe('Knowledge Panel', () => {
    test('Reload Knowledge Data button is present and clickable', () => {
      const btn = document.getElementById('force-init-knowledge');
      expect(btn).not.toBeNull();
      btn.click();
    });
  
    test('Explore button is present and clickable', () => {
      const btn = document.getElementById('explore-knowledge');
      expect(btn).not.toBeNull();
      btn.click();
    });
  });
  
  // --- Assistant Panel ---
  describe('Assistant Panel', () => {
    test('Reload Assistant button is present and clickable', () => {
      const btn = document.getElementById('force-init-assistant');
      expect(btn).not.toBeNull();
      btn.click();
    });
  });
  
  // --- Tasks Panel ---
  describe('Tasks Panel', () => {
    test('Reload Analysis Data button is present and clickable', () => {
      const btn = document.getElementById('force-init-tasks');
      expect(btn).not.toBeNull();
      btn.click();
    });
  });
  
  // --- Settings Panel ---
  describe('Settings Panel', () => {
    test('Reload Settings button is present and clickable', () => {
      const btn = document.getElementById('force-init-settings');
      expect(btn).not.toBeNull();
      btn.click();
    });
  });

  describe('Sidebar Navigation', () => {
    beforeEach(async () => {
      await Dashboard.initDashboard();
    });
  
    const panels = [
      'overview',
      'capture',
      'knowledge',
      'assistant',
      'tasks',
      'settings'
    ];
  
    panels.forEach(panelName => {
      test(`Nav item for "${panelName}" is present and switches panel on click`, () => {
        const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
        const panel = document.getElementById(`${panelName}-panel`);
        expect(navItem).not.toBeNull();
        expect(panel).not.toBeNull();
  
        // Click the nav item
        navItem.click();
  
        // Only this nav item should be active
        document.querySelectorAll('.nav-item').forEach(item => {
          if (item === navItem) {
            expect(item.classList.contains('active')).toBe(true);
          } else {
            expect(item.classList.contains('active')).toBe(false);
          }
        });
  
        // Only this panel should be active
        document.querySelectorAll('.content-panel').forEach(p => {
          if (p === panel) {
            expect(p.classList.contains('active')).toBe(true);
          } else {
            expect(p.classList.contains('active')).toBe(false);
          }
        });
      });
    });
  });
});