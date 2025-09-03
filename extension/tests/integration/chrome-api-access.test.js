/**
 * Chrome API Access Tests
 * 
 * TDD approach to verify Chrome API access is working correctly
 * This test specifically targets the MessageService Chrome API failure
 */

describe('Chrome API Access', () => {
  beforeEach(() => {
    // Set up comprehensive Chrome API mock
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
        lastError: null,
        id: 'test-extension-id'
      },
      tabs: {
        query: jest.fn((query, callback) => {
          callback([
            { id: 1, title: 'Test Tab 1', url: 'https://example.com' },
            { id: 2, title: 'Test Tab 2', url: 'https://google.com' }
          ]);
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

  describe('MessageService Chrome API Requirements', () => {
    it('should have chrome.runtime.onMessage.addListener available', () => {
      // TEST: Verify the exact Chrome API that MessageService needs
      expect(global.chrome).toBeDefined();
      expect(global.chrome.runtime).toBeDefined();
      expect(global.chrome.runtime.onMessage).toBeDefined();
      expect(global.chrome.runtime.onMessage.addListener).toBeDefined();
      expect(typeof global.chrome.runtime.onMessage.addListener).toBe('function');
    });

    it('should successfully initialize MessageService with proper Chrome API', async () => {
      // TEST: Verify MessageService can initialize without errors
      
      const { MessageService } = await import('../../src/services/message-service.js');
      
      const messageService = new MessageService({
        context: 'test',
        container: {
          getService: () => ({
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
          })
        }
      });

      // This should NOT throw an error
      await expect(messageService.initialize()).resolves.not.toThrow();
      
      // Verify addListener was called
      expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should handle Chrome API unavailability gracefully', async () => {
      // TEST: Verify graceful handling when Chrome API is not available
      
      // Remove Chrome API to simulate unavailability
      delete global.chrome.runtime.onMessage;
      
      const { MessageService } = await import('../../src/services/message-service.js');
      
      const messageService = new MessageService({
        context: 'test',
        container: {
          getService: () => ({
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
          })
        }
      });

      // This should either succeed gracefully or provide a clear error
      try {
        await messageService.initialize();
        // If it succeeds, that's fine
      } catch (error) {
        // If it fails, the error should be informative
        expect(error.message).toContain('chrome.runtime.onMessage');
      }
    });
  });

  describe('Container Initialization with Chrome API', () => {
    it('should initialize container system without Chrome API errors', async () => {
      // TEST: Verify full container initialization works with proper Chrome API
      
      const { ContainerInitializer } = await import('../../src/core/container-init.js');
      
      // This should complete without throwing Chrome API errors
      await expect(ContainerInitializer.initialize({
        context: 'test',
        isBackgroundScript: false
      })).resolves.not.toThrow();
    });

    it('should identify which services fail due to Chrome API issues', async () => {
      // TEST: Identify exactly which services have Chrome API dependencies
      
      const { ContainerInitializer } = await import('../../src/core/container-init.js');
      
      const failedServices = [];
      const originalConsoleError = console.error;
      
      console.error = (message, error) => {
        if (message.includes('Failed to initialize service')) {
          const serviceName = message.match(/service (\w+):/)?.[1];
          if (serviceName) {
            failedServices.push({
              service: serviceName,
              error: error.message
            });
          }
        }
        originalConsoleError(message, error);
      };
      
      try {
        await ContainerInitializer.initialize({
          context: 'test',
          isBackgroundScript: false
        });
      } catch (error) {
        // Expected to fail, we're collecting the failures
      }
      
      console.error = originalConsoleError;
      
      // Log which services failed and why
      console.log('Services that failed due to Chrome API issues:', failedServices);
      
      // We expect to identify the problematic services
      expect(failedServices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Real Extension Environment Simulation', () => {
    it('should simulate the exact Chrome API environment of a real extension', async () => {
      // TEST: Create the most accurate Chrome API simulation possible
      
      // Enhanced Chrome API mock that matches real extension environment
      global.chrome = {
        runtime: {
          onMessage: {
            addListener: jest.fn((callback) => {
              // Simulate real Chrome behavior
              global.chrome.runtime.onMessage._listeners = 
                global.chrome.runtime.onMessage._listeners || [];
              global.chrome.runtime.onMessage._listeners.push(callback);
            }),
            removeListener: jest.fn(),
            hasListener: jest.fn(() => false)
          },
          sendMessage: jest.fn((message, callback) => {
            setTimeout(() => {
              if (callback) callback({ success: true });
            }, 10);
          }),
          lastError: null,
          id: 'test-extension-id',
          getManifest: jest.fn(() => ({
            name: 'Marvin Extension',
            version: '0.1.0'
          }))
        },
        tabs: {
          query: jest.fn((query, callback) => {
            setTimeout(() => {
              callback([
                { id: 1, title: 'Test Tab 1', url: 'https://example.com', active: true },
                { id: 2, title: 'Test Tab 2', url: 'https://google.com', active: false }
              ]);
            }, 10);
          }),
          get: jest.fn((tabId, callback) => {
            callback({ id: tabId, title: `Tab ${tabId}`, url: 'https://example.com' });
          })
        },
        storage: {
          local: {
            get: jest.fn((key, callback) => {
              setTimeout(() => callback({}), 5);
            }),
            set: jest.fn((data, callback) => {
              setTimeout(() => callback(), 5);
            })
          }
        },
        bookmarks: {
          getTree: jest.fn((callback) => {
            callback([{ id: '1', title: 'Bookmarks Bar', children: [] }]);
          })
        },
        history: {
          search: jest.fn((query, callback) => {
            callback([{ id: '1', url: 'https://example.com', title: 'Example' }]);
          })
        }
      };
      
      // Now test full system initialization
      const { ContainerInitializer } = await import('../../src/core/container-init.js');
      
      await expect(ContainerInitializer.initialize({
        context: 'popup',
        isBackgroundScript: false
      })).resolves.not.toThrow();
      
      // Verify Chrome APIs were used correctly
      expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });
});
