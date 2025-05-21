// src/components/panels/settings/settings-panel.js
import { LogManager } from '../../../utils/log-manager.js'; 
import { container } from '../../../core/dependency-container.js';

/**
 * Settings Panel Component
 * Manages user settings and configuration
 */
const SettingsPanel = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  /**
   * Initialize settings panel
   * @returns {Promise<boolean>} Success state
   */
  async initSettingsPanel() {
    // Create logger directly
    const logger = new LogManager({
      context: 'settings-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.info('Initializing settings panel');
    
    try {
      // Check if already initialized
      if (this.initialized) {
        logger.debug('Settings panel already initialized');
        return true;
      }
      
      // Get dependencies with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      const ui = this.getService(logger, 'ui', {
        showSaveConfirmation: (form) => {
          const originalText = form.querySelector('button[type="submit"]')?.textContent;
          const button = form.querySelector('button[type="submit"]');
          if (button) {
            button.textContent = 'Saved!';
            setTimeout(() => {
              button.textContent = originalText;
            }, 2000);
          }
        }
      });
      
      // Load current settings
      await this.loadCurrentSettings(logger);
      
      // Set up form submission handlers
      this.setupSettingsForms(logger, notificationService, ui);
      
      // Set up action buttons
      this.setupActionButtons(logger, notificationService);
      
      // Set up status monitoring
      this.setupStatusMonitoring(logger);
      
      this.initialized = true;
      logger.info('Settings panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing settings panel:', error);
      
      // Get notification service with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Failed to initialize settings panel', 'error');
      
      // Show error in the settings container
      const settingsContainer = document.querySelector('.settings-container');
      if (settingsContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-state';
        errorDiv.innerHTML = `
          Error initializing settings: ${error.message}
          <br><br>
          <button id="retry-settings-btn" class="btn-secondary">Retry</button>
        `;
        
        settingsContainer.innerHTML = '';
        settingsContainer.appendChild(errorDiv);
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retry-settings-btn');
        if (retryBtn) {
          const retryHandler = () => {
            this.initSettingsPanel();
          };
          
          retryBtn.addEventListener('click', retryHandler);
          
          // Track this listener for cleanup
          this._eventListeners.push({
            element: retryBtn,
            type: 'click',
            listener: retryHandler
          });
        }
      }
      
      return false;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(logger, serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
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
    
    const submitHandler = async (e) => {
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
    };
    
    apiConfigForm.addEventListener('submit', submitHandler);
    
    // Track this listener for cleanup
    this._eventListeners.push({
      element: apiConfigForm,
      type: 'submit',
      listener: submitHandler
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
    
    const submitHandler = async (e) => {
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
    };
    
    captureSettingsForm.addEventListener('submit', submitHandler);
    
    // Track this listener for cleanup
    this._eventListeners.push({
      element: captureSettingsForm,
      type: 'submit',
      listener: submitHandler
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
    
    const submitHandler = async (e) => {
      e.preventDefault();
      
      logger.info('Analysis settings form submitted');
      
      try {
        // Get form values
        const autoAnalyze = document.getElementById('auto-analyze')?.checked || false;
        
        // Create analysis settings object
        const analysisSettings = {
          autoAnalyze
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
    };
    
    analysisSettingsForm.addEventListener('submit', submitHandler);
    
    // Track this listener for cleanup
    this._eventListeners.push({
      element: analysisSettingsForm,
      type: 'submit',
      listener: submitHandler
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
        const clearDataHandler = () => this.handleClearData(logger, notificationService);
        clearDataBtn.addEventListener('click', clearDataHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: clearDataBtn,
          type: 'click',
          listener: clearDataHandler
        });
        
        logger.debug('Clear data button listener attached');
      } else {
        logger.warn('Clear data button not found');
      }
      
      // Set up API test button
      const testApiBtn = document.getElementById('test-api-btn');
      if (testApiBtn) {
        const testApiHandler = () => this.testApiConnection(logger, notificationService);
        testApiBtn.addEventListener('click', testApiHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: testApiBtn,
          type: 'click',
          listener: testApiHandler
        });
        
        logger.debug('Test API button listener attached');
      } else {
        logger.warn('Test API button not found');
      }
      
      // Set up export data button if it exists
      const exportDataBtn = document.getElementById('export-data-btn');
      if (exportDataBtn) {
        const exportDataHandler = () => this.handleExportData(logger, notificationService);
        exportDataBtn.addEventListener('click', exportDataHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: exportDataBtn,
          type: 'click',
          listener: exportDataHandler
        });
        
        logger.debug('Export data button listener attached');
      }
      
      // Set up import data button if it exists
      const importDataBtn = document.getElementById('import-data-btn');
      if (importDataBtn) {
        const importDataHandler = () => this.handleImportData(logger, notificationService);
        importDataBtn.addEventListener('click', importDataHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: importDataBtn,
          type: 'click',
          listener: importDataHandler
        });
        
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
      const timeoutId = setTimeout(() => {
        if (apiStatusEl.className !== 'status-error') {
          apiStatusEl.textContent = '';
          apiStatusEl.className = '';
        }
      }, 5000);
      
      // Track this timeout for cleanup
      this._timeouts.push(timeoutId);
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
      
      // Track this element for cleanup
      this._domElements.push(a);
      
      // Clean up
      const timeoutId = setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (error) {
          logger.warn('Error cleaning up export elements:', error);
        }
      }, 100);
      
      // Track this timeout for cleanup
      this._timeouts.push(timeoutId);
      
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
      
      // Track this element for cleanup
      this._domElements.push(fileInput);
      
      // Handle file selection
      const fileChangeHandler = async (e) => {
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
          
          const readerLoadHandler = async (event) => {
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
              const timeoutId = setTimeout(() => {
                window.location.reload();
              }, 1000);
              
              // Track this timeout for cleanup
              this._timeouts.push(timeoutId);
            } catch (parseError) {
              logger.error('Error parsing import file:', parseError);
              notificationService.showNotification(`Error parsing import file: ${parseError.message}`, 'error');
            }
          };
          
          reader.onload = readerLoadHandler;
          
          // Track this listener for cleanup
          this._eventListeners.push({
            element: reader,
            type: 'load',
            listener: readerLoadHandler
          });
          
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
      
      fileInput.addEventListener('change', fileChangeHandler);
      
      // Track this listener for cleanup
      this._eventListeners.push({
        element: fileInput,
        type: 'change',
        listener: fileChangeHandler
      });
      
      // Trigger file selection
      fileInput.click();
    } catch (error) {
      logger.error('Error importing data:', error);
      notificationService.showNotification(`Error importing data: ${error.message}`, 'error');
    }
  },
  
  /**
   * Set up status monitoring for network and API
   * @param {LogManager} logger - Logger instance
   */
  setupStatusMonitoring(logger) {
    logger.debug('Setting up status monitoring');
    
    try {
      // Network status
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      if (!statusDot || !statusText) {
        logger.warn('Status indicators not found');
        return;
      }
      
      const updateNetworkStatus = () => {
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
      };
      
      // Check initial status
      updateNetworkStatus();
      
      // Listen for changes
      window.addEventListener('online', updateNetworkStatus);
      window.addEventListener('offline', updateNetworkStatus);
      
      // Track these listeners for cleanup
      this._eventListeners.push(
        {
          element: window,
          type: 'online',
          listener: updateNetworkStatus
        },
        {
          element: window,
          type: 'offline',
          listener: updateNetworkStatus
        }
      );
      
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
    const logger = new LogManager({
      context: 'settings-panel',
      isBackgroundScript: false
    });
    
    const notificationService = this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
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
      const timeoutId = setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      // Track this timeout for cleanup
      this._timeouts.push(timeoutId);
    } catch (error) {
      logger.error('Error resetting settings:', error);
      notificationService.showNotification(`Error resetting settings: ${error.message}`, 'error');
    }
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'settings-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Settings panel not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up settings panel resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        logger.warn(`Error clearing interval:`, error);
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
        logger.warn(`Error removing event listener:`, error);
      }
    });
    this._eventListeners = [];
    
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode && !el.id?.includes('panel')) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    this.initialized = false;
    logger.debug('Settings panel cleanup completed');
  }
};

// Export using named export
export { SettingsPanel };