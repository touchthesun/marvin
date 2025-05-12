// src/background/background.js
// Import directly for immediate use
import { LogManager } from '../utils/log-manager.js';

// Create logger instance directly without dependency container
const logger = new LogManager({
  isBackgroundScript: true,
  storageKey: 'marvin_background_logs',
  maxEntries: 2000
});

// Import other dependencies after logger is set up
import { container } from '../core/dependency-container.js';
import { ServiceRegistry } from '../core/service-registry.js';
import { UtilsRegistry } from '../core/utils-registry.js';

logger.log('info', 'Background script starting initialization');

/**
 * Register utilities directly before using container
 */
function registerUtilitiesDirectly() {
  logger.log('debug', 'Registering utilities directly');
  
  // Register LogManager first as it's used by others
  container.registerUtil('LogManager', LogManager);
  
  // Register other utilities from registry
  if (UtilsRegistry.formatting) {
    container.registerUtil('formatting', UtilsRegistry.formatting);
  }
  
  if (UtilsRegistry.timeout) {
    container.registerUtil('timeout', UtilsRegistry.timeout);
  }
  
  if (UtilsRegistry.ui) {
    container.registerUtil('ui', UtilsRegistry.ui);
  }
  
  logger.log('info', 'Utilities registered successfully');
}

/**
 * Initialize the background script
 */
async function initialize() {
  try {
    logger.log('info', 'Starting background script initialization...');
    
    // First, register utilities directly
    registerUtilitiesDirectly();
    
    // Then register services
    logger.log('info', 'Registering services...');
    ServiceRegistry.registerAll();
    
    // Initialize all services
    logger.log('info', 'Initializing services...');
    await ServiceRegistry.initializeAll();
    
    // Setup message handling
    setupMessageHandling();
    
    // Create public API that delegates to services
    createPublicAPI();
    
    logger.log('info', 'Background script initialization complete');
  } catch (error) {
    logger.log('error', 'Background script initialization failed:', error);
    console.error('Background script initialization failed:', error);
  }
}

/**
 * Set up message handling
 */
function setupMessageHandling() {
  logger.log('debug', 'Setting up message handling');
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Log the message for debugging
    logger.log('debug', 'Received message:', message);
    
    // Return true to indicate we'll send response asynchronously
    const isAsync = true;
    
    // Handle different message types
    switch (message.action) {
      case 'captureUrl':
        handleCaptureUrl(message, sender, sendResponse);
        return isAsync;
        
      case 'analyzeUrl':
        handleAnalyzeUrl(message, sender, sendResponse);
        return isAsync;
        
      case 'getActiveTasks':
        handleGetActiveTasks(message, sender, sendResponse);
        return isAsync;
        
      case 'cancelTask':
        handleCancelTask(message, sender, sendResponse);
        return isAsync;
        
      case 'retryTask':
        handleRetryTask(message, sender, sendResponse);
        return isAsync;
        
      case 'networkStatusChange':
        handleNetworkStatusChange(message, sender, sendResponse);
        // Synchronous response
        sendResponse({ success: true });
        return false;
        
      case 'updateSettings':
        handleUpdateSettings(message, sender, sendResponse);
        return isAsync;
    }
    
    // Default response for unhandled messages
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  });
  
  logger.log('info', 'Message handling set up successfully');
}

/**
 * Handle capture URL request by delegating to the appropriate service
 */
async function handleCaptureUrl(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing captureUrl request:', message.url);
    
    // Get the task service
    const taskService = container.getService('taskService');
    
    if (!taskService) {
      throw new Error('Task service not available');
    }
    
    // Prepare capture data
    const captureData = {
      url: message.url,
      ...message.options
    };
    
    // Create capture task
    const result = await taskService.createCaptureTask(captureData);
    
    sendResponse({
      success: true,
      data: result
    });
  } catch (error) {
    logger.log('error', 'Error processing captureUrl:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in captureUrl'
    });
  }
}

/**
 * Handle analyze URL request
 */
async function handleAnalyzeUrl(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing analyzeUrl request:', message.url);
    
    // Get the API service
    const apiService = container.getService('apiService');
    
    if (!apiService) {
      throw new Error('API service not available');
    }
    
    // Call the API
    const response = await apiService.fetchAPI('/api/v1/analysis/analyze', {
      method: 'POST',
      body: JSON.stringify({
        url: message.url,
        options: message.options
      })
    });
    
    if (response.success) {
      sendResponse({
        success: true,
        taskId: response.data.task_id,
        status: response.data.status
      });
    } else {
      throw new Error(response.error?.message || 'Analysis request failed');
    }
  } catch (error) {
    logger.log('error', 'Error processing analyzeUrl:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in analyzeUrl'
    });
  }
}

/**
 * Handle get active tasks request
 */
async function handleGetActiveTasks(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing getActiveTasks request');
    
    // Get the task service
    const taskService = container.getService('taskService');
    
    if (!taskService) {
      throw new Error('Task service not available');
    }
    
    // Get active tasks
    const activeTasks = taskService.getActiveTasks();
    
    sendResponse({
      success: true,
      tasks: activeTasks
    });
  } catch (error) {
    logger.log('error', 'Error processing getActiveTasks:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in getActiveTasks'
    });
  }
}

/**
 * Handle cancel task request
 */
async function handleCancelTask(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing cancelTask request:', message.taskId);
    
    // Get the task service
    const taskService = container.getService('taskService');
    
    if (!taskService) {
      throw new Error('Task service not available');
    }
    
    // Cancel task
    const result = await taskService.cancelTask(message.taskId);
    
    sendResponse({
      success: true,
      taskId: message.taskId,
      status: 'cancelled'
    });
  } catch (error) {
    logger.log('error', 'Error processing cancelTask:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in cancelTask'
    });
  }
}

/**
 * Handle retry task request
 */
async function handleRetryTask(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing retryTask request:', message.taskId);
    
    // Get the task service
    const taskService = container.getService('taskService');
    
    if (!taskService) {
      throw new Error('Task service not available');
    }
    
    // Retry task
    const result = await taskService.retryTask(message.taskId);
    
    sendResponse({
      success: true,
      taskId: message.taskId,
      status: 'retried'
    });
  } catch (error) {
    logger.log('error', 'Error processing retryTask:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in retryTask'
    });
  }
}

/**
 * Handle network status change
 */
function handleNetworkStatusChange(message, sender, sendResponse) {
  logger.log('info', 'Network status change:', message.isOnline ? 'online' : 'offline');
  
  // Get the status service if available
  try {
    const statusService = container.getService('statusService');
    if (statusService && statusService.updateNetworkStatus) {
      statusService.updateNetworkStatus(message.isOnline);
    }
  } catch (error) {
    logger.log('error', 'Error updating network status:', error);
  }
}

/**
 * Handle update settings request
 */
async function handleUpdateSettings(message, sender, sendResponse) {
  try {
    logger.log('info', 'Processing updateSettings request');
    
    // Get the storage service
    const storageService = container.getService('storageService');
    
    if (!storageService) {
      throw new Error('Storage service not available');
    }
    
    // Update settings
    await storageService.updateSettings(message.settings);
    
    sendResponse({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    logger.log('error', 'Error processing updateSettings:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error in updateSettings'
    });
  }
}

/**
 * Create public API that delegates to services
 * This makes the functionality available to other pages via chrome.extension.getBackgroundPage()
 */
function createPublicAPI() {
  logger.log('debug', 'Creating public API');
  
  // Use self instead of window for service worker context
  self.marvin = {
    // Delegate to task service
    captureUrl: async (url, options) => {
      try {
        const taskService = container.getService('taskService');
        if (!taskService) {
          throw new Error('Task service not available');
        }
        
        return await taskService.createCaptureTask({ url, ...options });
      } catch (error) {
        logger.log('error', 'Error in captureUrl API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Delegate to task service via API
    analyzeUrl: async (url, options) => {
      try {
        const apiService = container.getService('apiService');
        if (!apiService) {
          throw new Error('API service not available');
        }
        
        const response = await apiService.fetchAPI('/api/v1/analysis/analyze', {
          method: 'POST',
          body: JSON.stringify({ url, options })
        });
        
        return response;
      } catch (error) {
        logger.log('error', 'Error in analyzeUrl API call:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Get active tasks from task service
    getActiveTasks: async () => {
      try {
        const taskService = container.getService('taskService');
        if (!taskService) {
          throw new Error('Task service not available');
        }
        
        return taskService.getActiveTasks();
      } catch (error) {
        logger.log('error', 'Error in getActiveTasks API call:', error);
        return [];
      }
    },
    
    // Cancel task via task service
    cancelTask: async (taskId) => {
      try {
        const taskService = container.getService('taskService');
        if (!taskService) {
          throw new Error('Task service not available');
        }
        
        return await taskService.cancelTask(taskId);
      } catch (error) {
        logger.log('error', 'Error in cancelTask API call:', error);
        return false;
      }
    },
    
    // Retry task via task service
    retryTask: async (taskId) => {
      try {
        const taskService = container.getService('taskService');
        if (!taskService) {
          throw new Error('Task service not available');
        }
        
        return await taskService.retryTask(taskId);
      } catch (error) {
        logger.log('error', 'Error in retryTask API call:', error);
        return false;
      }
    }
  };
  
  logger.log('info', 'Public API created successfully');
}

// Add error handlers for service worker context
try {
  // Add global error handler
  self.addEventListener('error', (event) => {
    logger.log('error', 'Unhandled error in service worker:', event.error);
    console.error('Unhandled error in service worker:', event.error);
  });

  // Add unhandled rejection handler
  self.addEventListener('unhandledrejection', (event) => {
    logger.log('error', 'Unhandled promise rejection in service worker:', event.reason);
    console.error('Unhandled promise rejection in service worker:', event.reason);
  });
} catch (e) {
  logger.log('error', 'Error setting up error handlers:', e);
  console.error('Error setting up error handlers:', e);
}

// Initialize the background script
initialize();