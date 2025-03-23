// background/background.js

// Import dependencies
import AuthManager from './auth-manager.js';
import MarvinAPIClient from './api-client.js';
import CaptureManager from './capture-manager.js';
import StateManager from './state-manager.js';

// Configuration (would be loaded from storage in real implementation)
const API_BASE_URL = 'http://localhost:8000';

// Initialize components
const authManager = new AuthManager();
const apiClient = new MarvinAPIClient(API_BASE_URL, authManager);
const captureManager = new CaptureManager(apiClient);
const stateManager = new StateManager(apiClient);

// Initialize on extension load
async function initialize() {
  console.log('Initializing Marvin extension...');
  try {
    await authManager.initialize();
    await captureManager.initialize();
    await stateManager.initialize();
    
    // Load configuration from storage
    const config = await chrome.storage.local.get('apiConfig');
    if (config.apiConfig?.baseUrl) {
      apiClient.baseURL = config.apiConfig.baseUrl;
    }
    
    console.log('Marvin extension initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // First-time installation
    chrome.tabs.create({ url: 'options/options.html' });
  } else if (details.reason === 'update') {
    // Extension update
    console.log('Marvin extension updated');
  }
});

// Message handler for communication with popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.action);
  
  // Handle various message types
  switch (message.action) {
    case 'captureCurrentTab':
      captureManager.captureCurrentTab()
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Indicates async response
      
    case 'checkAuthStatus':
      authManager.getToken()
        .then(token => sendResponse({ authenticated: !!token }))
        .catch(error => sendResponse({ authenticated: false, error: error.message }));
      return true;
      
    case 'login':
      authManager.login(message.username, message.password)
        .then(success => sendResponse({ success }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'logout':
      authManager.clearToken()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'updateSettings':
      captureManager.updateSettings(message.settings)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'syncBrowserState':
      stateManager.syncState()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'networkStatusChange':
      apiClient.handleNetworkChange(message.isOnline);
      return false; // No async response needed
      
    case 'extractedContent':
      captureManager.processExtractedContent(sender.tab, message.content, message.metadata)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

      case 'getDashboardData':
      chrome.storage.local.get(['captureHistory', 'stats'], (data) => {
        sendResponse(data);
      });
      return true; // Indicates async response

      case 'contentScriptPing':
        sendResponse({ success: true });
        return true;

      case 'pageVisible':
        // Handle page visibility change
        console.log('Page visible:', message.url);
        return false;

      case 'pageHidden':
        // Handle page visibility change
        console.log('Page hidden:', message.url);
        return false;
    }
});

// Initialize extension
initialize();