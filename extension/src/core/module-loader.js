// dashboard/js/utils/module-loader.js

// Enable debug logging
const DEBUG_MODULE_LOADER = true;

/**
 * Debug logging function
 * @param {string} message - Debug message
 * @param {...any} args - Additional arguments
 */
function debugLog(message, ...args) {
  if (DEBUG_MODULE_LOADER) {
    console.log(`[MODULE LOADER] ${message}`, ...args);
  }
}

// Keep track of loaded and failed modules
const moduleCache = new Map();
const failedModules = new Set();

/**
 * Check if a module is available in the extension
 * @param {string} path - Path to the module
 * @returns {Promise<boolean>} - Whether the module is available
 */
async function isModuleAvailable(path) {
  try {
    const extensionPath = chrome.runtime.getURL(path);
    const response = await fetch(extensionPath, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    debugLog(`Error checking module availability: ${error.message}`);
    return false;
  }
}


/**
 * Safely import a module with standardized path resolution
 * @param {string} moduleName - Name of the module to import
 * @param {object} [options] - Import options
 * @param {string} [options.type='component'] - Type of module ('component', 'util', 'shared', etc.)
 * @returns {Promise<object>} - The loaded module
 */ 
export async function safeImport(moduleName, options = {}) {
  const { type = 'component' } = options;
  
  debugLog(`Attempting to load module: ${moduleName} (type: ${type})`);
  
  // Check cache first
  if (moduleCache.has(moduleName)) {
    debugLog(`Using cached module: ${moduleName}`);
    return moduleCache.get(moduleName);
  }
  
  // Check global registry for components
  const componentName = moduleName.replace(/\.js$/, '');
  if (window.MarvinComponents && window.MarvinComponents[componentName]) {
    const component = window.MarvinComponents[componentName];
    if (!component._isStub) {
      debugLog(`Found module in global registry: ${moduleName}`);
      return window.MarvinComponents[componentName];
    }
    debugLog(`Found stub in global registry for: ${moduleName}, will try to load real component`);
  }
  
  // Convert bare module name to path if needed
  const modulePath = moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`;
  
  // Get extension base URL
  const baseUrl = chrome.runtime.getURL('/');
  
  // Determine the correct paths to try with full URLs
  let pathsToTry = [];
  
  if (type === 'component') {
    pathsToTry = [
      `${baseUrl}dashboard/js/components/${modulePath}`,
      `${baseUrl}js/components/${modulePath}`
    ];
  } else if (type === 'util') {
    pathsToTry = [
      `${baseUrl}dashboard/js/utils/${modulePath}`,
      `${baseUrl}shared/utils/${modulePath}`
    ];
  } else if (type === 'shared') {
    pathsToTry = [
      `${baseUrl}shared/utils/${modulePath}`
    ];
  }
  
  // Add debug information about paths
  debugLog(`Paths to try for ${moduleName}:`, pathsToTry);
  
  // Try each path until we find one that works
  for (const path of pathsToTry) {
    try {
      debugLog(`Trying to import from path: ${path}`);
      
      try {
        // Use dynamic import
        const module = await import(/* webpackIgnore: true */ path);
        
        // Cache successful module
        moduleCache.set(moduleName, module);
        debugLog(`Successfully loaded module: ${moduleName}`);
        
        return module;
      } catch (importError) {
        debugLog(`Import error for ${path}: ${importError.message}`);
        // Continue to next path
      }
    } catch (error) {
      debugLog(`Error checking file at ${path}: ${error.message}`);
      // Continue to the next path
    }
  }
  
  // All paths failed - log detailed error info
  debugLog(`All paths failed for module: ${moduleName}`, {
    paths: pathsToTry,
    cache: Array.from(moduleCache.keys()),
    failed: Array.from(failedModules)
  });
  
  failedModules.add(moduleName);
  
  // Return a stub module
  return createStubModule(moduleName);
}

/**
 * Clear a specific failed module to allow retry
 * @param {string} moduleName - Name of module to clear from failed list
 */
export function clearFailedModule(moduleName) {
  failedModules.delete(moduleName);
  moduleCache.delete(moduleName);
  debugLog(`Cleared failed status for module: ${moduleName}`);
}

/**
 * Clear all module caches
 */
export function clearModuleCache() {
  moduleCache.clear();
  failedModules.clear();
  debugLog('Module cache cleared');
}

/**
 * Create a stub module with basic functionality
 * @param {string} moduleName - Name of the module
 * @returns {object} - Stub module
 */
function createStubModule(moduleName) {
  // Extract panel name from module name
  let panelName = moduleName.replace(/\.js$/, '');
  if (panelName.endsWith('-panel')) {
    panelName = panelName.replace('-panel', '');
  }
  
  // Create capitalized version for function names
  const capitalizedName = panelName.charAt(0).toUpperCase() + panelName.slice(1);
  
  // Create initialization function name
  const initFunctionName = `init${capitalizedName}Panel`;
  
  // Create a stub module with the expected initialization function
  const stubModule = {
    [initFunctionName]: async function() {
      debugLog(`Using stub implementation for ${moduleName}`);
      
      // Try to get the panel element
      const panelElement = document.getElementById(`${panelName}-panel`);
      if (!panelElement) {
        debugLog(`Panel element not found: ${panelName}-panel`);
        return;
      }
      
      // Add a warning message to the panel
      const warningElement = document.createElement('div');
      warningElement.className = 'module-warning';
      warningElement.style.padding = '15px';
      warningElement.style.margin = '15px';
      warningElement.style.backgroundColor = '#fff3cd';
      warningElement.style.border = '1px solid #ffeeba';
      warningElement.style.borderRadius = '4px';
      warningElement.style.color = '#856404';
      
      warningElement.innerHTML = `
        <h3>Module Loading Error</h3>
        <p>The ${panelName} panel module could not be loaded due to import errors.</p>
        <p>This is a placeholder implementation with limited functionality.</p>
        <button class="btn-secondary stub-retry-btn">Retry Loading Module</button>
      `;
      
      // Find the content area to insert the warning
      const contentArea = panelElement.querySelector('.panel-actions') || 
                          panelElement.querySelector('.panel-header');
      
      if (contentArea && contentArea.parentNode) {
        contentArea.parentNode.insertBefore(warningElement, contentArea.nextSibling);
      } else {
        // Fallback: Add to panel directly
        panelElement.appendChild(warningElement);
      }
      
      // Add retry button functionality
      const retryButton = warningElement.querySelector('.stub-retry-btn');
      if (retryButton) {
        retryButton.addEventListener('click', async () => {
          debugLog(`Retrying module load for ${moduleName}...`);
          
          // Clear failed status to allow retry
          clearFailedModule(moduleName);
          
          // Remove warning
          warningElement.remove();
          
          // Try loading again
          try {
            const module = await safeImport(moduleName);
            if (module[initFunctionName]) {
              await module[initFunctionName]();
              debugLog(`Successfully reloaded and initialized ${moduleName}`);
            }
          } catch (error) {
            debugLog(`Failed to reload ${moduleName}:`, error);
          }
        });
      }
    },
    // Mark this as a stub so we can identify it later
    _isStub: true
  };
  
  return stubModule;
}

/**
 * Get a list of all loaded and failed modules
 * @returns {object} - Object containing loaded and failed module lists
 */
export function getModuleStatus() {
  return {
    loaded: Array.from(moduleCache.keys()),
    failed: Array.from(failedModules)
  };
}

/**
 * Preload a component to ensure it's available before needed
 * @param {string} componentName - Name of the component to preload
 * @returns {Promise<boolean>} - Whether preloading was successful
 */
export async function preloadComponent(componentName) {
  try {
    debugLog(`Preloading component: ${componentName}`);
    await safeImport(componentName, { type: 'component' });
    return true;
  } catch (error) {
    debugLog(`Error preloading component ${componentName}: ${error.message}`);
    return false;
  }
}

/**
 * Preload multiple components
 * @param {string[]} componentNames - Array of component names to preload
 * @returns {Promise<object>} - Results of preloading each component
 */
export async function preloadComponents(componentNames) {
  const results = {};
  
  for (const name of componentNames) {
    results[name] = await preloadComponent(name);
  }
  
  return results;
}

// If global component registry doesn't exist, create it
if (typeof window !== 'undefined' && !window.MarvinComponents) {
  window.MarvinComponents = {};
}

// If global registration function doesn't exist, create it
if (typeof window !== 'undefined' && !window.registerComponent) {
  window.registerComponent = function(name, implementation) {
    debugLog(`Registering component: ${name}`);
    window.MarvinComponents[name] = implementation;
    
    // Also add to module cache
    moduleCache.set(name, implementation);
  };
}

// Export a test function to verify the module loader works
export function testModuleLoader() {
  return {
    status: 'Module loader initialized',
    timestamp: new Date().toISOString()
  };
}
