// Dashboard test setup
import { jest } from '@jest/globals';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    lastError: null
  }
};

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true })
});

console.log('Dashboard test setup complete');
