// src/background/background.js
import { LogManager } from '../utils/log-manager.js';
import { ensureContainerInitialized } from '../core/container-init.js';
import { container } from '../core/dependency-container.js';
import { BackgroundService } from './background-service.js';

/**
 * Background Script Component
 * Main service worker component for the Marvin extension
 */
const BackgroundScript = {
  // Resource tracking arrays
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  
  // Component state
  initialized: false,
  _logger: null,
  _backgroundService: null,
  
  /**
   * Initialize the background script
   * @returns {Promise<boolean>} Success status
   */
  async initBackgroundScript() {
    try {
      // Create logger directly
      this._logger = new LogManager({
        context: 'background',
        isBackgroundScript: true,
        maxEntries: 2000
      });
      
      this._logger.info('Starting background script initialization');
      
      // Check if already initialized
      if (this.initialized) {
        this._logger.debug('Background script already initialized, skipping');
        return true;
      }
      
      // Ensure container is initialized
      const initResult = await ensureContainerInitialized({
        isBackgroundScript: true,
        context: 'background'
      });
      
      this._logger.debug('Container initialization result:', initResult);
      
      // Create and initialize the background service
      this._logger.info('Creating background service...');
      this._backgroundService = new BackgroundService(container);
      await this._backgroundService.initialize();
      
      // Create public API
      this.createPublicAPI();
      
      // Register the background service with the container
      container.registerService('backgroundService', () => this._backgroundService);
      
      // Set up service worker event listeners
      this.setupServiceWorkerEvents();
      
      this.initialized = true;
      this._logger.info('Background script initialization completed successfully');
      return true;
      
    } catch (error) {
      this._logger?.error('Error initializing background script:', error);
      
      // Create a basic logger for error reporting if container init failed
      if (!this._logger) {
        this._logger = new LogManager({
          isBackgroundScript: true,
          context: 'background-error',
          maxEntries: 1000
        });
        this._logger.error('Container initialization failed:', error);
      }
      
      return false;
    }
  },
  
  /**
   * Set up service worker event listeners
   */
  setupServiceWorkerEvents() {
    try {
      // Add global error handler
      const errorHandler = (event) => {
        this._logger.error('Unhandled error in service worker:', event.error);
      };
      
      // Add unhandled rejection handler
      const rejectionHandler = (event) => {
        this._logger.error('Unhandled promise rejection in service worker:', event.reason);
      };
      
      // Add install handler
      const installHandler = (event) => {
        this._logger.info('Service worker installing...');
        // Skip waiting to activate immediately
        event.waitUntil(self.skipWaiting());
      };
      
      // Add activate handler
      const activateHandler = (event) => {
        this._logger.info('Service worker activating...');
        // Claim clients to ensure the service worker controls all pages
        event.waitUntil(self.clients.claim());
      };
      
      // Add fetch handler
      const fetchHandler = (event) => {
        this._logger.debug('Service worker fetch:', event.request.url);
      };
      
      // Add message handler
      const messageHandler = (event) => {
        this._logger.debug('Service worker message received:', event.data);
        if (this._backgroundService) {
          this._backgroundService.handleMessage(event.data, event.source, event.ports[0]);
        }
      };
      
      // Add all event listeners
      self.addEventListener('error', errorHandler);
      self.addEventListener('unhandledrejection', rejectionHandler);
      self.addEventListener('install', installHandler);
      self.addEventListener('activate', activateHandler);
      self.addEventListener('fetch', fetchHandler);
      self.addEventListener('message', messageHandler);
      
      // Track listeners for cleanup
      this._eventListeners.push(
        { target: self, type: 'error', listener: errorHandler },
        { target: self, type: 'unhandledrejection', listener: rejectionHandler },
        { target: self, type: 'install', listener: installHandler },
        { target: self, type: 'activate', listener: activateHandler },
        { target: self, type: 'fetch', listener: fetchHandler },
        { target: self, type: 'message', listener: messageHandler }
      );
      
      this._logger.debug('Service worker event listeners set up successfully');
    } catch (error) {
      this._logger.error('Error setting up service worker events:', error);
    }
  },
  
  /**
   * Create public API that delegates to the background service
   */
  createPublicAPI() {
    try {
      this._logger.info('Creating public API');
      
      // Use self instead of window for service worker context
      self.marvin = {
        // Delegate all methods to the background service
        captureUrl: async (url, options) => {
          try {
            return await this._backgroundService.handleCaptureUrl({ url, options });
          } catch (error) {
            this._logger.error('Error in captureUrl API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        analyzeUrl: async (url, options) => {
          try {
            return await this._backgroundService.handleAnalyzeUrl({ url, options });
          } catch (error) {
            this._logger.error('Error in analyzeUrl API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        getActiveTasks: async () => {
          try {
            return await this._backgroundService.handleGetActiveTasks();
          } catch (error) {
            this._logger.error('Error in getActiveTasks API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        cancelTask: async (taskId) => {
          try {
            return await this._backgroundService.handleCancelTask({ taskId });
          } catch (error) {
            this._logger.error('Error in cancelTask API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        retryTask: async (taskId) => {
          try {
            return await this._backgroundService.handleRetryTask({ taskId });
          } catch (error) {
            this._logger.error('Error in retryTask API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        updateSettings: async (settings) => {
          try {
            return await this._backgroundService.handleUpdateSettings({ settings });
          } catch (error) {
            this._logger.error('Error in updateSettings API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        // Add convenience methods
        ping: async () => {
          try {
            return await this._backgroundService.handlePing();
          } catch (error) {
            this._logger.error('Error in ping API call:', error);
            return { success: false, error: error.message };
          }
        },
        
        getComponentStatus: async () => {
          try {
            return await this._backgroundService.handleGetComponentStatus();
          } catch (error) {
            this._logger.error('Error in getComponentStatus API call:', error);
            return { success: false, error: error.message };
          }
        }
      };
      
      this._logger.info('Public API created successfully');
    } catch (error) {
      this._logger.error('Error creating public API:', error);
    }
  },
  
  /**
   * Clean up background script resources
   */
  cleanup() {
    this._logger?.info('Cleaning up background script resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => clearTimeout(id));
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => clearInterval(id));
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({target, type, listener}) => {
      try {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, listener);
        }
      } catch (error) {
        this._logger?.warn('Error removing event listener:', error);
      }
    });
    this._eventListeners = [];
    
    // Clean up background service
    if (this._backgroundService) {
      try {
        this._backgroundService.cleanup();
      } catch (error) {
        this._logger?.warn('Error cleaning up background service:', error);
      }
      this._backgroundService = null;
    }
    
    this.initialized = false;
    this._logger?.debug('Background script cleanup completed');
  }
};

// Initialize the background script
BackgroundScript.initBackgroundScript().catch(error => {
  console.error('Fatal error initializing background script:', error);
});

// Export for testing
export { BackgroundScript };