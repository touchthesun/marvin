// options.js
// JavaScript for the options page

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
  function initialize() {
    // Load current settings
    loadSettings();
    
    // Set up event listeners
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('resetBtn').addEventListener('click', resetSettings);
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
  }
  
  /**
   * Load settings from storage
   */
  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      // Populate form fields
      document.getElementById('apiBaseUrl').value = settings.apiBaseUrl;
      document.getElementById('autoCapture').checked = settings.autoCapture;
      document.getElementById('autoAnalyze').checked = settings.autoAnalyze;
      document.getElementById('captureTimeout').value = settings.captureTimeout;
      document.getElementById('extractContent').checked = settings.extractContent;
      document.getElementById('maxConcurrentAnalysis').value = settings.maxConcurrentAnalysis;
    });
  }
  
  /**
   * Save settings to storage
   */
  function saveSettings() {
    // Get values from form
    const settings = {
      apiBaseUrl: document.getElementById('apiBaseUrl').value.trim(),
      autoCapture: document.getElementById('autoCapture').checked,
      autoAnalyze: document.getElementById('autoAnalyze').checked,
      captureTimeout: parseInt(document.getElementById('captureTimeout').value, 10),
      extractContent: document.getElementById('extractContent').checked,
      maxConcurrentAnalysis: parseInt(document.getElementById('maxConcurrentAnalysis').value, 10)
    };
    
    // Validate settings
    if (!settings.apiBaseUrl) {
      settings.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
    }
    
    if (isNaN(settings.captureTimeout) || settings.captureTimeout < 1 || settings.captureTimeout > 60) {
      settings.captureTimeout = DEFAULT_SETTINGS.captureTimeout;
    }
    
    if (isNaN(settings.maxConcurrentAnalysis) || settings.maxConcurrentAnalysis < 1 || settings.maxConcurrentAnalysis > 5) {
      settings.maxConcurrentAnalysis = DEFAULT_SETTINGS.maxConcurrentAnalysis;
    }
    
    // Save to storage
    chrome.storage.sync.set(settings, () => {
      // Show success message
      const status = document.getElementById('status');
      status.textContent = 'Settings saved';
      status.className = 'status-success';
      status.style.display = 'block';
      
      // Hide message after 2 seconds
      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
      
      // Notify background script that settings changed
      chrome.runtime.sendMessage({
        action: 'settingsChanged',
        settings
      });
    });
  }
  
  /**
   * Reset settings to defaults
   */
  function resetSettings() {
    // Confirm with user
    if (!confirm('Reset all settings to defaults?')) {
      return;
    }
    
    // Save default settings
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      // Reload settings in the form
      loadSettings();
      
      // Show success message
      const status = document.getElementById('status');
      status.textContent = 'Settings reset to defaults';
      status.className = 'status-success';
      status.style.display = 'block';
      
      // Hide message after 2 seconds
      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
      
      // Notify background script that settings changed
      chrome.runtime.sendMessage({
        action: 'settingsChanged',
        settings: DEFAULT_SETTINGS
      });
    });
  }
  
  /**
   * Clear all Marvin data
   */
  function clearAllData() {
    // Confirm with user
    if (!confirm('Are you sure you want to delete all Marvin data? This cannot be undone.')) {
      return;
    }
    
    // Double-check - this is a destructive action
    if (!confirm('ALL data will be deleted, including your captured pages and analysis results. Continue?')) {
      return;
    }
    
    // Clear extension storage
    chrome.storage.local.clear(() => {
      const status = document.getElementById('status');
      status.textContent = 'All data has been cleared';
      status.className = 'status-success';
      status.style.display = 'block';
      
      // Notify background script to reset state
      chrome.runtime.sendMessage({
        action: 'dataCleared'
      });
    });
  }
  
  // Initialize the options page when the DOM is loaded
  document.addEventListener('DOMContentLoaded', initialize);