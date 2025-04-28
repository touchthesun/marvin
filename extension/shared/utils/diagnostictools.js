// DiagnosticTools.js - Standalone diagnostic utilities for Marvin extension
// Exporting to the global scope for non-module scripts

/**
 * Diagnostic tools for extension troubleshooting
 * Provides memory monitoring, module loading tests, and other diagnostic functions
 */
class DiagnosticTools {
  constructor() {
    this.logs = [];
    this.monitors = {
      memory: null
    };
    console.log('DiagnosticTools initialized');
  }

  /**
   * Take a snapshot of memory usage
   * @returns {object|null} Memory snapshot or null if not available
   */
  takeMemorySnapshot() {
    if (performance && performance.memory) {
      return {
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Start periodic memory monitoring
   * @param {number} intervalMs - Monitoring interval in milliseconds
   * @param {function} callback - Function to call with each snapshot
   * @returns {number} Interval ID
   */
  startMemoryMonitoring(intervalMs, callback) {
    if (this.monitors.memory) {
      clearInterval(this.monitors.memory);
    }

    this.monitors.memory = setInterval(() => {
      const snapshot = this.takeMemorySnapshot();
      if (snapshot && callback) {
        callback(snapshot);
      }
    }, intervalMs);

    return this.monitors.memory;
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring() {
    if (this.monitors.memory) {
      clearInterval(this.monitors.memory);
      this.monitors.memory = null;
    }
  }

  /**
   * Test loading a module
   * @param {string} modulePath - Path to module to test
   * @returns {Promise<object>} Test result
   */
  async testModuleLoading(modulePath) {
    try {
      const startTime = performance.now();
      
      // Use fetch to test if a file exists and can be loaded
      const url = chrome.runtime.getURL(modulePath);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load module: ${response.status} ${response.statusText}`);
      }
      
      const endTime = performance.now();
      
      return {
        success: true,
        loadTime: endTime - startTime,
        exports: ['File loaded successfully']
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get status of all loaded modules
   * @returns {Promise<object>} Module statuses
   */
  async getLoadedModules() {
    const corePaths = [
      'dashboard/js/components/overview-panel.js',
      'dashboard/js/components/capture-panel.js',
      'dashboard/js/components/knowledge-panel.js',
      'dashboard/js/components/settings-panel.js',
      'shared/utils/log-manager.js'
    ];

    const results = {};
    
    for (const path of corePaths) {
      results[path] = await this.testModuleLoading(path);
    }
    
    return results;
  }
}

// Export to global scope for non-module scripts
window.DiagnosticTools = DiagnosticTools;