/**
 * Simple Chrome API Test
 * 
 * TDD approach: Create the simplest possible test to identify the Chrome API issue
 * that's causing "Loading tabs..." to persist
 */

describe('Simple Chrome API Test', () => {
  beforeEach(() => {
    // Set up the exact Chrome API structure that the extension needs
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
          // Simulate successful tab query
          setTimeout(() => {
            callback([
              { id: 1, title: 'Test Tab 1', url: 'https://example.com' },
              { id: 2, title: 'Test Tab 2', url: 'https://google.com' }
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
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('should initialize MessageService without errors', async () => {
    // TEST: The exact failure we saw in the logs
    
    const { MessageService } = await import('../../src/services/message-service.js');
    
    const messageService = new MessageService({
      context: 'test',
      container: {
        getService: () => ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        })
      }
    });

    // This should NOT throw "Cannot read properties of undefined (reading 'addListener')"
    await expect(messageService.initialize()).resolves.not.toThrow();
    
    // Verify the Chrome API was called
    expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  it('should initialize container system successfully', async () => {
    // TEST: The container initialization that's failing
    
    const { containerInitializer } = await import('../../src/core/container-init.js');
    
    // This should complete without Chrome API errors
    await expect(containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    })).resolves.not.toThrow();
  });

  it('should load tabs data successfully', async () => {
    // TEST: The core issue - tabs should load and replace "Loading tabs..."
    
    // Initialize the system first
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the tabs capture component
    const container = containerInitializer.getContainer();
    const tabsCapture = container.getComponent('capture-panel');
    
    // Mock DOM element for tabs display
    const mockTabsElement = {
      innerHTML: 'Loading tabs...',
      textContent: 'Loading tabs...'
    };
    
    global.document = {
      getElementById: jest.fn(() => mockTabsElement),
      createElement: jest.fn(() => ({}))
    };
    
    // Initialize the tabs capture component
    await tabsCapture.initialize();
    
    // Wait for async tab loading
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify tabs were loaded and "Loading tabs..." was replaced
    expect(global.chrome.tabs.query).toHaveBeenCalled();
    
    // The key test: tabs should have been loaded
    expect(mockTabsElement.innerHTML).not.toBe('Loading tabs...');
  });
});
