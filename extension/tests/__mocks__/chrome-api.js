 // extension/tests/__mocks__/chrome-api.js
import { mockRuntime } from './chrome-api/runtime.js';

export function createChromeMock() {
  return {
    runtime: mockRuntime(),
    // Add other Chrome API mocks as needed
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn()
      },
      sync: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn()
      },
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn()
      }
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    },
    windows: {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getAll: jest.fn((options, callback) => {
        // Mock windows data
        const mockWindows = [
          {
            id: 1,
            focused: true,
            tabs: [
              { id: 1, url: 'https://example.com', title: 'Example Site', active: true },
              { id: 2, url: 'https://google.com', title: 'Google', active: false }
            ]
          }
        ];
        
        if (callback) {
          callback(mockWindows);
        }
        return Promise.resolve(mockWindows);
      })
    },
    // Add more Chrome API mocks as needed
  };
}