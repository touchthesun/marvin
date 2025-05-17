// src/popup/diagnostics.js - Updated to use centralized initialization
import { LogManager } from '../utils/log-manager.js';
import { ensureContainerInitialized, getContainerStatus } from '../core/container-init.js';
import { container } from '../core/dependency-container.js';
import { componentSystem } from '../core/component-system.js';

/**
 * Diagnostics tool for the Marvin extension
 * Uses centralized container initialization
 */

let initialized = false;
let messageService = null;
let logger = null;

/**
 * Initialize services using centralized container initialization
 */
async function initializeServices() {
  if (initialized) return;
  
  try {
    // Use centralized container initialization
    const initResult = await ensureContainerInitialized({
      isBackgroundScript: false,
      context: 'diagnostics'
    });
    
    console.log('Container initialized for diagnostics:', initResult);
    
    // Get services from container
    messageService = container.getService('messageService');
    
    // Initialize logger
    logger = new LogManager({
      context: 'diagnostics',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    initialized = true;
    logger.info('Diagnostics services initialized');
  } catch (error) {
    console.error('Error initializing services:', error);
    throw error;
  }
}

// Initialize diagnostic tools on DOM load
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Initialize services first
    await initializeServices();
    
    logger.info('Diagnostics page loaded');
    
    // Update status to show diagnostic tools are initializing
    updateStatus('Initializing diagnostic tools...', 'info');
    
    // Set up all event listeners first (before other operations)
    setupEventListeners();
    
    // Test background script connection
    const backgroundReady = await testBackgroundConnection();
    if (!backgroundReady) {
      logger.warn('Background script may not be properly configured for all diagnostic actions');
      updateStatus('Background script may not support all diagnostic actions', 'warning');
    }
    
    // Update diagnostic tools status
    const diagnosticStatus = document.getElementById('diagnostic-tools-status');
    if (diagnosticStatus) {
      diagnosticStatus.className = 'diagnostic-status import-success';
      diagnosticStatus.textContent = 'Diagnostic tools initialized (Centralized Container Init)';
    }
    
    // Run automatic checks
    await runAutomaticChecks();
    
    updateStatus('Diagnostic tools ready', 'success');
  } catch (error) {
    logger?.error('Error initializing diagnostic tools:', error);
    console.error('Error initializing diagnostic tools:', error);
    updateStatus(`Error initializing: ${error.message}`, 'error');
    
    const diagnosticStatus = document.getElementById('diagnostic-tools-status');
    if (diagnosticStatus) {
      diagnosticStatus.className = 'diagnostic-status import-error';
      diagnosticStatus.textContent = `Error: ${error.message}`;
    }
  }
});

/**
 * Update status message
 */
function updateStatus(message, type = 'info') {
  const statusContainer = document.getElementById('status-container');
  const statusMessage = document.getElementById('status-message');
  
  if (!statusContainer || !statusMessage) return;
  
  // Remove existing status classes
  statusContainer.classList.remove('error', 'success', 'warning');
  
  // Add new status class
  if (type === 'error') {
    statusContainer.classList.add('error');
  } else if (type === 'success') {
    statusContainer.classList.add('success');
  } else if (type === 'warning') {
    statusContainer.classList.add('warning');
  }
  
  // Update message
  statusMessage.textContent = message;
  
  // Log message
  if (logger) {
    logger.log(type, message);
  }
}

/**
 * Log result to output container
 */
function logResult(title, data) {
  const resultOutput = document.getElementById('result-output');
  if (!resultOutput) return;
  
  // Format data as JSON string if it's an object
  const formattedData = typeof data === 'object' 
    ? JSON.stringify(data, null, 2) 
    : String(data);
  
  // Add to output
  resultOutput.textContent += `\n\n=== ${title} ===\n${formattedData}`;
  
  // Scroll to bottom
  resultOutput.scrollTop = resultOutput.scrollHeight;
  
  if (logger) {
    logger.debug(`Logged result: ${title}`);
  }
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  if (logger) {
    logger.debug('Setting up event listeners');
  }
  
  // Helper function to safely add event listener
  function addEventListenerSafely(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener(event, handler);
      if (logger) {
        logger.debug(`Added ${event} listener to ${elementId}`);
      }
    } else {
      if (logger) {
        logger.warn(`Element with ID '${elementId}' not found, skipping event listener`);
      }
    }
  }
  
  // Clear results button
  addEventListenerSafely('clear-results', 'click', function() {
    const resultOutput = document.getElementById('result-output');
    if (resultOutput) {
      resultOutput.textContent = '';
    }
    if (logger) {
      logger.debug('Results cleared');
    }
  });
  
  // Extension info check
  addEventListenerSafely('check-extension', 'click', () => checkExtensionInfo());
  
  // Environment check
  addEventListenerSafely('check-environment', 'click', () => checkEnvironment());
  
  // Storage check
  addEventListenerSafely('check-storage', 'click', () => checkStorage());
  
  // Memory check
  addEventListenerSafely('check-memory', 'click', () => checkMemory());
  
  // Memory monitoring
  addEventListenerSafely('start-memory-monitoring', 'click', () => startMemoryMonitoring());
  addEventListenerSafely('stop-memory-monitoring', 'click', () => stopMemoryMonitoring());
  
  // Background connection test
  addEventListenerSafely('ping-background', 'click', () => testBackgroundConnection());
  
  // Component system test
  addEventListenerSafely('test-component-system', 'click', () => testComponentSystem());
  
  // Message statistics
  addEventListenerSafely('get-message-stats', 'click', () => getMessageStatistics());
  addEventListenerSafely('reset-message-stats', 'click', () => resetMessageStatistics());
  
  if (logger) {
    logger.debug('Event listeners set up successfully');
  }
}

/**
 * Run automatic checks on initialization
 */
async function runAutomaticChecks() {
  if (logger) {
    logger.debug('Running automatic checks');
  }
  
  // Check extension info automatically
  await checkExtensionInfo();
  
  // Check environment automatically
  await checkEnvironment();
  
  // Test background connection
  await testBackgroundConnection();
  
  // Test component system
  await testComponentSystem();
  
  // Get initial message statistics
  await getMessageStatistics();
}

/**
 * Check extension information
 */
async function checkExtensionInfo() {
  try {
    updateStatus('Checking extension info...', 'info');
    
    const extensionInfo = document.getElementById('extension-info');
    if (!extensionInfo) return;
    
    // Get manifest
    const manifest = chrome.runtime.getManifest();
    
    // Format info
    const info = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      manifestVersion: manifest.manifest_version,
      permissions: manifest.permissions || [],
      background: manifest.background?.service_worker ? 'Service Worker' : 'None',
      contentScripts: manifest.content_scripts?.length || 0
    };
    
    // Update display
    extensionInfo.innerHTML = `
      <div><strong>Name:</strong> ${info.name}</div>
      <div><strong>Version:</strong> ${info.version}</div>
      <div><strong>Description:</strong> ${info.description}</div>
      <div><strong>Manifest Version:</strong> ${info.manifestVersion}</div>
      <div><strong>Background Type:</strong> ${info.background}</div>
      <div><strong>Content Scripts:</strong> ${info.contentScripts}</div>
      <div><strong>Permissions:</strong> ${info.permissions.join(', ') || 'None'}</div>
    `;
    
    // Log result
    logResult('Extension Info', info);
    
    updateStatus('Extension info retrieved', 'success');
  } catch (error) {
    if (logger) {
      logger.error('Error checking extension info:', error);
    }
    updateStatus(`Error checking extension info: ${error.message}`, 'error');
  }
}

/**
 * Check environment information
 */
async function checkEnvironment() {
  try {
    updateStatus('Checking environment...', 'info');
    
    const environmentInfo = document.getElementById('environment-info');
    if (!environmentInfo) return;
    
    // Get browser info
    const userAgent = navigator.userAgent;
    
    function detectBrowserName(userAgent) {
      if (userAgent.includes('Firefox')) {
        return 'Firefox';
      } else if (userAgent.includes('Edg')) {
        return 'Microsoft Edge';
      } else if (userAgent.includes('Chrome')) {
        return 'Chrome';
      } else if (userAgent.includes('Safari')) {
        return 'Safari';
      } else {
        return 'Unknown';
      }
    }
    
    function detectBrowserVersion(userAgent) {
      let version = 'Unknown';
      
      if (userAgent.includes('Chrome/')) {
        const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
        version = match ? match[1] : 'Unknown';
      } else if (userAgent.includes('Edg/')) {
        const match = userAgent.match(/Edg\/(\d+\.\d+)/);
        version = match ? match[1] : 'Unknown';
      } else if (userAgent.includes('Firefox/')) {
        const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
        version = match ? match[1] : 'Unknown';
      } else if (userAgent.includes('Safari/')) {
        const match = userAgent.match(/Version\/(\d+\.\d+)/);
        version = match ? match[1] : 'Unknown';
      }
      
      return version;
    }
    
    // Get browser info
    const browserName = detectBrowserName(userAgent);
    const browserVersion = detectBrowserVersion(userAgent);
    
    // Get extension context info
    const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined';
    const hasWindowAccess = typeof window !== 'undefined';
    const hasSelfAccess = typeof self !== 'undefined';
    const hasDocumentAccess = typeof document !== 'undefined';
    
    // Format info
    const info = {
      browserName,
      browserVersion,
      userAgent,
      isServiceWorker,
      hasWindowAccess,
      hasSelfAccess,
      hasDocumentAccess,
      isExtensionContext: !!chrome.runtime
    };
    
    // Update display
    environmentInfo.innerHTML = `
      <div><strong>Browser:</strong> ${info.browserName} ${info.browserVersion}</div>
      <div><strong>Extension Context:</strong> ${info.isExtensionContext ? 'Yes' : 'No'}</div>
      <div><strong>Service Worker Context:</strong> ${info.isServiceWorker ? 'Yes' : 'No'}</div>
      <div><strong>Window Access:</strong> ${info.hasWindowAccess ? 'Yes' : 'No'}</div>
      <div><strong>Self Access:</strong> ${info.hasSelfAccess ? 'Yes' : 'No'}</div>
      <div><strong>Document Access:</strong> ${info.hasDocumentAccess ? 'Yes' : 'No'}</div>
    `;
    
    // Log result
    logResult('Environment Info', info);
    
    updateStatus('Environment info retrieved', 'success');
  } catch (error) {
    if (logger) {
      logger.error('Error checking environment:', error);
    }
    updateStatus(`Error checking environment: ${error.message}`, 'error');
  }
}

/**
 * Check storage information
 */
async function checkStorage() {
  try {
    updateStatus('Checking storage...', 'info');
    
    const storageInfo = document.getElementById('storage-info');
    if (!storageInfo) return;
    
    // Get all storage data
    chrome.storage.local.get(null, function(storageData) {
      try {
        // Get storage usage
        chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
          try {
            // Calculate size as MB
            const sizeInMB = (bytesInUse / (1024 * 1024)).toFixed(2);
            
            // Get key count
            const keyCount = Object.keys(storageData).length;
            
            // Format storage stats
            const storageStats = {
              bytesInUse,
              sizeInMB: `${sizeInMB} MB`,
              keyCount,
              keys: Object.keys(storageData)
            };
            
            // Update display
            storageInfo.innerHTML = `
              <div><strong>Storage Size:</strong> ${sizeInMB} MB</div>
              <div><strong>Items Count:</strong> ${keyCount}</div>
              <div><strong>Keys:</strong> ${Object.keys(storageData).join(', ').substring(0, 100)}${Object.keys(storageData).length > 10 ? '...' : ''}</div>
            `;
            
            // Log result
            logResult('Storage Stats', storageStats);
            
            // Log key sizes
            const keySizes = {};
            for (const key in storageData) {
              try {
                const size = JSON.stringify(storageData[key]).length;
                keySizes[key] = `${(size / 1024).toFixed(2)} KB`;
              } catch (e) {
                keySizes[key] = 'Error measuring';
              }
            }
            
            logResult('Storage Key Sizes', keySizes);
            
            updateStatus('Storage info retrieved', 'success');
          } catch (innerError) {
            if (logger) {
              logger.error('Error processing storage size:', innerError);
            }
            console.error('Error processing storage size:', innerError);
            updateStatus(`Error processing storage size: ${innerError.message}`, 'error');
          }
        });
      } catch (storageError) {
        if (logger) {
          logger.error('Error getting storage usage:', storageError);
        }
        console.error('Error getting storage usage:', storageError);
        updateStatus(`Error getting storage usage: ${storageError.message}`, 'error');
      }
    });
  } catch (error) {
    if (logger) {
      logger.error('Error checking storage:', error);
    }
    updateStatus(`Error checking storage: ${error.message}`, 'error');
  }
}

/**
 * Check memory usage
 */
async function checkMemory() {
  try {
    updateStatus('Checking memory usage...', 'info');
    
    const memoryInfo = document.getElementById('memory-info');
    const memoryChart = document.getElementById('memory-chart');
    const memoryBar = document.getElementById('memory-bar');
    
    if (!memoryInfo || !memoryChart || !memoryBar) return;
    
    // Check if performance.memory is available (Chrome only)
    if (performance.memory) {
      const memory = performance.memory;
      
      const usedMemory = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const totalMemory = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      const limitMemory = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      
      const percentage = Math.round((usedMemory / limitMemory) * 100);
      
      // Update memory info
      memoryInfo.innerHTML = `
        <div><strong>Used Memory:</strong> ${usedMemory} MB</div>
        <div><strong>Total Memory:</strong> ${totalMemory} MB</div>
        <div><strong>Memory Limit:</strong> ${limitMemory} MB</div>
        <div><strong>Usage Percentage:</strong> ${percentage}%</div>
      `;
      
      // Update memory chart
      memoryChart.style.display = 'block';
      memoryBar.style.width = `${percentage}%`;
      
      // Add warning class if getting close to limit
      if (percentage > 80) {
        memoryBar.style.backgroundColor = '#ea4335';
      } else if (percentage > 60) {
        memoryBar.style.backgroundColor = '#fbbc05';
      } else {
        memoryBar.style.backgroundColor = '#34a853';
      }
      
      // Log result
      logResult('Memory Usage', {
        usedMemory: `${usedMemory} MB`,
        totalMemory: `${totalMemory} MB`,
        limitMemory: `${limitMemory} MB`,
        percentage: `${percentage}%`
      });
      
      updateStatus('Memory usage checked', 'success');
    } else {
      memoryInfo.textContent = 'Memory API not available in this browser';
      memoryChart.style.display = 'none';
      
      updateStatus('Memory API not available', 'warning');
    }
  } catch (error) {
    if (logger) {
      logger.error('Error checking memory:', error);
    }
    updateStatus(`Error checking memory: ${error.message}`, 'error');
  }
}

// Define memory monitoring interval variable
let memoryMonitoringInterval = null;

/**
 * Start memory monitoring
 */
function startMemoryMonitoring() {
  try {
    // Already monitoring
    if (memoryMonitoringInterval) return;
    
    updateStatus('Starting memory monitoring...', 'info');
    
    // Check every 5 seconds
    memoryMonitoringInterval = setInterval(() => checkMemory(), 5000);
    
    // Update UI
    document.getElementById('start-memory-monitoring').style.display = 'none';
    document.getElementById('stop-memory-monitoring').style.display = 'inline-block';
    
    updateStatus('Memory monitoring started', 'success');
  } catch (error) {
    if (logger) {
      logger.error('Error starting memory monitoring:', error);
    }
    updateStatus(`Error starting memory monitoring: ${error.message}`, 'error');
  }
}

/**
 * Stop memory monitoring
 */
function stopMemoryMonitoring() {
  try {
    // Not monitoring
    if (!memoryMonitoringInterval) return;
    
    updateStatus('Stopping memory monitoring...', 'info');
    
    // Clear interval
    clearInterval(memoryMonitoringInterval);
    memoryMonitoringInterval = null;
    
    // Update UI
    document.getElementById('start-memory-monitoring').style.display = 'inline-block';
    document.getElementById('stop-memory-monitoring').style.display = 'none';
    
    updateStatus('Memory monitoring stopped', 'success');
  } catch (error) {
    if (logger) {
      logger.error('Error stopping memory monitoring:', error);
    }
    updateStatus(`Error stopping memory monitoring: ${error.message}`, 'error');
  }
}

/**
 * Test background connection using MessageService
 */
async function testBackgroundConnection() {
  try {
    updateStatus('Testing background connection...', 'info');
    
    const backgroundStatus = document.getElementById('background-status');
    if (!backgroundStatus) return false;
    
    try {
      await initializeServices(); // Ensure services are available
      
      // Test basic ping
      const pingResponse = await messageService.sendMessage({ action: 'ping' });
      const isResponsive = pingResponse && pingResponse.success;
      
      if (!isResponsive) {
        throw new Error('Background script not responding to ping');
      }
      
      // Get component status
      const componentStatusResponse = await messageService.sendMessage({ 
        action: 'getComponentStatus' 
      });
      
      if (!componentStatusResponse || !componentStatusResponse.success) {
        throw new Error('Failed to get component status');
      }
      
      const componentStatus = componentStatusResponse.data || {};
      
      // Update display
      backgroundStatus.innerHTML = `
        <div><strong>Background Connection:</strong> Active</div>
        <div><strong>Ping Response:</strong> Success</div>
        <div><strong>Component Count:</strong> ${componentStatus.componentCount || 'Unknown'}</div>
        <div><strong>Service Count:</strong> ${componentStatus.serviceCount || 'Unknown'}</div>
        <div><strong>Utility Count:</strong> ${componentStatus.utilityCount || 'Unknown'}</div>
        <div><strong>Component Instance Count:</strong> ${componentStatus.componentInstanceCount || 'Unknown'}</div>
        <div><strong>System Initialized:</strong> ${componentStatus.initialized || 'Unknown'}</div>
      `;
      
      // Log service statistics if available
      const messageStats = messageService.getStatistics();
      if (messageStats) {
        logResult('Message Service Statistics', messageStats);
      }
      
      logResult('Background Connection', {
        pingSuccess: true,
        componentStatus
      });
      
      updateStatus('Background connection successful', 'success');
      return true;
    } catch (error) {
      backgroundStatus.innerHTML = `
        <div><strong>Background Connection:</strong> Failed</div>
        <div><strong>Error:</strong> ${error.message}</div>
      `;
      
      logResult('Background Connection Error', {
        error: error.message,
        stack: error.stack
      });
      
      updateStatus(`Background connection failed: ${error.message}`, 'error');
      return false;
    }
  } catch (error) {
    if (logger) {
      logger.error('Error testing background connection:', error);
    }
    updateStatus(`Error testing background connection: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Test component system using centralized initialization
 */
async function testComponentSystem() {
  try {
    updateStatus('Testing component system initialization...', 'info');
    
    const componentStatus = document.getElementById('component-status');
    if (!componentStatus) return;
    
    try {
      await initializeServices(); // Ensure services are available
      
      // Test initialization using centralized system
      const initResult = await componentSystem.initialize();
      
      // Get container status
      const containerStatus = getContainerStatus();
      
      // Log detailed results
      logResult('Component System Status', initResult);
      logResult('Container Status', containerStatus);
      
      if (initResult.initialized && containerStatus.initialized) {
        componentStatus.innerHTML = `
          <div class="diagnostic-status import-success">
            ✅ Component System Working (Centralized Init)<br>
            Components: ${containerStatus.components?.count || 0}<br>
            Services: ${containerStatus.services?.count || 0}<br>
            Utilities: ${containerStatus.utilities?.count || 0}<br>
            Validation: ${initResult.validationResults?.allValid ? 'Passed' : 'Failed'}
          </div>
        `;
        updateStatus('Component system initialized successfully using centralized initialization', 'success');
      } else {
        componentStatus.innerHTML = `<div class="diagnostic-status import-error">❌ Component system failed to initialize</div>`;
        updateStatus('Component system initialization failed', 'error');
      }
      
      logResult('Component System Test', {
        success: initResult.initialized,
        containerInitialized: containerStatus.initialized,
        componentCount: containerStatus.components?.count || 0,
        serviceCount: containerStatus.services?.count || 0,
        utilityCount: containerStatus.utilities?.count || 0,
        validationResults: initResult.validationResults
      });
    } catch (error) {
      componentStatus.innerHTML = `<div class="diagnostic-status import-error">Error: ${error.message}</div>`;
      updateStatus(`Error testing component system: ${error.message}`, 'error');
      
      logResult('Component System Test Error', {
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Error testing component system:', error);
    }
    updateStatus(`Error testing component system: ${error.message}`, 'error');
  }
}

/**
 * Get message statistics from background
 */
async function getMessageStatistics() {
  try {
    updateStatus('Getting message statistics...', 'info');
    
    const messageStatsDiv = document.getElementById('message-stats');
    if (!messageStatsDiv) return;
    
    try {
      await initializeServices(); // Ensure services are available
      
      // Get statistics from background script
      const response = await messageService.sendMessage({ 
        action: 'getMessageStatistics' 
      });
      
      if (!response || !response.success) {
        throw new Error('Failed to get message statistics');
      }
      
      const stats = response.data || {};
      
      // Also get client-side statistics
      const clientStats = messageService.getStatistics();
      
      // Update display
      messageStatsDiv.innerHTML = `
        <h4>Background Message Statistics</h4>
        <div><strong>Total Messages:</strong> ${stats.totalMessages || 0}</div>
        <div><strong>Successful Messages:</strong> ${stats.successfulMessages || 0}</div>
        <div><strong>Failed Messages:</strong> ${stats.failedMessages || 0}</div>
        <div><strong>Invalid Messages:</strong> ${stats.invalidMessages || 0}</div>
        <div><strong>Success Rate:</strong> ${stats.successRate || '0%'}</div>
        <div><strong>Average Response Time:</strong> ${stats.averageResponseTimeMs || 0}ms</div>
        <div><strong>Uptime:</strong> ${stats.uptimeMs ? Math.round(stats.uptimeMs / 1000) : 0}s</div>
        
        <h4>Client Message Statistics</h4>
        <div><strong>Total Messages:</strong> ${clientStats?.totalMessages || 0}</div>
        <div><strong>Successful Messages:</strong> ${clientStats?.successfulMessages || 0}</div>
        <div><strong>Failed Messages:</strong> ${clientStats?.failedMessages || 0}</div>
        <div><strong>Timeouts:</strong> ${clientStats?.timeouts || 0}</div>
        <div><strong>Success Rate:</strong> ${clientStats?.successRate || '0%'}</div>
        <div><strong>Average Response Time:</strong> ${clientStats?.averageResponseTimeMs || 0}ms</div>
      `;
      
      // Log detailed statistics
      logResult('Background Message Statistics', stats);
      logResult('Client Message Statistics', clientStats);
      
      // Log most frequent messages if available
      if (stats.messagesByActionArray && stats.messagesByActionArray.length > 0) {
        logResult('Most Frequent Messages', stats.messagesByActionArray);
      }
      
      updateStatus('Message statistics retrieved', 'success');
    } catch (error) {
      messageStatsDiv.innerHTML = `<div class="diagnostic-status import-error">Error: ${error.message}</div>`;
      updateStatus(`Error getting message statistics: ${error.message}`, 'error');
      
      logResult('Message Statistics Error', {
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Error getting message statistics:', error);
    }
    updateStatus(`Error getting message statistics: ${error.message}`, 'error');
  }
}

/**
 * Reset message statistics in background
 */
async function resetMessageStatistics() {
  try {
    updateStatus('Resetting message statistics...', 'info');
    
    try {
      await initializeServices(); // Ensure services are available
      
      // Reset background statistics
      const response = await messageService.sendMessage({ 
        action: 'resetMessageStatistics' 
      });
      
      if (!response || !response.success) {
        throw new Error('Failed to reset background message statistics');
      }
      
      // Reset client statistics
      messageService.resetStatistics();
      
      updateStatus('Message statistics reset successfully', 'success');
      
      // Refresh the statistics display
      await getMessageStatistics();
    } catch (error) {
      updateStatus(`Error resetting message statistics: ${error.message}`, 'error');
      
      logResult('Reset Statistics Error', {
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Error resetting message statistics:', error);
    }
    updateStatus(`Error resetting message statistics: ${error.message}`, 'error');
  }
}