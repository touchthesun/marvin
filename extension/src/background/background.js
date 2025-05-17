// src/background/background.js
// Import the centralized container initializer
import { LogManager } from '../utils/log-manager.js';
import { initializeContainer } from '../core/container-init.js';
import { container } from '../core/dependency-container.js';
import { BackgroundService } from './background-service.js';

/**
 * Initialize the background script using centralized container initialization
 */
async function initialize() {
  let logger;
  try {
    // Initialize the container with all utilities, services, etc.
    console.log('Starting background script initialization...');
    
    const initResult = await initializeContainer({
      isBackgroundScript: true,
      context: 'background'
    });
    
    // Get logger from the initialized container
    logger = new LogManager({
      isBackgroundScript: true,
      context: 'background',
      maxEntries: 2000
    });
    
    logger.info('Container initialized successfully:', initResult);
    
    // Create and initialize the background service
    logger.info('Creating background service...');
    const backgroundService = new BackgroundService(container);
    await backgroundService.initialize();
    
    // Create public API that delegates to the background service
    logger.info('Creating public API...');
    createPublicAPI(backgroundService);
    
    // Register the background service with the container for other components to access
    container.registerService('backgroundService', () => backgroundService);
    
    logger.info('Background script initialization complete');
    logger.debug('Container status:', {
      utilities: initResult.utilities.count,
      services: initResult.services.count,
      components: initResult.components.count
    });
    
  } catch (error) {
    if (logger) {
      logger.error('Background script initialization failed:', error);
    }
    console.error('Background script initialization failed:', error);
    
    // Create a basic logger for error reporting if container init failed
    if (!logger) {
      const { LogManager } = await import('../utils/log-manager.js');
      logger = new LogManager({
        isBackgroundScript: true,
        context: 'background-error',
        maxEntries: 1000
      });
      logger.error('Container initialization failed:', error);
    }
    
    // Don't throw - keep the extension functional even if some parts fail
  }
}

/**
 * Create public API that delegates to the background service
 * This makes the functionality available to other parts of the extension
 */
function createPublicAPI(backgroundService) {
  console.log('Creating public API');
  
  // Use self instead of window for service worker context (MV3 requirement)
  self.marvin = {
    // Delegate all methods to the background service
    captureUrl: async (url, options) => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleCaptureUrl({ url, options }, {}, resolve);
        });
      } catch (error) {
        console.error('Error in captureUrl API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    analyzeUrl: async (url, options) => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleAnalyzeUrl({ url, options }, {}, resolve);
        });
      } catch (error) {
        console.error('Error in analyzeUrl API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    getActiveTasks: async () => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleGetActiveTasks({}, {}, resolve);
        });
      } catch (error) {
        console.error('Error in getActiveTasks API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    cancelTask: async (taskId) => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleCancelTask({ taskId }, {}, resolve);
        });
      } catch (error) {
        console.error('Error in cancelTask API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    retryTask: async (taskId) => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleRetryTask({ taskId }, {}, resolve);
        });
      } catch (error) {
        console.error('Error in retryTask API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    updateSettings: async (settings) => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleUpdateSettings({ settings }, {}, resolve);
        });
      } catch (error) {
        console.error('Error in updateSettings API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Add convenience methods
    ping: async () => {
      try {
        return new Promise((resolve) => {
          backgroundService.handlePing({}, {}, resolve);
        });
      } catch (error) {
        console.error('Error in ping API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    getComponentStatus: async () => {
      try {
        return new Promise((resolve) => {
          backgroundService.handleGetComponentStatus({}, {}, resolve);
        });
      } catch (error) {
        console.error('Error in getComponentStatus API call:', error);
        return { success: false, error: error.message };
      }
    }
  };
  
  console.log('Public API created successfully');
}

// Add error handlers for service worker context (MV3 requirement)
try {
  // Add global error handler
  self.addEventListener('error', (event) => {
    console.error('Unhandled error in service worker:', event.error);
  });

  // Add unhandled rejection handler
  self.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection in service worker:', event.reason);
  });
} catch (e) {
  console.error('Error setting up error handlers:', e);
}

// Initialize the background script
initialize();