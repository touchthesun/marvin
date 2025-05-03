// Debug flag
const DEBUG = true;

// Debug logging function
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[COMPONENT LOADER] ${message}`, ...args);
  }
}
 
debugLog('Component loader script initialized');

// Initialize component loading status tracker
const componentLoadStatus = {
  navigationInitialized: false,
  componentsLoaded: false
};

/**
 * Check if a component exists and is not a stub
 * @param {string} name - Component name
 * @returns {boolean} - Whether a real component exists
 */
function hasRealComponent(name) {
  return window.MarvinComponents && 
         window.MarvinComponents[name] && 
         !window.MarvinComponents[name]._isStub;
}

/**
 * Get a component from the registry
 * @param {string} name - Component name
 * @returns {object|null} - Component or null if not found
 */
function getComponent(name) {
  if (!window.MarvinComponents) {
    debugLog(`Component registry not found`);
    return null;
  }
  
  const component = window.MarvinComponents[name];
  if (!component) {
    debugLog(`Component not found: ${name}`);
    return null;
  }
  
  if (component._isStub) {
    debugLog(`Component ${name} is a stub`);
  } else {
    debugLog(`Component ${name} is real`);
  }
  
  return component;
}

/**
 * Initialize a component if it exists
 * @param {string} name - Component name
 * @param {string} initFunctionName - Initialization function name
 * @returns {Promise<boolean>} - Whether initialization succeeded
 */
async function initializeComponent(name, initFunctionName) {
  const component = getComponent(name);
  
  if (!component) {
    debugLog(`Cannot initialize ${name}, component not found`);
    return false;
  }
  
  if (!component[initFunctionName]) {
    debugLog(`Component ${name} does not have init function: ${initFunctionName}`);
    return false;
  }
  
  try {
    debugLog(`Initializing component: ${name}`);
    const result = await component[initFunctionName]();
    debugLog(`Component initialized: ${name} (result: ${result})`);
    return true;
  } catch (error) {
    debugLog(`Error initializing component ${name}:`, error);
    return false;
  }
}

/**
 * Initialize navigation system
 * @returns {Promise<boolean>} - Whether initialization succeeded
 */
async function initializeNavigation() {
  if (componentLoadStatus.navigationInitialized) {
    debugLog('Navigation already initialized');
    return true;
  }
  
  debugLog('Initializing navigation system');
  
  const component = getComponent('navigation');
  if (!component || !component.initNavigation) {
    debugLog('Navigation component not found or missing initNavigation function');
    return false;
  }
  
  try {
    // Initialize navigation
    await component.initNavigation();
    debugLog('Navigation system initialized');
    
    // Initialize tabs if available
    if (component.initTabs) {
      await component.initTabs();
      debugLog('Tab system initialized');
    }
    
    componentLoadStatus.navigationInitialized = true;
    return true;
  } catch (error) {
    debugLog('Error initializing navigation:', error);
    return false;
  }
}

/**
 * Handle DOM content loaded event
 */
function handleDOMContentLoaded() {
  debugLog('DOM loaded, initializing from component-loader');
  
  // Wait a bit to ensure component registry is initialized
  setTimeout(async () => {
    // Initialize navigation
    const success = await initializeNavigation();
    
    if (success) {
      // Activate the first panel
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        debugLog('Activating first panel');
        firstNavItem.click();
      }
    } else {
      debugLog('ERROR: Failed to initialize navigation');
    }
  }, 300);
}

// Create a public API
window.ComponentLoader = {
  getComponent,
  initializeComponent,
  initializeNavigation
};

// Setup DOM event handlers
document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);

debugLog('Component loader script loaded successfully');