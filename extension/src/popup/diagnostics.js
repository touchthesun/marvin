// src/popup/diagnostics/diagnostics-dashboard.js
import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';
import { ensureContainerInitialized } from '../core/container-init.js';

/**
 * Diagnostics Dashboard Component
 * Provides comprehensive diagnostic tools for the Marvin extension
 */
const DiagnosticsDashboard = {
  // Resource tracking arrays
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Component state
  _messageService: null,
  _logger: null,
  _memoryMonitoringInterval: null,
  
  /**
   * Initialize the diagnostics dashboard
   * @returns {Promise<boolean>} Success status
   */
  async initDiagnosticsDashboard() {
    try {
      // Create logger directly
      this._logger = new LogManager({
        context: 'diagnostics-dashboard',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing diagnostics dashboard');
      
      // Initialize services
      await this.initializeServices();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Run automatic checks
      await this.runAutomaticChecks();
      
      this.initialized = true;
      this._logger.info('Diagnostics dashboard initialized successfully');
      return true;
    } catch (error) {
      this._logger.error('Error initializing diagnostics dashboard:', error);
      this.updateStatus(`Error initializing: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Initialize services
   */
  async initializeServices() {
    if (this.initialized) return;
    
    try {
      // Ensure container is initialized
      await ensureContainerInitialized({
        isBackgroundScript: false,
        context: 'diagnostics'
      });
      
      // Get services with fallbacks
      this._messageService = this.getService('messageService', {
        sendMessage: async (message) => {
          this._logger.warn('MessageService not available, using fallback');
          return { success: false, error: 'Service not available' };
        }
      });
      
      this._logger.info('Diagnostics services initialized');
    } catch (error) {
      this._logger.error('Error initializing services:', error);
      throw error;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      this._logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this._logger.debug('Setting up event listeners');
    
    // Helper function to safely add event listener
    const addEventListenerSafely = (elementId, event, handler) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(event, handler);
        this._eventListeners.push({
          element,
          type: event,
          listener: handler
        });
        this._logger.debug(`Added ${event} listener to ${elementId}`);
      } else {
        this._logger.warn(`Element with ID '${elementId}' not found, skipping event listener`);
      }
    };
    
    // Clear results
    addEventListenerSafely('clear-results', 'click', () => {
      const resultOutput = document.getElementById('result-output');
      if (resultOutput) {
        resultOutput.textContent = '';
      }
      this._logger.debug('Results cleared');
    });
    
    // Extension info
    addEventListenerSafely('check-extension', 'click', () => this.checkExtensionInfo());
    
    // Environment
    addEventListenerSafely('check-environment', 'click', () => this.checkEnvironment());
    
    // Storage
    addEventListenerSafely('check-storage', 'click', () => this.checkStorage());
    
    // Memory
    addEventListenerSafely('check-memory', 'click', () => this.checkMemory());
    addEventListenerSafely('start-memory-monitoring', 'click', () => this.startMemoryMonitoring());
    addEventListenerSafely('stop-memory-monitoring', 'click', () => this.stopMemoryMonitoring());
    
    // Background connection
    addEventListenerSafely('ping-background', 'click', () => this.testBackgroundConnection());
    
    // Component system
    addEventListenerSafely('test-component-system', 'click', () => this.testComponentSystem());
    
    // Message statistics
    addEventListenerSafely('get-message-stats', 'click', () => this.getMessageStatistics());
    addEventListenerSafely('reset-message-stats', 'click', () => this.resetMessageStatistics());
    
    this._logger.debug('Event listeners set up successfully');
  },
  
  /**
   * Run automatic checks
   */
  async runAutomaticChecks() {
    this._logger.debug('Running automatic checks');
    
    try {
      await this.checkExtensionInfo();
      await this.checkEnvironment();
      await this.testBackgroundConnection();
      await this.testComponentSystem();
      await this.getMessageStatistics();
      
      this._logger.debug('Automatic checks completed');
    } catch (error) {
      this._logger.error('Error running automatic checks:', error);
    }
  },
  
  /**
   * Update status message
   * @param {string} message - Status message
   * @param {string} type - Status type (info|success|error|warning)
   */
  updateStatus(message, type = 'info') {
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
    this._logger.log(type, message);
  },
  
  /**
   * Log result to output container
   * @param {string} title - Result title
   * @param {any} data - Result data
   */
  logResult(title, data) {
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
    
    this._logger.debug(`Logged result: ${title}`);
  },
  
  /**
   * Check extension information
   */
  async checkExtensionInfo() {
    try {
      this.updateStatus('Checking extension info...', 'info');
      
      const extensionInfo = document.getElementById('extension-info');
      if (!extensionInfo) return;
      
      // Get manifest
      const manifest = chrome.runtime.getManifest();
      
      // Format info
      const info = {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions,
        host_permissions: manifest.host_permissions,
        manifest_version: manifest.manifest_version
      };
      
      // Update UI
      extensionInfo.innerHTML = `
        <p><strong>Name:</strong> ${info.name}</p>
        <p><strong>Version:</strong> ${info.version}</p>
        <p><strong>Description:</strong> ${info.description}</p>
        <p><strong>Manifest Version:</strong> ${info.manifest_version}</p>
        <p><strong>Permissions:</strong></p>
        <ul>
          ${info.permissions.map(p => `<li>${p}</li>`).join('')}
        </ul>
        <p><strong>Host Permissions:</strong></p>
        <ul>
          ${info.host_permissions.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;
      
      this.logResult('Extension Info', info);
      this.updateStatus('Extension info checked', 'success');
    } catch (error) {
      this._logger.error('Error checking extension info:', error);
      this.updateStatus(`Error checking extension info: ${error.message}`, 'error');
    }
  },
  
  /**
   * Check environment information
   */
  async checkEnvironment() {
    try {
      this.updateStatus('Checking environment...', 'info');
      
      const environmentInfo = document.getElementById('environment-info');
      if (!environmentInfo) return;
      
      const info = {
        browser: this.detectBrowserName(navigator.userAgent),
        browserVersion: this.detectBrowserVersion(navigator.userAgent),
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        online: navigator.onLine,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        memory: navigator.deviceMemory ? `${navigator.deviceMemory}GB` : 'Not available',
        hardwareConcurrency: navigator.hardwareConcurrency || 'Not available'
      };
      
      // Update UI
      environmentInfo.innerHTML = `
        <p><strong>Browser:</strong> ${info.browser} ${info.browserVersion}</p>
        <p><strong>Platform:</strong> ${info.platform}</p>
        <p><strong>Language:</strong> ${info.language}</p>
        <p><strong>Cookies Enabled:</strong> ${info.cookiesEnabled}</p>
        <p><strong>Do Not Track:</strong> ${info.doNotTrack}</p>
        <p><strong>Online:</strong> ${info.online}</p>
        <p><strong>Screen Resolution:</strong> ${info.screenResolution}</p>
        <p><strong>Color Depth:</strong> ${info.colorDepth}</p>
        <p><strong>Timezone:</strong> ${info.timezone}</p>
        <p><strong>Memory:</strong> ${info.memory}</p>
        <p><strong>CPU Cores:</strong> ${info.hardwareConcurrency}</p>
      `;
      
      this.logResult('Environment Info', info);
      this.updateStatus('Environment checked', 'success');
    } catch (error) {
      this._logger.error('Error checking environment:', error);
      this.updateStatus(`Error checking environment: ${error.message}`, 'error');
    }
  },
  
  /**
   * Detect browser name from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Browser name
   */
  detectBrowserName(userAgent) {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown';
  },
  
  /**
   * Detect browser version from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Browser version
   */
  detectBrowserVersion(userAgent) {
    const match = userAgent.match(/(?:Chrome|Firefox|Safari|Edge|Opera)\/(\d+\.\d+)/);
    return match ? match[1] : 'Unknown';
  },
  
  /**
   * Check storage status
   */
  async checkStorage() {
    try {
      this.updateStatus('Checking storage...', 'info');
      
      const storageInfo = document.getElementById('storage-info');
      if (!storageInfo) return;
      
      // Get storage info
      const storage = await chrome.storage.local.get(null);
      const storageSize = new Blob([JSON.stringify(storage)]).size;
      
      const info = {
        totalItems: Object.keys(storage).length,
        totalSize: `${(storageSize / 1024).toFixed(2)}KB`,
        items: storage
      };
      
      // Update UI
      storageInfo.innerHTML = `
        <p><strong>Total Items:</strong> ${info.totalItems}</p>
        <p><strong>Total Size:</strong> ${info.totalSize}</p>
      `;
      
      this.logResult('Storage Info', info);
      this.updateStatus('Storage checked', 'success');
    } catch (error) {
      this._logger.error('Error checking storage:', error);
      this.updateStatus(`Error checking storage: ${error.message}`, 'error');
    }
  },
  
  /**
   * Check memory usage
   */
  async checkMemory() {
    try {
      this.updateStatus('Checking memory...', 'info');
      
      const memoryInfo = document.getElementById('memory-info');
      const memoryChart = document.getElementById('memory-chart');
      const memoryBar = document.getElementById('memory-bar');
      
      if (!memoryInfo || !memoryChart || !memoryBar) return;
      
      // Get memory info
      const memory = await chrome.system.memory.getInfo();
      const usedMemory = memory.capacity - memory.availableCapacity;
      const usedPercentage = (usedMemory / memory.capacity) * 100;
      
      const info = {
        total: `${(memory.capacity / (1024 * 1024 * 1024)).toFixed(2)}GB`,
        available: `${(memory.availableCapacity / (1024 * 1024 * 1024)).toFixed(2)}GB`,
        used: `${(usedMemory / (1024 * 1024 * 1024)).toFixed(2)}GB`,
        usedPercentage: `${usedPercentage.toFixed(1)}%`
      };
      
      // Update UI
      memoryInfo.innerHTML = `
        <p><strong>Total Memory:</strong> ${info.total}</p>
        <p><strong>Available Memory:</strong> ${info.available}</p>
        <p><strong>Used Memory:</strong> ${info.used}</p>
        <p><strong>Used Percentage:</strong> ${info.usedPercentage}</p>
      `;
      
      // Show and update chart
      memoryChart.style.display = 'block';
      memoryBar.style.width = `${usedPercentage}%`;
      
      this.logResult('Memory Info', info);
      this.updateStatus('Memory checked', 'success');
    } catch (error) {
      this._logger.error('Error checking memory:', error);
      this.updateStatus(`Error checking memory: ${error.message}`, 'error');
    }
  },
  
  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    try {
      const startButton = document.getElementById('start-memory-monitoring');
      const stopButton = document.getElementById('stop-memory-monitoring');
      
      if (!startButton || !stopButton) return;
      
      // Update UI
      startButton.style.display = 'none';
      stopButton.style.display = 'inline-block';
      
      // Start monitoring
      this._memoryMonitoringInterval = setInterval(() => {
        this.checkMemory();
      }, 2000);
      
      this._intervals.push(this._memoryMonitoringInterval);
      
      this._logger.info('Memory monitoring started');
      this.updateStatus('Memory monitoring started', 'info');
    } catch (error) {
      this._logger.error('Error starting memory monitoring:', error);
      this.updateStatus(`Error starting memory monitoring: ${error.message}`, 'error');
    }
  },
  
  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring() {
    try {
      const startButton = document.getElementById('start-memory-monitoring');
      const stopButton = document.getElementById('stop-memory-monitoring');
      
      if (!startButton || !stopButton) return;
      
      // Update UI
      startButton.style.display = 'inline-block';
      stopButton.style.display = 'none';
      
      // Stop monitoring
      if (this._memoryMonitoringInterval) {
        clearInterval(this._memoryMonitoringInterval);
        this._memoryMonitoringInterval = null;
      }
      
      this._logger.info('Memory monitoring stopped');
      this.updateStatus('Memory monitoring stopped', 'info');
    } catch (error) {
      this._logger.error('Error stopping memory monitoring:', error);
      this.updateStatus(`Error stopping memory monitoring: ${error.message}`, 'error');
    }
  },
  
  /**
   * Test background connection
   */
  async testBackgroundConnection() {
    try {
      this.updateStatus('Testing background connection...', 'info');
      
      const backgroundStatus = document.getElementById('background-status');
      if (!backgroundStatus) return;
      
      // Try to get background page
      const backgroundPage = chrome.extension.getBackgroundPage();
      
      if (backgroundPage && backgroundPage.marvin) {
        backgroundStatus.textContent = 'Background script is running and accessible';
        this.logResult('Background Connection', { status: 'connected' });
        this.updateStatus('Background connection successful', 'success');
      } else {
        // Try messaging as fallback
        const response = await this._messageService.sendMessage({ action: 'ping' });
        
        if (response.success) {
          backgroundStatus.textContent = 'Background script is running (via messaging)';
          this.logResult('Background Connection', { status: 'connected_via_messaging' });
          this.updateStatus('Background connection successful', 'success');
        } else {
          backgroundStatus.textContent = 'Background script may not be running';
          this.logResult('Background Connection', { status: 'disconnected' });
          this.updateStatus('Background connection failed', 'error');
        }
      }
    } catch (error) {
      this._logger.error('Error testing background connection:', error);
      this.updateStatus(`Error testing background connection: ${error.message}`, 'error');
    }
  },
  
  /**
   * Test component system
   */
  async testComponentSystem() {
    try {
      this.updateStatus('Testing component system...', 'info');
      
      const componentStatus = document.getElementById('component-status');
      if (!componentStatus) return;
      
      // Test component system
      const result = await this._messageService.sendMessage({
        action: 'testComponentSystem'
      });
      
      if (result.success) {
        componentStatus.textContent = 'Component system is working correctly';
        this.logResult('Component System Test', result);
        this.updateStatus('Component system test successful', 'success');
      } else {
        componentStatus.textContent = 'Component system may have issues';
        this.logResult('Component System Test', result);
        this.updateStatus('Component system test failed', 'error');
      }
    } catch (error) {
      this._logger.error('Error testing component system:', error);
      this.updateStatus(`Error testing component system: ${error.message}`, 'error');
    }
  },
  
  /**
   * Get message statistics
   */
  async getMessageStatistics() {
    try {
      this.updateStatus('Getting message statistics...', 'info');
      
      const messageStats = document.getElementById('message-stats');
      if (!messageStats) return;
      
      // Get message statistics
      const result = await this._messageService.sendMessage({
        action: 'getMessageStatistics'
      });
      
      if (result.success) {
        messageStats.innerHTML = `
          <p><strong>Total Messages:</strong> ${result.total}</p>
          <p><strong>Successful Messages:</strong> ${result.successful}</p>
          <p><strong>Failed Messages:</strong> ${result.failed}</p>
          <p><strong>Average Response Time:</strong> ${result.averageResponseTime}ms</p>
        `;
        
        this.logResult('Message Statistics', result);
        this.updateStatus('Message statistics retrieved', 'success');
      } else {
        messageStats.textContent = 'Failed to get message statistics';
        this.logResult('Message Statistics', { error: result.error });
        this.updateStatus('Failed to get message statistics', 'error');
      }
    } catch (error) {
      this._logger.error('Error getting message statistics:', error);
      this.updateStatus(`Error getting message statistics: ${error.message}`, 'error');
    }
  },
  
  /**
   * Reset message statistics
   */
  async resetMessageStatistics() {
    try {
      this.updateStatus('Resetting message statistics...', 'info');
      
      // Reset message statistics
      const result = await this._messageService.sendMessage({
        action: 'resetMessageStatistics'
      });
      
      if (result.success) {
        this.logResult('Message Statistics Reset', { status: 'success' });
        this.updateStatus('Message statistics reset', 'success');
        
        // Refresh statistics display
        await this.getMessageStatistics();
      } else {
        this.logResult('Message Statistics Reset', { error: result.error });
        this.updateStatus('Failed to reset message statistics', 'error');
      }
    } catch (error) {
      this._logger.error('Error resetting message statistics:', error);
      this.updateStatus(`Error resetting message statistics: ${error.message}`, 'error');
    }
  },
  
  /**
   * Clean up resources
   */
  cleanup() {
    if (!this.initialized) {
      this._logger.debug('Diagnostics dashboard not initialized, skipping cleanup');
      return;
    }
    
    this._logger.info('Cleaning up diagnostics dashboard resources');
    
    // Stop memory monitoring if active
    this.stopMemoryMonitoring();
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        this._logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        this._logger.warn(`Error clearing interval:`, error);
      }
    });
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({element, type, listener}) => {
      try {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, listener);
        }
      } catch (error) {
        this._logger.warn(`Error removing event listener:`, error);
      }
    });
    this._eventListeners = [];
    
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        this._logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    // Clear service references
    this._messageService = null;
    this._logger = null;
    
    this.initialized = false;
    this._logger.debug('Diagnostics dashboard cleanup completed');
  }
};

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  DiagnosticsDashboard.initDiagnosticsDashboard();
});

// Export the diagnostics dashboard component
export { DiagnosticsDashboard };