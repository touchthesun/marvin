/**
 * Marvin Extension Background Script
 *
 * Chrome Extension background worker that handles communication with FastAPI server.
 * Manages all message passing between content scripts, popup, and other extension components.
 */

import { apiClient } from './api-client.js';
import { containerInitializer } from '../core/container-init.js';
import AuthManager from './auth-manager.js';

// Initialize container system when background script loads
let containerInitialized = false;
const authManager = new AuthManager();

async function initializeBackgroundContainer() {
  if (containerInitialized) return;
  
  try {
    console.log('Background: Initializing container system');
    await containerInitializer.initialize({
      context: 'background',
      isBackgroundScript: true
    });
    containerInitialized = true;
    console.log('Background: Container system initialized successfully');
    
    // Initialize auth manager
    await authManager.initialize();
    console.log('Background: Auth manager initialized');
  } catch (error) {
    console.error('Background: Failed to initialize container system:', error);
  }
}

// Initialize container on script load
initializeBackgroundContainer();

// Service worker lifecycle events
self.addEventListener('install', (event) => {
  console.log('Marvin extension installing...');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Marvin extension activating...');
  event.waitUntil(self.clients.claim());
});

// Main message handler - handles all communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate input
  if (!message || typeof message !== 'object') {
    console.warn('Background received invalid message:', message);
    sendResponse({ success: false, error: 'Invalid message format' });
    return true;
  }

  console.log('Background received message:', message.action, 'from:', sender);

  try {
    switch (message.action) {
      // Core functionality
      case 'ping':
        sendResponse({ success: true, timestamp: Date.now() });
        break;
        
      case 'marvin_log_entry':
        handleLogEntry(message, sendResponse);
        break;
        
      case 'reinitialize':
        handleReinitialize(message, sendResponse);
        break;
        
      // Content script actions
      case 'contentScriptLoaded':
        handleContentScriptLoaded(message, sendResponse);
        break;
        
      case 'pageVisible':
        handlePageVisible(message, sendResponse);
        break;
        
      case 'pageHidden':
        handlePageHidden(message, sendResponse);
        break;
        
      case 'contentScriptPing':
        handleContentScriptPing(message, sendResponse);
        break;
        
      // Capture actions
      case 'captureUrl':
        handleCaptureUrl(message, sendResponse);
        break;
        
      case 'captureBatch':
        handleCaptureBatch(message, sendResponse);
        break;
        
      case 'captureTabs':
        handleCaptureTabs(message, sendResponse);
        break;
        
      case 'getTabs':
        handleGetTabs(message, sendResponse);
        break;
        
      case 'getBatchStatus':
        handleGetBatchStatus(message, sendResponse);
        break;
        
      // Analysis actions
      case 'analyzeUrl':
        handleAnalyzeUrl(message, sendResponse);
        break;
        
      // Task management
      case 'getActiveTasks':
        handleGetActiveTasks(message, sendResponse);
        break;
        
      case 'cancelTask':
        handleCancelTask(message, sendResponse);
        break;
        
      case 'retryTask':
        handleRetryTask(message, sendResponse);
        break;
        
      // Settings actions
      case 'updateSettings':
        handleUpdateSettings(message, sendResponse);
        break;
        
      case 'updateApiConfig':
        handleUpdateApiConfig(message, sendResponse);
        break;
        
      case 'updateSyncSettings':
        handleUpdateSyncSettings(message, sendResponse);
        break;
        
      case 'updateAnalysisSettings':
        handleUpdateAnalysisSettings(message, sendResponse);
        break;
        
      // Auth actions
      case 'login':
        handleLogin(message, sendResponse);
        break;
        
      case 'logout':
        handleLogout(message, sendResponse);
        break;
        
      case 'checkAuthStatus':
        handleCheckAuthStatus(message, sendResponse);
        break;
        
      // Panel actions
      case 'loadPanelData':
        handleLoadPanelData(message, sendResponse);
        break;
        
      // System actions
      case 'clearLocalData':
        handleClearLocalData(message, sendResponse);
        break;
        
      case 'dataImported':
        handleDataImported(message, sendResponse);
        break;
        
      // Network actions
      case 'networkStatusChange':
        handleNetworkStatusChange(message, sendResponse);
        break;
        
      // API actions
      case 'apiRequest':
        handleApiRequest(message, sendResponse);
        break;
        
      // Diagnostic actions
      case 'testComponentSystem':
        handleTestComponentSystem(message, sendResponse);
        break;
        
      case 'getMessageStatistics':
        handleGetMessageStatistics(message, sendResponse);
        break;
        
      case 'resetMessageStatistics':
        handleResetMessageStatistics(message, sendResponse);
        break;
        
      default:
        console.warn('Unknown action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', message.action, error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep message port open for async responses
});

// Chrome extension lifecycle events
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Marvin extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Handle first-time installation
    console.log('First time installation');
  } else if (details.reason === 'update') {
    // Handle extension update
    console.log('Extension updated from', details.previousVersion);
  }
});

// Tab events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Tab updated:', tabId, tab.url);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log('Tab created:', tab.id, tab.url);
});

// ========== MESSAGE HANDLERS ==========

// Core functionality handlers
function handleLogEntry(message, sendResponse) {
  console.log('Log entry received:', message.entry);
  sendResponse({ success: true, timestamp: Date.now() });
}

function handleReinitialize(message, sendResponse) {
  console.log('Reinitializing background script');
  sendResponse({ success: true });
}

// Content script handlers
function handleContentScriptLoaded(message, sendResponse) {
  console.log('Content script loaded:', message.url);
  sendResponse({ success: true });
}

function handlePageVisible(message, sendResponse) {
  console.log('Page became visible:', message.url);
  sendResponse({ success: true });
}

function handlePageHidden(message, sendResponse) {
  console.log('Page hidden:', message.url);
  sendResponse({ success: true });
}

function handleContentScriptPing(message, sendResponse) {
  console.log('Content script ping received');
  sendResponse({ success: true, timestamp: Date.now() });
}

// Capture handlers
async function handleCaptureUrl(message, sendResponse) {
  console.log('Capture URL requested:', message.url);
  
  try {
    const result = await apiClient.captureUrl(message.url, message.options || {});
    sendResponse({ success: true, data: result });
  } catch (error) {
    console.error('Failed to capture URL:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

async function handleCaptureBatch(message, sendResponse) {
  console.log('Capture batch requested:', message.urls);
  
  try {
    const result = await apiClient.captureBatch(message.urls, message.options || {});
    sendResponse({ success: true, result });
  } catch (error) {
    console.error('Failed to capture batch:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

async function handleCaptureTabs(message, sendResponse) {
  console.log('Capture tabs requested');
  
  try {
    // Get all tabs and capture them
    const tabs = await chrome.tabs.query({});
    const urls = tabs.map(tab => tab.url).filter(url => url && url.startsWith('http'));
    const result = await apiClient.captureBatch(urls, message.options || {});
    sendResponse({ success: true, result });
  } catch (error) {
    console.error('Failed to capture tabs:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

async function handleGetTabs(message, sendResponse) {
  console.log('Get tabs requested');
  
  try {
    // Get all windows with tabs
    const windows = await chrome.windows.getAll({ populate: true });
    console.log(`Background: Got ${windows.length} windows with tabs`);
    
    sendResponse({ 
      success: true, 
      windows: windows
    });
  } catch (error) {
    console.error('Failed to get tabs:', error);
    sendResponse({ 
      success: false, 
      error: error.message
    });
  }
}

async function handleGetBatchStatus(message, sendResponse) {
  console.log('Get batch status requested:', message.batchId);
  
  try {
    const result = await apiClient.getBatchStatus(message.batchId);
    sendResponse({ success: true, result });
  } catch (error) {
    console.error('Failed to get batch status:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

// Analysis handlers
function handleAnalyzeUrl(message, sendResponse) {
  console.log('Analyze URL requested:', message.url);
  // TODO: Implement analysis logic
  sendResponse({ success: true, message: 'Analyze URL handler - not yet implemented' });
}

// Task management handlers
async function handleGetActiveTasks(message, sendResponse) {
  console.log('Get active tasks requested');
  
  try {
    const response = await apiClient.getActiveTasks();
    // The API returns { success: true, data: { tasks: [...] } }
    const tasks = response.data?.tasks || [];
    sendResponse({ success: true, tasks });
  } catch (error) {
    console.error('Failed to get active tasks:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

async function handleCancelTask(message, sendResponse) {
  console.log('Cancel task requested:', message.taskId);
  
  try {
    const result = await apiClient.cancelTask(message.taskId);
    sendResponse({ success: true, result });
  } catch (error) {
    console.error('Failed to cancel task:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

async function handleRetryTask(message, sendResponse) {
  console.log('Retry task requested:', message.taskId);
  
  try {
    const result = await apiClient.retryTask(message.taskId);
    sendResponse({ success: true, result });
  } catch (error) {
    console.error('Failed to retry task:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

// Settings handlers
function handleUpdateSettings(message, sendResponse) {
  console.log('Update settings requested:', message.settings);
  // TODO: Implement settings update logic
  sendResponse({ success: true, message: 'Update settings handler - not yet implemented' });
}

function handleUpdateApiConfig(message, sendResponse) {
  console.log('Update API config requested:', message.config);
  // TODO: Implement API config update logic
  sendResponse({ success: true, message: 'Update API config handler - not yet implemented' });
}

function handleUpdateSyncSettings(message, sendResponse) {
  console.log('Update sync settings requested:', message.settings);
  // TODO: Implement sync settings update logic
  sendResponse({ success: true, message: 'Update sync settings handler - not yet implemented' });
}

function handleUpdateAnalysisSettings(message, sendResponse) {
  console.log('Update analysis settings requested:', message.settings);
  // TODO: Implement analysis settings update logic
  sendResponse({ success: true, message: 'Update analysis settings handler - not yet implemented' });
}

// Auth handlers
async function handleLogin(message, sendResponse) {
  console.log('Login requested:', message.username);
  try {
    const success = await authManager.login(message.username, message.password);
    sendResponse({ success, authenticated: success });
  } catch (error) {
    console.error('Login error:', error);
    sendResponse({ success: false, authenticated: false, error: error.message });
  }
}

async function handleLogout(message, sendResponse) {
  console.log('Logout requested');
  try {
    await authManager.clearToken();
    sendResponse({ success: true, authenticated: false });
  } catch (error) {
    console.error('Logout error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCheckAuthStatus(message, sendResponse) {
  console.log('Check auth status requested');
  try {
    const token = await authManager.getToken();
    const authenticated = !!token;
    sendResponse({ success: true, authenticated });
  } catch (error) {
    console.error('Auth status check error:', error);
    sendResponse({ success: false, authenticated: false, error: error.message });
  }
}

// Panel handlers
async function handleLoadPanelData(message, sendResponse) {
  console.log('Load panel data requested:', message.panelName);
  
  try {
    const response = await apiClient.getKnowledgeData(message.panelName, message.options || {});
    // The API returns { success: true, data: {...} }
    const data = response.data || {};
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('Failed to load panel data:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      serverAvailable: apiClient.isAvailable()
    });
  }
}

// System handlers
function handleClearLocalData(message, sendResponse) {
  console.log('Clear local data requested');
  // TODO: Implement local data clearing logic
  sendResponse({ success: true, message: 'Clear local data handler - not yet implemented' });
}

function handleDataImported(message, sendResponse) {
  console.log('Data imported notification:', message.data);
  // TODO: Implement data import handling logic
  sendResponse({ success: true, message: 'Data imported handler - not yet implemented' });
}

// Network handlers
function handleNetworkStatusChange(message, sendResponse) {
  console.log('Network status changed:', message.isOnline);
  // TODO: Implement network status change logic
  sendResponse({ success: true, message: 'Network status change handler - not yet implemented' });
}

// API handlers
function handleApiRequest(message, sendResponse) {
  console.log('API request:', message.endpoint);
  // TODO: Implement API request logic
  sendResponse({ success: true, message: 'API request handler - not yet implemented' });
}

// Diagnostic handlers
function handleTestComponentSystem(message, sendResponse) {
  console.log('Test component system requested');
  // TODO: Implement component system testing logic
  sendResponse({ success: true, message: 'Test component system handler - not yet implemented' });
}

function handleGetMessageStatistics(message, sendResponse) {
  console.log('Get message statistics requested');
  // TODO: Implement message statistics logic
  sendResponse({ success: true, statistics: {}, message: 'Get message statistics handler - not yet implemented' });
}

function handleResetMessageStatistics(message, sendResponse) {
  console.log('Reset message statistics requested');
  // TODO: Implement message statistics reset logic
  sendResponse({ success: true, message: 'Reset message statistics handler - not yet implemented' });
}

console.log('Marvin background script loaded successfully');
