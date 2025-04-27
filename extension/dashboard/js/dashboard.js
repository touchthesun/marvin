// dashboard.js - Main entry point for the Marvin dashboard
import { LogManager } from '../../shared/utils/log-manager.js';
import { showNotification } from './services/notification-service.js';

// Import services
import { initStorageService, getActiveState } from './services/storage-service.js';
import { setupStatusMonitoring } from './services/status-service.js';
import { initTaskService } from './services/task-service.js';

// Import UI components
import { 
  initNavigation, 
  initTabs, 
  restoreLastActivePanel, 
  restoreLastActiveTab,
  navigateToPanel
} from './components/navigation.js';

import { initOverviewPanel } from './components/overview-panel.js';
import { initCapturePanel } from './components/capture-panel.js';
import { initKnowledgePanel, initKnowledgeGraph } from './components/knowledge-panel.js';
import { initAssistantPanel } from './components/assistant-panel.js';
import { initSettingsPanel } from './components/settings-panel.js';
import { initTasksPanel } from './components/tasks-panel.js';
import { setupForceInitButtons, setupTabSwitching } from './utils/ui-utils.js';
import { initNavigationDebug } from './utils/navigation-debug.js';

// Safety mechanism to prevent infinite loops or excessive resource usage
let initializationAttempts = 0;
const MAX_INITIALIZATION_ATTEMPTS = 3;

/**
 * Logger for dashboard operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'dashboard',
  storageKey: 'marvin_dashboard_logs',
  maxEntries: 5000
});

// Initialization flags
let dashboardInitialized = false;
let servicesInitialized = false;
let uiInitialized = false;
let panelHandlersRegistered = false;

/**
 * Dashboard initialization function 
 * @returns {Promise<void>}
 */
async function initDashboard() {
  // Prevent excessive initialization attempts
  initializationAttempts++;
  if (initializationAttempts > MAX_INITIALIZATION_ATTEMPTS) {
    console.error('Too many initialization attempts, stopping to prevent browser crash');
    showInitializationError(new Error('Too many initialization attempts. Please reload the extension.'));
    return;
  }

  if (dashboardInitialized) {
    logger.debug('Dashboard already initialized, skipping');
    return;
  }
  
  logger.info('Initializing Marvin dashboard');
  showNotification('Initializing dashboard...', 'info');
  
  try {
    // Initialize navigation debug tools
    initNavigationDebug();
    
    // First initialize services
    await initServices();
    
    // Then initialize UI
    await initUI();
    
    // Register panel activation handlers
    if (!panelHandlersRegistered) {
      registerPanelHandlers();
    }
    
    // Set flag to prevent duplicate initialization
    dashboardInitialized = true;
    
    logger.info('Dashboard initialization completed successfully');
    showNotification('Dashboard initialized successfully', 'success');
  } catch (error) {
    logger.error('Error initializing dashboard:', error);
    showNotification(`Dashboard initialization error: ${error.message}`, 'error');
    
    // Show error message in UI
    showInitializationError(error);
  }
}

/**
 * Initialize all services
 * @returns {Promise<void>}
 */
async function initServices() {
  if (servicesInitialized) {
    logger.debug('Services already initialized, skipping');
    return;
  }
  
  logger.info('Initializing services');
  
  try {
    // Initialize storage service first as other services depend on it
    await initStorageService();
    
    // Initialize task service
    await initTaskService();
    
    // Set up status monitoring
    setupStatusMonitoring();
    
    servicesInitialized = true;
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Error initializing services:', error);
    throw new Error(`Failed to initialize services: ${error.message}`);
  }
}

/**
 * Initialize UI components
 * @returns {Promise<void>}
 */
async function initUI() {
  if (uiInitialized) {
    logger.debug('UI already initialized, skipping');
    return;
  }

  logger.info('Initializing UI components');
  
  try {
    // Initialize navigation system first
    logger.debug('Initializing navigation system');
    initNavigation();
    
    // Initialize tabs system
    logger.debug('Initializing tabs system');
    initTabs();
    
    // Set up utility functions
    logger.debug('Setting up utility functions');
    setupForceInitButtons();
    setupTabSwitching();
    
    // Initialize the overview panel immediately since it's the default
    logger.debug('Pre-initializing overview panel');
    await initOverviewPanel();
    
    // Restore last active panel and tab
    logger.debug('Restoring navigation state');
    await restoreNavigation();
    
    uiInitialized = true;
    logger.info('UI components initialized successfully');
  } catch (error) {
    logger.error('Error initializing UI components:', error);
    throw new Error(`Failed to initialize UI: ${error.message}`);
  }
}

/**
 * Register handlers for panel activation events
 */
function registerPanelHandlers() {
  logger.debug('Registering panel activation handlers');
  
  try {
    // Add panel activation listener for lazy loading
    document.addEventListener('panelChanged', (event) => {
      if (event.detail && event.detail.panelId) {
        logger.debug(`Panel changed event received for: ${event.detail.panelId}`);
        handlePanelActivation(event.detail.panelId);
      } else {
        logger.warn('Panel changed event received without panelId');
      }
    });
    
    // Log all available panels for debugging
    const panels = document.querySelectorAll('.content-panel');
    logger.debug(`Available panels: ${Array.from(panels).map(p => p.id).join(', ')}`);
    
    // Log all navigation items for debugging
    const navItems = document.querySelectorAll('.nav-item');
    logger.debug(`Available nav items: ${Array.from(navItems).map(n => n.getAttribute('data-panel')).join(', ')}`);
    
    panelHandlersRegistered = true;
    logger.debug('Panel activation handlers registered successfully');
  } catch (error) {
    logger.error('Error registering panel handlers:', error);
    // Don't throw here, just log the error
  }
}

/**
 * Restore navigation state
 * @returns {Promise<void>}
 */
async function restoreNavigation() {
  try {
    // Get active state from storage
    const activeState = await getActiveState();
    logger.debug(`Retrieved active state: ${JSON.stringify(activeState)}`);
    
    if (activeState && activeState.panel) {
      logger.debug(`Attempting to restore panel: ${activeState.panel}`);
      
      // Use the navigateToPanel function directly
      const success = await navigateToPanel(activeState.panel);
      
      if (success) {
        logger.debug(`Successfully restored panel: ${activeState.panel}`);
        
        // Restore active tab within panel if available
        if (activeState.tab) {
          await restoreLastActiveTab(`${activeState.panel}-panel`);
          logger.debug(`Restored tab: ${activeState.tab} in panel: ${activeState.panel}`);
        }
      } else {
        logger.warn(`Failed to restore panel: ${activeState.panel}, defaulting to overview`);
        // Default to overview panel
        await navigateToPanel('overview');
      }
    } else {
      // Default to first panel (overview)
      logger.debug('No saved navigation state, defaulting to overview panel');
      await navigateToPanel('overview');
    }
  } catch (error) {
    logger.error('Error restoring navigation state:', error);
    
    // Fall back to overview panel
    try {
      logger.debug('Falling back to overview panel after error');
      await navigateToPanel('overview');
    } catch (fallbackError) {
      logger.error('Error activating fallback panel:', fallbackError);
      
      // Last resort: try to click the first nav item directly
      try {
        const firstNavItem = document.querySelector('.nav-item');
        if (firstNavItem) {
          logger.debug('Attempting to click first nav item directly');
          firstNavItem.click();
        } else {
          logger.error('No navigation items found');
        }
      } catch (clickError) {
        logger.error('Error clicking first nav item:', clickError);
      }
    }
  }
}

/**
 * Display initialization error
 * @param {Error} error - Error object
 */
function showInitializationError(error) {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'initialization-error';
  errorContainer.innerHTML = `
    <h2>Dashboard Initialization Error</h2>
    <p>${error.message}</p>
    <button id="retry-init-btn" class="btn-primary">Retry</button>
    <button id="debug-info-btn" class="btn-secondary">Show Debug Info</button>
  `;
  
  document.body.appendChild(errorContainer);
  
  // Add retry button functionality
  document.getElementById('retry-init-btn')?.addEventListener('click', () => {
    errorContainer.remove();
    dashboardInitialized = false;
    servicesInitialized = false;
    uiInitialized = false;
    initDashboard();
  });
  
  // Add debug info button
  document.getElementById('debug-info-btn')?.addEventListener('click', () => {
    const debugInfo = document.createElement('div');
    debugInfo.className = 'debug-info';
    debugInfo.innerHTML = `
      <h3>Debug Information</h3>
      <pre>
Dashboard initialized: ${dashboardInitialized}
Services initialized: ${servicesInitialized}
UI initialized: ${uiInitialized}
Panel handlers registered: ${panelHandlersRegistered}
Initialization attempts: ${initializationAttempts}

Available panels: ${Array.from(document.querySelectorAll('.content-panel')).map(p => p.id).join(', ')}
Available nav items: ${Array.from(document.querySelectorAll('.nav-item')).map(n => n.getAttribute('data-panel')).join(', ')}
      </pre>
    `;
    
    // Replace any existing debug info
    const existingDebugInfo = errorContainer.querySelector('.debug-info');
    if (existingDebugInfo) {
      existingDebugInfo.remove();
    }
    
    errorContainer.appendChild(debugInfo);
  });
}

/**
 * Handle lazy initialization of panels
 * @param {string} panelId - ID of panel being activated
 */
function handlePanelActivation(panelId) {
  logger.debug(`Panel activation handler called for: ${panelId}`);
  
  // Initialize panel components based on ID
  switch (panelId) {
    case 'overview':
      logger.debug('Initializing overview panel');
      initOverviewPanel().catch(err => 
        logger.error('Error initializing overview panel:', err));
      break;
      
    case 'capture':
      logger.debug('Initializing capture panel');
      initCapturePanel().catch(err => 
        logger.error('Error initializing capture panel:', err));
      break;
      
    case 'knowledge':
      logger.debug('Initializing knowledge panel and graph');
      // Initialize both panel and graph
      Promise.all([
        initKnowledgePanel().catch(err => 
          logger.error('Error initializing knowledge panel:', err)),
        initKnowledgeGraph().catch(err => 
          logger.error('Error initializing knowledge graph:', err))
      ]);
      break;
      
    case 'assistant':
      logger.debug('Initializing assistant panel');
      initAssistantPanel().catch(err => 
        logger.error('Error initializing assistant panel:', err));
      break;
      
    case 'settings':
      logger.debug('Initializing settings panel');
      initSettingsPanel().catch(err => 
        logger.error('Error initializing settings panel:', err));
      break;
      
    case 'analysis':
      logger.debug('Initializing analysis panel');
      // This might need to be updated if the panel has a different name
      initTasksPanel().catch(err => 
        logger.error('Error initializing analysis panel:', err));
      break;
      
    case 'tasks':
      logger.debug('Initializing tasks panel');
      initTasksPanel().catch(err => 
        logger.error('Error initializing tasks panel:', err));
      break;
      
    default:
      logger.warn(`Unknown panel activated: ${panelId}`);
  }
}

// Main entry point - Run when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, starting dashboard initialization');
  
  try {
    // Check if another dashboard instance might be running in another tab
    const instanceId = 'dashboard_instance_' + Date.now();
    sessionStorage.setItem('current_dashboard_instance', instanceId);
    
    // Start initialization with a slight delay to ensure DOM is fully ready
    setTimeout(() => {
      initDashboard();
    }, 100);
    
    // Expose key functions to window for debugging
    window.marvinDashboard = {
      refreshAll: async () => {
        dashboardInitialized = false;
        servicesInitialized = false;
        uiInitialized = false;
        panelHandlersRegistered = false;
        await initDashboard();
      },
      initPanel: handlePanelActivation,
      navigateToPanel: navigateToPanel,
      debug: {
        getState: () => ({
          dashboardInitialized,
          servicesInitialized,
          uiInitialized,
          panelHandlersRegistered,
          initializationAttempts
        }),
        getPanels: () => Array.from(document.querySelectorAll('.content-panel')).map(p => p.id),
        getNavItems: () => Array.from(document.querySelectorAll('.nav-item')).map(n => ({
          panel: n.getAttribute('data-panel'),
          text: n.textContent.trim(),
          isActive: n.classList.contains('active')
        }))
      }
    };
  } catch (error) {
    console.error('Critical error in dashboard initialization:', error);
    showNotification('Dashboard initialization failed', 'error');
  }
});

// Handle beforeunload event
window.addEventListener('beforeunload', () => {
  // Any cleanup or state saving can be done here
  logger.info('Dashboard unloading');
});
