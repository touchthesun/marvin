/**
 * Enhanced Diagnostic utilities for Marvin dashboard
 */
export class DiagnosticTools {
    /**
     * Initialize diagnostic tools
     */
    constructor() {
      this.memorySnapshots = [];
      this.intervalIds = [];
      this.resourceTimings = [];
      this.errors = [];
      
      // Setup error tracking
      this.setupErrorTracking();
    }
    
    /**
     * Set up global error tracking
     */
    setupErrorTracking() {
      // Store original console.error
      this.originalConsoleError = console.error;
      
      // Override console.error to capture errors
      console.error = (...args) => {
        // Call original method
        this.originalConsoleError.apply(console, args);
        
        // Store error
        this.errors.push({
          timestamp: Date.now(),
          message: args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        });
      };
      
      // Listen for uncaught errors
      window.addEventListener('error', (event) => {
        this.errors.push({
          timestamp: Date.now(),
          type: 'uncaught',
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error ? event.error.stack : null
        });
      });
      
      // Listen for unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.errors.push({
          timestamp: Date.now(),
          type: 'unhandledrejection',
          message: event.reason ? (event.reason.message || String(event.reason)) : 'Unknown promise rejection',
          stack: event.reason && event.reason.stack ? event.reason.stack : null
        });
      });
    }
    
    /**
     * Restore original console.error
     */
    restoreConsoleError() {
      if (this.originalConsoleError) {
        console.error = this.originalConsoleError;
      }
    }
    
    /**
     * Take a memory snapshot
     * @returns {Object|null} Memory snapshot or null if not supported
     */
    takeMemorySnapshot() {
      if (performance && performance.memory) {
        const snapshot = {
          timestamp: Date.now(),
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
        
        this.memorySnapshots.push(snapshot);
        return snapshot;
      }
      
      return null;
    }
    
    /**
     * Capture performance resource timings
     */
    captureResourceTimings() {
      if (performance && performance.getEntriesByType) {
        const resources = performance.getEntriesByType('resource');
        
        this.resourceTimings = resources.map(resource => ({
          name: resource.name,
          entryType: resource.entryType,
          startTime: resource.startTime,
          duration: resource.duration,
          initiatorType: resource.initiatorType,
          size: resource.transferSize || 0,
          timestamp: Date.now()
        }));
        
        return this.resourceTimings;
      }
      
      return null;
    }
    
    /**
     * Start monitoring memory usage
     * @param {number} interval - Interval in milliseconds
     * @param {Function} callback - Callback function
     * @returns {number} Interval ID
     */
    startMemoryMonitoring(interval = 1000, callback = null) {
      const intervalId = setInterval(() => {
        const snapshot = this.takeMemorySnapshot();
        
        if (snapshot && callback) {
          callback(snapshot);
        }
      }, interval);
      
      this.intervalIds.push(intervalId);
      return intervalId;
    }
    
    /**
     * Start monitoring for memory leaks
     * @param {number} interval - Interval in milliseconds
     * @param {number} threshold - Growth threshold in MB to trigger warning
     * @param {Function} callback - Callback function
     * @returns {number} Interval ID
     */
    startLeakDetection(interval = 5000, threshold = 5, callback = null) {
      let lastUsed = 0;
      
      const intervalId = setInterval(() => {
        const snapshot = this.takeMemorySnapshot();
        
        if (!snapshot) return;
        
        const usedMB = snapshot.usedJSHeapSize / (1024 * 1024);
        
        // First run, just store the value
        if (lastUsed === 0) {
          lastUsed = usedMB;
          return;
        }
        
        // Check for significant growth
        const growth = usedMB - lastUsed;
        
        if (growth > threshold) {
          const warning = {
            timestamp: Date.now(),
            message: `Possible memory leak detected: ${growth.toFixed(2)}MB growth in ${interval/1000}s`,
            before: lastUsed,
            after: usedMB,
            growth: growth
          };
          
          console.warn(warning.message);
          
          if (callback) {
            callback(warning);
          }
        }
        
        lastUsed = usedMB;
      }, interval);
      
      this.intervalIds.push(intervalId);
      return intervalId;
    }
    
    /**
     * Stop all monitoring
     */
    stopAllMonitoring() {
      this.intervalIds.forEach(id => clearInterval(id));
      this.intervalIds = [];
      this.restoreConsoleError();
    }
    
    /**
     * Get memory usage report
     * @returns {string} Formatted report
     */
    getMemoryReport() {
      if (this.memorySnapshots.length === 0) {
        return 'No memory snapshots available';
      }
      
      const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
      const first = this.memorySnapshots[0];
      
      const usedMBLatest = Math.round(latest.usedJSHeapSize / (1024 * 1024));
      const usedMBFirst = Math.round(first.usedJSHeapSize / (1024 * 1024));
      const totalMBLatest = Math.round(latest.totalJSHeapSize / (1024 * 1024));
      const limitMB = Math.round(latest.jsHeapSizeLimit / (1024 * 1024));
      
      const change = usedMBLatest - usedMBFirst;
      const changeText = change >= 0 ? `+${change}MB` : `${change}MB`;
      
      return `
Memory Usage: ${usedMBLatest}MB / ${totalMBLatest}MB (Limit: ${limitMB}MB)
Change since first snapshot: ${changeText}
Snapshots taken: ${this.memorySnapshots.length}
      `;
    }
    
    /**
     * Get detailed information about loaded modules
     * @returns {Promise<object>} Module information
     */
    async getLoadedModules() {
      const modules = [
        './js/components/navigation.js',
        './js/components/overview-panel.js',
        './js/components/capture-panel.js',
        './js/components/knowledge-panel.js',
        './js/components/assistant-panel.js',
        './js/components/settings-panel.js',
        './js/components/tasks-panel.js',
        './js/services/api-service.js',
        './js/services/notification-service.js',
        './js/services/status-service.js',
        './js/services/storage-service.js',
        './js/services/task-service.js'
      ];
      
      const results = {};
      
      for (const module of modules) {
        try {
          const testResult = await this.testModuleLoading(module);
          results[module] = testResult;
        } catch (error) {
          results[module] = {
            success: false,
            error: error.message,
            stack: error.stack
          };
        }
      }
      
      return results;
    }
    
    /**
     * Test module loading
     * @param {string} modulePath - Path to module
     * @returns {Promise<Object>} Test result
     */
    async testModuleLoading(modulePath) {
      const startTime = performance.now();
      const startMemory = performance.memory?.usedJSHeapSize;
      
      try {
        // webpackIgnore: true tells webpack to ignore this dynamic import
        const module = await import(/* webpackIgnore: true */ modulePath);
        
        const endTime = performance.now();
        const endMemory = performance.memory?.usedJSHeapSize;
        
        return {
          success: true,
          loadTime: endTime - startTime,
          memoryImpact: endMemory ? (endMemory - startMemory) / (1024 * 1024) : null,
          exports: Object.keys(module)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }
    
    /**
     * Check for circular references in objects
     * Can be useful for debugging memory leaks
     * @param {Object} obj - Object to check
     * @param {number} maxDepth - Maximum depth to check
     * @returns {Array} Paths to circular references
     */
    findCircularReferences(obj, maxDepth = 10) {
      const seen = new WeakMap();
      const paths = [];
      
      function detect(obj, path, depth) {
        if (depth > maxDepth) return;
        
        if (obj && typeof obj === 'object') {
          if (seen.has(obj)) {
            paths.push(`${path} -> ${seen.get(obj)}`);
            return;
          }
          
          seen.set(obj, path);
          
          for (const [key, value] of Object.entries(obj)) {
            detect(value, `${path}.${key}`, depth + 1);
          }
        }
      }
      
      detect(obj, 'root', 0);
      return paths;
    }
    
    /**
     * Export all diagnostic data
     * @returns {Object} All diagnostic data
     */
    exportDiagnosticData() {
      return {
        timestamp: new Date().toISOString(),
        memorySnapshots: this.memorySnapshots,
        resourceTimings: this.resourceTimings,
        errors: this.errors,
        browser: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack,
          hardwareConcurrency: navigator.hardwareConcurrency,
          maxTouchPoints: navigator.maxTouchPoints
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
          colorDepth: window.screen.colorDepth,
          pixelDepth: window.screen.pixelDepth,
          orientation: window.screen.orientation ? {
            type: window.screen.orientation.type,
            angle: window.screen.orientation.angle
          } : null
        }
      };
    }
    
    /**
     * Clear error log
     */
    clearErrors() {
      this.errors = [];
    }
    
    /**
     * Get list of recorded errors
     */
    getErrors() {
      return this.errors;
    }
}