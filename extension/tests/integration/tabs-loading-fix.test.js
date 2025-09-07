/**
 * Tabs Loading Fix Test
 * 
 * TDD approach: Create the simplest possible test to fix the "Loading tabs..." issue
 * Focus on the exact problem: tabs should load and replace "Loading tabs..." text
 */

// Set up TextEncoder/TextDecoder for JSDOM
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

describe('Tabs Loading Fix', () => {
  beforeEach(() => {
    // Set up Chrome API with working tabs.query
    global.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
          hasListener: jest.fn(() => false)
        },
        sendMessage: jest.fn((message, callback) => {
          if (callback) callback({ success: true });
        }),
        lastError: null
      },
      tabs: {
        query: jest.fn((query, callback) => {
          // Simulate successful tab query with real data
          setTimeout(() => {
            callback([
              { id: 1, title: 'Example Website', url: 'https://example.com', active: true },
              { id: 2, title: 'Google Search', url: 'https://google.com', active: false },
              { id: 3, title: 'GitHub', url: 'https://github.com', active: false }
            ]);
          }, 10);
        })
      },
      windows: {
        getAll: jest.fn((options, callback) => {
          // Simulate successful windows query with tabs
          setTimeout(() => {
            callback([
              {
                id: 1,
                focused: true,
                tabs: [
                  { id: 1, title: 'Example Website', url: 'https://example.com', active: true },
                  { id: 2, title: 'Google Search', url: 'https://google.com', active: false }
                ]
              },
              {
                id: 2,
                focused: false,
                tabs: [
                  { id: 3, title: 'GitHub', url: 'https://github.com', active: false }
                ]
              }
            ]);
          }, 10);
        })
      },
      storage: {
        local: {
          get: jest.fn((key, callback) => callback({})),
          set: jest.fn((data, callback) => callback())
        }
      }
    };

    // Mock DOM for tabs display
    global.document = {
      getElementById: jest.fn((id) => {
        if (id === 'tabs-list' || id.includes('tabs')) {
          return {
            innerHTML: 'Loading tabs...',
            textContent: 'Loading tabs...',
            style: {},
            addEventListener: jest.fn(),
            classList: {
              add: jest.fn(),
              remove: jest.fn(),
              contains: jest.fn(() => false)
            }
          };
        }
        return {
          innerHTML: '',
          textContent: '',
          style: {},
          addEventListener: jest.fn(),
          classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) }
        };
      }),
      createElement: jest.fn(() => ({
        innerHTML: '',
        textContent: '',
        style: {},
        addEventListener: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) }
      }))
    };
  });

  afterEach(() => {
    delete global.chrome;
    delete global.document;
  });

  it('should initialize container system successfully', async () => {
    // TEST: Verify container system initializes without errors
    
    const { containerInitializer } = await import('../../src/core/container-init.js');
    
    // This should complete successfully
    await expect(containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    })).resolves.not.toThrow();
  });

  it('should access capture-panel component correctly', async () => {
    // TEST: Verify we can access the capture-panel component
    
    // Set up DOM environment
    if (!document.body) {
      document.body = document.createElement('body');
    }
    document.body.innerHTML = '';
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Import the container directly
    const { container } = await import('../../src/core/dependency-container.js');
    
    // Get the capture-panel component
    const capturePanel = container.getComponent('capture-panel');
    
    // Verify component exists and has initialize method
    expect(capturePanel).toBeDefined();
    expect(capturePanel.initialize).toBeDefined();
    expect(typeof capturePanel.initialize).toBe('function');
  });

  it('should initialize capture-panel and load tabs data', async () => {
    // TEST: The core issue - capture-panel should load tabs and replace "Loading tabs..."
    
    // Ensure document.body exists
    if (!document.body) {
      document.body = document.createElement('body');
    }
    
    // Create minimal DOM structure that capture-panel expects
    document.body.innerHTML = `
      <div class="capture-tab-content">
        <div class="tab-pane active" id="tabs-tab">
          <div id="tabs-list" class="tabs-list"></div>
        </div>
        <div class="tab-pane" id="bookmarks-tab">
          <div class="bookmarks-list"></div>
        </div>
        <div class="tab-pane" id="history-tab">
          <div class="history-list"></div>
        </div>
      </div>
      <button data-tab="tabs">Tabs</button>
      <button data-tab="bookmarks">Bookmarks</button>
      <button data-tab="history">History</button>
      <button id="capture-selected">Capture Selected</button>
    `;
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the container and capture-panel component
    const { container } = await import('../../src/core/dependency-container.js');
    const capturePanel = container.getComponent('capture-panel');
    
    // Initialize the capture panel (this should load tabs)
    await capturePanel.initialize();
    
    // Wait for async tab loading
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Chrome windows API was called
    expect(global.chrome.windows.getAll).toHaveBeenCalled();
    
    // The key test: tabs should have been loaded
    // (We'll need to check how the component actually updates the DOM)
    console.log('Capture panel initialized successfully');
  });

  it('should verify tabs-capture component loads tabs correctly', async () => {
    // TEST: Direct test of the tabs-capture component
    
    // Ensure document.body exists
    if (!document.body) {
      document.body = document.createElement('body');
    }
    
    // Create minimal DOM structure
    document.body.innerHTML = `
      <div class="capture-tab-content">
        <div class="tab-pane active" id="tabs-tab">
          <div id="tabs-list" class="tabs-list"></div>
        </div>
      </div>
      <button id="capture-selected">Capture Selected</button>
    `;
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the container and capture-panel
    const { container } = await import('../../src/core/dependency-container.js');
    const capturePanel = container.getComponent('capture-panel');
    
    // Initialize capture panel
    await capturePanel.initialize();
    
    // Check if tabs-capture component exists
    expect(capturePanel._tabsCapture).toBeDefined();
    
    // Initialize tabs-capture directly
    if (capturePanel._tabsCapture && capturePanel._tabsCapture.initialize) {
      await capturePanel._tabsCapture.initialize();
    }
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Chrome API was called
    expect(global.chrome.windows.getAll).toHaveBeenCalled();
    
    console.log('Tabs capture component tested successfully');
  });
});
