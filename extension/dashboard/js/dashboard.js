// dashboard.js - Main entry point for the Marvin dashboard
import { LogManager } from '../../shared/utils/log-manager.js';
import { showNotification } from './services/notification-service.js';
import { safeImport, getModuleStatus, clearModuleCache, preloadComponents } from './utils/module-loader.js';

// Import services
import { initStorageService, getActiveState } from './services/storage-service.js';
import { setupStatusMonitoring } from './services/status-service.js';
import { initTaskService } from './services/task-service.js';

// Safety mechanism to prevent infinite loops or excessive resource usage
let initializationAttempts = 0;
const MAX_INITIALIZATION_ATTEMPTS = 3;

// Debug flag
const DEBUG_MODE = true;


// Preload all components
async function preloadDashboardComponents() {
  console.log('[DASHBOARD] Preloading components...');
  
  const componentsToPreload = [
    'navigation',
    'overview-panel',
    'capture-panel',
    'knowledge-panel',
    'settings-panel',
    'tasks-panel',
    'assistant-panel'
  ];
  
  const results = {};
  
  for (const component of componentsToPreload) {
    try {
      console.log(`[DASHBOARD] Preloading component: ${component}`);
      const module = await safeImport(component, { type: 'component' });
      
      // Check if the module is a stub
      if (module && module._isStub) {
        console.log(`[DASHBOARD] Loaded stub for: ${component}`);
        results[component] = false;
      } else {
        console.log(`[DASHBOARD] Successfully loaded: ${component}`);
        results[component] = true;
      }
    } catch (error) {
      console.error(`[DASHBOARD] Error preloading ${component}:`, error);
      results[component] = false;
    }
  }
  
  console.log('[DASHBOARD] Component preloading results:', results);
  
  // Register stubs for any components that failed to load
  registerAllStubs();
  
  return Object.values(results).filter(success => success).length;
}

// Call this before initializing the dashboard
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DASHBOARD] Dashboard script loaded');
  
  // Preload components
  const loadedCount = await preloadDashboardComponents();
  console.log(`[DASHBOARD] Successfully preloaded ${loadedCount} components`);
  
  // Initialize dashboard
  initDashboard();
});

/**
 * Debug logging function
 */
function debugLog(message, ...args) {
  if (DEBUG_MODE) {
    console.log(`[DASHBOARD] ${message}`, ...args);
  }
}

debugLog('Dashboard script loaded');

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

// Components cache
const componentsCache = new Map();

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
    // First try to load the navigation component which is critical
    debugLog('Loading navigation component...');
    
    // Check if navigation component is already registered
    const navigationModule = self.MarvinComponents['navigation'];

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
    const uiUtilsModule = await safeImport('ui-utils', { type: 'util' });
    
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
 * Display initialization error
 * @param {Error} error - Error object
 */
function showInitializationError(error) {
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
  
  errorContainer.innerHTML = `
    <h2 style="color: #f44336; margin-top: 0;">Dashboard Initialization Error</h2>
    <p>${error.message}</p>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button id="retry-init-btn" style="padding: 8px 16px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
      <button id="debug-info-btn" style="padding: 8px 16px; background-color: #f5f5f5; color: #333; border: none; border-radius: 4px; cursor: pointer;">Show Debug Info</button>
      <button id="diagnostics-btn" style="padding: 8px 16px; background-color: #f5f5f5; color: #333; border: none; border-radius: 4px; cursor: pointer;">Open Diagnostics</button>
    </div>
  `;
  
  document.body.appendChild(errorContainer);
  
  // Add retry button functionality
  document.getElementById('retry-init-btn')?.addEventListener('click', () => {
    errorContainer.remove();
    dashboardInitialized = false;
    servicesInitialized = false;
    uiInitialized = false;
    
    // Clear module cache before retrying
    clearModuleCache();
    
    initDashboard();
  });
  
  // Add debug info button
  document.getElementById('debug-info-btn')?.addEventListener('click', () => {
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
    
    // Get module status
    const moduleStatus = getModuleStatus();
    
    debugInfo.innerHTML = `
      <h3 style="margin-top: 0; font-size: 14px;">Debug Information</h3>
      <pre style="margin: 0; white-space: pre-wrap;">
Dashboard initialized: ${dashboardInitialized}
Services initialized: ${servicesInitialized}
UI initialized: ${uiInitialized}
Panel handlers registered: ${panelHandlersRegistered}
Initialization attempts: ${initializationAttempts}

Available panels: ${Array.from(document.querySelectorAll('.content-panel')).map(p => p.id).join(', ')}
Available nav items: ${Array.from(document.querySelectorAll('.nav-item')).map(n => n.getAttribute('data-panel')).join(', ')}

Loaded modules: ${moduleStatus.loaded.join(', ') || 'None'}
Failed modules: ${moduleStatus.failed.join(', ') || 'None'}

Error: ${error.stack || error.message}
      </pre>
    `;
    
    // Replace any existing debug info
    const existingDebugInfo = errorContainer.querySelector('.debug-info');
    if (existingDebugInfo) {
      existingDebugInfo.remove();
    }
    
    errorContainer.appendChild(debugInfo);
  });
  
  // Add diagnostics button
  document.getElementById('diagnostics-btn')?.addEventListener('click', () => {
    try {
      // Open diagnostics in a new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/diagnostics.html') });
    } catch (error) {
      alert('Error opening diagnostics: ' + error.message);
    }
  });
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
    
    // Try to load the panel module
    const modulePath = `${panelId}-panel`;
    
    // Use the direct path
    logger.debug(`Loading panel module: ${modulePath}`);
    
    const panelModule = await safeImport(modulePath, {
      type: 'component'
    });
    
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
        
        // Clear component cache
        componentsCache.clear();
        
        // Clear module cache
        clearModuleCache();
        
        await initDashboard();
      },
      initPanel: handlePanelActivation,
      loadModule: safeImport,
      getModuleStatus: getModuleStatus,
      clearModuleCache: clearModuleCache,
      debug: {
        getState: () => ({
          dashboardInitialized,
          servicesInitialized,
          uiInitialized,
          panelHandlersRegistered,
          initializationAttempts,
          moduleStatus: getModuleStatus()
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

// Make a test function available globally for debugging
if (typeof window !== 'undefined') {
  window.__testModuleLoad = async function(moduleName, exactPath) {
    console.log(`[TEST] Testing direct module load for: ${moduleName}`);
    console.log(`[TEST] Using path: ${exactPath}`);
    
    try {
      // Get the full URL
      const url = chrome.runtime.getURL(exactPath);
      console.log(`[TEST] Resolved URL: ${url}`);
      
      // Check if the file exists
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[TEST] File not found at ${url} (status: ${response.status})`);
        return null;
      }
      
      console.log(`[TEST] Found file at ${url}`);
      
      // Try to import the module
      const module = await import(/* webpackIgnore: true */ url);
      console.log(`[TEST] Successfully imported module`);
      console.log(`[TEST] Module exports:`, Object.keys(module));
      
      return module;
    } catch (error) {
      console.error(`[TEST] Error loading module:`, error);
      return null;
    }
  };
}
