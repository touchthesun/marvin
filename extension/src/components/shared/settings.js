// shared/utils/settings.js

// Load settings from storage
export async function loadSettings() {
    const data = await chrome.storage.local.get([
      'apiConfig',
      'captureSettings'
    ]);
    
    return {
      apiUrl: data.apiConfig?.baseUrl || 'http://localhost:8000',
      automaticCapture: data.captureSettings?.automaticCapture !== false,
      minTimeOnPage: data.captureSettings?.minTimeOnPage || 10,
      excludedDomains: data.captureSettings?.excludedDomains || [],
      includedDomains: data.captureSettings?.includedDomains || []
    };
  }
  
  // Save settings to storage
  export async function saveSettings(settings) {
    // Handle API config
    if (settings.apiUrl) {
      await chrome.storage.local.set({
        apiConfig: { baseUrl: settings.apiUrl }
      });
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'updateApiConfig',
        config: { baseUrl: settings.apiUrl }
      });
    }
    
    // Handle capture settings
    if ('automaticCapture' in settings || 
        'minTimeOnPage' in settings ||
        'excludedDomains' in settings ||
        'includedDomains' in settings) {
      
      // Get current settings
      const data = await chrome.storage.local.get(['captureSettings']);
      const currentSettings = data.captureSettings || {};
      
      // Merge with new settings
      const newSettings = {
        ...currentSettings,
        automaticCapture: settings.automaticCapture !== undefined ? settings.automaticCapture : currentSettings.automaticCapture,
        minTimeOnPage: settings.minTimeOnPage !== undefined ? settings.minTimeOnPage : currentSettings.minTimeOnPage,
        excludedDomains: settings.excludedDomains !== undefined ? settings.excludedDomains : currentSettings.excludedDomains,
        includedDomains: settings.includedDomains !== undefined ? settings.includedDomains : currentSettings.includedDomains
      };
      
      await chrome.storage.local.set({ captureSettings: newSettings });
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: newSettings
      });
    }
    
    return true;
  }