// options/options.js
import { LogManager } from '../utils/log-manager.js';

/**
 * Logger for options page operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'options-page',
  storageKey: 'marvin_options_logs',
  maxEntries: 1000
});

// Default settings
const DEFAULT_SETTINGS = {
  apiBaseUrl: 'http://localhost:8000',
  autoCapture: false,
  autoAnalyze: true,
  captureTimeout: 5,
  extractContent: true,
  maxConcurrentAnalysis: 2
};

/**
 * Initialize the options page
 */
async function initOptionsPage() {
  logger.info('Initializing options page');
  
  // Forms
  const apiConfigForm = document.getElementById('api-config-form');
  const captureSettingsForm = document.getElementById('capture-settings-form');
  const syncSettingsForm = document.getElementById('sync-settings-form');
  const analysisSettingsForm = document.getElementById('analysis-settings-form');
  const authForm = document.getElementById('auth-form');
  
  // Auth elements
  const authStatus = document.getElementById('auth-status');
  const logoutContainer = document.getElementById('logout-container');
  const logoutBtn = document.getElementById('logout-btn');
  
  // Other elements
  const clearDataBtn = document.getElementById('clear-data-btn');
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  
  // Load current settings
  await loadSettings();
  
  // Check authentication status
  await checkAuthStatus();
  
  // Set up form submission handlers
  setupFormHandlers(apiConfigForm, captureSettingsForm, syncSettingsForm, analysisSettingsForm, authForm);
  
  // Set up button handlers
  setupButtonHandlers(logoutBtn, clearDataBtn, resetSettingsBtn);
  
  // Report network status to service worker
  reportNetworkStatus();
  
  logger.info('Options page initialized successfully');
}

/**
 * Load current settings from storage
 */
async function loadSettings() {
  logger.debug('Loading current settings');
  
  try {
    const data = await chrome.storage.local.get([
      'apiConfig',
      'captureSettings',
      'stateSettings',
      'analysisSettings'
    ]);
    
    // API settings
    const apiConfig = data.apiConfig || { baseUrl: DEFAULT_SETTINGS.apiBaseUrl };
    document.getElementById('api-url').value = apiConfig.baseUrl;
    
    // Capture settings
    const captureSettings = data.captureSettings || {
      automaticCapture: DEFAULT_SETTINGS.autoCapture,
      minTimeOnPage: 10,
      excludedDomains: [],
      includedDomains: []
    };
    
    document.getElementById('auto-capture').checked = captureSettings.automaticCapture;
    document.getElementById('min-time').value = captureSettings.minTimeOnPage;
    document.getElementById('excluded-domains').value = captureSettings.excludedDomains.join('\n');
    document.getElementById('included-domains').value = captureSettings.includedDomains.join('\n');
    
    // Sync settings
    const stateSettings = data.stateSettings || {
      syncEnabled: true,
      syncInterval: 60000, // In milliseconds
      syncBookmarks: true
    };
    
    document.getElementById('enable-sync').checked = stateSettings.syncEnabled;
    document.getElementById('sync-interval').value = stateSettings.syncInterval / 1000; // Convert to seconds
    document.getElementById('sync-bookmarks').checked = stateSettings.syncBookmarks;
    
    // Analysis settings
    const analysisSettings = data.analysisSettings || {
      autoAnalyze: DEFAULT_SETTINGS.autoAnalyze,
      extractContent: DEFAULT_SETTINGS.extractContent,
      maxConcurrentAnalysis: DEFAULT_SETTINGS.maxConcurrentAnalysis
    };
    
    if (document.getElementById('auto-analyze')) {
      document.getElementById('auto-analyze').checked = analysisSettings.autoAnalyze;
    }
    
    if (document.getElementById('extract-content')) {
      document.getElementById('extract-content').checked = analysisSettings.extractContent;
    }
    
    if (document.getElementById('max-concurrent-analysis')) {
      document.getElementById('max-concurrent-analysis').value = analysisSettings.maxConcurrentAnalysis;
    }
    
    logger.debug('Settings loaded successfully');
  } catch (error) {
    logger.error('Error loading settings:', error);
    showErrorMessage('Failed to load settings: ' + error.message);
  }
}

/**
 * Check authentication status
 */
async function checkAuthStatus() {
  logger.debug('Checking authentication status');
  
  try {
    const authStatus = document.getElementById('auth-status');
    const authForm = document.getElementById('auth-form');
    const logoutContainer = document.getElementById('logout-container');
    
    if (!authStatus || !authForm || !logoutContainer) {
      logger.warn('Auth elements not found');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({ action: 'checkAuthStatus' });
    
    if (response.authenticated) {
      authStatus.innerHTML = '<div class="status-success">You are authenticated</div>';
      authForm.style.display = 'none';
      logoutContainer.style.display = 'block';
      logger.debug('User is authenticated');
    } else {
      authStatus.innerHTML = '<div class="status-error">Not authenticated</div>';
      authForm.style.display = 'block';
      logoutContainer.style.display = 'none';
      logger.debug('User is not authenticated');
    }
  } catch (error) {
    logger.error('Error checking auth status:', error);
    showErrorMessage('Failed to check authentication status: ' + error.message);
  }
}

/**
 * Set up form submission handlers
 */
function setupFormHandlers(apiConfigForm, captureSettingsForm, syncSettingsForm, analysisSettingsForm, authForm) {
  logger.debug('Setting up form handlers');
  
  // API Config Form
  if (apiConfigForm) {
    apiConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const baseUrl = document.getElementById('api-url').value;
        
        await chrome.storage.local.set({
          apiConfig: { baseUrl }
        });
        
        // Update API client in background
        chrome.runtime.sendMessage({
          action: 'updateApiConfig',
          config: { baseUrl }
        });
        
        showSaveConfirmation(apiConfigForm);
        logger.info('API config saved successfully');
      } catch (error) {
        logger.error('Error saving API config:', error);
        showErrorMessage('Failed to save API config: ' + error.message);
      }
    });
  }
  
  // Capture Settings Form
  if (captureSettingsForm) {
    captureSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const automaticCapture = document.getElementById('auto-capture').checked;
        const minTimeOnPage = parseInt(document.getElementById('min-time').value, 10);
        const excludedDomainsText = document.getElementById('excluded-domains').value;
        const includedDomainsText = document.getElementById('included-domains').value;
        
        // Parse domains, filtering empty lines
        const excludedDomains = excludedDomainsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
          
        const includedDomains = includedDomainsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        const settings = {
          automaticCapture,
          minTimeOnPage,
          excludedDomains,
          includedDomains
        };
        
        // Save settings
        await chrome.storage.local.set({ captureSettings: settings });
        
        // Update capture manager
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings
        });
        
        showSaveConfirmation(captureSettingsForm);
        logger.info('Capture settings saved successfully');
      } catch (error) {
        logger.error('Error saving capture settings:', error);
        showErrorMessage('Failed to save capture settings: ' + error.message);
      }
    });
  }
  
  // Sync Settings Form
  if (syncSettingsForm) {
    syncSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const syncEnabled = document.getElementById('enable-sync').checked;
        const syncInterval = parseInt(document.getElementById('sync-interval').value, 10) * 1000; // Convert to ms
        const syncBookmarks = document.getElementById('sync-bookmarks').checked;
        
        const settings = {
          syncEnabled,
          syncInterval,
          syncBookmarks
        };
        
        // Save settings
        await chrome.storage.local.set({ stateSettings: settings });
        
        // Update state manager
        chrome.runtime.sendMessage({
          action: 'updateSyncSettings',
          settings
        });
        
        showSaveConfirmation(syncSettingsForm);
        logger.info('Sync settings saved successfully');
      } catch (error) {
        logger.error('Error saving sync settings:', error);
        showErrorMessage('Failed to save sync settings: ' + error.message);
      }
    });
  }
  
  // Analysis Settings Form
  if (analysisSettingsForm) {
    analysisSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const autoAnalyze = document.getElementById('auto-analyze').checked;
        const extractContent = document.getElementById('extract-content').checked;
        const maxConcurrentAnalysis = parseInt(document.getElementById('max-concurrent-analysis').value, 10);
        
        // Validate settings
        const validatedMaxConcurrent = isNaN(maxConcurrentAnalysis) || 
                                      maxConcurrentAnalysis < 1 || 
                                      maxConcurrentAnalysis > 5 
                                        ? DEFAULT_SETTINGS.maxConcurrentAnalysis 
                                        : maxConcurrentAnalysis;
        
        const settings = {
          autoAnalyze,
          extractContent,
          maxConcurrentAnalysis: validatedMaxConcurrent
        };
        
        // Save settings
        await chrome.storage.local.set({ analysisSettings: settings });
        
        // Update analysis queue in background
        chrome.runtime.sendMessage({
          action: 'updateAnalysisSettings',
          settings
        });
        
        showSaveConfirmation(analysisSettingsForm);
        logger.info('Analysis settings saved successfully');
      } catch (error) {
        logger.error('Error saving analysis settings:', error);
        showErrorMessage('Failed to save analysis settings: ' + error.message);
      }
    });
  }
  
  // Auth Form
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Show loading state
        const submitButton = authForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        
        const response = await chrome.runtime.sendMessage({
          action: 'login',
          username,
          password
        });
        
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        
        if (response.success) {
          checkAuthStatus();
          logger.info('Login successful');
        } else {
          logger.warn('Login failed:', response.error);
          alert('Login failed: ' + (response.error || 'Unknown error'));
        }
      } catch (error) {
        logger.error('Error during login:', error);
        showErrorMessage('Login error: ' + error.message);
      }
    });
  }
}

/**
 * Set up button handlers
 */
function setupButtonHandlers(logoutBtn, clearDataBtn, resetSettingsBtn) {
  logger.debug('Setting up button handlers');
  
  // Logout Button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'logout' });
        checkAuthStatus();
        logger.info('Logout successful');
      } catch (error) {
        logger.error('Error during logout:', error);
        showErrorMessage('Logout error: ' + error.message);
      }
    });
  }
  
  // Clear Data Button
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
      try {
        if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
          await chrome.storage.local.clear();
          
          // Reload settings
          loadSettings();
          
          // Reinitialize background script
          chrome.runtime.sendMessage({ action: 'reinitialize' });
          
          alert('All local data has been cleared.');
          logger.info('Local data cleared');
        }
      } catch (error) {
        logger.error('Error clearing data:', error);
        showErrorMessage('Error clearing data: ' + error.message);
      }
    });
  }
  
  // Reset Settings Button
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
      try {
        if (confirm('Reset all settings to defaults?')) {
          // Save default API config
          await chrome.storage.local.set({
            apiConfig: { baseUrl: DEFAULT_SETTINGS.apiBaseUrl }
          });
          
          // Save default capture settings
          await chrome.storage.local.set({
            captureSettings: {
              automaticCapture: DEFAULT_SETTINGS.autoCapture,
              minTimeOnPage: 10,
              excludedDomains: [],
              includedDomains: []
            }
          });
          
          // Save default sync settings
          await chrome.storage.local.set({
            stateSettings: {
              syncEnabled: true,
              syncInterval: 60000,
              syncBookmarks: true
            }
          });
          
          // Save default analysis settings
          await chrome.storage.local.set({
            analysisSettings: {
              autoAnalyze: DEFAULT_SETTINGS.autoAnalyze,
              extractContent: DEFAULT_SETTINGS.extractContent,
              maxConcurrentAnalysis: DEFAULT_SETTINGS.maxConcurrentAnalysis
            }
          });
          
          // Reload settings
          loadSettings();
          
          // Notify background script
          chrome.runtime.sendMessage({ action: 'reinitialize' });
          
          alert('All settings have been reset to defaults.');
          logger.info('Settings reset to defaults');
        }
      } catch (error) {
        logger.error('Error resetting settings:', error);
        showErrorMessage('Error resetting settings: ' + error.message);
      }
    });
  }
}

/**
 * Report network status to service worker
 */
function reportNetworkStatus() {
  logger.debug('Setting up network status reporting');
  
  // Report initial status
  chrome.runtime.sendMessage({ 
    action: 'networkStatusChange',
    isOnline: navigator.onLine
  });
  
  // Add network status event listeners
  window.addEventListener('online', () => {
    logger.info('Network status changed: online');
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange',
      isOnline: true
    });
  });
  
  window.addEventListener('offline', () => {
    logger.info('Network status changed: offline');
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange',
      isOnline: false
    });
  });
}

/**
 * Show save confirmation message
 * @param {HTMLElement} form - Form element to show confirmation in
 */
function showSaveConfirmation(form) {
  logger.debug('Showing save confirmation');
  
  // Remove any existing confirmation
  const existingConfirmation = form.querySelector('.save-confirmation');
  if (existingConfirmation) {
    existingConfirmation.remove();
  }
  
  const confirmation = document.createElement('div');
  confirmation.className = 'save-confirmation';
  confirmation.textContent = 'Settings saved!';
  
  form.appendChild(confirmation);
  
  setTimeout(() => {
    confirmation.style.opacity = '0';
    setTimeout(() => {
      confirmation.remove();
    }, 300);
  }, 2000);
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
  logger.debug('Showing error message:', message);
  
  const errorContainer = document.getElementById('error-container');
  
  if (!errorContainer) {
    // Create error container if it doesn't exist
    const container = document.createElement('div');
    container.id = 'error-container';
    container.className = 'error-container';
    document.body.appendChild(container);
  }
  
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'error-close';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', () => {
    errorElement.remove();
  });
  
  errorElement.appendChild(closeButton);
  errorContainer.appendChild(errorElement);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    errorElement.classList.add('fade-out');
    setTimeout(() => {
      errorElement.remove();
    }, 300);
  }, 5000);
}

/**
 * Validate settings against defaults
 * @param {Object} settings - Settings to validate
 * @param {Object} defaults - Default settings
 * @returns {Object} Validated settings
 */
function validateSettings(settings, defaults) {
  const validated = { ...settings };
  
  // Validate API URL
  if (!validated.apiBaseUrl) {
    validated.apiBaseUrl = defaults.apiBaseUrl;
  }
  
  // Validate numeric values
  if (isNaN(validated.maxConcurrentAnalysis) || 
      validated.maxConcurrentAnalysis < 1 || 
      validated.maxConcurrentAnalysis > 5) {
    validated.maxConcurrentAnalysis = defaults.maxConcurrentAnalysis;
  }
  
  return validated;
}

// Initialize the options page when DOM is loaded
document.addEventListener('DOMContentLoaded', initOptionsPage);

// Export functions for testing or external use
export {
  initOptionsPage,
  loadSettings,
  checkAuthStatus,
  setupFormHandlers,
  setupButtonHandlers,
  reportNetworkStatus,
  showSaveConfirmation,
  showErrorMessage,
  validateSettings
};