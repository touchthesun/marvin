// extension/tests/components/capture-panel.test.js
jest.mock('d3', () => ({}));

import { jest } from '@jest/globals';
import { container } from '../../src/core/dependency-container.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { containerInitializer } from '../../src/core/container-init.js';
import { LogManager } from '../../src/utils/log-manager.js';
import fs from 'fs';
import path from 'path';

// Set up logging to file for debugging
const logFile = path.join(process.cwd(), 'test-logs.txt');
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

// Create a custom logger for our test debugging
const testLogger = {
  log: (...args) => {
    const message = `[TEST-LOG] ${args.join(' ')}\n`;
    fs.appendFileSync(logFile, message);
    originalConsoleLog(message.trim());
  },
  error: (...args) => {
    const message = `[TEST-ERROR] ${args.join(' ')}\n`;
    fs.appendFileSync(logFile, message);
    originalConsoleError(message.trim());
  },
  warn: (...args) => {
    const message = `[TEST-WARN] ${args.join(' ')}\n`;
    fs.appendFileSync(logFile, message);
    originalConsoleWarn(message.trim());
  }
};

// Clear the log file
beforeAll(() => {
  fs.writeFileSync(logFile, '');
  testLogger.log('=== Test session started ===');
});

// Add a debug helper to test component methods directly
const debugComponent = (component, methodName, logger) => {
  logger.log(`=== Debugging ${methodName} ===`);
  logger.log('Component exists:', !!component);
  logger.log('Component methods:', Object.keys(component));
  logger.log('Component initialized:', component.initialized);
  
  if (typeof component[methodName] === 'function') {
    logger.log(`Method ${methodName} exists`);
    try {
      const result = component[methodName]();
      logger.log(`Method ${methodName} result:`, result);
    } catch (error) {
      logger.log(`Method ${methodName} error:`, error.message);
    }
  } else {
    logger.log(`Method ${methodName} does not exist`);
  }
};

// Restore console methods after tests
afterAll(() => {
  testLogger.log('=== Test session ended ===');
  console.log(`\nTest logs written to: ${logFile}`);
});

// Mock Chrome APIs for the new class-based components
global.chrome = {
  windows: {
    getAll: jest.fn((options, cb) => {
      const mockData = [
        {
          id: 1,
          tabs: [
            { id: 1, title: 'Tab One', url: 'https://one.com', favIconUrl: 'https://one.com/favicon.ico' },
            { id: 2, title: 'Tab Two', url: 'https://two.com', favIconUrl: 'https://two.com/favicon.ico' }
          ]
        }
      ];
      
      if (cb) {
        cb(mockData);
      } else {
        return Promise.resolve(mockData);
      }
    })
  },
  bookmarks: {
    getTree: jest.fn((cb) => {
      const mockData = [
        {
          id: "0",
          title: "Bookmarks Bar",
          children: [
            {
              id: "10",
              title: "Bookmark One",
              url: "https://bookmark1.com",
              dateAdded: Date.now()
            },
            {
              id: "11", 
              title: "Bookmark Two",
              url: "https://bookmark2.com",
              dateAdded: Date.now()
            }
          ]
        },
        {
          id: "1",
          title: "Other Bookmarks",
          children: [
            {
              id: "20",
              title: "Bookmark Three",
              url: "https://bookmark3.com",
              dateAdded: Date.now()
            }
          ]
        }
      ];
      
      if (cb) {
        cb(mockData);
      } else {
        return Promise.resolve(mockData);
      }
    })
  },
  history: {
    search: jest.fn((query, cb) => {
      const mockData = [
        {
          id: "1",
          title: "History Item One",
          url: "https://history1.com",
          lastVisitTime: Date.now(),
          visitCount: 5
        },
        {
          id: "2",
          title: "History Item Two", 
          url: "https://history2.com",
          lastVisitTime: Date.now() - 86400000,
          visitCount: 3
        }
      ];
      
      if (cb) {
        cb(mockData);
      } else {
        return Promise.resolve(mockData);
      }
    })
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

  // Updated DOM structure to match our new components
  document.body.innerHTML = `
  <section id="capture-panel" class="content-panel active" data-component="capture-panel">
    <button id="capture-selected">Capture Selected</button>
    
    <!-- Tab navigation -->
    <div class="capture-tabs">
      <button data-tab="tabs">Tabs</button>
      <button data-tab="bookmarks">Bookmarks</button>
      <button data-tab="history">History</button>
    </div>
    
    <!-- Tab content -->
    <div class="capture-tab-content">
      <!-- Tabs tab -->
      <div class="tab-pane active" id="tabs-pane">
        <div class="list-controls">
          <input type="text" id="tabs-search" placeholder="Search tabs...">
          <select id="tabs-window-filter">
            <option value="all">All Windows</option>
          </select>
        </div>
        <div id="tabs-list"></div>
      </div>
      
      <!-- Bookmarks tab -->
      <div class="tab-pane" id="bookmarks-pane">
        <div class="list-controls">
          <input type="text" id="bookmarks-search" placeholder="Search bookmarks...">
          <select id="bookmarks-folder-filter">
            <option value="all">All Folders</option>
          </select>
        </div>
        <div id="bookmarks-list"></div>
        <button id="select-all-bookmarks">Select All</button>
        <button id="deselect-all-bookmarks">Deselect All</button>
      </div>
      
      <!-- History tab -->
      <div class="tab-pane" id="history-pane">
        <div class="list-controls">
          <input type="text" id="history-search" placeholder="Search history...">
          <select id="history-time-filter">
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <div id="history-list"></div>
        <button id="select-all-history">Select All</button>
        <button id="deselect-all-history">Deselect All</button>
      </div>
    </div>
  </section>
`;
  
  ComponentRegistry.registerAll();
});

test('Capture panel initializes successfully', async () => {
  testLogger.log('=== Starting initialization test ===');
  
  const capturePanel = container.getComponent('capture-panel');
  testLogger.log('Got capture panel component:', !!capturePanel);
  
  // Test initialization
  const result = await capturePanel.initCapturePanel();
  testLogger.log('Initialization result:', result);
  
  // Verify component instances are set
  testLogger.log('Tabs capture component:', !!capturePanel._tabsCapture);
  testLogger.log('Bookmarks capture component:', !!capturePanel._bookmarksCapture);
  testLogger.log('History capture component:', !!capturePanel._historyCapture);
  
  expect(result).toBe(true);
  expect(capturePanel._tabsCapture).toBeDefined();
  expect(capturePanel._bookmarksCapture).toBeDefined();
  expect(capturePanel._historyCapture).toBeDefined();
});

test('Tabs capture component loads tabs correctly', async () => {
  testLogger.log('=== Starting tabs test ===');
  
  const capturePanel = container.getComponent('capture-panel');
  testLogger.log('Got capture panel component:', !!capturePanel);
  
  await capturePanel.initCapturePanel();
  testLogger.log('Initialized capture panel');
  
  // Debug: Check if switchToTab method exists
  testLogger.log('switchToTab method exists:', typeof capturePanel.switchToTab === 'function');
  
  // Switch to tabs tab
  const tabsTab = document.querySelector('[data-tab="tabs"]');
  testLogger.log('Found tabs tab button:', !!tabsTab);
  
  // Try calling switchToTab directly first
  testLogger.log('Calling switchToTab directly...');
  try {
    await capturePanel.switchToTab(new LogManager({context: 'test'}), 'tabs');
    testLogger.log('switchToTab completed successfully');
  } catch (error) {
    testLogger.log('switchToTab error:', error.message);
  }
  
  // Now try clicking the button
  tabsTab.click();
  testLogger.log('Clicked tabs tab button');
  
  // Wait for tabs to load
  await new Promise(resolve => setTimeout(resolve, 100));
  testLogger.log('Waited for tabs to load');
  
  // Check that tabs are rendered
  const tabItems = document.querySelectorAll('.tab-item');
  testLogger.log('Found tab items:', tabItems.length);
  testLogger.log('Tab items HTML:', document.getElementById('tabs-list')?.innerHTML);
  
  // Check that window groups are created
  const windowGroups = document.querySelectorAll('.window-group');
  testLogger.log('Found window groups:', windowGroups.length);
  
  // Debug: Check if the component method was actually called
  testLogger.log('Tabs capture component methods:', Object.keys(capturePanel._tabsCapture));
  testLogger.log('Tabs capture initialized state:', capturePanel._tabsCapture.initialized);
  
  // Debug: Check the DOM structure
  testLogger.log('All tab panes:', document.querySelectorAll('.tab-pane').length);
  testLogger.log('Active tab pane:', document.querySelector('.tab-pane.active')?.id);
  testLogger.log('Tabs list element:', !!document.getElementById('tabs-list'));
  
  expect(tabItems.length).toBeGreaterThan(0);
  expect(windowGroups.length).toBeGreaterThan(0);
});

test('Bookmarks capture component loads bookmarks correctly', async () => {
  testLogger.log('=== Starting bookmarks test ===');
  
  const capturePanel = container.getComponent('capture-panel');
  testLogger.log('Got capture panel component:', !!capturePanel);
  
  await capturePanel.initCapturePanel();
  testLogger.log('Initialized capture panel');
  
  // Debug: Check if switchToTab method exists for bookmarks
  testLogger.log('switchToTab method exists:', typeof capturePanel.switchToTab === 'function');
  
  // Switch to bookmarks tab
  const bookmarksTab = document.querySelector('[data-tab="bookmarks"]');
  testLogger.log('Found bookmarks tab button:', !!bookmarksTab);
  
  // Try calling switchToTab directly first
  testLogger.log('Calling switchToTab for bookmarks directly...');
  try {
    await capturePanel.switchToTab(new LogManager({context: 'test'}), 'bookmarks');
    testLogger.log('switchToTab for bookmarks completed successfully');
  } catch (error) {
    testLogger.log('switchToTab for bookmarks error:', error.message);
  }
  
  // Now try clicking the button
  bookmarksTab.click();
  testLogger.log('Clicked bookmarks tab button');
  
  // Wait for bookmarks to load
  await new Promise(resolve => setTimeout(resolve, 100));
  testLogger.log('Waited for bookmarks to load');
  
  // Check that bookmarks are rendered
  const bookmarkItems = document.querySelectorAll('.bookmark-item');
  testLogger.log('Found bookmark items:', bookmarkItems.length);
  testLogger.log('Bookmark items HTML:', document.getElementById('bookmarks-list')?.innerHTML);
  
  // Debug: Check if the component method was actually called
  testLogger.log('Bookmarks capture component methods:', Object.keys(capturePanel._bookmarksCapture));
  testLogger.log('Bookmarks capture initialized state:', capturePanel._bookmarksCapture.initialized);
  
  expect(bookmarkItems.length).toBeGreaterThan(0);
});

test('History capture component loads history correctly', async () => {
  testLogger.log('=== Starting history test ===');
  
  const capturePanel = container.getComponent('capture-panel');
  testLogger.log('Got capture panel component:', !!capturePanel);
  
  await capturePanel.initCapturePanel();
  testLogger.log('Initialized capture panel');
  
  // Debug: Check if switchToTab method exists for history
  testLogger.log('switchToTab method exists:', typeof capturePanel.switchToTab === 'function');
  
  // Switch to history tab
  const historyTab = document.querySelector('[data-tab="history"]');
  testLogger.log('Found history tab button:', !!historyTab);
  
  // Try calling switchToTab directly first
  testLogger.log('Calling switchToTab for history directly...');
  try {
    await capturePanel.switchToTab(new LogManager({context: 'test'}), 'history');
    testLogger.log('switchToTab for history completed successfully');
  } catch (error) {
    testLogger.log('switchToTab for history error:', error.message);
  }
  
  // Now try clicking the button
  historyTab.click();
  testLogger.log('Clicked history tab button');
  
  // Wait for history to load
  await new Promise(resolve => setTimeout(resolve, 100));
  testLogger.log('Waited for history to load');
  
  // Check that history items are rendered
  const historyItems = document.querySelectorAll('.history-item');
  testLogger.log('Found history items:', historyItems.length);
  testLogger.log('History items HTML:', document.getElementById('history-list')?.innerHTML);
  
  // Debug: Check if the component method was actually called
  testLogger.log('History capture component methods:', Object.keys(capturePanel._historyCapture));
  testLogger.log('History capture initialized state:', capturePanel._historyCapture.initialized);
  
  expect(historyItems.length).toBeGreaterThan(0);
});

test('Select All and Deselect All buttons work for bookmarks', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Switch to bookmarks tab
  const bookmarksTab = document.querySelector('[data-tab="bookmarks"]');
  bookmarksTab.click();
  
  // Wait for bookmarks to load
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulate clicking "Select All"
  document.getElementById('select-all-bookmarks').click();
  document.querySelectorAll('#bookmarks-list .item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(true);
  });
  
  // Simulate clicking "Deselect All"
  document.getElementById('deselect-all-bookmarks').click();
  document.querySelectorAll('#bookmarks-list .item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(false);
  });
});

test('Select All and Deselect All buttons work for history', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Switch to history tab
  const historyTab = document.querySelector('[data-tab="history"]');
  historyTab.click();
  
  // Wait for history to load
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulate clicking "Select All"
  document.getElementById('select-all-history').click();
  document.querySelectorAll('#history-list .item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(true);
  });
  
  // Simulate clicking "Deselect All"
  document.getElementById('deselect-all-history').click();
  document.querySelectorAll('#history-list .item-checkbox').forEach(cb => {
    expect(cb.checked).toBe(false);
  });
});

test('Capture Selected triggers capture for checked items', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Switch to tabs tab
  const tabsTab = document.querySelector('[data-tab="tabs"]');
  tabsTab.click();
  
  // Wait for tabs to load
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Select the first tab
  const checkboxes = document.querySelectorAll('#tabs-list .item-checkbox');
  if (checkboxes.length > 0) {
    checkboxes[0].checked = true;
    
    // Click "Capture Selected"
    document.getElementById('capture-selected').click();
    
    // Check that chrome.runtime.sendMessage was called
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  }
});

test('Component cleanup works correctly', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Test cleanup
  capturePanel.cleanup();
  
  // Verify cleanup was called on sub-components
  expect(capturePanel.initialized).toBe(false);
  expect(capturePanel._eventListeners).toEqual([]);
  expect(capturePanel._timeouts).toEqual([]);
  expect(capturePanel._intervals).toEqual([]);
});

test('Error handling works for missing DOM elements', async () => {
  // Test with minimal DOM
  document.body.innerHTML = `
    <section id="capture-panel" class="content-panel active" data-component="capture-panel">
      <button id="capture-selected">Capture Selected</button>
    </section>
  `;
  
  const capturePanel = container.getComponent('capture-panel');
  
  // Should handle missing elements gracefully and still initialize
  const result = await capturePanel.initCapturePanel();
  expect(result).toBe(true); // Should succeed gracefully
});

test('Input validation works correctly', async () => {
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Test tabs capture validation
  const tabsCapture = capturePanel._tabsCapture;
  expect(tabsCapture._validateInputs).toBeDefined();
  
  // Test bookmarks capture validation
  const bookmarksCapture = capturePanel._bookmarksCapture;
  expect(bookmarksCapture._validateInputs).toBeDefined();
  
  // Test history capture validation
  const historyCapture = capturePanel._historyCapture;
  expect(historyCapture._validateInputs).toBeDefined();
});

test('Debug component methods directly', async () => {
  testLogger.log('=== Starting component debug test ===');
  
  const capturePanel = container.getComponent('capture-panel');
  await capturePanel.initCapturePanel();
  
  // Debug tabs capture component
  testLogger.log('=== Debugging TabsCapture ===');
  const tabsCapture = capturePanel._tabsCapture;
  testLogger.log('TabsCapture methods:', Object.keys(tabsCapture));
  testLogger.log('TabsCapture initialized:', tabsCapture.initialized);
  
  // Try calling the method directly
  if (typeof tabsCapture.initTabsCapture === 'function') {
    testLogger.log('Calling initTabsCapture directly...');
    try {
      const result = await tabsCapture.initTabsCapture();
      testLogger.log('initTabsCapture result:', result);
    } catch (error) {
      testLogger.log('initTabsCapture error:', error.message);
    }
  }
  
  // Debug bookmarks capture component
  testLogger.log('=== Debugging BookmarksCapture ===');
  const bookmarksCapture = capturePanel._bookmarksCapture;
  testLogger.log('BookmarksCapture methods:', Object.keys(bookmarksCapture));
  testLogger.log('BookmarksCapture initialized:', bookmarksCapture.initialized);
  
  // Try calling the method directly
  if (typeof bookmarksCapture.initBookmarksCapture === 'function') {
    testLogger.log('Calling initBookmarksCapture directly...');
    try {
      const result = await bookmarksCapture.initBookmarksCapture();
      testLogger.log('initBookmarksCapture result:', result);
    } catch (error) {
      testLogger.log('initBookmarksCapture error:', error.message);
    }
  }
  
  // Check what's in the DOM after calling methods
  testLogger.log('=== DOM state after method calls ===');
  testLogger.log('Tabs list HTML:', document.getElementById('tabs-list')?.innerHTML);
  testLogger.log('Bookmarks list HTML:', document.getElementById('bookmarks-list')?.innerHTML);
  testLogger.log('History list HTML:', document.getElementById('history-list')?.innerHTML);
});