// extension/tests/utils/test-component.js
import { BaseComponent } from '../../src/core/base-component';

export class TestComponent extends BaseComponent {
  constructor() {
    super();
    this._testState = new Map();
  }

  async _performInitialization() {
    this._testState.set('initialized', true);
  }

  async _performCleanup() {
    this._testState.clear();
  }

  async _handleMemoryPressure(snapshot) {
    await this._performNormalCleanup();
  }

  // Test helper methods
  getTestState() {
    return this._testState;
  }

  // Add methods to help with testing
  getEventListeners() {
    return this._eventListeners;
  }

  getTimeouts() {
    return this._timeouts;
  }

  getIntervals() {
    return this._intervals;
  }

  getDOMRefs() {
    return this._domRefs;
  }
}