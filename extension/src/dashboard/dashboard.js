// src/dashboard/dashboard.js
// Import LogManager directly first to avoid dependency issues
import { LogManager } from '../utils/log-manager.js';

// Create logger instance directly
const logger = new LogManager({ 
  context: 'dashboard', 
  isBackgroundScript: false,
  maxEntries: 1000
});

// Then import container and other dependencies
import { container } from '../core/dependency-container.js';
import { initializeComponentSystem, loadAndInitializePanel, getComponentSystemStatus } from '../core/component-system.js';

// Register LogManager immediately to avoid "Utility not found" errors
function registerEssentialUtilities() {
  if (!container.utils.has('LogManager')) {
    container.registerUtil('LogManager', LogManager);
    console.log('LogManager registered directly in dashboard.js');
  }
}

// Register essential utilities first
registerEssentialUtilities();

// Dashboard initialization flag
let dashboardInitialized = false;

/**
 * Initialize dashboard
 */
async function initDashboard() {
  if (dashboardInitialized) {
    logger.debug('Dashboard already initialized, skipping');
    return;
  }
  
  logger.info('Starting dashboard initialization');
  console.log('Starting dashboard initialization'); // Extra console log for visibility
  
  try {
    // First initialize the component system - this will initialize the navigation component
    logger.info('Initializing component system');
    await initializeComponentSystem();
    
    // Navigation should already be initialized by the component system
    // But we'll check to make sure
    const navigation = container.getComponent('navigation');
    if (!navigation || !navigation.initialized) {
      logger.warn('Navigation component not initialized by component system, initializing now');
      
      if (navigation && navigation.initNavigation) {
        await navigation.initNavigation();
        logger.info('Navigation component initialized manually');
      } else {
        throw new Error('Navigation component not found or missing initNavigation method');
      }
    } else {
      logger.info('Navigation component already initialized');
    }
    
    // Set up event handlers for debug panel and other non-navigation elements
    setupNonNavigationEventHandlers();
    
    // Add direct click handlers for navigation items as a fallback
    // This shouldn't be needed with our fixed navigation system, but it's a safety measure
    setupDirectNavHandlersFallback();
    
    dashboardInitialized = true;
    logger.info('Dashboard initialization completed successfully');
    console.log('Dashboard initialization completed successfully'); // Extra console log
    
  } catch (error) {
    logger.error('Error initializing dashboard:', error);
    console.error('Error initializing dashboard:', error); // Extra console error
    showInitializationError(error);
  }
}

/**
 * Set up event handlers for non-navigation elements
 */
function setupNonNavigationEventHandlers() {
  logger.debug('Setting up non-navigation event handlers');

  try {
    // Setup debug panel toggle
    const showDebugBtn = document.getElementById('show-debug-panel');
    const debugPanel = document.getElementById('debug-panel');
    const toggleDebugBtn = document.getElementById('toggle-debug-panel');
    
    if (showDebugBtn && debugPanel && toggleDebugBtn) {
      showDebugBtn.addEventListener('click', () => {
        debugPanel.style.display = 'block';
      });
      
      toggleDebugBtn.addEventListener('click', () => {
        debugPanel.style.display = 'none';
      });
    }
    
    // Setup test components button
    const testComponentsBtn = document.getElementById('test-components');
    if (testComponentsBtn) {
      testComponentsBtn.addEventListener('click', () => {
        logger.info('Testing components');
        
        // Use imported getComponentSystemStatus function
        const status = getComponentSystemStatus();
        
        const debugOutput = document.getElementById('debug-output');
        if (debugOutput) {
          debugOutput.innerHTML = `
            <pre>
Component System Status:
- Initialized: ${status.initialized}
- Component Count: ${status.componentCount}
- Service Count: ${status.serviceCount}
- Utility Count: ${status.utilityCount}
- Component Instance Count: ${status.componentInstanceCount || 0}
            </pre>
          `;
        }
      });
    }
    
    logger.debug('Non-navigation event handlers set up successfully');
  } catch (error) {
    logger.error('Error setting up non-navigation event handlers:', error);
  }
}

/**
 * Set up direct navigation handlers as a fallback
 * This should only be used if the navigation component fails to initialize
 */
function setupDirectNavHandlersFallback() {
  logger.info('Setting up direct navigation handlers fallback');
  
  try {
    // Check if navigation is already initialized
    const navigation = container.getComponent('navigation');
    
    if (navigation && navigation.initialized) {
      logger.debug('Navigation already initialized, skipping fallback setup');
      return;
    }
    
    const navItems = document.querySelectorAll('.nav-item');
    const contentPanels = document.querySelectorAll('.content-panel');
    
    logger.debug(`Found ${navItems.length} nav items and ${contentPanels.length} panels for fallback navigation`);
    
    navItems.forEach(item => {
      const panelName = item.getAttribute('data-panel');
      if (!panelName) {
        logger.warn('Navigation item missing data-panel attribute');
        return;
      }
      
      logger.debug(`Setting up fallback handler for ${panelName} navigation item`);
      
      // Add click event listener
      item.addEventListener('click', async (event) => {
        logger.info(`Fallback navigation: ${panelName} clicked`);
        
        try {
          // Update active state for nav items
          navItems.forEach(navItem => navItem.classList.remove('active'));
          item.classList.add('active');
          
          // Update panel visibility
          contentPanels.forEach(panel => {
            if (panel.id === `${panelName}-panel`) {
              panel.classList.add('active');
              logger.debug(`Panel ${panel.id} activated`);
            } else {
              panel.classList.remove('active');
            }
          });
          
          // Initialize the panel using imported function
          await loadAndInitializePanel(`${panelName}-panel`);
          
          // Store the active panel
          try {
            await chrome.storage.local.set({ lastActivePanel: panelName });
          } catch (storageError) {
            logger.warn('Error saving last active panel:', storageError);
          }
        } catch (navError) {
          logger.error(`Error in fallback navigation to ${panelName}:`, navError);
        }
      });
    });
    
    logger.info('Fallback navigation handlers set up successfully');
  } catch (error) {
    logger.error('Error setting up fallback navigation handlers:', error);
  }
}

/**
 * Show initialization error
 */
function showInitializationError(error) {
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
  
  // Add retry button functionality
  document.getElementById('error-retry-btn').addEventListener('click', () => {
    errorEl.remove();
    // Reset initialization flag and retry
    dashboardInitialized = false;
    initDashboard();
  });
}

// Create debug interface for development
function createDebugInterface() {
  // Use self instead of window for service worker context
  self.marvinDashboard = {
    refreshAll: () => {
      dashboardInitialized = false;
      initDashboard();
    },
    initPanel: loadAndInitializePanel, // Use imported function directly
    getContainer: () => container,
    getLogger: () => logger,
    debug: () => ({
      initialized: dashboardInitialized,
      container: {
        components: container.components.size,
        componentInstances: container.componentInstances?.size || 0,
        services: container.services.size,
        utils: container.utils.size
      }
    })
  };
  
  logger.debug('Debug interface created', self.marvinDashboard);
}

// Initialize dashboard on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired, initializing dashboard');
  initDashboard();
});

// Create debug interface
createDebugInterface();

// Export for testing
export { initDashboard, setupNonNavigationEventHandlers, setupDirectNavHandlersFallback };