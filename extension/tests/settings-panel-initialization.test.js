// tests/settings-panel-initialization.test.js
import { SettingsPanel } from '../src/components/panels/settings/settings-panel.js';

/**
 * Test suite for settings panel initialization issues
 * This test verifies that the settings panel can initialize properly
 * and identifies the root cause of the blank page issue
 */
describe('Settings Panel Initialization', () => {
  let mockContainer;
  let mockLogger;
  
  beforeEach(() => {
    // Mock the container
    mockContainer = {
      getService: jest.fn(),
      utils: {
        get: jest.fn()
      }
    };
    
    // Mock the LogManager
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Mock chrome.storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue()
        }
      },
      runtime: {
        sendMessage: jest.fn()
      }
    };
    
    // Mock document methods
    document.getElementById = jest.fn();
    document.querySelector = jest.fn();
    document.createElement = jest.fn(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      appendChild: jest.fn(),
      removeChild: jest.fn()
    }));
    
    // Reset the settings panel state
    SettingsPanel.initialized = false;
    SettingsPanel._eventListeners = [];
    SettingsPanel._timeouts = [];
    SettingsPanel._intervals = [];
    SettingsPanel._domElements = [];
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should identify missing DOM elements during initialization', async () => {
    // Mock the settings panel container
    const mockSettingsContainer = document.createElement('div');
    mockSettingsContainer.className = 'settings-container';
    document.querySelector.mockReturnValue(mockSettingsContainer);
    
    // Mock that all the required form elements are missing
    document.getElementById.mockReturnValue(null);
    
    // Mock container services
    mockContainer.getService.mockReturnValue({
      showNotification: jest.fn()
    });
    
    mockContainer.utils.get.mockReturnValue({
      showSaveConfirmation: jest.fn()
    });
    
    // Try to initialize the settings panel
    const result = await SettingsPanel.initialize();
    
    // Should fail because DOM elements are missing
    expect(result).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error initializing settings panel'),
      expect.any(Error)
    );
  });
  
  test('should create HTML content dynamically when DOM elements are missing', async () => {
    // Mock the settings panel container
    const mockSettingsContainer = document.createElement('div');
    mockSettingsContainer.className = 'settings-container';
    document.querySelector.mockReturnValue(mockSettingsContainer);
    
    // Mock that all the required form elements are missing initially
    document.getElementById.mockReturnValue(null);
    
    // Mock container services
    mockContainer.getService.mockReturnValue({
      showNotification: jest.fn()
    });
    
    mockContainer.utils.get.mockReturnValue({
      showSaveConfirmation: jest.fn()
    });
    
    // The settings panel should create the HTML content dynamically
    // This test verifies that the issue is the missing HTML content creation
    const result = await SettingsPanel.initialize();
    
    // Should fail because the panel doesn't create HTML content
    expect(result).toBe(false);
    
    // Verify that the error handling shows an error in the settings container
    expect(mockSettingsContainer.innerHTML).toContain('Error initializing settings');
  });
  
  test('should successfully initialize when HTML content is properly created', async () => {
    // Mock the settings panel container
    const mockSettingsPanel = document.createElement('div');
    mockSettingsPanel.id = 'settings-panel';
    mockSettingsPanel.innerHTML = '<div class="loading-indicator">Loading settings panel...</div>';
    
    // Mock document.getElementById to return the settings panel
    document.getElementById.mockImplementation((id) => {
      if (id === 'settings-panel') return mockSettingsPanel;
      return null;
    });
    
    // Mock document.querySelector for the settings panel
    document.querySelector.mockImplementation((selector) => {
      if (selector === '#settings-panel') return mockSettingsPanel;
      if (selector === '.settings-container') return null; // Initially doesn't exist
      if (selector === '.loading-indicator') return mockSettingsPanel.querySelector('.loading-indicator');
      if (selector === '.status-dot') return { classList: { add: jest.fn(), remove: jest.fn() } };
      if (selector === '.status-text') return { textContent: '' };
      return null;
    });
    
    // Mock container services
    mockContainer.getService.mockReturnValue({
      showNotification: jest.fn()
    });
    
    mockContainer.utils.get.mockReturnValue({
      showSaveConfirmation: jest.fn()
    });
    
    // Try to initialize the settings panel
    const result = await SettingsPanel.initialize();
    
    // Should succeed because ensurePanelUI creates the HTML content
    expect(result).toBe(true);
    expect(SettingsPanel.initialized).toBe(true);
    
    // Verify that the loading indicator was removed and content was created
    expect(mockSettingsPanel.querySelector('.loading-indicator')).toBeNull();
    expect(mockSettingsPanel.querySelector('.settings-container')).not.toBeNull();
  });
});
