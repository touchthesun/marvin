 // extension/tests/__mocks__/chrome-api.js
import { runtime } from './chrome-api/runtime.js';

export function createChromeMock() {
  return {
    runtime,
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
      remove: jest.fn()
    },
    // Add more Chrome API mocks as needed
  };
}