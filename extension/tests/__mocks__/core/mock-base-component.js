// extension/tests/__mocks__/core/base-component.js
const { createMockSystem } = require('../../utils/mock-system');

// Create a single instance of the mock system
const mockSystem = createMockSystem();

class MockBaseComponent {
  constructor() {
    // Initialize state
    this.initialized = false;
    this._eventListeners = [];
    this._timeouts = [];
    this._intervals = [];
    this._domElements = [];
    
    // Initialize services from mock system
    this.logger = mockSystem.logger;
    this._memoryMonitor = mockSystem.memoryMonitor;
    this._resourceTracker = mockSystem.resourceTracker;
  }

  async initialize() {
    if (this.initialized) return;
    await this._performInitialization();
    this.initialized = true;
  }

  async cleanup() {
    if (!this.initialized) return;
    await this._resourceTracker.cleanup();
    await this._performCleanup();
    this.initialized = false;
  }

  trackEventListener(target, type, handler) {
    this._eventListeners.push({ target, type, handler });
    this._resourceTracker.trackEventListener(target, type, handler);
  }

  trackTimeout(callback, delay) {
    const id = setTimeout(callback, delay);
    this._timeouts.push(id);
    return id;
  }

  trackInterval(callback, delay) {
    const id = setInterval(callback, delay);
    this._intervals.push(id);
    return id;
  }

  trackDOMElement(element) {
    this._domElements.push(element);
    this._resourceTracker.trackDOMElement(element);
  }

  getService(serviceName) {
    return mockSystem.container.getService(serviceName);
  }

  async _performInitialization() {
    // To be implemented by subclass
  }

  async _performCleanup() {
    // To be implemented by subclass
  }
}

const mockExports = {
  BaseComponent: MockBaseComponent,
  __mocks: mockSystem
};

module.exports = mockExports;
module.exports.default = mockExports;