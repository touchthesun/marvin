// extension/tests/components/capture-panel.test.js
jest.mock('d3', () => ({}));

import { jest } from '@jest/globals';
import { container } from '../../src/core/dependency-container.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { containerInitializer } from '../../src/core/container-init.js';

// Mock Chrome APIs
global.chrome = {
  tabs: {
    query: jest.fn((queryInfo, cb) => cb([
      { id: 1, title: 'Tab One', url: 'https://one.com' },
      { id: 2, title: 'Tab Two', url: 'https://two.com' }
    ]))
  },
  runtime: {
    sendMessage: jest.fn((msg, cb) => cb && cb({ success: true })),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn((key, cb) => cb ? cb({}) : Promise.resolve({})),
      set: jest.fn((data, cb) => cb ? cb() : Promise.resolve())
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  }
};

beforeEach(async () => {
  // Ensure all core services are registered
  await containerInitializer.initialize();

  document.body.innerHTML = `
    <section id="capture-panel" class="content-panel active" data-component="capture-panel">
      <button id="select-all-tabs">Select All</button>
      <button id="deselect-all-tabs">Deselect All</button>
      <button id="capture-selected">Capture Selected</button>
      <div class="capture-tab-content">
        <div class="tab-pane active" id="tabs-pane"></div>
      </div>
      <div id="tabs-list"></div>
    </section>
  `;
  ComponentRegistry.registerAll();
});

test('Capture panel lists open tabs', async () => {
  const capturePanel = container.getComponent('capture-panel');
  // Call the panel's initialization method
  await capturePanel.initCapturePanel();
  console.log('BODY:', document.body.innerHTML);

  // Check that tab items are rendered
  const tabItems = document.querySelectorAll('.tab-item');
  expect(tabItems.length).toBeGreaterThan(0);
  expect(tabItems[0].textContent).toContain('Tab One');
  expect(tabItems[1].textContent).toContain('Tab Two');
});

test('Select All and Deselect All buttons work', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  console.log('BODY:', document.body.innerHTML);

  // Simulate clicking "Select All"
  document.getElementById('select-all-tabs').click();
  document.querySelectorAll('.item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(true);
  });

  // Simulate clicking "Deselect All"
  document.getElementById('deselect-all-tabs').click();
  document.querySelectorAll('.item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(false);
  });
});

test('Capture Selected triggers capture for checked tabs', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();

  // Select the first tab
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes[0].checked = true;

  // Click "Capture Selected"
  document.getElementById('capture-selected').click();

  // Check that chrome.runtime.sendMessage was called for the selected tab
  expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  // Optionally, check the message contents
  // expect(chrome.runtime.sendMessage.mock.calls[0][0]).toMatchObject({ ... });
});