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
  restoreLastActiveTab 
} from './components/navigation.js';

import { initOverviewPanel } from './components/overview-panel.js';
import { initCapturePanel } from './components/capture-panel.js';
import { initKnowledgePanel, initKnowledgeGraph } from './components/knowledge-panel.js';
import { initAssistantPanel } from './components/assistant-panel.js';
import { initSettingsPanel } from './components/settings-panel.js';
import { initTasksPanel } from './components/tasks-panel.js';
import { setupForceInitButtons, setupTabSwitching } from './utils/ui-utils.js';

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
    // First initialize services
    await initServices();
    
    // Then initialize UI
    await initUI();
    
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
  logger.info('Initializing UI components');
  
  try {
    // Initialize navigation system
    initNavigation();
    
    // Initialize tabs system
    initTabs();
    
    // Set up utility functions
    setupForceInitButtons();
    setupTabSwitching();
    
    // Restore last active panel and tab
    await restoreNavigation();
    
    logger.info('UI components initialized successfully');
  } catch (error) {
    logger.error('Error initializing UI components:', error);
    throw new Error(`Failed to initialize UI: ${error.message}`);
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
    
    if (activeState.panel) {
      // Restore active panel
      await restoreLastActivePanel();
      
      // Restore active tab within panel if available
      if (activeState.tab) {
        await restoreLastActiveTab(`${activeState.panel}-panel`);
      }
      
      logger.debug(`Restored navigation state: panel=${activeState.panel}, tab=${activeState.tab || 'none'}`);
    } else {
      // Default to first panel
      logger.debug('No saved navigation state, defaulting to first panel');
      document.querySelector('.nav-item')?.click();
    }
  } catch (error) {
    logger.error('Error restoring navigation state:', error);
    
    // Fall back to first panel
    document.querySelector('.nav-item')?.click();
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
  `;
  
  document.body.appendChild(errorContainer);
  
  // Add retry button functionality
  document.getElementById('retry-init-btn')?.addEventListener('click', () => {
    errorContainer.remove();
    dashboardInitialized = false;
    servicesInitialized = false;
    initDashboard();
  });
}

/**
 * Handle lazy initialization of panels
 * @param {string} panelId - ID of panel being activated
 */
function handlePanelActivation(panelId) {
  logger.debug(`Panel activated: ${panelId}`);
  
  // Initialize panel components based on ID
  switch (panelId) {
    case 'overview':
      initOverviewPanel();
      break;
      
    case 'capture':
      initCapturePanel();
      break;
      
    case 'knowledge':
      // Initialize both panel and graph
      initKnowledgePanel();
      initKnowledgeGraph();
      break;
      
    case 'assistant':
      initAssistantPanel();
      break;
      
    case 'settings':
      initSettingsPanel();
      break;
      
    case 'tasks':
      initTasksPanel();
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
    
    // Add panel activation listener for lazy loading
    document.addEventListener('panelChanged', (event) => {
      if (event.detail && event.detail.panelId) {
        handlePanelActivation(event.detail.panelId);
      }
    });
    
    // Expose key functions to window for debugging
    window.marvinDashboard = {
      refreshAll: async () => {
        dashboardInitialized = false;
        servicesInitialized = false;
        await initDashboard();
      },
      initPanel: handlePanelActivation
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