// services/storage-service.js
import { LogManager } from '../../shared/utils/log-manager.js';
import { showNotification } from './notification-service.js';

/**
 * Logger for storage service operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'storage-service',
  storageKey: 'marvin_storage_logs',
  maxEntries: 1000
});

// Default settings
const DEFAULT_SETTINGS = {
  apiConfig: {
    baseUrl: 'http://localhost:8000',
    apiKey: ''
  },
  captureSettings: {
    automaticCapture: true,
    minTimeOnPage: 30,
    excludedDomains: ['mail.google.com', 'twitter.com', 'facebook.com', 'instagram.com'],
    includedDomains: []
  },
  analysisSettings: {
    autoAnalyze: true,
    embedding: 'auto',
    minTokens: 100,
    maxTokens: 2000
  },
  uiSettings: {
    theme: 'system',
    fontSize: 'medium',
    sidebarWidth: 280,
    expandedSections: ['recent-captures', 'active-tasks']
  }
};

// Data cache
const cache = {
  settings: null,
  captureHistory: null,
  stats: null,
  lastRefresh: {
    settings: 0,
    captureHistory: 0,
    stats: 0
  }
};

// Cache TTL in ms
const CACHE_TTL = {
  settings: 60000, // 1 minute
  captureHistory: 30000, // 30 seconds
  stats: 60000 // 1 minute
};

/**
 * Initialize storage service
 * @returns {Promise<void>}
 */
export async function initStorageService() {
  logger.info('Initializing storage service');
  
  try {
    // Pre-load common data
    await getSettings();
    
    // Set up storage change listeners
    setupStorageListeners();
    
    logger.info('Storage service initialized successfully');
  } catch (error) {
    logger.error('Error initializing storage service:', error);
  }
}

/**
 * Set up listeners for storage changes
 * @returns {void}
 */
function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    
    logger.debug('Storage changes detected:', changes);
    
    // Clear relevant caches when data changes
    if (changes.apiConfig || changes.captureSettings || 
        changes.analysisSettings || changes.uiSettings) {
      cache.settings = null;
      logger.debug('Settings cache cleared due to storage changes');
    }
    
    if (changes.captureHistory) {
      cache.captureHistory = null;
      logger.debug('Capture history cache cleared due to storage changes');
    }
    
    if (changes.stats) {
      cache.stats = null;
      logger.debug('Stats cache cleared due to storage changes');
    }
  });
}

/**
 * Get settings from storage with defaults applied
 * @returns {Promise<Object>} Settings object
 */
export async function getSettings() {
  // Check cache first
  if (cache.settings && (Date.now() - cache.lastRefresh.settings < CACHE_TTL.settings)) {
    logger.debug('Returning cached settings');
    return cache.settings;
  }
  
  logger.debug('Getting settings from storage');
  
  try {
    const data = await chrome.storage.local.get([
      'apiConfig',
      'captureSettings',
      'analysisSettings',
      'uiSettings'
    ]);
    
    // Merge with defaults
    const settings = {
      apiConfig: { ...DEFAULT_SETTINGS.apiConfig, ...data.apiConfig },
      captureSettings: { ...DEFAULT_SETTINGS.captureSettings, ...data.captureSettings },
      analysisSettings: { ...DEFAULT_SETTINGS.analysisSettings, ...data.analysisSettings },
      uiSettings: { ...DEFAULT_SETTINGS.uiSettings, ...data.uiSettings }
    };
    
    // Update cache
    cache.settings = settings;
    cache.lastRefresh.settings = Date.now();
    
    logger.debug('Retrieved settings from storage', settings);
    return settings;
  } catch (error) {
    logger.error('Error getting settings:', error);
    
    // Return defaults on error
    logger.debug('Returning default settings due to error');
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Update settings in storage
 * @param {Object} settings - Settings object to update
 * @returns {Promise<void>}
 */
export async function updateSettings(settings) {
  if (!settings) {
    logger.warn('Attempted to update settings with null/undefined value');
    return;
  }
  
  logger.info('Updating settings', settings);
  
  try {
    // Only update provided sections
    const updates = {};
    
    if (settings.apiConfig) {
      updates.apiConfig = settings.apiConfig;
    }
    
    if (settings.captureSettings) {
      updates.captureSettings = settings.captureSettings;
    }
    
    if (settings.analysisSettings) {
      updates.analysisSettings = settings.analysisSettings;
    }
    
    if (settings.uiSettings) {
      updates.uiSettings = settings.uiSettings;
    }
    
    // Save to storage
    await chrome.storage.local.set(updates);
    
    // Clear cache
    cache.settings = null;
    
    // Send message to background script
    try {
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: updates
      });
    } catch (messageError) {
      logger.warn('Error sending settings update to background:', messageError);
    }
    
    logger.debug('Settings updated successfully');
  } catch (error) {
    logger.error('Error updating settings:', error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 * @returns {Promise<void>}
 */
export async function resetSettings() {
  logger.info('Resetting settings to defaults');
  
  try {
    await chrome.storage.local.set({
      apiConfig: DEFAULT_SETTINGS.apiConfig,
      captureSettings: DEFAULT_SETTINGS.captureSettings,
      analysisSettings: DEFAULT_SETTINGS.analysisSettings,
      uiSettings: DEFAULT_SETTINGS.uiSettings
    });
    
    // Clear cache
    cache.settings = null;
    
    // Send message to background script
    try {
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: DEFAULT_SETTINGS
      });
    } catch (messageError) {
      logger.warn('Error sending settings reset to background:', messageError);
    }
    
    logger.debug('Settings reset successfully');
  } catch (error) {
    logger.error('Error resetting settings:', error);
    throw error;
  }
}

/**
 * Get capture history from storage
 * @param {number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} Capture history entries
 */
export async function getCaptureHistory(limit = 0) {
  // Check cache first
  if (cache.captureHistory && (Date.now() - cache.lastRefresh.captureHistory < CACHE_TTL.captureHistory)) {
    logger.debug('Returning cached capture history');
    return limit > 0 ? cache.captureHistory.slice(0, limit) : cache.captureHistory;
  }
  
  logger.debug('Getting capture history from storage');
  
  try {
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    // Sort by timestamp (most recent first)
    captureHistory.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Update cache
    cache.captureHistory = captureHistory;
    cache.lastRefresh.captureHistory = Date.now();
    
    logger.debug(`Retrieved ${captureHistory.length} capture history entries`);
    
    // Apply limit if specified
    return limit > 0 ? captureHistory.slice(0, limit) : captureHistory;
  } catch (error) {
    logger.error('Error getting capture history:', error);
    return [];
  }
}

/**
 * Update capture history with new entries
 * @param {Array} newEntries - New capture history entries
 * @param {number} maxEntries - Maximum number of entries to keep
 * @returns {Promise<void>}
 */
export async function updateCaptureHistory(newEntries, maxEntries = 100) {
  if (!newEntries || newEntries.length === 0) {
    logger.debug('No new capture history entries to add');
    return;
  }
  
  logger.info(`Updating capture history with ${newEntries.length} new entries`);
  
  try {
    // Get existing history
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    // Add new entries
    const updatedHistory = [
      ...newEntries,
      ...captureHistory
    ];
    
    // Remove duplicates by URL
    const uniqueHistory = [];
    const urlSet = new Set();
    
    for (const entry of updatedHistory) {
      if (!urlSet.has(entry.url)) {
        urlSet.add(entry.url);
        uniqueHistory.push(entry);
      }
    }
    
    // Sort by timestamp (most recent first)
    uniqueHistory.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Limit to maxEntries
    const finalHistory = uniqueHistory.slice(0, maxEntries);
    
    // Save to storage
    await chrome.storage.local.set({ captureHistory: finalHistory });
    
    // Update cache
    cache.captureHistory = finalHistory;
    cache.lastRefresh.captureHistory = Date.now();
    
    // Update stats
    await incrementStatsCounter('captures', newEntries.length);
    
    logger.debug(`Capture history updated with ${newEntries.length} entries, total: ${finalHistory.length}`);
  } catch (error) {
    logger.error('Error updating capture history:', error);
    throw error;
  }
}

/**
 * Get stats from storage
 * @returns {Promise<Object>} Stats object
 */
export async function getStats() {
  // Check cache first
  if (cache.stats && (Date.now() - cache.lastRefresh.stats < CACHE_TTL.stats)) {
    logger.debug('Returning cached stats');
    return cache.stats;
  }
  
  logger.debug('Getting stats from storage');
  
  try {
    const data = await chrome.storage.local.get('stats');
    const stats = data.stats || {
      captures: 0,
      relationships: 0,
      queries: 0
    };
    
    // Update cache
    cache.stats = stats;
    cache.lastRefresh.stats = Date.now();
    
    logger.debug('Retrieved stats from storage', stats);
    return stats;
  } catch (error) {
    logger.error('Error getting stats:', error);
    
    // Return empty stats on error
    return {
      captures: 0,
      relationships: 0,
      queries: 0
    };
  }
}

/**
 * Update stats in storage
 * @param {Object} stats - Stats object to update
 * @returns {Promise<void>}
 */
export async function updateStats(stats) {
  if (!stats) {
    logger.warn('Attempted to update stats with null/undefined value');
    return;
  }
  
  logger.info('Updating stats', stats);
  
  try {
    await chrome.storage.local.set({ stats });
    
    // Update cache
    cache.stats = stats;
    cache.lastRefresh.stats = Date.now();
    
    logger.debug('Stats updated successfully');
  } catch (error) {
    logger.error('Error updating stats:', error);
    throw error;
  }
}

/**
 * Increment stats counter
 * @param {string} counter - Counter to increment
 * @param {number} amount - Amount to increment by
 * @returns {Promise<Object>} Updated stats
 */
export async function incrementStatsCounter(counter, amount = 1) {
  if (!counter || amount <= 0) {
    logger.warn(`Invalid counter increment: ${counter}, ${amount}`);
    return null;
  }
  
  logger.debug(`Incrementing stats counter ${counter} by ${amount}`);
  
  try {
    const stats = await getStats();
    
    // Increment the counter
    if (typeof stats[counter] === 'number') {
      stats[counter] += amount;
    } else {
      stats[counter] = amount;
    }
    
    // Save updated stats
    await updateStats(stats);
    
    logger.debug(`Stats counter ${counter} incremented successfully`);
    return stats;
  } catch (error) {
    logger.error(`Error incrementing stats counter ${counter}:`, error);
    return null;
  }
}

/**
 * Clear local storage data
 * @param {boolean} keepSettings - Whether to keep settings
 * @returns {Promise<void>}
 */
export async function clearLocalData(keepSettings = true) {
  logger.info(`Clearing local data${keepSettings ? ' (keeping settings)' : ''}`);
  
  try {
    if (keepSettings) {
      // Get current settings first
      const settings = await getSettings();
      
      // Clear specific storage items but keep settings
      await chrome.storage.local.remove([
        'captureHistory', 
        'stats', 
        'chatHistory', 
        'pendingRequests',
        'taskHistory',
        'graphCache'
      ]);
      
      // Reset stats
      await chrome.storage.local.set({ 
        stats: {
          captures: 0,
          relationships: 0,
          queries: 0
        }
      });
      
      // Clear caches
      cache.captureHistory = null;
      cache.stats = null;
      
      logger.debug('Local data cleared successfully (keeping settings)');
    } else {
      // Clear all local storage
      await chrome.storage.local.clear();
      
      // Reset to defaults for critical settings
      await chrome.storage.local.set({
        apiConfig: DEFAULT_SETTINGS.apiConfig,
        captureSettings: DEFAULT_SETTINGS.captureSettings,
        analysisSettings: DEFAULT_SETTINGS.analysisSettings,
        uiSettings: DEFAULT_SETTINGS.uiSettings,
        stats: {
          captures: 0,
          relationships: 0,
          queries: 0
        }
      });
      
      // Clear all caches
      cache.settings = null;
      cache.captureHistory = null;
      cache.stats = null;
      
      logger.debug('All local data cleared and defaults restored');
    }
    
    // Notify background script
    try {
      chrome.runtime.sendMessage({ 
        action: 'clearLocalData',
        keepSettings
      });
    } catch (messageError) {
      logger.warn('Error sending clearLocalData message to background:', messageError);
    }
    
    // Show notification
    showNotification('Local data cleared successfully', 'success');
  } catch (error) {
    logger.error('Error clearing local data:', error);
    showNotification(`Error clearing local data: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Export data to a downloadable file
 * @param {Array<string>} dataTypes - Types of data to export
 * @returns {Promise<Object>} Export data
 */
export async function exportData(dataTypes = ['settings', 'captureHistory', 'stats']) {
  logger.info(`Exporting data: ${dataTypes.join(', ')}`);
  
  try {
    // Prepare export object
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {}
    };
    
    // Get requested data types
    if (dataTypes.includes('settings')) {
      const settings = await getSettings();
      
      // Clone settings and remove sensitive data
      const exportSettings = JSON.parse(JSON.stringify(settings));
      if (exportSettings.apiConfig && exportSettings.apiConfig.apiKey) {
        exportSettings.apiConfig.apiKey = '[REDACTED]';
      }
      
      exportData.data.settings = exportSettings;
    }
    
    if (dataTypes.includes('captureHistory')) {
      const captureHistory = await getCaptureHistory();
      exportData.data.captureHistory = captureHistory;
    }
    
    if (dataTypes.includes('stats')) {
      const stats = await getStats();
      exportData.data.stats = stats;
    }
    
    logger.debug('Data exported successfully');
    return exportData;
  } catch (error) {
    logger.error('Error exporting data:', error);
    throw error;
  }
}

/**
 * Import data from file
 * @param {Object} importData - Data to import
 * @param {boolean} overwrite - Whether to overwrite existing data
 * @returns {Promise<Object>} Import result
 */
export async function importData(importData, overwrite = false) {
  if (!importData || !importData.data) {
    logger.warn('Invalid import data format');
    throw new Error('Invalid import data format');
  }
  
  logger.info('Importing data', { overwrite, version: importData.version });
  
  try {
    const result = {
      success: true,
      imported: {}
    };
    
    // Import settings if included
    if (importData.data.settings) {
      await updateSettings(importData.data.settings);
      result.imported.settings = true;
    }
    
    // Import capture history if included
    if (importData.data.captureHistory) {
      if (overwrite) {
        // Replace all entries
        await chrome.storage.local.set({ 
          captureHistory: importData.data.captureHistory 
        });
        cache.captureHistory = null;
      } else {
        // Merge with existing entries
        await updateCaptureHistory(importData.data.captureHistory);
      }
      result.imported.captureHistory = true;
    }
    
    // Import stats if included
    if (importData.data.stats) {
      if (overwrite) {
        await updateStats(importData.data.stats);
      } else {
        // Merge with existing stats
        const currentStats = await getStats();
        const mergedStats = { ...currentStats };
        
        // Add values from imported stats
        Object.entries(importData.data.stats).forEach(([key, value]) => {
          if (typeof value === 'number' && typeof mergedStats[key] === 'number') {
            mergedStats[key] += value;
          } else {
            mergedStats[key] = value;
          }
        });
        
        await updateStats(mergedStats);
      }
      result.imported.stats = true;
    }
    
    // Notify background script
    try {
      chrome.runtime.sendMessage({ 
        action: 'dataImported',
        dataTypes: Object.keys(result.imported)
      });
    } catch (messageError) {
      logger.warn('Error sending dataImported message to background:', messageError);
    }
    
    logger.debug('Data imported successfully', result);
    showNotification('Data imported successfully', 'success');
    
    return result;
  } catch (error) {
    logger.error('Error importing data:', error);
    showNotification(`Error importing data: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Save last active panel and tab
 * @param {string} panel - Active panel ID
 * @param {string} tab - Active tab ID
 * @returns {Promise<void>}
 */
export async function saveActiveState(panel, tab) {
  if (!panel) {
    logger.warn('Attempted to save active state with no panel ID');
    return;
  }
  
  logger.debug(`Saving active state: panel=${panel}, tab=${tab || 'none'}`);
  
  try {
    const updates = {};
    
    if (panel) {
      updates.lastActivePanel = panel;
    }
    
    if (tab) {
      updates[`lastActiveTab_${panel}`] = tab;
    }
    
    await chrome.storage.local.set(updates);
    logger.debug('Active state saved successfully');
  } catch (error) {
    logger.error('Error saving active state:', error);
  }
}

/**
 * Get last active panel and tab
 * @returns {Promise<Object>} Active state object
 */
export async function getActiveState() {
  logger.debug('Getting active state');
  
  try {
    const data = await chrome.storage.local.get(['lastActivePanel']);
    const panel = data.lastActivePanel;
    
    if (!panel) {
      logger.debug('No last active panel found');
      return { panel: null, tab: null };
    }
    
    // Get last active tab for this panel
    const tabKey = `lastActiveTab_${panel}`;
    const tabData = await chrome.storage.local.get([tabKey]);
    const tab = tabData[tabKey];
    
    logger.debug(`Retrieved active state: panel=${panel}, tab=${tab || 'none'}`);
    
    return { panel, tab };
  } catch (error) {
    logger.error('Error getting active state:', error);
    return { panel: null, tab: null };
  }
}

// Export all necessary functions
export {
  initStorageService,
  getSettings,
  updateSettings,
  resetSettings,
  getCaptureHistory,
  updateCaptureHistory,
  getStats,
  updateStats,
  incrementStatsCounter,
  clearLocalData,
  exportData,
  importData,
  saveActiveState,
  getActiveState
};