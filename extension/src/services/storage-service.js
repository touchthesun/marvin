// src/services/storage-service.js
import { LogManager } from '../utils/log-manager.js';
import { BaseService } from '../services/base-service.js'

/**
 * StorageService - Manages browser storage operations and caching
 */
export class StorageService extends BaseService {
  /**
   * Create a new StorageService instance
   * @param {Object} options - Service options
   * @param {LogManager} [options.logger] - Logger instance
   * @param {Object} [options.notificationService] - Notification service instance
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 3,
      retryBackoffBase: 1000,
      retryBackoffMax: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });
    
    // Private properties
    this._logger = options.logger || new LogManager({
      context: 'storage-service',
      isBackgroundScript: false,
      storageKey: 'marvin_storage_logs',
      maxEntries: 1000
    });

    this._notificationService = options.notificationService || null;
    
    // Default settings (frozen to prevent modifications)
    this._DEFAULT_SETTINGS = Object.freeze({
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
    });
    
    // Cache configuration
    this._CACHE_TTL = Object.freeze({
      settings: 60000, // 1 minute
      captureHistory: 30000, // 30 seconds
      stats: 60000 // 1 minute
    });

    this._CACHE_LIMITS = Object.freeze({
      captureHistory: 1000, // Maximum number of history entries
      stats: 100 // Maximum number of stat entries
    });
    
    // Data cache using WeakMap for object references
    this._cache = new WeakMap();
    this._cacheTimestamps = new Map();
    
    // Bind methods for event listeners
    this._handleStorageChanges = this._handleStorageChanges.bind(this);
  }

  /**
   * Service-specific initialization
   * @protected
   */
  async _performInitialization() {
    try {
      this._logger.info('Initializing storage service');
      
      // Pre-load common data
      await this.getSettings();
      
      // Set up storage change listeners using resource tracker
      this._setupStorageListeners();
      
      this._logger.info('Storage service initialized successfully');
    } catch (error) {
      this._logger.error('Error initializing storage service:', error);
      throw error;
    }
  }

  /**
   * Service-specific cleanup
   * @protected
   */
  async _performCleanup() {
    try {
      await this._clearAllCaches();
      this._logger.info('Storage service cleaned up successfully');
    } catch (error) {
      this._logger.error('Error during storage service cleanup:', error);
      throw error;
    }
  }

  /**
   * Handle memory pressure
   * @param {Object} snapshot - Memory usage snapshot
   * @protected
   */
  async _handleMemoryPressure(snapshot) {
    this._logger.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    await this._clearAllCaches();
  }

  /**
   * Clear all caches
   * @private
   */
  async _clearAllCaches() {
    this._cache = new WeakMap();
    this._cacheTimestamps.clear();
  }

  /**
   * Set up listeners for storage changes using resource tracker
   * @private
   */
  _setupStorageListeners() {
    try {
      // Remove any existing listeners first to prevent duplicates
      try {
        chrome.storage.onChanged.removeListener(this._handleStorageChanges);
      } catch (removeError) {
        this._logger.debug('No existing storage listener to remove');
      }
      
      // Add the listener using resource tracker
      this._resourceTracker.trackEventListener(
        chrome.storage.onChanged,
        'addListener',
        this._handleStorageChanges
      );
      
      this._logger.debug('Storage change listener set up');
    } catch (error) {
      this._logger.error('Error setting up storage listeners:', error);
      throw error;
    }
  }

  /**
   * Handle storage change events
   * @param {Object} changes - Changed storage items
   * @param {string} area - Storage area ('local', 'sync', etc.)
   * @private
   */
  _handleStorageChanges(changes, area) {
    if (!this._logger) return; // Skip if logger not available
    if (area !== 'local') return;
    
    this._logger.debug('Storage changes detected:', changes);
    
    // Clear relevant caches when data changes
    if (changes.apiConfig || changes.captureSettings || 
        changes.analysisSettings || changes.uiSettings) {
      this._cache.delete('settings');
      this._cacheTimestamps.delete('settings');
      this._logger.debug('Settings cache cleared due to storage changes');
    }
    
    if (changes.captureHistory) {
      this._cache.delete('captureHistory');
      this._cacheTimestamps.delete('captureHistory');
      this._logger.debug('Capture history cache cleared due to storage changes');
    }
    
    if (changes.stats) {
      this._cache.delete('stats');
      this._cacheTimestamps.delete('stats');
      this._logger.debug('Stats cache cleared due to storage changes');
    }
  }
  
  /**
   * Get settings from storage with defaults applied
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Storage service failed to initialize');
          // Return defaults on initialization failure
          return { ...this.DEFAULT_SETTINGS };
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        // Return defaults on initialization error
        return { ...this.DEFAULT_SETTINGS };
      }
    }
    
    // Check cache first
    if (this.cache.settings && (Date.now() - this.cache.lastRefresh.settings < this.CACHE_TTL.settings)) {
      this.logger.debug('Returning cached settings');
      return this.cache.settings;
    }
    
    this.logger.debug('Getting settings from storage');
    
    try {
      const data = await chrome.storage.local.get([
        'apiConfig',
        'captureSettings',
        'analysisSettings',
        'uiSettings'
      ]);
      
      // Merge with defaults
      const settings = {
        apiConfig: { ...this.DEFAULT_SETTINGS.apiConfig, ...data.apiConfig },
        captureSettings: { ...this.DEFAULT_SETTINGS.captureSettings, ...data.captureSettings },
        analysisSettings: { ...this.DEFAULT_SETTINGS.analysisSettings, ...data.analysisSettings },
        uiSettings: { ...this.DEFAULT_SETTINGS.uiSettings, ...data.uiSettings }
      };
      
      // Update cache
      this.cache.settings = settings;
      this.cache.lastRefresh.settings = Date.now();
      
      this.logger.debug('Retrieved settings from storage', settings);
      return settings;
    } catch (error) {
      this.logger.error('Error getting settings:', error);
      
      // Return defaults on error
      this.logger.debug('Returning default settings due to error');
      return { ...this.DEFAULT_SETTINGS };
    }
  }
  
  /**
   * Update settings in storage
   * @param {Object} settings - Settings object to update
   * @returns {Promise<void>}
   */
  async updateSettings(settings) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    if (!settings) {
      this.logger.warn('Attempted to update settings with null/undefined value');
      return;
    }
    
    this.logger.info('Updating settings', settings);
    
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
      this.cache.settings = null;
      
      // Send message to background script
      try {
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: updates
        });
      } catch (messageError) {
        this.logger.warn('Error sending settings update to background:', messageError);
      }
      
      this.logger.debug('Settings updated successfully');
    } catch (error) {
      this.logger.error('Error updating settings:', error);
      throw error;
    }
  }
  
  /**
   * Reset settings to defaults
   * @returns {Promise<void>}
   */
  async resetSettings() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    this.logger.info('Resetting settings to defaults');
    
    try {
      await chrome.storage.local.set({
        apiConfig: this.DEFAULT_SETTINGS.apiConfig,
        captureSettings: this.DEFAULT_SETTINGS.captureSettings,
        analysisSettings: this.DEFAULT_SETTINGS.analysisSettings,
        uiSettings: this.DEFAULT_SETTINGS.uiSettings
      });
      
      // Clear cache
      this.cache.settings = null;
      
      // Send message to background script
      try {
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: this.DEFAULT_SETTINGS
        });
      } catch (messageError) {
        this.logger.warn('Error sending settings reset to background:', messageError);
      }
      
      this.logger.debug('Settings reset successfully');
    } catch (error) {
      this.logger.error('Error resetting settings:', error);
      throw error;
    }
  }
  
  /**
   * Get capture history from storage
   * @param {number} limit - Maximum number of entries to return
   * @returns {Promise<Array>} Capture history entries
   */
  async getCaptureHistory(limit = 0) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Storage service failed to initialize');
          return []; // Return empty array on initialization failure
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        return []; // Return empty array on initialization error
      }
    }
    
    // Check cache first
    if (this.cache.captureHistory && (Date.now() - this.cache.lastRefresh.captureHistory < this.CACHE_TTL.captureHistory)) {
      this.logger.debug('Returning cached capture history');
      return limit > 0 ? this.cache.captureHistory.slice(0, limit) : this.cache.captureHistory;
    }
    
    this.logger.debug('Getting capture history from storage');
    
    try {
      const data = await chrome.storage.local.get('captureHistory');
      const captureHistory = data.captureHistory || [];
      
      // Sort by timestamp (most recent first)
      captureHistory.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      
      // Update cache
      this.cache.captureHistory = captureHistory;
      this.cache.lastRefresh.captureHistory = Date.now();
      
      this.logger.debug(`Retrieved ${captureHistory.length} capture history entries`);
      
      // Apply limit if specified
      return limit > 0 ? captureHistory.slice(0, limit) : captureHistory;
    } catch (error) {
      this.logger.error('Error getting capture history:', error);
      return [];
    }
  }
  
  /**
   * Update capture history with new entries
   * @param {Array} newEntries - New capture history entries
   * @param {number} maxEntries - Maximum number of entries to keep
   * @returns {Promise<void>}
   */
  async updateCaptureHistory(newEntries, maxEntries = 100) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    if (!newEntries || newEntries.length === 0) {
      this.logger.debug('No new capture history entries to add');
      return;
    }
    
    this.logger.info(`Updating capture history with ${newEntries.length} new entries`);
    
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
      this.cache.captureHistory = finalHistory;
      this.cache.lastRefresh.captureHistory = Date.now();
      
      // Update stats
      await this.incrementStatsCounter('captures', newEntries.length);
      
      this.logger.debug(`Capture history updated with ${newEntries.length} entries, total: ${finalHistory.length}`);
    } catch (error) {
      this.logger.error('Error updating capture history:', error);
      throw error;
    }
  }
  
  /**
   * Get stats from storage
   * @returns {Promise<Object>} Stats object
   */
  async getStats() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Storage service failed to initialize');
          // Return empty stats on initialization failure
          return {
            captures: 0,
            relationships: 0,
            queries: 0
          };
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        // Return empty stats on initialization error
        return {
          captures: 0,
          relationships: 0,
          queries: 0
        };
      }
    }
    
    // Check cache first
    if (this.cache.stats && (Date.now() - this.cache.lastRefresh.stats < this.CACHE_TTL.stats)) {
      this.logger.debug('Returning cached stats');
      return this.cache.stats;
    }
    
    this.logger.debug('Getting stats from storage');
    
    try {
      const data = await chrome.storage.local.get('stats');
      const stats = data.stats || {
        captures: 0,
        relationships: 0,
        queries: 0
      };
      
      // Update cache
      this.cache.stats = stats;
      this.cache.lastRefresh.stats = Date.now();
      
      this.logger.debug('Retrieved stats from storage', stats);
      return stats;
    } catch (error) {
      this.logger.error('Error getting stats:', error);
      
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
  async updateStats(stats) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    if (!stats) {
      this.logger.warn('Attempted to update stats with null/undefined value');
      return;
    }
    
    this.logger.info('Updating stats', stats);
    
    try {
      await chrome.storage.local.set({ stats });
      
      // Update cache
      this.cache.stats = stats;
      this.cache.lastRefresh.stats = Date.now();
      
      this.logger.debug('Stats updated successfully');
    } catch (error) {
      this.logger.error('Error updating stats:', error);
      throw error;
    }
  }
  
  /**
   * Increment stats counter
   * @param {string} counter - Counter to increment
   * @param {number} amount - Amount to increment by
   * @returns {Promise<Object>} Updated stats
   */
  async incrementStatsCounter(counter, amount = 1) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        return null;
      }
    }
    
    if (!counter || amount <= 0) {
      this.logger.warn(`Invalid counter increment: ${counter}, ${amount}`);
      return null;
    }
    
    this.logger.debug(`Incrementing stats counter ${counter} by ${amount}`);
    
    try {
      const stats = await this.getStats();
      
      // Increment the counter
      if (typeof stats[counter] === 'number') {
        stats[counter] += amount;
      } else {
        stats[counter] = amount;
      }
      
      // Save updated stats
      await this.updateStats(stats);
      
      this.logger.debug(`Stats counter ${counter} incremented successfully`);
      return stats;
    } catch (error) {
      this.logger.error(`Error incrementing stats counter ${counter}:`, error);
      return null;
    }
  }
  
  /**
   * Clear local storage data
   * @param {boolean} keepSettings - Whether to keep settings
   * @returns {Promise<void>}
   */
  async clearLocalData(keepSettings = true) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    this.logger.info(`Clearing local data${keepSettings ? ' (keeping settings)' : ''}`);
    
    try {
      if (keepSettings) {
        // Get current settings first
        const settings = await this.getSettings();
        
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
        this.cache.captureHistory = null;
        this.cache.stats = null;
        
        this.logger.debug('Local data cleared successfully (keeping settings)');
      } else {
        // Clear all local storage
        await chrome.storage.local.clear();
        
        // Reset to defaults for critical settings
        await chrome.storage.local.set({
          apiConfig: this.DEFAULT_SETTINGS.apiConfig,
          captureSettings: this.DEFAULT_SETTINGS.captureSettings,
          analysisSettings: this.DEFAULT_SETTINGS.analysisSettings,
          uiSettings: this.DEFAULT_SETTINGS.uiSettings,
          stats: {
            captures: 0,
            relationships: 0,
            queries: 0
          }
        });
        
        // Clear all caches
        this.cache.settings = null;
        this.cache.captureHistory = null;
        this.cache.stats = null;
        
        this.logger.debug('All local data cleared and defaults restored');
      }
      
      // Notify background script
      try {
        chrome.runtime.sendMessage({ 
          action: 'clearLocalData',
          keepSettings
        });
      } catch (messageError) {
        this.logger.warn('Error sending clearLocalData message to background:', messageError);
      }
      
      // Show notification
      if (this.notificationService) {
        this.notificationService.showNotification('Local data cleared successfully', 'success');
      }
    } catch (error) {
      this.logger.error('Error clearing local data:', error);
      
      if (this.notificationService) {
        this.notificationService.showNotification(`Error clearing local data: ${error.message}`, 'error');
      }
      
      throw error;
    }
  }
  
  /**
   * Export data to a downloadable file
   * @param {Array<string>} dataTypes - Types of data to export
   * @returns {Promise<Object>} Export data
   */
  async exportData(dataTypes = ['settings', 'captureHistory', 'stats']) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    this.logger.info(`Exporting data: ${dataTypes.join(', ')}`);
    
    try {
      // Prepare export object
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {}
      };
      
      // Get requested data types
      if (dataTypes.includes('settings')) {
        const settings = await this.getSettings();
        
        // Clone settings and remove sensitive data
        const exportSettings = JSON.parse(JSON.stringify(settings));
        if (exportSettings.apiConfig && exportSettings.apiConfig.apiKey) {
          exportSettings.apiConfig.apiKey = '[REDACTED]';
        }
        
        exportData.data.settings = exportSettings;
      }
      
      if (dataTypes.includes('captureHistory')) {
        const captureHistory = await this.getCaptureHistory();
        exportData.data.captureHistory = captureHistory;
      }
      
      if (dataTypes.includes('stats')) {
        const stats = await this.getStats();
        exportData.data.stats = stats;
      }
      
      this.logger.debug('Data exported successfully');
      return exportData;
    } catch (error) {
      this.logger.error('Error exporting data:', error);
      throw error;
    }
  }
  
  /**
   * Import data from file
   * @param {Object} importData - Data to import
   * @param {boolean} overwrite - Whether to overwrite existing data
   * @returns {Promise<Object>} Import result
   */
  async importData(importData, overwrite = false) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        throw error;
      }
    }
    
    if (!importData || !importData.data) {
      this.logger.warn('Invalid import data format');
      throw new Error('Invalid import data format');
    }
    
    this.logger.info('Importing data', { overwrite, version: importData.version });
    
    try {
      const result = {
        success: true,
        imported: {}
      };
      
      // Import settings if included
      if (importData.data.settings) {
        await this.updateSettings(importData.data.settings);
        result.imported.settings = true;
      }
      
      // Import capture history if included
      if (importData.data.captureHistory) {
        if (overwrite) {
          // Replace all entries
          await chrome.storage.local.set({ 
            captureHistory: importData.data.captureHistory 
          });
          this.cache.captureHistory = null;
        } else {
          // Merge with existing entries
          await this.updateCaptureHistory(importData.data.captureHistory);
        }
        result.imported.captureHistory = true;
      }
      
      // Import stats if included
      if (importData.data.stats) {
        if (overwrite) {
          await this.updateStats(importData.data.stats);
        } else {
          // Merge with existing stats
          const currentStats = await this.getStats();
          const mergedStats = { ...currentStats };
          
          // Add values from imported stats
          Object.entries(importData.data.stats).forEach(([key, value]) => {
            if (typeof value === 'number' && typeof mergedStats[key] === 'number') {
              mergedStats[key] += value;
            } else {
              mergedStats[key] = value;
            }
          });
          
          await this.updateStats(mergedStats);
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
        this.logger.warn('Error sending dataImported message to background:', messageError);
      }
      
      this.logger.debug('Data imported successfully', result);
      
      if (this.notificationService) {
        this.notificationService.showNotification('Data imported successfully', 'success');
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error importing data:', error);
      
      if (this.notificationService) {
        this.notificationService.showNotification(`Error importing data: ${error.message}`, 'error');
      }
      
      throw error;
    }
  }
  
  /**
   * Save last active panel and tab
   * @param {string} panel - Active panel ID
   * @param {string} tab - Active tab ID
   * @returns {Promise<void>}
   */
  async saveActiveState(panel, tab) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize storage service');
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        return; // Just return instead of throwing for this non-critical operation
      }
    }
    
    if (!panel) {
      this.logger.warn('Attempted to save active state with no panel ID');
      return;
    }
    
    this.logger.debug(`Saving active state: panel=${panel}, tab=${tab || 'none'}`);
    
    try {
      const updates = {};
      
      if (panel) {
        updates.lastActivePanel = panel;
      }
      
      if (tab) {
        updates[`lastActiveTab_${panel}`] = tab;
      }
      
      await chrome.storage.local.set(updates);
      this.logger.debug('Active state saved successfully');
    } catch (error) {
      this.logger.error('Error saving active state:', error);
    }
  }
  
  /**
   * Get last active panel and tab
   * @returns {Promise<Object>} Active state object
   */
  async getActiveState() {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          this.logger?.warn('Storage service failed to initialize');
          return { panel: null, tab: null };
        }
      } catch (error) {
        console.error('Error initializing storage service:', error);
        return { panel: null, tab: null };
      }
    }
    
    this.logger.debug('Getting active state');
    
    try {
      const data = await chrome.storage.local.get(['lastActivePanel']);
      const panel = data.lastActivePanel;
      
      if (!panel) {
        this.logger.debug('No last active panel found');
        return { panel: null, tab: null };
      }
      
      // Get last active tab for this panel
      const tabKey = `lastActiveTab_${panel}`;
      const tabData = await chrome.storage.local.get([tabKey]);
      const tab = tabData[tabKey];
      
      this.logger.debug(`Retrieved active state: panel=${panel}, tab=${tab || 'none'}`);
      
      return { panel, tab };
    } catch (error) {
      this.logger.error('Error getting active state:', error);
      return { panel: null, tab: null };
    }
  }
  
  /**
   * Cleanup service resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up storage service');
    
    // Remove event listeners
    try {
      chrome.storage.onChanged.removeListener(this.handleStorageChanges);
      this.logger.debug('Removed storage change listeners');
    } catch (error) {
      this.logger.warn('Error removing storage change listeners:', error);
    }
    
    // Clear and nullify caches
    this.cache.settings = null;
    this.cache.captureHistory = null;
    this.cache.stats = null;
    this.cache.lastRefresh = null;
    this.cache = null;
    
    // Clear object references
    this.notificationService = null;
    this.DEFAULT_SETTINGS = null;
    
    // Clear bound methods
    this.handleStorageChanges = null;
    
    // Clear logger reference
    this.logger = null;
    
    this.initialized = false;
  }
}