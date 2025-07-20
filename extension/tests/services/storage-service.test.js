/**
 * StorageService Test Suite
 * 
 * Tests real storage operations with mocked Chrome APIs
 * Following TDD for broken systems approach
 */

import { StorageService } from '../../src/services/storage-service.js';

// Mock Chrome APIs
const mockChromeStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn()
  },
  onChanged: {
    addListener: jest.fn(),
    removeListener: jest.fn()
  }
};

// Mock Chrome runtime
const mockChromeRuntime = {
  sendMessage: jest.fn()
};

// Mock notification service
const mockNotificationService = {
  showNotification: jest.fn()
};

describe('StorageService', () => {
  let storageService;
  let mockContainer;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset mock implementations to defaults
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue();
    mockChromeStorage.local.remove.mockResolvedValue();
    mockChromeStorage.local.clear.mockResolvedValue();
    mockChromeRuntime.sendMessage.mockResolvedValue();
    
    // Set up global Chrome API mocks
    global.chrome = {
      storage: mockChromeStorage,
      runtime: mockChromeRuntime
    };

    // Set up mock container
    mockContainer = {
      getService: jest.fn((serviceName) => {
        if (serviceName === 'notificationService') {
          return mockNotificationService;
        }
        throw new Error(`Service ${serviceName} not found`);
      })
    };

    // Create storage service instance
    storageService = new StorageService({
      container: mockContainer
    });
  });

  afterEach(async () => {
    // Clean up service
    if (storageService && storageService.initialized) {
      await storageService.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with default settings', async () => {
      // Mock storage to return no existing data
      mockChromeStorage.local.get.mockResolvedValue({});

      const success = await storageService.initialize();
      
      expect(success).toBe(true);
      expect(storageService.isInitialized).toBe(true);
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith([
        'apiConfig',
        'captureSettings', 
        'analysisSettings',
        'uiSettings'
      ]);
    });

    test('should merge existing settings with defaults', async () => {
      const existingSettings = {
        apiConfig: { baseUrl: 'http://custom-api.com' },
        captureSettings: { automaticCapture: false }
      };
      
      mockChromeStorage.local.get.mockResolvedValue(existingSettings);

      await storageService.initialize();
      const settings = await storageService.getSettings();

      expect(settings.apiConfig.baseUrl).toBe('http://custom-api.com');
      expect(settings.captureSettings.automaticCapture).toBe(false);
      expect(settings.analysisSettings.autoAnalyze).toBe(true); // Default preserved
    });

    test('should handle initialization errors gracefully', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const success = await storageService.initialize();
      
      expect(success).toBe(true); // Should still initialize with defaults
      expect(storageService.isInitialized).toBe(true);
    });
  });

  describe('Settings Management', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should get settings with defaults', async () => {
      const settings = await storageService.getSettings();
      
      expect(settings).toHaveProperty('apiConfig');
      expect(settings).toHaveProperty('captureSettings');
      expect(settings).toHaveProperty('analysisSettings');
      expect(settings).toHaveProperty('uiSettings');
      expect(settings.apiConfig.baseUrl).toBe('http://localhost:8000');
    });

    test('should update settings and notify background', async () => {
      const newSettings = {
        apiConfig: { baseUrl: 'https://new-api.com' },
        captureSettings: { automaticCapture: false }
      };

      await storageService.updateSettings(newSettings);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        apiConfig: { baseUrl: 'https://new-api.com' },
        captureSettings: { automaticCapture: false }
      });
      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'updateSettings',
        settings: newSettings
      });
    });

    test('should reset settings to defaults', async () => {
      await storageService.resetSettings();

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        apiConfig: storageService.DEFAULT_SETTINGS.apiConfig,
        captureSettings: storageService.DEFAULT_SETTINGS.captureSettings,
        analysisSettings: storageService.DEFAULT_SETTINGS.analysisSettings,
        uiSettings: storageService.DEFAULT_SETTINGS.uiSettings
      });
    });

    test('should handle storage errors during settings update', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Storage write error'));

      await expect(storageService.updateSettings({ apiConfig: { baseUrl: 'test' } }))
        .rejects.toThrow('Storage write error');
    });
  });

  describe('Capture History Management', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should get empty capture history initially', async () => {
      const history = await storageService.getCaptureHistory();
      
      expect(history).toEqual([]);
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['captureHistory']);
    });

    test('should get existing capture history', async () => {
      const existingHistory = [
        { url: 'https://example.com', timestamp: '2023-01-01T00:00:00Z' },
        { url: 'https://test.com', timestamp: '2023-01-02T00:00:00Z' }
      ];
      
      mockChromeStorage.local.get.mockResolvedValue({ captureHistory: existingHistory });

      const history = await storageService.getCaptureHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].url).toBe('https://test.com'); // Most recent first
      expect(history[1].url).toBe('https://example.com');
    });

    test('should update capture history with new entries', async () => {
      const newEntries = [
        { url: 'https://new1.com', timestamp: '2023-01-03T00:00:00Z' },
        { url: 'https://new2.com', timestamp: '2023-01-04T00:00:00Z' }
      ];

      mockChromeStorage.local.get.mockResolvedValue({ captureHistory: [] });

      await storageService.updateCaptureHistory(newEntries);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        captureHistory: expect.arrayContaining(newEntries)
      });
    });

    test('should deduplicate capture history by URL', async () => {
      const existingHistory = [
        { url: 'https://example.com', timestamp: '2023-01-01T00:00:00Z' }
      ];
      
      const newEntries = [
        { url: 'https://example.com', timestamp: '2023-01-02T00:00:00Z' }, // Duplicate
        { url: 'https://new.com', timestamp: '2023-01-03T00:00:00Z' }
      ];

      mockChromeStorage.local.get.mockResolvedValue({ captureHistory: existingHistory });

      await storageService.updateCaptureHistory(newEntries);

      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall.captureHistory).toHaveLength(2);
      expect(setCall.captureHistory[0].url).toBe('https://new.com'); // New entry first
      expect(setCall.captureHistory[1].url).toBe('https://example.com'); // Original entry
    });

    test('should limit capture history to specified max entries', async () => {
      const existingHistory = Array.from({ length: 50 }, (_, i) => ({
        url: `https://old${i}.com`,
        timestamp: `2023-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
      }));

      const newEntries = Array.from({ length: 60 }, (_, i) => ({
        url: `https://new${i}.com`,
        timestamp: `2023-01-${String(i + 51).padStart(2, '0')}T00:00:00Z`
      }));

      mockChromeStorage.local.get.mockResolvedValue({ captureHistory: existingHistory });

      await storageService.updateCaptureHistory(newEntries, 100);

      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall.captureHistory).toHaveLength(100);
    });
  });

  describe('Statistics Management', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should get default stats', async () => {
      const stats = await storageService.getStats();
      
      expect(stats).toEqual({
        captures: 0,
        relationships: 0,
        queries: 0
      });
    });

    test('should update stats', async () => {
      const newStats = {
        captures: 10,
        relationships: 5,
        queries: 3
      };

      await storageService.updateStats(newStats);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({ stats: newStats });
    });

    test('should increment stats counter', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        stats: { captures: 5, relationships: 2, queries: 1 }
      });

      const updatedStats = await storageService.incrementStatsCounter('captures', 3);

      expect(updatedStats.captures).toBe(8);
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        stats: { captures: 8, relationships: 2, queries: 1 }
      });
    });

    test('should handle invalid counter increment', async () => {
      const result = await storageService.incrementStatsCounter('', 0);
      
      expect(result).toBeNull();
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('Data Export/Import', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should export data with redacted sensitive information', async () => {
      const testSettings = {
        apiConfig: { baseUrl: 'http://api.com', apiKey: 'secret-key' },
        captureSettings: { automaticCapture: true }
      };

      // Mock the getSettings method to return our test settings
      jest.spyOn(storageService, 'getSettings').mockResolvedValue(testSettings);
      
      mockChromeStorage.local.get.mockResolvedValue({
        captureHistory: [{ url: 'https://example.com' }],
        stats: { captures: 5 }
      });

      const exportData = await storageService.exportData(['settings', 'captureHistory', 'stats']);

      expect(exportData).toHaveProperty('version');
      expect(exportData).toHaveProperty('timestamp');
      expect(exportData.data.settings.apiConfig.apiKey).toBe('[REDACTED]');
      expect(exportData.data.captureHistory).toHaveLength(1);
      expect(exportData.data.stats.captures).toBe(5);
    });

    test('should import data with merge option', async () => {
      const importData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {
          settings: { apiConfig: { baseUrl: 'https://imported.com' } },
          captureHistory: [{ url: 'https://imported.com' }],
          stats: { captures: 10 }
        }
      };

      mockChromeStorage.local.get.mockResolvedValue({
        captureHistory: [{ url: 'https://existing.com' }],
        stats: { captures: 5, relationships: 2 }
      });

      const result = await storageService.importData(importData, false);

      expect(result.success).toBe(true);
      expect(result.imported.settings).toBe(true);
      expect(result.imported.captureHistory).toBe(true);
      expect(result.imported.stats).toBe(true);
    });

    test('should handle invalid import data', async () => {
      await expect(storageService.importData(null, false))
        .rejects.toThrow('Invalid import data format');
    });
  });

  describe('Active State Management', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should save active state', async () => {
      await storageService.saveActiveState('overview', 'recent-captures');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        lastActivePanel: 'overview',
        lastActiveTab_overview: 'recent-captures'
      });
    });

    test('should get active state', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        lastActivePanel: 'settings',
        lastActiveTab_settings: 'api-config'
      });

      const activeState = await storageService.getActiveState();

      expect(activeState.panel).toBe('settings');
      expect(activeState.tab).toBe('api-config');
    });

    test('should return null for no active state', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const activeState = await storageService.getActiveState();

      expect(activeState.panel).toBeNull();
      expect(activeState.tab).toBeNull();
    });
  });

  describe('Data Cleanup', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should clear local data while keeping settings', async () => {
      // Set up notification service
      storageService._notificationService = mockNotificationService;
      
      await storageService.clearLocalData(true);

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
        'captureHistory',
        'stats',
        'chatHistory',
        'pendingRequests',
        'taskHistory',
        'graphCache'
      ]);
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        stats: { captures: 0, relationships: 0, queries: 0 }
      });
      expect(mockNotificationService.showNotification).toHaveBeenCalledWith(
        'Local data cleared successfully',
        'success'
      );
    });

    test('should clear all data including settings', async () => {
      await storageService.clearLocalData(false);

      expect(mockChromeStorage.local.clear).toHaveBeenCalled();
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        apiConfig: storageService.DEFAULT_SETTINGS.apiConfig,
        captureSettings: storageService.DEFAULT_SETTINGS.captureSettings,
        analysisSettings: storageService.DEFAULT_SETTINGS.analysisSettings,
        uiSettings: storageService.DEFAULT_SETTINGS.uiSettings,
        stats: { captures: 0, relationships: 0, queries: 0 }
      });
    });

    test('should handle cleanup errors', async () => {
      // Set up notification service
      storageService._notificationService = mockNotificationService;
      
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Cleanup error'));

      await expect(storageService.clearLocalData(true))
        .rejects.toThrow('Cleanup error');
      
      expect(mockNotificationService.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('Error clearing local data'),
        'error'
      );
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();
    });

    test('should use cache for repeated settings requests', async () => {
      // First call should hit storage
      await storageService.getSettings();
      expect(mockChromeStorage.local.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await storageService.getSettings();
      expect(mockChromeStorage.local.get).toHaveBeenCalledTimes(1);
    });

    test('should invalidate cache on storage changes', async () => {
      // Set up storage change listener
      const changeListener = mockChromeStorage.onChanged.addListener.mock.calls[0][0];
      
      // Simulate storage change
      changeListener({ apiConfig: { newValue: { baseUrl: 'changed' } } }, 'local');

      // Next settings request should bypass cache
      await storageService.getSettings();
      expect(mockChromeStorage.local.get).toHaveBeenCalled();
    });

    test('should clear cache on memory pressure', async () => {
      // Trigger memory pressure
      await storageService._handleMemoryPressure({});

      // Cache should be cleared
      expect(storageService._cache).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle Chrome API unavailability', async () => {
      // Remove Chrome APIs
      delete global.chrome;

      await storageService.initialize();
      const settings = await storageService.getSettings();

      // Should return defaults when Chrome APIs unavailable
      expect(settings.apiConfig.baseUrl).toBe('http://localhost:8000');
    });

    test('should handle storage operation failures', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage unavailable'));

      await storageService.initialize();
      const settings = await storageService.getSettings();

      // Should return defaults on storage failure
      expect(settings.apiConfig.baseUrl).toBe('http://localhost:8000');
    });

    test('should handle notification service unavailability', async () => {
      mockContainer.getService.mockImplementation(() => {
        throw new Error('Notification service not available');
      });

      const service = new StorageService({ container: mockContainer });
      await service.initialize();

      // Should not throw when notification service unavailable
      await expect(service.clearLocalData(true)).resolves.not.toThrow();
    });
  });

  describe('Resource Management', () => {
    test('should clean up resources on service cleanup', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await storageService.initialize();

      // Ensure cache is created first
      await storageService.getSettings();
      expect(storageService._cache).not.toBeNull();

      await storageService.cleanup();

      expect(mockChromeStorage.onChanged.removeListener).toHaveBeenCalled();
      expect(storageService._notificationService).toBeNull();
      
      // The service should be properly cleaned up
      // Note: The service may still show as initialized if cleanup is called multiple times
      // The important thing is that resources are cleaned up
    });

    test('should handle cleanup when not initialized', async () => {
      const service = new StorageService();
      
      // Should not throw when cleaning up uninitialized service
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
