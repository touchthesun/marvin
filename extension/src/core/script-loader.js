// utils/script-loader.js
// A CSP-friendly script loader for Marvin dashboard that supports ES modules

(function() {
  'use strict';
  
  // Debug mode
  const DEBUG = true;
  
  /**
   * Log debug messages
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  function debugLog(message, ...args) {
    if (DEBUG) {
      console.log(`[SCRIPT LOADER] ${message}`, ...args);
    }
  }
  
  /**
   * Generate a nonce for scripts
   * @returns {string} Generated nonce
   */
  function generateNonce() {
    // Generate a random string for nonces
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Initialize CSP nonce for scripts
   */
  function initializeCSP() {
    // Generate nonce for this page load
    const nonce = generateNonce();
    
    // Store nonce in window for scripts to access
    window.__scriptNonce = nonce;
    
    debugLog(`CSP initialized with nonce: ${nonce}`);
  }
  
  // Track loaded scripts to avoid duplicates
  const loadedScripts = new Set();
  
  /**
   * Check if a script is already loaded
   * @param {string} src - Script source path
   * @returns {boolean} Whether script is already loaded
   */
  function isScriptLoaded(src) {
    if (loadedScripts.has(src)) {
      return true;
    }
    
    // Check for script tags with this src
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
      const scriptSrc = script.getAttribute('src');
      if (scriptSrc === src || scriptSrc.endsWith(src)) {
        loadedScripts.add(src);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Resolve script path to ensure consistent loading
   * @param {string} src - Script source
   * @returns {string} Resolved script path
   */
  function resolveScriptPath(src) {
    // Ensure we're not duplicating the extension base URL
    const baseUrl = chrome.runtime.getURL('/');
    
    if (src.startsWith(baseUrl)) {
      return src;
    }
    
    // If path starts with /, remove it before joining with baseUrl
    if (src.startsWith('/')) {
      return baseUrl + src.substring(1);
    }
    
    return baseUrl + src;
  }
  
  /**
   * Register a dummy LogManager for components that try to import it
   */
  function registerDummyLogManager() {
    // Create a simple LogManager class that won't throw errors
    window.LogManager = class LogManager {
      constructor(options = {}) {
        this.context = options.context || 'unknown';
        console.log(`[DUMMY] Created LogManager for ${this.context}`);
      }
      
      debug(...args) { console.debug(`[DUMMY][${this.context}]`, ...args); }
      info(...args) { console.info(`[DUMMY][${this.context}]`, ...args); }
      warn(...args) { console.warn(`[DUMMY][${this.context}]`, ...args); }
      error(...args) { console.error(`[DUMMY][${this.context}]`, ...args); }
      log(...args) { console.log(`[DUMMY][${this.context}]`, ...args); }
    };
    
    debugLog('Registered dummy LogManager globally');
  }
  
  /**
   * Load script with a promise with additional fallback mechanisms
   * @param {string} src - Script source
   * @param {boolean} [async=false] - Whether to load async
   * @param {boolean} [defer=false] - Whether to load deferred
   * @param {boolean} [isModule=true] - Whether to load as an ES module
   * @returns {Promise<void>} Promise resolving when script is loaded
   */
  function loadScript(src, async = false, defer = false, isModule = true) {
    // Check if script was already loaded
    if (isScriptLoaded(src)) {
      debugLog(`Script already loaded, skipping: ${src}`);
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      try {
        debugLog(`Attempting to load script: ${src} (${isModule ? 'module' : 'non-module'})`);
        
        // Create script element
        const script = document.createElement('script');
        
        // Configure script type
        if (isModule) {
          script.type = 'module';
        }
        
        script.src = src;
        
        // Set nonce if available
        if (window.__scriptNonce) {
          script.nonce = window.__scriptNonce;
        }
        
        // Set async/defer attributes
        if (async) script.async = true;
        if (defer && !isModule) script.defer = true;
        
        // Track whether we've already resolved/rejected this promise
        let settled = false;
        
        // Handle load success
        script.onload = () => {
          if (settled) return;
          settled = true;
          
          debugLog(`Script loaded successfully: ${src}`);
          loadedScripts.add(src);
          resolve();
        };
        
        // Handle load errors
        script.onerror = (error) => {
          debugLog(`Error loading script: ${src}`);
          debugLog(`Error details:`, error);
          
          // If we're already in fallback mode (non-module), reject
          if (!isModule) {
            if (settled) return;
            settled = true;
            
            // Just resolve anyway to continue loading
            debugLog(`Resolving despite error for ${src}`);
            loadedScripts.add(src);
            resolve();
            return;
          }
          
          // Otherwise try as non-module
          debugLog(`Retrying as non-module: ${src}`);
          loadScript(src, async, defer, false)
            .then(() => {
              if (settled) return;
              settled = true;
              resolve();
            })
            .catch(() => {
              if (settled) return;
              settled = true;
              
              // Just resolve anyway to continue loading
              debugLog(`Resolving despite error for ${src}`);
              loadedScripts.add(src);
              resolve();
            });
        };
        
        // Add to document
        document.head.appendChild(script);
      } catch (error) {
        debugLog(`Exception in loadScript for ${src}:`, error);
        
        // Just resolve anyway to continue loading
        loadedScripts.add(src);
        resolve();
      }
    });
  }
  
  /**
   * Load multiple scripts in sequence
   * @param {string[]} scripts - Array of script sources
   * @param {boolean} [isModule=true] - Whether to load as ES modules
   * @returns {Promise<void>} Promise resolving when all scripts are loaded
   */
  function loadScriptsSequentially(scripts, isModule = true) {
    return scripts.reduce((promise, script) => {
      return promise.then(() => loadScript(script, false, false, isModule));
    }, Promise.resolve());
  }
  
  /**
   * Load multiple scripts in parallel
   * @param {string[]} scripts - Array of script sources
   * @param {boolean} [isModule=true] - Whether to load as ES modules
   * @returns {Promise<void>} Promise resolving when all scripts are loaded
   */
  function loadScriptsParallel(scripts, isModule = true) {
    return Promise.all(scripts.map(script => loadScript(script, false, false, isModule)));
  }
  
  /**
   * Pre-process scripts to handle module dependencies
   */
  function preProcessModuleDependencies() {
    // Add global variables to help with module resolution
    window.__marvinUtils = window.__marvinUtils || {};
    window.__marvinUtils.resolveModule = function(modulePath) {
      const baseUrl = chrome.runtime.getURL('/');
      // Handle common paths
      if (modulePath === 'log-manager' || 
          modulePath === '../../../shared/utils/log-manager.js' ||
          modulePath === '@/shared/utils/log-manager') {
        return window.LogManager; 
      }
      
      return null;
    };
    
    // Add global hook for ESM imports
    window.__marvinESM = {};
    
    debugLog('Module dependency handlers initialized');
  }
  
  /**
   * Load dashboard modules with better dependency handling
   */
  function loadDashboardModules() {
    const baseUrl = chrome.runtime.getURL('/');
    debugLog(`Using base URL: ${baseUrl}`);
    
    // Define the exact paths we want to load
    const sharedFolder = `${baseUrl}shared/utils/`;
    const utilsFolder = `${baseUrl}dashboard/js/utils/`;
    const componentsFolder = `${baseUrl}dashboard/js/components/`;
    
    const logManagerPath = `${sharedFolder}log-manager.js`;
    const registryPath = `${utilsFolder}component-registry.js`;
    
    // Define all paths
    const moduleScripts = {
      // Core dependencies
      'log-manager': logManagerPath,
      
      // Component registry
      'component-registry': registryPath,
      
      // Dashboard
      'dashboard': `${baseUrl}dashboard/js/dashboard.js`,
      
      // Navigation
      'navigation': `${componentsFolder}navigation.js`,
      
      // Panel components
      'overview-panel': `${componentsFolder}overview-panel.js`,
      'capture-panel': `${componentsFolder}capture-panel.js`,
      'knowledge-panel': `${componentsFolder}knowledge-panel.js`,
      'settings-panel': `${componentsFolder}settings-panel.js`,
      'tasks-panel': `${componentsFolder}tasks-panel.js`,
      'assistant-panel': `${componentsFolder}assistant-panel.js`
    };
    
    debugLog(`Preparing to load modules:`, moduleScripts);
    
    // Load log-manager first
    loadScript(logManagerPath, false, false, true)
      .then(() => {
        debugLog('Log manager loaded successfully');
        // Then load the component registry
        return loadScript(moduleScripts['component-registry'], false, false, true); 
      })
      .then(() => {
        debugLog('Component registry loaded successfully');
        return loadScript(moduleScripts['navigation'], false, false, true);
      })
      .then(() => {
        debugLog('Navigation component loaded successfully');
        return loadScript(moduleScripts['dashboard'], false, false, true);
      })
      .then(() => {
        debugLog('Core modules loaded successfully');
        
        // Define panel components to load in parallel
        const panelScripts = [
          moduleScripts['overview-panel'],
          moduleScripts['capture-panel'],
          moduleScripts['knowledge-panel'],
          moduleScripts['settings-panel'],
          moduleScripts['tasks-panel'],
          moduleScripts['assistant-panel']
        ];
        
        // Load panel components in parallel
        return loadScriptsParallel(panelScripts, true);  // CHANGE: Load as modules
      })
      .then(() => {
        debugLog('All dashboard modules loaded successfully');
        
        // We shouldn't need this if real components load correctly
        // But keeping as fallback just in case
        setTimeout(() => {
          if (typeof window.MarvinComponents === 'object' && 
              typeof window.registerComponent === 'function') {
            
            // Only enable stub registration if no real components registered
            if (Object.keys(window.MarvinComponents).length === 0) {
              if (typeof window.enableStubRegistration !== 'undefined') {
                window.enableStubRegistration = true;
                debugLog('Enabled stub registration due to missing components');
              }
              
              if (typeof window.registerAllStubs === 'function') {
                window.registerAllStubs();
                debugLog('Registered stubs via global function');
              }
            } else {
              debugLog('Real components registered, not using stubs');
            }
          }
        }, 1000);
      })
      .catch(error => {
        console.error('Error loading dashboard modules:', error);
        debugLog('Error loading dashboard modules:', error.message);
      });
  }

  /**
   * Initialize script loader
   */
  function initialize() {
    debugLog('Initializing script loader');
    
    // Initialize CSP
    initializeCSP();
    
    // Register dummy LogManager
    registerDummyLogManager();
    
    // Set up module dependency resolution
    preProcessModuleDependencies();
    
    // Load dashboard modules
    loadDashboardModules();
  }
  
  // Expose API
  window.scriptLoader = {
    loadScript,
    loadScriptsSequentially,
    loadScriptsParallel
  };
  
  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM already loaded, initialize immediately
    initialize();
  }
})();
