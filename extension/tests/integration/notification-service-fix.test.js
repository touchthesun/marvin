/**
 * Notification Service Fix Test
 * 
 * TDD approach: Test the exact NotificationService issue and fix it
 */

describe('Notification Service Fix', () => {
  beforeEach(() => {
    // Set up Chrome API
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
          setTimeout(() => {
            callback([
              { id: 1, title: 'Test Tab', url: 'https://example.com', active: true }
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

    // Mock DOM
    global.document = {
      getElementById: jest.fn(() => ({
        innerHTML: '',
        textContent: '',
        style: {},
        addEventListener: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) }
      })),
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

  it('should verify NotificationService has showNotification method', async () => {
    // TEST: Verify the NotificationService actually has the method
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the container and notification service
    const { container } = await import('../../src/core/dependency-container.js');
    const notificationService = container.getService('notificationService');
    
    // Verify service exists and has the method
    expect(notificationService).toBeDefined();
    expect(notificationService.showNotification).toBeDefined();
    expect(typeof notificationService.showNotification).toBe('function');
  });

  it('should initialize capture-panel without NotificationService errors', async () => {
    // TEST: The exact error we're seeing
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the container and capture-panel
    const { container } = await import('../../src/core/dependency-container.js');
    const capturePanel = container.getComponent('capture-panel');
    
    // This should NOT throw "notificationService.showNotification is not a function"
    await expect(capturePanel.initialize()).resolves.not.toThrow();
  });

  it('should handle NotificationService method calls correctly', async () => {
    // TEST: Verify NotificationService methods work correctly
    
    // Initialize container system
    const { containerInitializer } = await import('../../src/core/container-init.js');
    await containerInitializer.initialize({
      context: 'test',
      isBackgroundScript: false
    });
    
    // Get the notification service
    const { container } = await import('../../src/core/dependency-container.js');
    const notificationService = container.getService('notificationService');
    
    // Test the showNotification method
    await expect(notificationService.showNotification('Test message', 'info')).resolves.not.toThrow();
    
    console.log('NotificationService methods work correctly');
  });
});
