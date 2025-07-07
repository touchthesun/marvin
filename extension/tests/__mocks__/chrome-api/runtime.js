export function mockRuntime() {
    const listeners = {
      onMessage: [],
      onInstalled: [],
      onStartup: [],
    };
  
    return {
      id: 'test-extension-id',
      lastError: null,
  
      getManifest: jest.fn(() => ({
        manifest_version: 3,
        name: 'Marvin',
        version: '1.0.0',
        description: 'Knowledge capture extension',
      })),
  
      getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`),
  
      onMessage: {
        addListener: jest.fn((callback) => {
          listeners.onMessage.push(callback);
        }),
        removeListener: jest.fn((callback) => {
          const index = listeners.onMessage.indexOf(callback);
          if (index > -1) {
            listeners.onMessage.splice(index, 1);
          }
        }),
        hasListener: jest.fn((callback) => {
          return listeners.onMessage.includes(callback);
        }),
        _listeners: listeners.onMessage,
        _trigger: (message, sender, responseCallback) => {
          listeners.onMessage.forEach((listener) => {
            listener(message, sender, responseCallback);
          });
        },
      },
  
      onInstalled: {
        addListener: jest.fn((callback) => {
          listeners.onInstalled.push(callback);
        }),
        removeListener: jest.fn((callback) => {
          const index = listeners.onInstalled.indexOf(callback);
          if (index > -1) {
            listeners.onInstalled.splice(index, 1);
          }
        }),
        _listeners: listeners.onInstalled,
        _trigger: (details) => {
          listeners.onInstalled.forEach((listener) => {
            listener(details);
          });
        },
      },
  
      sendMessage: jest.fn((message, responseCallback) => {
        setTimeout(() => {
          if (responseCallback) {
            responseCallback({ success: true, data: 'Mock response' });
          }
        }, 0);
      }),
  
      getBackgroundPage: jest.fn(() => null),
    };
  }