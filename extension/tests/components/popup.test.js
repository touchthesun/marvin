if (typeof window !== 'undefined') {
  window.__MARVIN_TEST__ = true;
}

import { Popup } from '../../src/popup/popup.js';
import { jest } from '@jest/globals';
import { LogManager } from '../../src/utils/log-manager.js';
import { container } from '../../src/core/dependency-container.js';
import { ServiceRegistry } from '../../src/core/service-registry.js';

// Mock Chrome APIs
const onMessage = {
  addListener: jest.fn(),
  removeListener: jest.fn()
};

global.chrome = {
  storage: {
    local: {
      get: jest.fn((key, cb) => cb ? cb({}) : Promise.resolve({})),
      set: jest.fn((data, cb) => cb ? cb() : Promise.resolve())
    }
  },
  tabs: {
    create: jest.fn((opts, cb) => cb && cb({ id: 1 }))
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://id/${path}`),
    onMessage
  }
};

beforeEach(() => {
  document.body.innerHTML = `
    <button id="capture-btn"></button>
    <button id="analyze-btn"></button>
    <button id="open-dashboard-btn"></button>
    <button id="related-btn"></button>
    <button id="query-btn"></button>
    <button id="options-btn"></button>
    <button id="logout-btn"></button>
    <div id="status-indicator"></div>
    <div id="activity-list"></div>
    <div id="status"></div>
    <form id="login-form"></form>
    <div id="user-info"></div>
  `;
  Popup.initialized = false;
  Popup._logger = new LogManager({ context: 'test', isBackgroundScript: false });

  // Ensure registry is populated
  ServiceRegistry.registerAll();

  // Register all core services with the container
  ServiceRegistry.getCoreServices().forEach(serviceDef => {
    container.registerService(serviceDef.name, serviceDef.class);
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

test('logUIElements finds all expected elements', () => {
  const elements = Popup.logUIElements();
  expect(elements.captureBtn).not.toBeNull();
  expect(elements.analyzeBtn).not.toBeNull();
  expect(elements.dashboardBtn).not.toBeNull();
  expect(elements.relatedBtn).not.toBeNull();
  expect(elements.queryBtn).not.toBeNull();
  expect(elements.optionsBtn).not.toBeNull();
  expect(elements.logoutBtn).not.toBeNull();
  expect(elements.statusIndicator).not.toBeNull();
  expect(elements.activityList).not.toBeNull();
});

test('initPopup completes and sets initialized to true', async () => {
  const result = await Popup.initPopup();
  expect(result).toBe(true);
  expect(Popup.initialized).toBe(true);
});

test('options button click calls openSettings', () => {
  const spy = jest.spyOn(Popup, 'openSettings').mockImplementation(() => {});
  Popup.setupEventListeners(Popup.logUIElements());
  document.getElementById('options-btn').click();
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

test('diagnostic: run full popup init and log progress', async () => {
  try {
    // Optionally, spy on logger to capture logs
    const logSpy = jest.spyOn(Popup._logger, 'info');
    const errorSpy = jest.spyOn(Popup._logger, 'error');
    const result = await Popup.initPopup();
    console.log('initPopup result:', result);

    // Print all info logs for review
    logSpy.mock.calls.forEach(call => {
      console.log('[Popup Log]', ...call);
    });
    // Print all error logs for review
    errorSpy.mock.calls.forEach(call => {
      console.error('[Popup Error Log]', ...call);
    });

    // Check DOM state after init
    console.log('Capture button disabled:', document.getElementById('capture-btn').disabled);
    // ...add more DOM state checks as needed

    logSpy.mockRestore();
    errorSpy.mockRestore();
  } catch (error) {
    console.error('Test-level catch: initPopup threw:', error);
  }
});