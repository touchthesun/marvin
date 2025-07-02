// extension/tests/helpers/setup-globals.js
import { mockRuntime } from '../__mocks__/chrome-api/runtime.js';
import { mockStorage } from '../__mocks__/chrome-api/storage.js';

global.setImmediate = jest.fn((callback) => setTimeout(callback, 0));

global.chrome = {
  storage: mockStorage(),
  runtime: mockRuntime()
};