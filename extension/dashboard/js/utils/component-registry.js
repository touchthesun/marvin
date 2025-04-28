// dashboard/js/utils/component-registry.js
// External script for component registration system

// Debug flag
const DEBUG = true;

// Debug logging function
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[COMPONENT REGISTRY] ${message}`, ...args);
  }
}

debugLog('Component registry initializing');

// Global component registry
window.MarvinComponents = window.MarvinComponents || {};

// Registration function
window.registerComponent = function(name, implementation) {
  debugLog(`Registering component: ${name}`);
  window.MarvinComponents[name] = implementation;
};

// Component lookup function
window.getComponent = function(name) {
  const component = window.MarvinComponents[name];
  if (!component) {
    debugLog(`Component not found: ${name}`);
  }
  return component;
};

// Register event for when a panel is requested
window.addEventListener('navToPanel', function(event) {
  if (event.detail && event.detail.panel) {
    debugLog(`Navigation event received for panel: ${event.detail.panel}`);
    const navItem = document.querySelector(`.nav-item[data-panel="${event.detail.panel}"]`);
    if (navItem) {
      navItem.click();
    } else {
      debugLog(`Panel not found: ${event.detail.panel}`);
    }
  }
});

debugLog('Component registry initialized');