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
    let initResult = undefined;
    try {
      // Create logger directly
      this._logger = new LogManager({
        context: 'dashboard',
        isBackgroundScript: false,
        maxEntries: 1000
      });
  
      this._logger.info('Starting dashboard initialization');
      console.log('[Dashboard] Starting dashboard initialization');
  
      // Check if already initialized
      if (this.initialized) {
        this._logger.debug('Dashboard already initialized, skipping');
        console.log('[Dashboard] Already initialized, skipping');
        return true;
      }
  
      // Check if we're in extension context
      if (!this._isExtensionContext()) {
        this._logger.warn('Dashboard running outside extension context - some features may be limited');
        console.log('[Dashboard] Running outside extension context');
      }
  
      // Initialize component system for UI components
      try {
        const { componentSystem } = await import('../core/component-system.js');
        await componentSystem.initialize();
        this._componentSystem = componentSystem;
        console.log('[Dashboard] Component system initialized successfully');
      } catch (error) {
        this._logger.warn('Component system initialization failed, using direct component access:', error);
        this._componentSystem = null;
      }
  
            // Initialize navigation component
      await this.initializeNavigationComponent();

      // Set up event handlers
      this.setupEventHandlers();
  
      // Create debug interface
      this.createDebugInterface();
  
      this.initialized = true;
      this._logger.info('Dashboard initialization completed successfully');
      console.log('[Dashboard] Dashboard initialization completed successfully');
      return true;
  
    } catch (error) {
      this._logger.error('Error initializing dashboard:', error);
      console.error('[Dashboard] Error initializing dashboard:', error);
      await this.cleanup();
      return false;
    }
  },
  
  /**
   * Check if we're running in extension context
   * @returns {boolean} True if in extension context
   */
  _isExtensionContext() {
    return typeof chrome !== 'undefined' && 
           chrome.runtime && 
           chrome.runtime.id;
  },
  
  /**
   * Send message to background script
   * @param {Object} message - Message to send
   * @returns {Promise<any>} Response from background script
   */
  async _sendMessageToBackground(message) {
    if (!this._isExtensionContext()) {
      throw new Error('Not in extension context - cannot send message to background script');
    }
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          // Check if this is the expected "Receiving end does not exist" error
          if (chrome.runtime.lastError.message === 'Could not establish connection. Receiving end does not exist.') {
            // This is expected in dashboard context, resolve with null instead of rejecting
            this._logger.debug('Background script not available in dashboard context (expected)');
            resolve(null);
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else {
          resolve(response);
        }
      });
    });
  },
  
  /**
   * Initialize the navigation component
   * @returns {Promise<void>}
   */
  async initializeNavigationComponent() {
    try {
      this._logger.info('Initializing navigation component');
      
      // Log container state
      this._logger.debug('Container components:', Array.from(container.components.keys()));
      this._logger.debug('Container has navigation:', container.components.has('navigation'));
      
      const navigation = container.getComponent('navigation');
      console.log('Navigation component retrieved:', navigation);
      console.log('Navigation type:', typeof navigation);
      console.log('Navigation has initialize method:', navigation?.initialize);
      console.log('Navigation initialize is function:', typeof navigation?.initialize === 'function');
      
      if (!navigation) {
        throw new Error('Navigation component not found in container');
      }
      
      if (navigation.initialize && typeof navigation.initialize === 'function') {
        console.log('About to call navigation.initialize()...');
        const success = await navigation.initialize();
        console.log('navigation.initialize() result:', success);
        if (!success) {
          throw new Error('Navigation component initialization failed');
        }
        this._logger.info('Navigation component initialized successfully');
      } else {
        throw new Error('Navigation component missing initialize method');
      }
    } catch (error) {
      console.error('Error in initializeNavigationComponent:', error);
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
          // Component system not available, return false for now
          console.log(`Panel initialization requested for ${panelName} but component system not available`);
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

// Make Dashboard and container globally available
if (typeof window !== 'undefined') {
  window.Dashboard = Dashboard;
  window.container = container;
}

// Initialize dashboard on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired, initializing dashboard...');
  if (window.Dashboard) {
    console.log('Dashboard object found, calling initDashboard...');
    Dashboard.initDashboard();
  } else {
    console.error('Dashboard object not found in window');
  }
});

// Export for testing
export { Dashboard };