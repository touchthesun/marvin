// src/dashboard/dashboard.js
import { LogManager } from '../utils/log-manager.js';
import { ensureContainerInitialized } from '../core/container-init.js';
import { container } from '../core/dependency-container.js';
import { ComponentRegistry } from '../core/component-registry.js';

/**
 * Dashboard Component
 * Main container component for the Marvin extension dashboard
 */
const Dashboard = {
  // Resource tracking arrays
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  
  // Component state
  initialized: false,
  _logger: null,
  _componentSystem: null,
  
  /**
   * Initialize the dashboard
   * @returns {Promise<boolean>} Success status
   */
  async initDashboard() {
    try {
      // Create logger directly
      this._logger = new LogManager({
        context: 'dashboard',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Starting dashboard initialization');
      
      // Check if already initialized
      if (this.initialized) {
        this._logger.debug('Dashboard already initialized, skipping');
        return true;
      }
      
      // Ensure container is initialized
      const initResult = await ensureContainerInitialized({
        isBackgroundScript: false,
        context: 'dashboard'
      });
      
      this._logger.debug('Container initialization result:', initResult);
      
      // Register components if needed
      if (initResult.components.count === 0) {
        this._logger.info('Registering components');
        ComponentRegistry.registerAll();
      }
      
      // Get component system
      this._componentSystem = container.getComponent('component-system');
      if (!this._componentSystem) {
        throw new Error('Component system not found in container');
      }
      
      // Initialize navigation component
      await this.initializeNavigationComponent();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Add fallback navigation handlers
      this.setupFallbackNavigation();
      
      // Create debug interface
      this.createDebugInterface();
      
      this.initialized = true;
      this._logger.info('Dashboard initialization completed successfully');
      return true;
      
    } catch (error) {
      this._logger.error('Error initializing dashboard:', error);
      this.showInitializationError(error);
      return false;
    }
  },
  
  /**
   * Initialize the navigation component
   * @returns {Promise<void>}
   */
  async initializeNavigationComponent() {
    try {
      this._logger.info('Initializing navigation component');
      
      const navigation = container.getComponent('navigation');
      if (!navigation) {
        throw new Error('Navigation component not found in container');
      }
      
      if (navigation.initNavigation && typeof navigation.initNavigation === 'function') {
        const success = await navigation.initNavigation();
        if (!success) {
          throw new Error('Navigation component initialization failed');
        }
        this._logger.info('Navigation component initialized successfully');
      } else {
        throw new Error('Navigation component missing initNavigation method');
      }
    } catch (error) {
      this._logger.error('Error initializing navigation component:', error);
      throw error;
    }
  },
  
  /**
   * Set up event handlers for non-navigation elements
   */
  setupEventHandlers() {
    this._logger.debug('Setting up event handlers');
    
    try {
      // Debug panel controls
      const showDebugBtn = document.getElementById('show-debug-panel');
      const debugPanel = document.getElementById('debug-panel');
      const toggleDebugBtn = document.getElementById('toggle-debug-panel');
      
      if (showDebugBtn && debugPanel && toggleDebugBtn) {
        const showHandler = () => {
          debugPanel.style.display = 'block';
          showDebugBtn.style.display = 'none';
        };
        
        const hideHandler = () => {
          debugPanel.style.display = 'none';
          showDebugBtn.style.display = 'block';
        };
        
        showDebugBtn.addEventListener('click', showHandler);
        toggleDebugBtn.addEventListener('click', hideHandler);
        
        this._eventListeners.push(
          { element: showDebugBtn, type: 'click', listener: showHandler },
          { element: toggleDebugBtn, type: 'click', listener: hideHandler }
        );
      }
      
      // Test components button
      const testComponentsBtn = document.getElementById('test-components');
      if (testComponentsBtn) {
        const testHandler = () => {
          this._logger.info('Testing components');
          this.updateDebugOutput();
        };
        
        testComponentsBtn.addEventListener('click', testHandler);
        this._eventListeners.push({
          element: testComponentsBtn,
          type: 'click',
          listener: testHandler
        });
      }
      
      this._logger.debug('Event handlers set up successfully');
    } catch (error) {
      this._logger.error('Error setting up event handlers:', error);
    }
  },
  
  /**
   * Set up fallback navigation handlers
   */
  setupFallbackNavigation() {
    this._logger.info('Setting up fallback navigation handlers');
    
    try {
      const navigation = container.getComponent('navigation');
      if (navigation && navigation.initialized) {
        this._logger.debug('Navigation already initialized, skipping fallback setup');
        return;
      }
      
      const navItems = document.querySelectorAll('.nav-item');
      const contentPanels = document.querySelectorAll('.content-panel');
      
      this._logger.debug(`Found ${navItems.length} nav items and ${contentPanels.length} panels for fallback navigation`);
      
      navItems.forEach(item => {
        const panelName = item.getAttribute('data-panel');
        if (!panelName) {
          this._logger.warn('Navigation item missing data-panel attribute');
          return;
        }
        
        const clickHandler = async (event) => {
          this._logger.info(`Fallback navigation: ${panelName} clicked`);
          
          try {
            // Update active state
            navItems.forEach(navItem => navItem.classList.remove('active'));
            item.classList.add('active');
            
            // Update panel visibility
            contentPanels.forEach(panel => {
              if (panel.id === `${panelName}-panel`) {
                panel.classList.add('active');
                this._logger.debug(`Panel ${panel.id} activated`);
              } else {
                panel.classList.remove('active');
              }
            });
            
            // Initialize panel
            if (this._componentSystem && this._componentSystem.loadAndInitializePanel) {
              await this._componentSystem.loadAndInitializePanel(`${panelName}-panel`);
            }
            
            // Store active panel
            try {
              await chrome.storage.local.set({ lastActivePanel: panelName });
            } catch (storageError) {
              this._logger.warn('Error saving last active panel:', storageError);
            }
          } catch (navError) {
            this._logger.error(`Error in fallback navigation to ${panelName}:`, navError);
          }
        };
        
        item.addEventListener('click', clickHandler);
        this._eventListeners.push({
          element: item,
          type: 'click',
          listener: clickHandler
        });
      });
      
      this._logger.info('Fallback navigation handlers set up successfully');
    } catch (error) {
      this._logger.error('Error setting up fallback navigation handlers:', error);
    }
  },
  
  /**
   * Update debug output with component status
   */
  updateDebugOutput() {
    try {
      const debugOutput = document.getElementById('debug-output');
      if (!debugOutput) return;
      
      const status = {
        initialized: this.initialized,
        container: {
          components: container.components.size,
          componentInstances: container.componentInstances?.size || 0,
          services: container.services.size,
          utils: container.utils.size
        }
      };
      
      debugOutput.innerHTML = `
        <pre>
Component System Status:
- Initialized: ${status.initialized}
- Component Count: ${status.container.components}
- Service Count: ${status.container.services}
- Utility Count: ${status.container.utils}
- Component Instance Count: ${status.container.componentInstances}
        </pre>
      `;
    } catch (error) {
      this._logger.error('Error updating debug output:', error);
    }
  },
  
  /**
   * Show initialization error
   * @param {Error} error - Error to display
   */
  showInitializationError(error) {
    try {
      const errorEl = document.createElement('div');
      errorEl.className = 'dashboard-error';
      errorEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        color: #991b1b;
        max-width: 400px;
        z-index: 9999;
      `;
      
      errorEl.innerHTML = `
        <strong>Dashboard Error</strong>
        <p>${error.message}</p>
        <button id="error-retry-btn">Retry</button>
        <button onclick="this.parentElement.remove()">Dismiss</button>
      `;
      
      document.body.appendChild(errorEl);
      this._domElements.push(errorEl);
      
      const retryBtn = document.getElementById('error-retry-btn');
      if (retryBtn) {
        const retryHandler = () => {
          errorEl.remove();
          this.initialized = false;
          this.initDashboard();
        };
        
        retryBtn.addEventListener('click', retryHandler);
        this._eventListeners.push({
          element: retryBtn,
          type: 'click',
          listener: retryHandler
        });
      }
    } catch (error) {
      this._logger.error('Error showing initialization error:', error);
    }
  },
  
  /**
   * Create debug interface for development
   */
  createDebugInterface() {
    try {
      // Use self instead of window for service worker context
      self.marvinDashboard = {
        refreshAll: () => {
          this.initialized = false;
          this.initDashboard();
        },
        initPanel: async (panelName) => {
          if (this._componentSystem && this._componentSystem.loadAndInitializePanel) {
            return await this._componentSystem.loadAndInitializePanel(panelName);
          }
          return false;
        },
        getContainer: () => container,
        getLogger: () => this._logger,
        debug: () => ({
          initialized: this.initialized,
          container: {
            components: container.components.size,
            componentInstances: container.componentInstances?.size || 0,
            services: container.services.size,
            utils: container.utils.size
          }
        })
      };
      
      this._logger.debug('Debug interface created', self.marvinDashboard);
    } catch (error) {
      this._logger.error('Error creating debug interface:', error);
    }
  },
  
  /**
   * Clean up dashboard resources
   */
  cleanup() {
    this._logger.info('Cleaning up dashboard resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => clearTimeout(id));
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => clearInterval(id));
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({element, type, listener}) => {
      try {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, listener);
        }
      } catch (error) {
        this._logger.warn('Error removing event listener:', error);
      }
    });
    this._eventListeners = [];
    
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        this._logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    this.initialized = false;
    this._logger.debug('Dashboard cleanup completed');
  }
};

// Initialize dashboard on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  Dashboard.initDashboard();
});

// Export for testing
export { Dashboard };