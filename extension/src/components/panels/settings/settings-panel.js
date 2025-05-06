// src/components/panels/settings/settings-panel.js
import { container } from '@core/dependency-container.js';

// Define the SettingsPanel object
const SettingsPanel = {
  /**
   * Initialize settings panel
   * @returns {Promise<boolean>} Success state
   */
  async initSettingsPanel() {
    // Get dependencies from container
    const logger = new (container.getUtil('LogManager'))({
      context: 'settings-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    const notificationService = container.getService('notificationService');
    const ui = container.getUtil('ui');
    
    logger.info('Initializing settings panel');
    
    try {
      // Track initialization state
      this.initialized = false;
      
      // Load current settings
      await this.loadCurrentSettings(logger);
      
      // Set up form submission handlers
      this.setupSettingsForms(logger, notificationService, ui);
      
      // Set up action buttons
      this.setupActionButtons(logger, notificationService);
      
      // Mark as initialized
      this.initialized = true;
      logger.info('Settings panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing settings panel:', error);
      notificationService.showNotification('Failed to initialize settings panel', 'error');
      
      // Show error in the settings container
      const settingsContainer = document.querySelector('.settings-container');
      if (settingsContainer) {
        settingsContainer.innerHTML = `
          <div class="error-state">
            Error initializing settings: ${error.message}
            <br><br>
            <button id="retry-settings-btn" class="btn-secondary">Retry</button>
          </div>
        `;
        
        // Add retry button functionality
        document.getElementById('retry-settings-btn')?.addEventListener('click', () => {
          this.initSettingsPanel();
        });
      }
      
      return false;
    }
  },
  
  /**
   * Load current settings from storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadCurrentSettings(logger) {
    logger.debug('Loading current settings');
    
    try {
      // Get settings from storage
      const data = await chrome.storage.local.get([
        'apiConfig', 
        'captureSettings', 
        'analysisSettings'
      ]);
      
      const apiConfig = data.apiConfig || {};
      const captureSettings = data.captureSettings || {};
      const analysisSettings = data.analysisSettings || {};
      
      logger.debug('Retrieved settings from storage', { 
        apiConfig, 
        captureSettings, 
        analysisSettings 
      });
      
      // Populate API config form
      this.populateApiConfigForm(apiConfig, logger);
      
      // Populate capture settings form
      this.populateCaptureSettingsForm(captureSettings, logger);
      
      // Populate analysis settings form
      this.populateAnalysisSettingsForm(analysisSettings, logger);
      
      logger.info('Settings loaded successfully');
    } catch (error) {
      logger.error('Error loading settings:', error);
      throw new Error(`Failed to load settings: ${error.message}`);
    }
  },
  
  /**
   * Populate API config form with stored values
   * @param {Object} apiConfig - API configuration object
   * @param {LogManager} logger - Logger instance
   */
  populateApiConfigForm(apiConfig, logger) {
    logger.debug('Populating API config form');
    
    try {
      const apiUrlInput = document.getElementById('api-url');
      if (apiUrlInput && apiConfig.baseUrl) {
        apiUrlInput.value = apiConfig.baseUrl;
        logger.debug(`Set API URL input to: ${apiConfig.baseUrl}`);
      } else if (!apiUrlInput) {
        logger.warn('API URL input element not found');
      }
      
      // Populate API key input if it exists
      const apiKeyInput = document.getElementById('api-key');
      if (apiKeyInput && apiConfig.apiKey) {
        apiKeyInput.value = apiConfig.apiKey;
        logger.debug('Set API key input');
      }
    } catch (error) {
      logger.error('Error populating API config form:', error);
    }
  },
  
  /**
   * Populate capture settings form with stored values
   * @param {Object} captureSettings - Capture settings object
   * @param {LogManager} logger - Logger instance
   */
  populateCaptureSettingsForm(captureSettings, logger) {
    logger.debug('Populating capture settings form');
    
    try {
      // Auto capture checkbox
      const autoCaptureCheckbox = document.getElementById('auto-capture');
      if (autoCaptureCheckbox) {
        autoCaptureCheckbox.checked = !!captureSettings.automaticCapture;
        logger.debug(`Set auto capture checkbox to: ${!!captureSettings.automaticCapture}`);
      } else {
        logger.warn('Auto capture checkbox not found');
      }
      
      // Minimum time input
      const minTimeInput = document.getElementById('min-time');
      if (minTimeInput && captureSettings.minTimeOnPage) {
        minTimeInput.value = captureSettings.minTimeOnPage;
        logger.debug(`Set min time input to: ${captureSettings.minTimeOnPage}`);
      } else if (!minTimeInput) {
        logger.warn('Min time input not found');
      }
      
      // Excluded domains textarea
      const excludedDomainsTextarea = document.getElementById('excluded-domains');
      if (excludedDomainsTextarea && captureSettings.excludedDomains) {
        excludedDomainsTextarea.value = this.formatDomainsList(captureSettings.excludedDomains);
        logger.debug('Set excluded domains textarea');
      } else if (!excludedDomainsTextarea) {
        logger.warn('Excluded domains textarea not found');
      }
      
      // Included domains textarea
      const includedDomainsTextarea = document.getElementById('included-domains');
      if (includedDomainsTextarea && captureSettings.includedDomains) {
        includedDomainsTextarea.value = this.formatDomainsList(captureSettings.includedDomains);
        logger.debug('Set included domains textarea');
      } else if (!includedDomainsTextarea) {
        logger.warn('Included domains textarea not found');
      }
    } catch (error) {
      logger.error('Error populating capture settings form:', error);
    }
  },
  
  /**
   * Format domains list for textarea display
   * @param {Array|string} domains - Domains list
   * @returns {string} Formatted domains string
   */
  formatDomainsList(domains) {
    if (!domains) return '';
    
    if (Array.isArray(domains)) {
      return domains.join('\n');
    }
    
    return domains;
  },
  
  /**
   * Populate analysis settings form with stored values
   * @param {Object} analysisSettings - Analysis settings object
   * @param {LogManager} logger - Logger instance
   */
  populateAnalysisSettingsForm(analysisSettings, logger) {
    logger.debug('Populating analysis settings form');
    
    try {
      // Auto analyze checkbox
      const autoAnalyzeCheckbox = document.getElementById('auto-analyze');
      if (autoAnalyzeCheckbox) {
        // Default to true if not explicitly set to false
        autoAnalyzeCheckbox.checked = analysisSettings.autoAnalyze !== false;
        logger.debug(`Set auto analyze checkbox to: ${analysisSettings.autoAnalyze !== false}`);
      } else {
        logger.warn('Auto analyze checkbox not found');
      }
      
      // Additional analysis settings can be added here
    } catch (error) {
      logger.error('Error populating analysis settings form:', error);
    }
  },
  
  /**
   * Set up settings form submission handlers
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @param {Object} ui - UI utilities
   */
  setupSettingsForms(logger, notificationService, ui) {
    logger.debug('Setting up settings forms');
    
    try {
      // API config form
      this.setupApiConfigForm(logger, notificationService, ui);
      
      // Capture settings form
      this.setupCaptureSettingsForm(logger, notificationService, ui);
      
      // Analysis settings form
      this.setupAnalysisSettingsForm(logger, notificationService, ui);
      
      logger.info('Settings forms set up successfully');
    } catch (error) {
      logger.error('Error setting up settings forms:', error);
    }
  },
  
  /**
   * Set up API config form handler
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @param {Object} ui - UI utilities
   */
  setupApiConfigForm(logger, notificationService, ui) {
    logger.debug('Setting up API config form');
    
    const apiConfigForm = document.getElementById('api-config-form');
    if (!apiConfigForm) {
      logger.warn('API config form not found');
      return;
    }
    
    apiConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      logger.info('API config form submitted');
      
      try {
        const apiUrl = document.getElementById('api-url')?.value?.trim() || '';
        const apiKey = document.getElementById('api-key')?.value?.trim();
        
        // Validate API URL
        if (!apiUrl) {
          throw new Error('API URL is required');
        }
        
        // Try to validate URL format
        try {
          new URL(apiUrl);
        } catch (urlError) {
          throw new Error('Invalid API URL format');
        }
        
        // Prepare API config object
        const apiConfig = { baseUrl: apiUrl };
        
        // Add API key if provided
        if (apiKey) {
          apiConfig.apiKey = apiKey;
        }
        
        logger.debug('Saving API config', { baseUrl: apiUrl, hasKey: !!apiKey });
        
        // Save to storage
        await chrome.storage.local.set({ apiConfig });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { apiConfig }
        });
        
        ui.showSaveConfirmation(apiConfigForm);
        notificationService.showNotification('API settings saved successfully', 'success');
        
        logger.info('API settings saved successfully');
      } catch (error) {
        logger.error('Error saving API settings:', error);
        notificationService.showNotification('Error saving API settings: ' + error.message, 'error');
      }
    });
  },
  
  /**
   * Set up capture settings form handler
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @param {Object} ui - UI utilities
   */
  setupCaptureSettingsForm(logger, notificationService, ui) {
    logger.debug('Setting up capture settings form');
    
    const captureSettingsForm = document.getElementById('capture-settings-form');
    if (!captureSettingsForm) {
      logger.warn('Capture settings form not found');
      return;
    }
    
    captureSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      logger.info('Capture settings form submitted');
      
      try {
        // Get form values
        const automaticCapture = document.getElementById('auto-capture')?.checked || false;
        
        // Parse min time with validation
        let minTimeOnPage = 0;
        const minTimeInput = document.getElementById('min-time')?.value;
        if (minTimeInput) {
          minTimeOnPage = parseInt(minTimeInput, 10);
          if (isNaN(minTimeOnPage) || minTimeOnPage < 0) {
            throw new Error('Minimum time must be a positive number');
          }
        }
        
        // Get domains text
        const excludedDomainsText = document.getElementById('excluded-domains')?.value || '';
        const includedDomainsText = document.getElementById('included-domains')?.value || '';
        
        // Parse domains from textarea (one per line)
        const excludedDomains = this.parseDomainsList(excludedDomainsText);
        const includedDomains = this.parseDomainsList(includedDomainsText);
        
        // Create capture settings object
        const captureSettings = {
          automaticCapture,
          minTimeOnPage,
          excludedDomains,
          includedDomains
        };
        
        logger.debug('Saving capture settings', captureSettings);
        
        // Save to storage
        await chrome.storage.local.set({ captureSettings });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { captureSettings }
        });

        ui.showSaveConfirmation(captureSettingsForm);
        notificationService.showNotification('Capture settings saved successfully', 'success');
        
        logger.info('Capture settings saved successfully');
      } catch (error) {
        logger.error('Error saving capture settings:', error);
        notificationService.showNotification('Error saving capture settings: ' + error.message, 'error');
      }
    });
  },
  
  /**
   * Parse domains list from textarea content
   * @param {string} domainsText - Text containing domains
   * @returns {Array} Array of domain strings
   */
  parseDomainsList(domainsText) {
    if (!domainsText) return [];
    
    return domainsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  },
  
  /**
   * Set up analysis settings form handler
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @param {Object} ui - UI utilities
   */
  setupAnalysisSettingsForm(logger, notificationService, ui) {
    logger.debug('Setting up analysis settings form');
    
    const analysisSettingsForm = document.getElementById('analysis-settings-form');
    if (!analysisSettingsForm) {
      logger.warn('Analysis settings form not found');
      return;
    }
    
    analysisSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      logger.info('Analysis settings form submitted');
      
      try {
        // Get form values
        const autoAnalyze = document.getElementById('auto-analyze')?.checked || false;
        
        // Create analysis settings object
        const analysisSettings = {
          autoAnalyze
          // Additional settings can be added here
        };
        
        logger.debug('Saving analysis settings', analysisSettings);
        
        // Save to storage
        await chrome.storage.local.set({ analysisSettings });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { analysisSettings }
        });

        ui.showSaveConfirmation(analysisSettingsForm);
        notificationService.showNotification('Analysis settings saved successfully', 'success');
        
        logger.info('Analysis settings saved successfully');
      } catch (error) {
        logger.error('Error saving analysis settings:', error);
        notificationService.showNotification('Error saving analysis settings: ' + error.message, 'error');
      }
    });
  },
  
  /**
   * Set up action buttons in the settings panel
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   */
  setupActionButtons(logger, notificationService) {
    logger.debug('Setting up action buttons');
    
    try {
      // Set up clear data button
      const clearDataBtn = document.getElementById('clear-data-btn');
      if (clearDataBtn) {
        clearDataBtn.addEventListener('click', () => this.handleClearData(logger, notificationService));
        logger.debug('Clear data button listener attached');
      } else {
        logger.warn('Clear data button not found');
      }
      
      // Set up API test button
      const testApiBtn = document.getElementById('test-api-btn');
      if (testApiBtn) {
        testApiBtn.addEventListener('click', () => this.testApiConnection(logger, notificationService));
        logger.debug('Test API button listener attached');
      } else {
        logger.warn('Test API button not found');
      }
      
      // Set up export data button if it exists
      const exportDataBtn = document.getElementById('export-data-btn');
      if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => this.handleExportData(logger, notificationService));
        logger.debug('Export data button listener attached');
      }
      
      // Set up import data button if it exists
      const importDataBtn = document.getElementById('import-data-btn');
      if (importDataBtn) {
        importDataBtn.addEventListener('click', () => this.handleImportData(logger, notificationService));
        logger.debug('Import data button listener attached');
      }
      
      logger.info('Action buttons set up successfully');
    } catch (error) {
      logger.error('Error setting up action buttons:', error);
    }
  },
  
  /**
   * Test API connection with the configured URL
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @returns {Promise<void>}
   */
  async testApiConnection(logger, notificationService) {
    logger.info('Testing API connection');
    
    const testApiBtn = document.getElementById('test-api-btn');
    const apiStatusEl = document.getElementById('api-status');
    
    if (!testApiBtn || !apiStatusEl) {
      logger.warn('Test API button or status element not found');
      return;
    }
    
    // Update UI to show testing state
    testApiBtn.disabled = true;
    testApiBtn.textContent = 'Testing...';
    apiStatusEl.textContent = 'Checking connection...';
    apiStatusEl.className = 'status-checking';
    
    try {
      // Get API URL from input
      const apiUrl = document.getElementById('api-url')?.value?.trim();
      if (!apiUrl) {
        throw new Error('Please enter an API URL');
      }
      
      logger.debug(`Testing connection to API: ${apiUrl}`);
      
      // Test connection
      const response = await fetch(`${apiUrl}/api/v1/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        logger.info('API connection test successful', data);
        
        apiStatusEl.textContent = 'Connected successfully!';
        apiStatusEl.className = 'status-success';
        notificationService.showNotification('API connection successful', 'success');
      } else {
        const errorText = await response.text();
        logger.warn(`API returned status ${response.status}:`, errorText);
        
        throw new Error(`API returned status ${response.status}: ${errorText}`);
      }
    } catch (error) {
      logger.error('API connection test failed:', error);
      
      apiStatusEl.textContent = `Connection failed: ${error.message}`;
      apiStatusEl.className = 'status-error';
      notificationService.showNotification(`API connection failed: ${error.message}`, 'error');
    } finally {
      // Reset button state
      testApiBtn.disabled = false;
      testApiBtn.textContent = 'Test Connection';
      
      // Clear success status after delay (keep error status visible)
      setTimeout(() => {
        if (apiStatusEl.className !== 'status-error') {
          apiStatusEl.textContent = '';
          apiStatusEl.className = '';
        }
      }, 5000);
    }
  },
  
  /**
   * Handle clear data button click
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @returns {Promise<void>}
   */
  async handleClearData(logger, notificationService) {
    logger.info('Clear data button clicked');
    
    // Confirm with user
    if (!confirm('Are you sure you want to clear all locally stored data? This cannot be undone.')) {
      logger.debug('User cancelled clear data operation');
      return;
    }
    
    try {
      logger.debug('Clearing local data');
      notificationService.showNotification('Clearing local data...', 'info');
      
      // Clear specific storage items but keep settings
      await chrome.storage.local.remove([
        'captureHistory', 
        'stats', 
        'chatHistory', 
        'pendingRequests',
        'taskHistory',
        'graphCache'
      ]);
      
      // Notify background script
      chrome.runtime.sendMessage({ action: 'clearLocalData' });
      
      logger.info('Local data cleared successfully');
      notificationService.showNotification('Local data cleared successfully', 'success');
      
      // Show alert for user confirmation
      alert('Local data cleared successfully');
      
      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      logger.error('Error clearing data:', error);
      notificationService.showNotification(`Error clearing data: ${error.message}`, 'error');
      
      // Show alert for error
      alert('Error clearing data: ' + error.message);
    }
  },
  
  /**
   * Handle export data button click
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @returns {Promise<void>}
   */
  async handleExportData(logger, notificationService) {
    logger.info('Export data button clicked');
    
    try {
      notificationService.showNotification('Preparing data export...', 'info');
      
      // Get data from storage
      const data = await chrome.storage.local.get([
        'apiConfig', 
        'captureSettings', 
        'analysisSettings',
        'captureHistory',
        'stats'
      ]);
      
      // Remove sensitive information
      if (data.apiConfig && data.apiConfig.apiKey) {
        data.apiConfig.apiKey = '[REDACTED]';
      }
      
      // Create export object with metadata
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data
      };
      
      // Convert to JSON
      const jsonData = JSON.stringify(exportData, null, 2);
      
      // Create download link
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `marvin-export-${new Date().toISOString().slice(0, 10)}.json`;
      
      // Create and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      logger.info('Data exported successfully');
      notificationService.showNotification('Data exported successfully', 'success');
    } catch (error) {
      logger.error('Error exporting data:', error);
      notificationService.showNotification(`Error exporting data: ${error.message}`, 'error');
    }
  },
  
  /**
   * Handle import data button click
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @returns {Promise<void>}
   */
  async handleImportData(logger, notificationService) {
    logger.info('Import data button clicked');
    
    try {
      // Create file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      // Handle file selection
      fileInput.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) {
            logger.warn('No file selected');
            return;
          }
          
          logger.debug(`File selected: ${file.name}`);
          notificationService.showNotification('Reading import file...', 'info');
          
          // Read file
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const jsonData = JSON.parse(event.target.result);
              
              // Validate import data
              if (!jsonData.version || !jsonData.data) {
                throw new Error('Invalid import file format');
              }
              
              // Confirm import
              if (!confirm('Are you sure you want to import this data? This will overwrite your current settings.')) {
                logger.debug('User cancelled import operation');
                return;
              }
              
              logger.debug('Importing data');
              notificationService.showNotification('Importing data...', 'info');
              
              // Extract data
              const { apiConfig, captureSettings, analysisSettings } = jsonData.data;
              
              // Store in local storage
              await chrome.storage.local.set({
                apiConfig,
                captureSettings,
                analysisSettings
              });
              
              // Notify background script
              chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: { apiConfig, captureSettings, analysisSettings }
              });
              
              logger.info('Data imported successfully');
              notificationService.showNotification('Data imported successfully', 'success');
              
              // Reload page to reflect changes
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } catch (parseError) {
              logger.error('Error parsing import file:', parseError);
              notificationService.showNotification(`Error parsing import file: ${parseError.message}`, 'error');
            }
          };
          
          reader.onerror = () => {
            logger.error('Error reading file');
            notificationService.showNotification('Error reading file', 'error');
          };
          
          reader.readAsText(file);
        } catch (fileError) {
          logger.error('Error handling file:', fileError);
          notificationService.showNotification(`Error handling file: ${fileError.message}`, 'error');
        }
      };
      
      // Trigger file selection
      fileInput.click();
    } catch (error) {
      logger.error('Error importing data:', error);
      notificationService.showNotification(`Error importing data: ${error.message}`, 'error');
    }
  },
  
  /**
   * Set up status monitoring for network and API
   */
  setupStatusMonitoring() {
    const logger = new (container.getUtil('LogManager'))({
      context: 'settings-panel-status',
      isBackgroundScript: false
    });
    
    logger.debug('Setting up status monitoring');
    
    try {
      // Network status
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      if (!statusDot || !statusText) {
        logger.warn('Status indicators not found');
        return;
      }
      
      function updateNetworkStatus() {
        if (navigator.onLine) {
          statusDot.classList.add('online');
          statusText.textContent = 'Online';
        } else {
          statusDot.classList.remove('online');
          statusText.textContent = 'Offline';
        }
        
        // Send status to service worker
        chrome.runtime.sendMessage({ 
          action: 'networkStatusChange', 
          isOnline: navigator.onLine 
        });
        
        logger.debug(`Network status updated: ${navigator.onLine ? 'Online' : 'Offline'}`);
      }
      
      // Check initial status
      updateNetworkStatus();
      
      // Listen for changes
      window.addEventListener('online', updateNetworkStatus);
      window.addEventListener('offline', updateNetworkStatus);
      
      logger.info('Status monitoring set up successfully');
    } catch (error) {
      logger.error('Error setting up status monitoring:', error);
    }
  },
  
  /**
   * Reset settings to defaults
   * @returns {Promise<void>}
   */
  async resetSettingsToDefaults() {
    const logger = new (container.getUtil('LogManager'))({
      context: 'settings-panel',
      isBackgroundScript: false
    });
    
    const notificationService = container.getService('notificationService');
    
    logger.info('Resetting settings to defaults');
    
    // Confirm with user
    if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      logger.debug('User cancelled reset operation');
      return;
    }
    
    try {
      notificationService.showNotification('Resetting settings...', 'info');
      
      // Default settings
      const defaultSettings = {
        apiConfig: {
          baseUrl: 'http://localhost:8000'
        },
        captureSettings: {
          automaticCapture: true,
          minTimeOnPage: 10,
          excludedDomains: [],
          includedDomains: []
        },
        analysisSettings: {
          autoAnalyze: true
        }
      };
      
      // Save defaults to storage
      await chrome.storage.local.set(defaultSettings);
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: defaultSettings
      });
      
      logger.info('Settings reset to defaults');
      notificationService.showNotification('Settings reset to defaults', 'success');
      
      // Reload page to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      logger.error('Error resetting settings:', error);
      notificationService.showNotification(`Error resetting settings: ${error.message}`, 'error');
    }
  }
};

// Export using named export
export { SettingsPanel };