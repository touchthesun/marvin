// extension/tests/helpers/setup-globals.js
global.setImmediate = jest.fn((callback) => setTimeout(callback, 0));