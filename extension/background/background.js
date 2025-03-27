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

// Consistent handler for captures
async function handleCaptureUrl(message, sender) {
  try {
    console.log('Processing capture request:', message.data);
    
    // Check that we have the right message structure
    if (!message.data || !message.data.url) {
      return {
        success: false,
        error: 'Invalid capture request: missing data or URL'
      };
    }
    
    const { url, context, tabId, windowId, title, content, browser_contexts } = message.data;
    
    // Add more detailed logging
    console.log('Capture data:', {
      url, context, tabId, windowId, title,
      hasContent: !!content,
      hasBrowserContexts: !!browser_contexts
    });
    
    // Process the capture with the capture manager
    // Make sure browser_contexts is included
    const pageData = {
      url: url,
      title: title || "",
      content: content || "",
      context: context || "ACTIVE_TAB",
      tab_id: tabId,
      window_id: windowId,
      browser_contexts: browser_contexts || [context || "ACTIVE_TAB"]
    };
    
    // Check if we're processing a tab capture
    if (tabId) {
      try {
        // Try to capture an existing tab by ID
        return await captureManager.captureTab(parseInt(tabId));
      } catch (tabError) {
        console.error('Error capturing tab:', tabError);
        // Fall back to direct URL capture
        return await directCapture(pageData);
      }
    } else {
      // Direct URL capture
      return await directCapture(pageData);
    }
  } catch (error) {
    console.error('Error in capture handler:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during capture'
    };
  }
}

// Add a helper function for direct capture
async function directCapture(pageData) {
  // Send to API
  const response = await apiClient.post('/api/v1/pages/', pageData);
  
  // Add detailed logging
  console.log('API response for capture:', response);
  
  // Update capture history if successful
  if (response.success) {
    await captureManager.updateCaptureHistory({
      url: pageData.url,
      title: pageData.title || pageData.url,
      timestamp: Date.now(),
      status: 'captured'
    });
  }
  
  return response;
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
  console.log('Background received message:', message);
  
  // Common handling for all capture-related messages
  if (message.action === 'captureUrl' || message.action === 'captureCurrentTab') {
    // Use Promise handling for async responses
    (async () => {
      try {
        const response = message.action === 'captureUrl' 
          ? await handleCaptureUrl(message, sender)
          : await captureManager.captureCurrentTab();
          
        console.log('Sending capture response:', response);
        sendResponse(response);
      } catch (error) {
        console.error('Error handling capture:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })();
    return true; // Indicate async response
  }
  
  // Handle various message types
  switch (message.action) {
      
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
