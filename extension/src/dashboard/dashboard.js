// src/dashboard/dashboard.js
import { container } from '../core/dependency-container.js';
import { loadAndInitializePanel } from '../core/component-system.js';

// Get necessary services and utilities
const Logger = container.getUtil('LogManager');
const logger = new Logger({ context: 'dashboard', isBackgroundScript: false });
const notificationService = container.getService('notificationService');

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
  notificationService.showNotification('Initializing dashboard...', 'info');
  
  try {
    // Initialize the navigation system
    await loadAndInitializePanel('navigation');
    
    // Initialize the overview panel as default
    await loadAndInitializePanel('overview-panel');
    
    // Set up event handlers
    setupEventHandlers();
    
    // Restore last navigation state
    await restoreNavigation();
    
    dashboardInitialized = true;
    logger.info('Dashboard initialization completed successfully');
    notificationService.showNotification('Dashboard ready', 'success');
    
  } catch (error) {
    logger.error('Error initializing dashboard:', error);
    notificationService.showNotification('Dashboard initialization failed', 'error');
    showInitializationError(error);
  }
}

/**
 * Set up dashboard event handlers
 */
function setupEventHandlers() {
  // Listen for panel change events
  document.addEventListener('panelChanged', async (event) => {
    if (event.detail && event.detail.panelId) {
      logger.debug(`Panel changed to: ${event.detail.panelId}`);
      await loadAndInitializePanel(event.detail.panelId);
    }
  });
  
  // Handle force initialization buttons
  document.querySelectorAll('[id^="force-init-"]').forEach(button => {
    button.addEventListener('click', () => {
      const panelName = button.id.replace('force-init-', '');
      logger.info(`Force initializing ${panelName}`);
      loadAndInitializePanel(panelName);
    });
  });
}

/**
 * Restore last navigation state
 */
async function restoreNavigation() {
  try {
    // Get the navigation component to restore state
    const navigation = container.getComponent('navigation');
    
    if (navigation && navigation.restoreLastActivePanel) {
      await navigation.restoreLastActivePanel();
      logger.debug('Navigation state restored');
    }
  } catch (error) {
    logger.error('Error restoring navigation:', error);
    // Fall back to default panel
    const navigation = container.getComponent('navigation');
    if (navigation && navigation.navigateToPanel) {
      navigation.navigateToPanel('overview');
    }
  }
}

/**
 * Create debug interface for development
 */
function createDebugInterface() {
  window.marvinDashboard = {
    refreshAll: () => {
      dashboardInitialized = false;
      initDashboard();
    },
    initPanel: loadAndInitializePanel,
    getContainer: () => container,
    getLogger: () => logger,
    debug: () => ({
      initialized: dashboardInitialized,
      container: {
        components: container.components.size,
        services: container.services.size,
        utils: container.utils.size
      }
    })
  };
  
  logger.debug('Debug interface created', window.marvinDashboard);
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
    <button onclick="this.parentElement.remove()">Dismiss</button>
  `;
  
  document.body.appendChild(errorEl);
}

// Initialize dashboard on load
initDashboard();

// Create debug interface for development
createDebugInterface();

// Export for testing
export { initDashboard, setupEventHandlers, restoreNavigation };