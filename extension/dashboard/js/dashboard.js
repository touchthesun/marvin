// dashboard.js - Main entry point for the Marvin dashboard
import { LogManager } from '../../shared/utils/log-manager.js';
import { showNotification } from './services/notification-service.js';
import { registerAllStubs } from './utils/component-registry.js';

// Import services
import { initStorageService, getActiveState } from './services/storage-service.js';
import { setupStatusMonitoring } from './services/status-service.js';
import { initTaskService } from './services/task-service.js';

// Safety mechanism to prevent infinite loops or excessive resource usage
let initializationAttempts = 0;
const MAX_INITIALIZATION_ATTEMPTS = 3;

// Debug flag
const DEBUG_MODE = true;

// Logger for dashboard operations
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

// Components cache
const componentsCache = new Map();

/**
 * Debug logging function
 * @param {string} message - Debug message
 * @param {...any} args - Additional arguments
 */
function debugLog(message, ...args) {
  if (DEBUG_MODE) {
    console.log(`[DASHBOARD] ${message}`, ...args);
  }
}

/**
 * Validate all dashboard components
 * @returns {number} Number of available real components
 */
function validateComponents() {
  debugLog('Validating components...');
  
  const componentsToValidate = [
    'navigation',
    'overview-panel',
    'capture-panel',
    'knowledge-panel',
    'settings-panel',
    'tasks-panel',
    'assistant-panel'
  ];
  
  const results = {};
  
  // Don't call registerAllStubs here - we want to check what components
  // naturally exist before any stubs are registered
  
  for (const component of componentsToValidate) {
    try {
      debugLog(`Validating component: ${component}`);
      const module = window.MarvinComponents[component];
      
      // Check if the module is available
      if (!module) {
        debugLog(`Component not found: ${component}`);
        results[component] = false;
      }
      // Check if the module is a stub
      else if (module._isStub) {
        debugLog(`Using stub for: ${component}`);
        results[component] = false;
      } else {
        debugLog(`Real component available: ${component}`);
        results[component] = true;
      }
    } catch (error) {
      console.error(`[DASHBOARD] Error validating ${component}:`, error);
      results[component] = false;
    }
  }
  
  debugLog('Component validation results:', results);
  
  // Return the count of valid components (non-stubs)
  return Object.values(results).filter(isValid => isValid).length;
}

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
    // Ensure all stubs are registered before initialization
    registerAllStubs();
    
    // Try to load the navigation component which is critical
    debugLog('Loading navigation component...');
    
    // Get navigation component from registry
    const navigationModule = window.MarvinComponents.navigation;

    if (!navigationModule || !navigationModule.initNavigation) {
      debugLog(`Navigation module not found in registry`);
      throw new Error('Critical navigation component could not be loaded');
    }
    
    debugLog('Navigation component loaded successfully');
    
    // First initialize services
    await initServices();
    
    // Then initialize UI with the loaded navigation module
    await initUI(navigationModule);
    
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
 * @param {Object} navigationModule - The loaded navigation module
 * @returns {Promise<void>}
 */
async function initUI(navigationModule) {
  if (uiInitialized) {
    logger.debug('UI already initialized, skipping');
    return;
  }

  logger.info('Initializing UI components');
  
  try {
    // Initialize navigation system first
    logger.debug('Initializing navigation system');
    navigationModule.initNavigation();
    
    // Initialize tabs system
    logger.debug('Initializing tabs system');
    navigationModule.initTabs();
    
    // Set up utility functions
    logger.debug('Loading UI utilities...');
    const uiUtilsModule = window.MarvinComponents['ui-utils'];
    
    if (uiUtilsModule) {
      if (uiUtilsModule.setupForceInitButtons) {
        uiUtilsModule.setupForceInitButtons();
      }
      
      if (uiUtilsModule.setupTabSwitching) {
        uiUtilsModule.setupTabSwitching();
      }
      
      debugLog('UI utilities loaded successfully');
    } else {
      debugLog('UI utilities not found, continuing without them');
    }
    
    // Initialize the overview panel immediately since it's the default
    logger.debug('Pre-initializing overview panel');
    await loadAndInitializePanel('overview');
    
    // Restore last active panel and tab
    logger.debug('Restoring navigation state');
    await restoreNavigation(navigationModule);
    
    uiInitialized = true;
    logger.info('UI components initialized successfully');
  } catch (error) {
    logger.error('Error initializing UI components:', error);
    throw new Error(`Failed to initialize UI: ${error.message}`);
  }
}

/**
 * Handle panel change event
 * @param {CustomEvent} event - The panel change event
 */
function handlePanelChangeEvent(event) {
  if (event.detail && event.detail.panelId) {
    logger.debug(`Panel changed event received for: ${event.detail.panelId}`);
    handlePanelActivation(event.detail.panelId);
  } else {
    logger.warn('Panel changed event received without panelId');
  }
}

/**
 * Register handlers for panel activation events
 */
function registerPanelHandlers() {
  logger.debug('Registering panel activation handlers');
  
  try {
    // Add panel activation listener for lazy loading
    document.removeEventListener('panelChanged', handlePanelChangeEvent);
    document.addEventListener('panelChanged', handlePanelChangeEvent);
    
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
 * @param {Object} navigationModule - The loaded navigation module
 * @returns {Promise<void>}
 */
async function restoreNavigation(navigationModule) {
  try {
    // Get active state from storage
    const activeState = await getActiveState();
    logger.debug(`Retrieved active state: ${JSON.stringify(activeState)}`);
    
    if (activeState && activeState.panel) {
      logger.debug(`Attempting to restore panel: ${activeState.panel}`);
      
      // Use the navigateToPanel function directly
      const success = await navigationModule.navigateToPanel(activeState.panel);
      
      if (success) {
        logger.debug(`Successfully restored panel: ${activeState.panel}`);
        
        // Restore active tab within panel if available
        if (activeState.tab) {
          await navigationModule.restoreLastActiveTab(`${activeState.panel}-panel`);
          logger.debug(`Restored tab: ${activeState.tab} in panel: ${activeState.panel}`);
        }
      } else {
        logger.warn(`Failed to restore panel: ${activeState.panel}, defaulting to overview`);
        // Default to overview panel
        await navigationModule.navigateToPanel('overview');
      }
    } else {
      // Default to first panel (overview)
      logger.debug('No saved navigation state, defaulting to overview panel');
      await navigationModule.navigateToPanel('overview');
    }
  } catch (error) {
    logger.error('Error restoring navigation state:', error);
    
    // Fall back to overview panel
    try {
      logger.debug('Falling back to overview panel after error');
      // Try to show the overview panel without using navigation module
      showPanelFallback('overview');
    } catch (fallbackError) {
      logger.error('Error activating fallback panel:', fallbackError);
    }
  }
}

/**
 * Fallback function to show a panel without using the navigation module
 * @param {string} panelId - ID of the panel to show
 */
function showPanelFallback(panelId) {
  try {
    // Update navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-panel') === panelId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Update panels
    document.querySelectorAll('.content-panel').forEach(panel => {
      if (panel.id === `${panelId}-panel`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
    
    logger.debug(`Fallback navigation to panel: ${panelId} completed`);
  } catch (error) {
    logger.error(`Error in fallback navigation to ${panelId}:`, error);
  }
}

/**
 * Create error container element
 * @param {Error} error - Error object
 * @returns {HTMLElement} Error container element
 */
function createErrorContainer(error) {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'initialization-error';
  errorContainer.style.position = 'fixed';
  errorContainer.style.top = '50%';
  errorContainer.style.left = '50%';
  errorContainer.style.transform = 'translate(-50%, -50%)';
  errorContainer.style.backgroundColor = 'white';
  errorContainer.style.border = '2px solid #f44336';
  errorContainer.style.borderRadius = '8px';
  errorContainer.style.padding = '20px';
  errorContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  errorContainer.style.zIndex = '9999';
  errorContainer.style.maxWidth = '80%';
  
  // Create title element
  const title = document.createElement('h2');
  title.style.color = '#f44336';
  title.style.marginTop = '0';
  title.textContent = 'Dashboard Initialization Error';
  errorContainer.appendChild(title);
  
  // Create message element
  const message = document.createElement('p');
  message.textContent = error.message;
  errorContainer.appendChild(message);
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.marginTop = '20px';
  
  // Create retry button
  const retryButton = document.createElement('button');
  retryButton.id = 'retry-init-btn';
  retryButton.style.padding = '8px 16px';
  retryButton.style.backgroundColor = '#4285f4';
  retryButton.style.color = 'white';
  retryButton.style.border = 'none';
  retryButton.style.borderRadius = '4px';
  retryButton.style.cursor = 'pointer';
  retryButton.textContent = 'Retry';
  buttonContainer.appendChild(retryButton);
  
  // Create debug info button
  const debugButton = document.createElement('button');
  debugButton.id = 'debug-info-btn';
  debugButton.style.padding = '8px 16px';
  debugButton.style.backgroundColor = '#f5f5f5';
  debugButton.style.color = '#333';
  debugButton.style.border = 'none';
  debugButton.style.borderRadius = '4px';
  debugButton.style.cursor = 'pointer';
  debugButton.textContent = 'Show Debug Info';
  buttonContainer.appendChild(debugButton);
  
  // Create diagnostics button
  const diagnosticsButton = document.createElement('button');
  diagnosticsButton.id = 'diagnostics-btn';
  diagnosticsButton.style.padding = '8px 16px';
  diagnosticsButton.style.backgroundColor = '#f5f5f5';
  diagnosticsButton.style.color = '#333';
  diagnosticsButton.style.border = 'none';
  diagnosticsButton.style.borderRadius = '4px';
  diagnosticsButton.style.cursor = 'pointer';
  diagnosticsButton.textContent = 'Open Diagnostics';
  buttonContainer.appendChild(diagnosticsButton);
  
  errorContainer.appendChild(buttonContainer);
  
  return errorContainer;
}

/**
 * Create debug info element
 * @param {Error} error - Error object
 * @returns {HTMLElement} Debug info element
 */
function createDebugInfoElement(error) {
  const debugInfo = document.createElement('div');
  debugInfo.className = 'debug-info';
  debugInfo.style.marginTop = '15px';
  debugInfo.style.padding = '10px';
  debugInfo.style.backgroundColor = '#f5f5f5';
  debugInfo.style.borderRadius = '4px';
  debugInfo.style.maxHeight = '200px';
  debugInfo.style.overflow = 'auto';
  debugInfo.style.fontFamily = 'monospace';
  debugInfo.style.fontSize = '12px';
  
  // Create heading
  const heading = document.createElement('h3');
  heading.style.marginTop = '0';
  heading.style.fontSize = '14px';
  heading.textContent = 'Debug Information';
  debugInfo.appendChild(heading);
  
  // Create pre element for debug text
  const pre = document.createElement('pre');
  pre.style.margin = '0';
  pre.style.whiteSpace = 'pre-wrap';
  
  // Build debug text
  let debugText = '';
  debugText += `Dashboard initialized: ${dashboardInitialized}\n`;
  debugText += `Services initialized: ${servicesInitialized}\n`;
  debugText += `UI initialized: ${uiInitialized}\n`;
  debugText += `Panel handlers registered: ${panelHandlersRegistered}\n`;
  debugText += `Initialization attempts: ${initializationAttempts}\n\n`;
  
  // Get available panels and nav items
  const availablePanels = Array.from(document.querySelectorAll('.content-panel'))
    .map(p => p.id).join(', ');
  
  const availableNavItems = Array.from(document.querySelectorAll('.nav-item'))
    .map(n => n.getAttribute('data-panel')).join(', ');
  
  debugText += `Available panels: ${availablePanels}\n`;
  debugText += `Available nav items: ${availableNavItems}\n\n`;
  
  // Get components information
  const components = window.MarvinComponents ? Object.keys(window.MarvinComponents).join(', ') : 'None';
  debugText += `Registered components: ${components}\n\n`;
  
  // Add error information
  debugText += `Error: ${error.stack || error.message}`;
  
  pre.textContent = debugText;
  debugInfo.appendChild(pre);
  
  return debugInfo;
}

/**
 * Handle retry button click
 * @param {HTMLElement} errorContainer - The error container element
 */
function handleRetryButtonClick(errorContainer) {
  errorContainer.remove();
  dashboardInitialized = false;
  servicesInitialized = false;
  uiInitialized = false;
  
  initDashboard();
}

/**
 * Handle debug info button click
 * @param {HTMLElement} errorContainer - The error container element
 * @param {Error} error - The error object
 */
function handleDebugInfoButtonClick(errorContainer, error) {
  // Remove any existing debug info
  const existingDebugInfo = errorContainer.querySelector('.debug-info');
  if (existingDebugInfo) {
    existingDebugInfo.remove();
  }
  
  // Create and append new debug info
  const debugInfo = createDebugInfoElement(error);
  errorContainer.appendChild(debugInfo);
}


/**
 * Handle diagnostics button click
 */
function handleDiagnosticsButtonClick() {
  try {
    // Open diagnostics in a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/diagnostics.html') });
  } catch (error) {
    alert('Error opening diagnostics: ' + error.message);
  }
}

/**
 * Display initialization error
 * @param {Error} error - Error object
 */
function showInitializationError(error) {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'initialization-error';
  
  // Apply styles using style property
  errorContainer.style.position = 'fixed';
  errorContainer.style.top = '50%';
  errorContainer.style.left = '50%';
  errorContainer.style.transform = 'translate(-50%, -50%)';
  errorContainer.style.backgroundColor = 'white';
  errorContainer.style.border = '2px solid #f44336';
  errorContainer.style.borderRadius = '8px';
  errorContainer.style.padding = '20px';
  errorContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  errorContainer.style.zIndex = '9999';
  errorContainer.style.maxWidth = '80%';
  
  // Create title
  const title = document.createElement('h2');
  title.style.color = '#f44336';
  title.style.marginTop = '0';
  title.textContent = 'Dashboard Initialization Error';
  errorContainer.appendChild(title);
  
  // Create message
  const message = document.createElement('p');
  message.textContent = error.message;
  errorContainer.appendChild(message);
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.marginTop = '20px';
  
  // Create retry button
  const retryButton = document.createElement('button');
  retryButton.id = 'retry-init-btn';
  retryButton.style.padding = '8px 16px';
  retryButton.style.backgroundColor = '#4285f4';
  retryButton.style.color = 'white';
  retryButton.style.border = 'none';
  retryButton.style.borderRadius = '4px';
  retryButton.style.cursor = 'pointer';
  retryButton.textContent = 'Retry';
  buttonContainer.appendChild(retryButton);
  
  // Create debug info button
  const debugButton = document.createElement('button');
  debugButton.id = 'debug-info-btn';
  debugButton.style.padding = '8px 16px';
  debugButton.style.backgroundColor = '#f5f5f5';
  debugButton.style.color = '#333';
  debugButton.style.border = 'none';
  debugButton.style.borderRadius = '4px';
  debugButton.style.cursor = 'pointer';
  debugButton.textContent = 'Show Debug Info';
  buttonContainer.appendChild(debugButton);
  
  // Create diagnostics button
  const diagnosticsButton = document.createElement('button');
  diagnosticsButton.id = 'diagnostics-btn';
  diagnosticsButton.style.padding = '8px 16px';
  diagnosticsButton.style.backgroundColor = '#f5f5f5';
  diagnosticsButton.style.color = '#333';
  diagnosticsButton.style.border = 'none';
  diagnosticsButton.style.borderRadius = '4px';
  diagnosticsButton.style.cursor = 'pointer';
  diagnosticsButton.textContent = 'Open Diagnostics';
  buttonContainer.appendChild(diagnosticsButton);
  
  errorContainer.appendChild(buttonContainer);
  document.body.appendChild(errorContainer);
  
  // Add retry button functionality
  if (retryButton) {
    retryButton.addEventListener('click', function() {
      handleRetryButtonClick(errorContainer);
    });
  }
  
  // Add debug info button functionality
  if (debugButton) {
    debugButton.addEventListener('click', function() {
      handleDebugInfoButtonClick(errorContainer, error);
    });
  }
  
  // Add diagnostics button functionality
  if (diagnosticsButton) {
    diagnosticsButton.addEventListener('click', handleDiagnosticsButtonClick);
  }
}

/**
 * Load and initialize a panel
 * @param {string} panelId - ID of panel to initialize
 * @returns {Promise<boolean>} - Whether initialization succeeded
 */
async function loadAndInitializePanel(panelId) {
  logger.debug(`Loading and initializing panel: ${panelId}`);
  
  try {
    if (componentsCache.has(panelId)) {
      const cachedComponent = componentsCache.get(panelId);
      logger.debug(`Using cached component for ${panelId}`);
      return true;
    }
    
    // Determine initialization function based on panel name
    const capitalizedName = panelId.charAt(0).toUpperCase() + panelId.slice(1);
    const initFunctionName = `init${capitalizedName}Panel`;
    
    // Get component name
    const componentName = `${panelId}-panel`;
    
    // Get the panel module from global registry
    logger.debug(`Getting panel module from registry: ${componentName}`);
    
    const panelModule = window.MarvinComponents[componentName];
    
    if (!panelModule || !panelModule[initFunctionName]) {
      logger.warn(`Module or init function not found for panel: ${panelId}`);
      return false;
    }
    
    // Initialize the panel
    logger.debug(`Calling ${initFunctionName}()`);
    await panelModule[initFunctionName]();
    
    // Cache the component
    componentsCache.set(panelId, panelModule);
    
    logger.debug(`Panel ${panelId} initialized successfully`);
    return true;
  } catch (error) {
    logger.error(`Error initializing panel ${panelId}:`, error);
    return false;
  }
}

/**
 * Handle lazy initialization of panels
 * @param {string} panelId - ID of panel being activated
 */
function handlePanelActivation(panelId) {
  logger.debug(`Panel activation handler called for: ${panelId}`);
  
  // Load and initialize the panel
  loadAndInitializePanel(panelId).catch(err => {
    logger.error(`Error in panel activation for ${panelId}:`, err);
    showNotification(`Error loading ${panelId} panel: ${err.message}`, 'error');
  });
}

/**
 * Handle window unload event
 */
function handleWindowUnload() {
  // Any cleanup or state saving can be done here
  logger.info('Dashboard unloading');
}

/**
 * Handle DOM content loaded
 */
function handleDOMContentLoaded() {
  console.log('DOM loaded, starting dashboard initialization');
  
  try {
    // Check if another dashboard instance might be running in another tab
    const instanceId = 'dashboard_instance_' + Date.now();
    sessionStorage.setItem('current_dashboard_instance', instanceId);
    
    // Start initialization with a slight delay to ensure DOM is fully ready
    setTimeout(initDashboard, 100);
    
    // Expose key functions to window for debugging
    createDebugInterface();
  } catch (error) {
    console.error('Critical error in dashboard initialization:', error);
    showNotification('Dashboard initialization failed', 'error');
  }
}

/**
 * Create debug interface object
 */
/**
 * Create debug interface on window object
 */
function createDebugInterface() {
  // Store internal state for debug access
  const debugState = {
    getState: function() {
      return {
        dashboardInitialized,
        servicesInitialized,
        uiInitialized,
        panelHandlersRegistered,
        initializationAttempts
      };
    },
    getPanels: function() {
      return Array.from(document.querySelectorAll('.content-panel')).map(p => p.id);
    },
    getNavItems: function() {
      return Array.from(document.querySelectorAll('.nav-item')).map(n => ({
        panel: n.getAttribute('data-panel'),
        text: n.textContent.trim(),
        isActive: n.classList.contains('active')
      }));
    }
  };
  
  // Create refresh function
  const refreshAllFunc = function() {
    dashboardInitialized = false;
    servicesInitialized = false;
    uiInitialized = false;
    panelHandlersRegistered = false;
    
    // Clear component cache
    componentsCache.clear();
    
    // Initialize dashboard
    return initDashboard();
  };
  
  // Expose debug interface
  window.marvinDashboard = {
    refreshAll: refreshAllFunc,
    initPanel: handlePanelActivation,
    debug: debugState
  };
}



// Attach event listeners
document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
window.addEventListener('beforeunload', handleWindowUnload);



/**
 * Module test function for development
 * This function has been simplified to avoid CSP issues
 */
function testModuleLoad(moduleName, exactPath) {
  console.warn('[TEST] testModuleLoad has been simplified due to CSP restrictions');
  console.warn('[TEST] Access components through window.MarvinComponents instead');
  
  // Log the parameters for debugging purposes
  console.log(`[TEST] Requested module: ${moduleName}, path: ${exactPath}`);
  
  // Return component from registry if available
  if (window.MarvinComponents && window.MarvinComponents[moduleName]) {
    console.log(`[TEST] Found component in registry: ${moduleName}`);
    return window.MarvinComponents[moduleName];
  }
  
  console.log(`[TEST] Component not found in registry: ${moduleName}`);
  return null;
}

// Export main functions for testing/debugging
export {
  initDashboard,
  initServices,
  initUI,
  handlePanelActivation,
  validateComponents
};

// Set up dom content loaded handler
function setupDomContentLoadedHandler() {
  document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
  document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
}

// Set up beforeunload handler
function setupBeforeUnloadHandler() {
  window.removeEventListener('beforeunload', handleWindowUnload);
  window.addEventListener('beforeunload', handleWindowUnload);
}

// Make test function available globally for debugging
if (typeof window !== 'undefined') {
  window.__testModuleLoad = testModuleLoad;
}

// Setup DOM event handlers - called directly to avoid inline handlers
setupDomContentLoadedHandler();
setupBeforeUnloadHandler();

// Perform initial component validation
const validComponentCount = validateComponents();
debugLog(`Initially found ${validComponentCount} valid components`);