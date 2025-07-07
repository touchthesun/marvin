import { createChromeMock } from '../__mocks__/chrome-api';

// Set up global objects needed for tests
global.chrome = createChromeMock();

// Additional setup that runs before each test
beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

// Mock the parts of the browser environment not provided by jsdom
global.self = global;

// Create mock for console to capture logs in tests if needed
const originalConsole = { ...console };
global.capturedConsoleLogs = {
  log: [],
  warn: [],
  error: [],
  debug: [],
};

// Optional: Replace console methods to capture logs
if (process.env.CAPTURE_CONSOLE_LOGS === 'true') {
  console.log = jest.fn((...args) => {
    global.capturedConsoleLogs.log.push(args);
    originalConsole.log(...args);
  });
  
  console.warn = jest.fn((...args) => {
    global.capturedConsoleLogs.warn.push(args);
    originalConsole.warn(...args);
  });
  
  console.error = jest.fn((...args) => {
    global.capturedConsoleLogs.error.push(args);
    originalConsole.error(...args);
  });
  
  console.debug = jest.fn((...args) => {
    global.capturedConsoleLogs.debug.push(args);
    originalConsole.debug(...args);
  });
}

// Function to reset captured console logs
global.resetCapturedConsole = () => {
  global.capturedConsoleLogs = {
    log: [],
    warn: [],
    error: [],
    debug: [],
  };
};