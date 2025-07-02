// extension/tests/components/popup.test.js
import { Popup } from '../../src/popup/popup.js';

describe('Popup Component Integration', () => {
  beforeEach(() => {
    // Set up minimal DOM structure
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
    `;
  });

  test('initPopup completes and sets initialized to true', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await Popup.initPopup();
    expect(result).toBe(true);
    expect(Popup.initialized).toBe(true);
    logSpy.mockRestore();
  });

  test('logUIElements finds all expected elements', () => {
    const elements = Popup.logUIElements();
    expect(elements.captureBtn).not.toBeNull();
    expect(elements.analyzeBtn).not.toBeNull();
    // ...repeat for other elements
  });

  // Add more tests for service initialization, event listeners, etc.
});