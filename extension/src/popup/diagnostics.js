// src/popup/diagnostics.js
// Import LogManager directly first to avoid dependency issues
import { LogManager } from '../utils/log-manager.js';

// Create logger instance directly
const logger = new LogManager({
  context: 'diagnostics',
  isBackgroundScript: false,
  maxEntries: 1000
});

logger.log('info', 'Diagnostics page loaded');

/**
 * Initialize diagnostic tools
 */
async function initDiagnosticTools() {
  try {
    logger.log('info', 'Initializing diagnostic tools');
    updateStatus('Initializing diagnostic tools...', 'info');
    
    // Update diagnostic tools status
    const diagnosticStatus = document.getElementById('diagnostic-tools-status');
    if (diagnosticStatus) {
      diagnosticStatus.className = 'diagnostic-status import-success';
      diagnosticStatus.textContent = 'Diagnostic tools initialized successfully';
    }
    
    // Set up event listeners for diagnostic buttons
    setupEventListeners();
    
    // Check extension info automatically
    await checkExtensionInfo();
    
    // Check environment automatically
    await checkEnvironment();
    
    updateStatus('Diagnostic tools ready', 'success');
  } catch (error) {
    logger.log('error', 'Error initializing diagnostic tools:', error);
    updateStatus(`Error initializing diagnostic tools: ${error.message}`, 'error');
    
    // Update diagnostic tools status
    const diagnosticStatus = document.getElementById('diagnostic-tools-status');
    if (diagnosticStatus) {
      diagnosticStatus.className = 'diagnostic-status import-error';
      diagnosticStatus.textContent = `Error: ${error.message}`;
    }
  }
}

/**
 * Set up event listeners for diagnostic buttons
 */
function setupEventListeners() {
  // Extension info
  document.getElementById('check-extension').addEventListener('click', checkExtensionInfo);
  
  // Memory usage
  document.getElementById('check-memory').addEventListener('click', checkMemory);
  document.getElementById('start-memory-monitoring').addEventListener('click', startMemoryMonitoring);
  document.getElementById('stop-memory-monitoring').addEventListener('click', stopMemoryMonitoring);
  
  // Environment
  document.getElementById('check-environment').addEventListener('click', checkEnvironment);
  
  // Storage
  document.getElementById('check-storage').addEventListener('click', checkStorage);
  
  // Component tests
  document.getElementById('load-overview').addEventListener('click', () => testComponent('overview-panel'));
  document.getElementById('load-capture').addEventListener('click', () => testComponent('capture-panel'));
  document.getElementById('load-knowledge').addEventListener('click', () => testComponent('knowledge-panel'));
  document.getElementById('load-settings').addEventListener('click', () => testComponent('settings-panel'));
  
  // Background connection
  document.getElementById('ping-background').addEventListener('click', pingBackground);
  
  // Clear results
  document.getElementById('clear-results').addEventListener('click', clearResults);
  
  logger.log('debug', 'Event listeners set up successfully');
}

/**
 * Update status message
 * @param {string} message - Message to display
 * @param {string} type - Status type (info, success, error, warning)
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
  
  logger.log(type, message);
}

/**
 * Log result to output container
 * @param {string} title - Result title
 * @param {any} data - Result data
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
  
  logger.log('debug', `Logged result: ${title}`);
}

/**
 * Clear results container
 */
function clearResults() {
  const resultOutput = document.getElementById('result-output');
  if (resultOutput) {
    resultOutput.textContent = '';
  }
  
  logger.log('debug', 'Results cleared');
}

/**
 * Check extension information
 */
async function checkExtensionInfo() {
  try {
    updateStatus('Checking extension info...', 'info');
    
    // Get extension info element
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
    logger.log('error', 'Error checking extension info:', error);
    updateStatus(`Error checking extension info: ${error.message}`, 'error');
  }
}

/**
 * Check memory usage
 */
async function checkMemory() {
  try {
    updateStatus('Checking memory usage...', 'info');
    
    // Get memory info element
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
    logger.log('error', 'Error checking memory:', error);
    updateStatus(`Error checking memory: ${error.message}`, 'error');
  }
}

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
    memoryMonitoringInterval = setInterval(checkMemory, 5000);
    
    // Update UI
    document.getElementById('start-memory-monitoring').style.display = 'none';
    document.getElementById('stop-memory-monitoring').style.display = 'inline-block';
    
    updateStatus('Memory monitoring started', 'success');
  } catch (error) {
    logger.log('error', 'Error starting memory monitoring:', error);
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
    logger.log('error', 'Error stopping memory monitoring:', error);
    updateStatus(`Error stopping memory monitoring: ${error.message}`, 'error');
  }
}

/**
 * Check environment
 */
async function checkEnvironment() {
  try {
    updateStatus('Checking environment...', 'info');
    
    // Get environment info element
    const environmentInfo = document.getElementById('environment-info');
    if (!environmentInfo) return;
    
    // Get browser info
    const userAgent = navigator.userAgent;
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
    logger.log('error', 'Error checking environment:', error);
    updateStatus(`Error checking environment: ${error.message}`, 'error');
  }
}

/**
 * Detect browser name from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Browser name
 */
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

/**
 * Detect browser version from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Browser version
 */
function detectBrowserVersion(userAgent) {
  let version = 'Unknown';
  
  // Chrome, Edge, or Safari
  if (userAgent.includes('Chrome/')) {
    version = userAgent.match(/Chrome\/(\d+\.\d+)/)[1];
  } else if (userAgent.includes('Edg/')) {
    version = userAgent.match(/Edg\/(\d+\.\d+)/)[1];
  } else if (userAgent.includes('Firefox/')) {
    version = userAgent.match(/Firefox\/(\d+\.\d+)/)[1];
  } else if (userAgent.includes('Safari/')) {
    version = userAgent.match(/Version\/(\d+\.\d+)/)[1];
  }
  
  return version;
}

/**
 * Check storage status
 */
async function checkStorage() {
  try {
    updateStatus('Checking storage...', 'info');
    
    // Get storage info element
    const storageInfo = document.getElementById('storage-info');
    if (!storageInfo) return;
    
    // Get all storage data
    const storageData = await chrome.storage.local.get(null);
    
    // Get storage usage
    const bytesInUse = await new Promise(resolve => {
      chrome.storage.local.getBytesInUse(null, resolve);
    });
    
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
  } catch (error) {
    logger.log('error', 'Error checking storage:', error);
    updateStatus(`Error checking storage: ${error.message}`, 'error');
  }
}

/**
 * Test component initialization
 * @param {string} componentName - Component name to test
 */
async function testComponent(componentName) {
  try {
    updateStatus(`Testing component: ${componentName}...`, 'info');
    
    // Get component status element
    const componentStatus = document.getElementById('component-status');
    if (!componentStatus) return;
    
    // Get background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage) {
      throw new Error('Could not access background page');
    }
    
    // Try to access the component system
    if (!backgroundPage.marvinDashboard && componentName.includes('panel')) {
      throw new Error('marvinDashboard not found in background page');
    }
    
    // Get component count
    const componentCount = backgroundPage.marvinDashboard.debug().container.components;
    const componentInstanceCount = backgroundPage.marvinDashboard.debug().container.componentInstances;
    
    // Show component info
    componentStatus.innerHTML = `
      <div><strong>Component Count:</strong> ${componentCount}</div>
      <div><strong>Component Instance Count:</strong> ${componentInstanceCount}</div>
      <div><strong>Testing Component:</strong> ${componentName}</div>
    `;
    
    // Try to initialize the component
    const result = await backgroundPage.marvinDashboard.initPanel(componentName);
    
    // Update status based on result
    if (result) {
      componentStatus.innerHTML += `<div class="diagnostic-status import-success">Component ${componentName} initialized successfully</div>`;
    } else {
      componentStatus.innerHTML += `<div class="diagnostic-status import-error">Component ${componentName} initialization failed</div>`;
    }
    
    // Log result
    logResult(`Component Test: ${componentName}`, {
      success: result,
      componentCount,
      componentInstanceCount
    });
    
    updateStatus(`Component ${componentName} test complete`, result ? 'success' : 'warning');
  } catch (error) {
    logger.log('error', `Error testing component ${componentName}:`, error);
    updateStatus(`Error testing component ${componentName}: ${error.message}`, 'error');
    
    // Update component status
    const componentStatus = document.getElementById('component-status');
    if (componentStatus) {
      componentStatus.innerHTML += `<div class="diagnostic-status import-error">Error: ${error.message}</div>`;
    }
  }
}

/**
 * Ping background script
 */
async function pingBackground() {
  try {
    updateStatus('Pinging background script...', 'info');
    
    // Get background status element
    const backgroundStatus = document.getElementById('background-status');
    if (!backgroundStatus) return;
    
    // Try to access background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    
    if (!backgroundPage) {
      throw new Error('Could not access background page');
    }
    
    // Check if marvin API is available
    const marvinAvailable = !!backgroundPage.marvin;
    
    // Send ping message to background
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'ping' }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    // Update display
    backgroundStatus.innerHTML = `
      <div><strong>Background Access:</strong> Yes</div>
      <div><strong>Marvin API Available:</strong> ${marvinAvailable ? 'Yes' : 'No'}</div>
      <div><strong>Ping Response:</strong> ${response ? 'Received' : 'None'}</div>
    `;
    
    // Log result
    logResult('Background Connection', {
      backgroundAccess: true,
      marvinAvailable,
      pingResponse: response
    });
    
    updateStatus('Background connection successful', 'success');
  } catch (error) {
    logger.log('error', 'Error pinging background:', error);
    updateStatus(`Error pinging background: ${error.message}`, 'error');
    
    // Update background status
    const backgroundStatus = document.getElementById('background-status');
    if (backgroundStatus) {
      backgroundStatus.innerHTML = `
        <div><strong>Background Access:</strong> No</div>
        <div><strong>Error:</strong> ${error.message}</div>
      `;
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDiagnosticTools);