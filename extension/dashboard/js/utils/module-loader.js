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
 * Safely import a module by path
 * @param {string} path - Path to the module file
 * @returns {Promise<object|null>} The module or null if failed
 */
async function importFromPath(path) {
  try {
    debugLog(`Trying path: ${path}`);
    
    // Get the full extension URL
    let fullUrl;
    try {
      fullUrl = chrome.runtime.getURL(path);
      debugLog(`Resolved URL: ${fullUrl}`);
    } catch (e) {
      debugLog(`Failed to resolve URL for ${path}: ${e.message}`);
      return null;
    }
    
    // First check if the file exists using fetch
    let fileCheck;
    try {
      fileCheck = await fetch(fullUrl);
      if (!fileCheck.ok) {
        debugLog(`File not found at ${fullUrl}`);
        return null;
      }
      debugLog(`Found file at ${fullUrl}`);
    } catch (e) {
      debugLog(`Fetch failed for ${fullUrl}: ${e.message}`);
      return null;
    }
    
    // Try to import directly
    try {
      // Direct import without blob URL creation
      const module = await import(/* webpackIgnore: true */ fullUrl);
      debugLog(`Successfully loaded module from: ${path}`);
      return module;
    } catch (importError) {
      debugLog(`Import error for ${path}: ${importError.message}`);
      
      // If the import fails, it might be due to relative imports in the module
      // Instead of modifying the module text, we need to ensure all modules
      // are properly referenced with absolute paths in the original files
      
      debugLog(`Module could not be loaded. Make sure all imports use absolute paths.`);
      
      // Log a helpful message about how to fix the module
      debugLog(`Tip: Replace relative imports like './utils.js' with absolute paths like '/dashboard/js/utils/utils.js'`);
      
      return null;
    }
  } catch (error) {
    debugLog(`Failed to load from ${path}: ${error.message}`);
    return null;
  }
}



/**
 * Resolve a relative import path to an absolute path
 * @param {string} relativePath - Relative import path
 * @param {string} baseModulePath - Path of the importing module
 * @returns {string} Resolved absolute path
 */
function resolveRelativeImport(relativePath, baseModulePath) {
  debugLog(`Resolving relative import: ${relativePath} from base: ${baseModulePath}`);
  
  // Get the directory of the base module
  const baseDir = baseModulePath.substring(0, baseModulePath.lastIndexOf('/') + 1);
  debugLog(`Base directory: ${baseDir}`);
  
  // Handle different relative path patterns
  if (relativePath.startsWith('./')) {
    // Same directory
    const resolved = baseDir + relativePath.substring(2);
    debugLog(`Resolved ./ import to: ${resolved}`);
    return resolved;
  } else if (relativePath.startsWith('../')) {
    // Parent directory - count the number of ../ segments
    let tempPath = relativePath;
    let tempBaseDir = baseDir;
    
    while (tempPath.startsWith('../')) {
      // Remove one directory level from the base path
      tempBaseDir = tempBaseDir.substring(0, tempBaseDir.lastIndexOf('/', tempBaseDir.length - 2) + 1);
      // Remove the ../ from the relative path
      tempPath = tempPath.substring(3);
    }
    
    const resolved = tempBaseDir + tempPath;
    debugLog(`Resolved ../ import to: ${resolved}`);
    return resolved;
  } else if (relativePath.startsWith('/')) {
    // Absolute path from extension root
    debugLog(`Using absolute path: ${relativePath}`);
    return relativePath.substring(1); // Remove leading slash
  } else {
    // Assume it's a module in the same directory
    const resolved = baseDir + relativePath;
    debugLog(`Resolved bare import to: ${resolved}`);
    return resolved;
  }
}



/**
 * Safely import a module with multiple path attempts
 * @param {string} moduleName - Name of the module to import
 * @param {object} [options] - Import options
 * @param {string} [options.type='component'] - Type of module ('component', 'util', 'shared', etc.)
 * @param {string[]} [options.additionalPaths] - Additional paths to try if standard resolution fails
 * @returns {Promise<object>} - The loaded module
 */
export async function safeImport(moduleName, options = {}) {
  const { 
    type = 'component', 
    additionalPaths = [] 
  } = options;
  
  debugLog(`Attempting to load module: ${moduleName} (type: ${type})`);
  
  // Check cache first
  if (moduleCache.has(moduleName)) {
    debugLog(`Using cached module: ${moduleName}`);
    return moduleCache.get(moduleName);
  }
  
  // Don't retry modules that have previously failed
  if (failedModules.has(moduleName)) {
    debugLog(`Module previously failed to load: ${moduleName}`);
    return createStubModule(moduleName);
  }
  
  // Convert bare module name to path if needed
  const modulePath = moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`;
  
  // Highest priority: Check if module is already registered in global registry
  if (window.MarvinComponents && window.MarvinComponents[moduleName.replace(/\.js$/, '')]) {
    debugLog(`Found module in global registry: ${moduleName}`);
    return window.MarvinComponents[moduleName.replace(/\.js$/, '')];
  }
  
  // For components, always try the dashboard/js/components path first
  if (type === 'component') {
    // Try the direct, correct path first
    const directPath = `dashboard/js/components/${modulePath}`;
    debugLog(`Trying direct component path: ${directPath}`);
    
    const module = await importFromPath(directPath);
    if (module) {
      moduleCache.set(moduleName, module);
      debugLog(`Successfully loaded module from direct path: ${directPath}`);
      return module;
    }
    
    // If direct path failed, try with variations
    const variations = [
      `/dashboard/js/components/${modulePath}`,
      `./dashboard/js/components/${modulePath}`
    ];
    
    for (const path of variations) {
      const module = await importFromPath(path);
      if (module) {
        moduleCache.set(moduleName, module);
        debugLog(`Successfully loaded module from variation path: ${path}`);
        return module;
      }
    }
  }

  if (type === 'util') {
    // Try the direct, correct path first
    const directPath = `dashboard/js/utils/${modulePath}`;
    debugLog(`Trying direct component path: ${directPath}`);

    const module = await importFromPath(directPath);
    if (module) {
      moduleCache.set(moduleName, module);
      debugLog(`Successfully loaded module from direct path: ${directPath}`);
      return module;
    }

    // If direct path failed, try with variations
    const variations = [
      `/dashboard/js/utils/${modulePath}`,
      `./dashboard/js/utils/${modulePath}`
    ];
    
    for (const path of variations) {
      const module = await importFromPath(path);
      if (module) {
        moduleCache.set(moduleName, module);
        debugLog(`Successfully loaded module from variation path: ${path}`);
        return module;
      }
    }
  }
  
  // If we're still here, try additional paths
  for (const path of additionalPaths) {
    const module = await importFromPath(path);
    if (module) {
      moduleCache.set(moduleName, module);
      debugLog(`Successfully loaded module from additional path: ${path}`);
      return module;
    }
  }
  
  // If we're still here, try the module name directly
  const module = await importFromPath(modulePath);
  if (module) {
    moduleCache.set(moduleName, module);
    debugLog(`Successfully loaded module from direct module path: ${modulePath}`);
    return module;
  }
  
  // All paths failed, mark as failed module
  failedModules.add(moduleName);
  debugLog(`All paths failed for module: ${moduleName}`);
  
  // Return a stub module
  debugLog(`Creating stub module for: ${moduleName}`);
  return createStubModule(moduleName);
}




/**
 * Get the base path of the extension
 * @returns {string} The base URL of the extension
 */
function getExtensionBasePath() {
  try {
    debugLog('Getting extension base path using chrome.runtime.getURL');
    const basePath = chrome.runtime.getURL('');
    debugLog(`Extension base path: ${basePath}`);
    return basePath;
  } catch (e) {
    debugLog(`Failed to get extension base path: ${e.message}`);
    // Fallback if runtime API fails
    return '/';
  }
}

/**
 * Resolve a module path against the extension's base URL
 * @param {string} path - Relative or absolute path to resolve
 * @returns {string} Fully resolved URL
 */
function resolveModulePath(path) {
  try {
    // Log the input path for debugging
    debugLog(`Resolving module path: ${path}`);
    
    // Skip resolution for absolute URLs
    if (path.startsWith('http://') || path.startsWith('https://')) {
      debugLog(`Path is already absolute: ${path}`);
      return path;
    }
    
    const basePath = getExtensionBasePath();
    debugLog(`Extension base path: ${basePath}`);
    
    // Special case for panel modules
    if (path.endsWith('-panel.js') && !path.includes('/')) {
      const correctedPath = `dashboard/js/components/${path}`;
      debugLog(`Special case for panel module: using ${correctedPath} instead of ${path}`);
      return new URL(correctedPath, basePath).href;
    }
    
    // Special case for component modules without path
    if (path.endsWith('.js') && !path.includes('/')) {
      // Check if this is likely a component
      const componentNames = ['navigation', 'overview', 'knowledge', 'tasks', 'assistant', 'capture', 'settings'];
      const baseName = path.replace('.js', '');
      
      if (componentNames.includes(baseName)) {
        const correctedPath = `dashboard/js/components/${path}`;
        debugLog(`Special case for component module: using ${correctedPath} instead of ${path}`);
        return new URL(correctedPath, basePath).href;
      }
    }
    
    // Handle paths that already start with the base path
    if (path.startsWith(basePath)) {
      debugLog(`Path already includes base path: ${path}`);
      return path;
    }
    
    // Remove leading slash if base path ends with slash and path starts with slash
    let normalizedPath = path;
    if (basePath.endsWith('/') && path.startsWith('/')) {
      normalizedPath = path.substring(1);
      debugLog(`Normalized path: ${normalizedPath}`);
    }
    
    // Construct full URL
    let fullPath;
    try {
      fullPath = new URL(normalizedPath, basePath).href;
      debugLog(`Resolved path: ${path} → ${fullPath}`);
    } catch (urlError) {
      debugLog(`Error constructing URL: ${urlError.message}`);
      // Fallback to simple string concatenation
      fullPath = basePath + (basePath.endsWith('/') ? '' : '/') + normalizedPath;
      debugLog(`Fallback path resolution: ${fullPath}`);
    }
    
    return fullPath;
  } catch (e) {
    debugLog(`Error resolving module path: ${e.message}`);
    // Return original path as fallback
    return path;
  }
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
      console.warn(`Using stub implementation for ${moduleName}`);
      
      // Try to get the panel element
      const panelElement = document.getElementById(`${panelName}-panel`);
      if (!panelElement) {
        console.warn(`Panel element not found: ${panelName}-panel`);
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
          console.log(`Retrying module load for ${moduleName}...`);
          
          // Remove from failed modules set to allow retry
          failedModules.delete(moduleName);
          
          // Remove warning
          warningElement.remove();
          
          // Try loading again
          try {
            const module = await safeImport(moduleName);
            if (module[initFunctionName]) {
              await module[initFunctionName]();
              console.log(`Successfully reloaded and initialized ${moduleName}`);
            }
          } catch (error) {
            console.error(`Failed to reload ${moduleName}:`, error);
          }
        });
      }
    }
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
 * Clear the module cache and failed modules list
 */
export function clearModuleCache() {
  moduleCache.clear();
  failedModules.clear();
  debugLog('Module cache cleared');
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
  };
}

// Export a test function to verify the module loader works
export function testModuleLoader() {
  return {
    status: 'Module loader initialized',
    timestamp: new Date().toISOString()
  };
}

/**
 * Resolve an import path relative to a base module
 * This is useful for modules that need to import their own dependencies
 * @param {string} importPath - Path to resolve
 * @param {string} baseModulePath - Path of the base module
 * @returns {string} Resolved path
 */
function resolveImportPath(importPath, baseModulePath) {
  try {
    debugLog(`Resolving import path: ${importPath} relative to ${baseModulePath}`);
    
    // If the import path is absolute, return it directly
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
      return importPath;
    }
    
    // If it's a relative path, resolve it against the base module path
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Get the directory of the base module
      const baseDir = baseModulePath.substring(0, baseModulePath.lastIndexOf('/') + 1);
      
      // Resolve the path
      const resolvedPath = new URL(importPath, new URL(baseDir, getExtensionBasePath())).href;
      debugLog(`Resolved relative import: ${resolvedPath}`);
      return resolvedPath;
    }
    
    // For non-relative imports, try to resolve against the extension root
    return resolveModulePath(importPath);
  } catch (e) {
    debugLog(`Error resolving import path: ${e.message}`);
    return importPath;
  }
}

// Export additional utility functions
export {
  getExtensionBasePath,
  resolveModulePath,
  resolveImportPath
};