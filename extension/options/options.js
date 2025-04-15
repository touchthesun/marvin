// options/options.js

document.addEventListener('DOMContentLoaded', async () => {
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
  
  // Default settings (from options-tbd.js)
  const DEFAULT_SETTINGS = {
    apiBaseUrl: 'http://localhost:8000',
    autoCapture: false,
    autoAnalyze: true,
    captureTimeout: 5,
    extractContent: true,
    maxConcurrentAnalysis: 2
  };
  
  // Load current settings
  async function loadSettings() {
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
    
    // Analysis settings (new from options-tbd.js)
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
  }
  
  // Check authentication status
  async function checkAuthStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuthStatus' });
    
    if (response.authenticated) {
      authStatus.innerHTML = '<div class="status-success">You are authenticated</div>';
      authForm.style.display = 'none';
      logoutContainer.style.display = 'block';
    } else {
      authStatus.innerHTML = '<div class="status-error">Not authenticated</div>';
      authForm.style.display = 'block';
      logoutContainer.style.display = 'none';
    }
  }
  
  // Form submission handlers
  apiConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
  });
  
  captureSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
  });
  
  syncSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
  });
  
  // New form handler for analysis settings
  if (analysisSettingsForm) {
    analysisSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
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
    });
  }
  
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
    } else {
      alert('Login failed: ' + (response.error || 'Unknown error'));
    }
  });
  
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'logout' });
    checkAuthStatus();
  });
  
  clearDataBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
      await chrome.storage.local.clear();
      
      // Reload settings
      loadSettings();
      
      // Reinitialize background script
      chrome.runtime.sendMessage({ action: 'reinitialize' });
      
      alert('All local data has been cleared.');
    }
  });
  
  // New reset settings button from options-tbd.js
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
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
      }
    });
  }
  
  // Helper function to show save confirmation
  function showSaveConfirmation(form) {
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
  
  // Helper function to validate settings (from options-tbd.js)
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
  
  // Initialize page
  loadSettings();
  checkAuthStatus();
  
  // Report network status to service worker
  chrome.runtime.sendMessage({ 
    action: 'networkStatusChange',
    isOnline: navigator.onLine
  });
  
  // Add network status event listeners
  window.addEventListener('online', () => {
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange',
      isOnline: true
    });
  });
  
  window.addEventListener('offline', () => {
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange',
      isOnline: false
    });
  });
});
