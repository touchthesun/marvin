// src/components/core/navigation.js
import { LogManager } from '../../utils/log-manager.js';
import { container } from '../../core/dependency-container.js';

/**
 * Navigation component for the dashboard
 * Manages panel switching and navigation state
 */
const Navigation = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  currentPanel: null,
  
  /**
   * Initialize the navigation system
   * @returns {Promise<boolean>} Success status
   */
  async initNavigation() {
    // Create logger directly
    const logger = new LogManager({
      context: 'navigation',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.info('Initializing navigation component');
    
    try {
      if (this.initialized) {
        logger.debug('Already initialized, skipping');
        return true;
      }
      
      // Find navigation elements
      const navItems = document.querySelectorAll('.nav-item');
      const contentPanels = document.querySelectorAll('.content-panel');
      
      logger.debug(`Found ${navItems.length} navigation items and ${contentPanels.length} content panels`);
      
      if (navItems.length === 0 || contentPanels.length === 0) {
        throw new Error('Navigation elements not found');
      }
      
      // Set up click handlers on nav items
      this.setupNavClickHandlers(logger, navItems, contentPanels);
      
      // Try to restore last active panel
      await this.restoreLastPanel(logger);
      
      // Set initialized flag
      this.initialized = true;
      logger.info('Navigation initialization complete');
      return true;
    } catch (error) {
      logger.error('Error initializing navigation:', error);
      return false;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(logger, serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Set up click handlers on navigation items
   * @param {LogManager} logger - Logger instance
   * @param {NodeList} navItems - Navigation items
   * @param {NodeList} contentPanels - Content panels
   */
  setupNavClickHandlers(logger, navItems, contentPanels) {
    logger.debug('Setting up click handlers');
    
    navItems.forEach(item => {
      // Get panel name from data attribute
      const panelName = item.getAttribute('data-panel');
      if (!panelName) {
        logger.warn('Nav item missing data-panel attribute');
        return;
      }
      
      logger.debug(`Adding click handler for ${panelName}`);
      
      // Create click handler
      const clickHandler = async (event) => {
        event.preventDefault();
        logger.debug(`Clicked: ${panelName}`);
        
        try {
          // Activate this nav item
          navItems.forEach(ni => ni.classList.remove('active'));
          item.classList.add('active');
          
          // Show corresponding panel
          contentPanels.forEach(panel => {
            if (panel.id === `${panelName}-panel`) {
              panel.classList.add('active');
              logger.debug(`Activated panel: ${panel.id}`);
            } else {
              panel.classList.remove('active');
            }
          });
          
          // Save active panel
          await this.saveActivePanel(logger, panelName);
          
          // Initialize the panel
          await this.initializePanel(logger, panelName);
          
          return false;
        } catch (error) {
          logger.error(`Error handling navigation click for ${panelName}:`, error);
          return false;
        }
      };
      
      // Add event listener
      item.addEventListener('click', clickHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: item,
        type: 'click',
        listener: clickHandler
      });
    });
  },
  
  /**
   * Save active panel to storage
   * @param {LogManager} logger - Logger instance
   * @param {string} panelName - Panel name
   * @returns {Promise<void>}
   */
  async saveActivePanel(logger, panelName) {
    try {
      await chrome.storage.local.set({ lastActivePanel: panelName });
      logger.debug(`Saved active panel: ${panelName}`);
    } catch (error) {
      logger.error('Error saving active panel:', error);
      throw error;
    }
  },
  
  /**
   * Restore last active panel from storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<boolean>} Success status
   */
  async restoreLastPanel(logger) {
    try {
      // Get last active panel from storage
      const data = await chrome.storage.local.get('lastActivePanel');
      const lastPanel = data.lastActivePanel;
      
      if (lastPanel) {
        logger.debug(`Restoring last panel: ${lastPanel}`);
        
        // Find the nav item
        const navItem = document.querySelector(`.nav-item[data-panel="${lastPanel}"]`);
        if (navItem) {
          // Create and dispatch click event
          const clickEvent = new Event('click');
          navItem.dispatchEvent(clickEvent);
          return true;
        } else {
          logger.warn(`Nav item for panel ${lastPanel} not found`);
        }
      }
      
      // No saved panel, default to first nav item
      logger.debug('No saved panel, using first nav item');
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        const clickEvent = new Event('click');
        firstNavItem.dispatchEvent(clickEvent);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error restoring last panel:', error);
      return false;
    }
  },
  
  /**
   * Initialize panel
   * @param {LogManager} logger - Logger instance
   * @param {string} panelName - Panel name
   * @returns {Promise<void>}
   */
  async initializePanel(logger, panelName) {
    try {
      logger.debug(`Initializing panel: ${panelName}-panel`);
      
      // Get dashboard service with fallback
      const dashboardService = this.getService(logger, 'dashboardService', {
        initPanel: async (panelId) => {
          logger.warn('Dashboard service not available, using fallback initialization');
          const panel = document.getElementById(panelId);
          if (panel && typeof panel.initPanel === 'function') {
            await panel.initPanel();
          }
        }
      });
      
      await dashboardService.initPanel(`${panelName}-panel`);
      logger.debug(`Panel ${panelName} initialized successfully`);
    } catch (error) {
      logger.error(`Error initializing panel ${panelName}:`, error);
      throw error;
    }
  },
  
  /**
   * Navigate to panel programmatically
   * @param {string} panelName - Panel name
   * @returns {Promise<boolean>} Success status
   */
  async navigateToPanel(panelName) {
    // Create logger directly
    const logger = new LogManager({
      context: 'navigation',
      isBackgroundScript: false
    });
    
    try {
      logger.debug(`Navigating to panel: ${panelName}`);
      
      // Find the nav item
      const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
      
      if (navItem) {
        // Create and dispatch click event
        const clickEvent = new Event('click');
        navItem.dispatchEvent(clickEvent);
        return true;
      } else {
        logger.warn(`Nav item for panel ${panelName} not found`);
        return false;
      }
    } catch (error) {
      logger.error(`Error navigating to panel ${panelName}:`, error);
      return false;
    }
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'navigation',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Navigation not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up navigation resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        logger.warn(`Error clearing interval:`, error);
      }
    });
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({element, type, listener}) => {
      try {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, listener);
        }
      } catch (error) {
        logger.warn(`Error removing event listener:`, error);
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
        logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    this.initialized = false;
    this.currentPanel = null;
    
    logger.debug('Navigation cleanup completed');
  }
};

// Export using named export
export { Navigation };