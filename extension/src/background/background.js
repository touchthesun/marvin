import { container } from '@core/dependency-container.js';
import { ServiceRegistry } from '@core/service-registry.js';
import { UtilsRegistry } from '@core/utils-registry.js';
import { BackgroundService } from './background-service.js';

async function initialize() {
  try {
    console.log('Starting background script initialization...');
    
    // First, register utilities
    console.log('Registering utilities...');
    registerUtilities();
    
    // Then register services
    console.log('Registering services...');
    ServiceRegistry.registerAll();
    
    // Initialize all services
    console.log('Initializing services...');
    await ServiceRegistry.initializeAll();
    
    // Use the already imported BackgroundService
    console.log('Starting background service...');
    const backgroundService = new BackgroundService(container);
    
    await backgroundService.initialize();
    
    console.log('Background script initialization complete');
  } catch (error) {
    console.error('Background script initialization failed:', error);
  }
}

/**
 * Register all utilities in the dependency container
 */
function registerUtilities() {
  // Register top-level utilities
  if (UtilsRegistry.LogManager) {
    container.registerUtil('LogManager', UtilsRegistry.LogManager);
  }
  
  // Register nested utilities
  if (UtilsRegistry.formatting) {
    container.registerUtil('formatting', UtilsRegistry.formatting);
  }
  
  if (UtilsRegistry.timeout) {
    container.registerUtil('timeout', UtilsRegistry.timeout);
  }
  
  if (UtilsRegistry.ui) {
    container.registerUtil('ui', UtilsRegistry.ui);
  }
  
  if (UtilsRegistry.capture) {
    container.registerUtil('capture', UtilsRegistry.capture);
  }
  
  console.log('Utilities registered successfully');
}

// Add error handlers if in service worker context (where self is defined)
try {
  // Check for service worker context
  if (typeof self !== 'undefined') {
    // Add global error handler
    self.addEventListener('error', (event) => {
      console.error('Unhandled error in service worker:', event.error);
    });

    // Add unhandled rejection handler
    self.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection in service worker:', event.reason);
    });
  }
} catch (e) {
  console.error('Error setting up error handlers:', e);
}

// Initialize the background script
initialize();