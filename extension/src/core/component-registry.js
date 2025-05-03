// Debug flag
const DEBUG = true;

/**
 * Debug logging function
 * @param {string} message - Debug message
 * @param {...any} args - Additional arguments
 */
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[COMPONENT REGISTRY] ${message}`, ...args);
  }
}

debugLog('Component registry initializing');

// Initialize global component registry (if it doesn't exist yet)
self.MarvinComponents = self.MarvinComponents || {};

// Track components and stubs separately
const registeredComponents = new Set();
const registeredStubs = new Set();

// Disable immediate stub registration
let enableStubRegistration = false;
// Set a longer timeout for stub registration (2 seconds)
const STUB_REGISTRATION_DELAY = 2000;

// Add registration function with logging of component type
self.registerComponent = function(name, implementation) {
  // Check if we're trying to register a stub when stub registration is disabled
  if (!enableStubRegistration && implementation && implementation._isStub) {
    debugLog(`Stub registration currently disabled for: ${name}`);
    return false;
  }
  
  // If we already have a non-stub version, don't overwrite
  if (self.MarvinComponents[name] && !self.MarvinComponents[name]._isStub) {
    debugLog(`Not overwriting real component with stub: ${name}`);
    return false;
  }

  // If this is a stub and we already registered it, skip
  if (implementation._isStub && registeredStubs.has(name)) {
    debugLog(`Stub component already registered, skipping: ${name}`);
    return false;
  }

  debugLog(`Registering component: ${name} (${implementation._isStub ? 'stub' : 'real'})`);
  self.MarvinComponents[name] = implementation;
  
  // Track registrations
  registeredComponents.add(name);
  if (implementation._isStub) {
    registeredStubs.add(name);
  }
  
  return true;
};

// Define component stubs here
const componentStubs = {
  'navigation': {
    initNavigation: function() {
      debugLog('STUB: navigation.initNavigation called');
      
      // Basic implementation for navigation
      const navItems = document.querySelectorAll('.nav-item');
      const contentPanels = document.querySelectorAll('.content-panel');
      
      navItems.forEach(item => {
        const panelName = item.getAttribute('data-panel');
        if (!panelName) return;
        
        item.addEventListener('click', () => {
          // Update navigation highlighting
          navItems.forEach(navItem => navItem.classList.remove('active'));
          item.classList.add('active');
          
          // Show corresponding panel
          contentPanels.forEach(panel => {
            if (panel.id === `${panelName}-panel`) {
              panel.classList.add('active');
              
              // Dispatch event for panel changed
              const event = new CustomEvent('panelChanged', {
                detail: { panelId: panelName, panelElement: panel }
              });
              document.dispatchEvent(event);
            } else {
              panel.classList.remove('active');
            }
          });
        });
      });
      
      return true;
    },
    
    initTabs: function() {
      debugLog('STUB: navigation.initTabs called');
      
      const tabButtons = document.querySelectorAll('.tab-btn');
      const tabPanes = document.querySelectorAll('.tab-pane');
      
      tabButtons.forEach(button => {
        const targetTab = button.getAttribute('data-tab');
        if (!targetTab) return;
        
        button.addEventListener('click', () => {
          // Update tab highlighting
          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          
          // Show corresponding tab content
          tabPanes.forEach(pane => {
            if (pane.id === `${targetTab}-content`) {
              pane.classList.add('active');
            } else {
              pane.classList.remove('active');
            }
          });
        });
      });
      
      return true;
    },
    
    navigateToPanel: function(panelName) {
      debugLog(`STUB: navigation.navigateToPanel(${panelName}) called`);
      
      const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
      if (navItem) {
        navItem.click();
        return true;
      }
      
      return false;
    },
    
    // Mark as stub
    _isStub: true
  },
  
  'overview-panel': {
    initOverviewPanel: function() {
      debugLog('STUB: overview-panel.initOverviewPanel called');
      
      // Get the panel element
      const panel = document.getElementById('overview-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      // Create and append heading element
      const heading = document.createElement('h3');
      heading.textContent = 'Overview Panel (Stub)';
      message.appendChild(heading);
      
      // Create and append paragraph elements
      const paragraph1 = document.createElement('p');
      paragraph1.textContent = 'This is a stub implementation of the overview panel.';
      message.appendChild(paragraph1);
      
      const paragraph2 = document.createElement('p');
      paragraph2.textContent = 'The actual component module could not be loaded.';
      message.appendChild(paragraph2);
      
      // Find the content area to insert the message
      const contentArea = panel.querySelector('.panel-header');
      if (contentArea && contentArea.nextSibling) {
        panel.insertBefore(message, contentArea.nextSibling);
      } else {
        panel.appendChild(message);
      }
    },
    
    // Mark as stub
    _isStub: true
  },
  
  // Add other component stubs here...
  'capture-panel': {
    initCapturePanel: function() {
      debugLog('STUB: capture-panel.initCapturePanel called');
      // Basic implementation
    },
    _isStub: true
  },
  
  'knowledge-panel': {
    initKnowledgePanel: function() {
      debugLog('STUB: knowledge-panel.initKnowledgePanel called');
      // Basic implementation
    },
    _isStub: true
  },
  
  'settings-panel': {
    initSettingsPanel: function() {
      debugLog('STUB: settings-panel.initSettingsPanel called');
      // Basic implementation
    },
    _isStub: true
  },
  
  'tasks-panel': {
    initTasksPanel: function() {
      debugLog('STUB: tasks-panel.initTasksPanel called');
      // Basic implementation
    },
    _isStub: true
  },
  
  'assistant-panel': {
    initAssistantPanel: function() {
      debugLog('STUB: assistant-panel.initAssistantPanel called');
      // Basic implementation
    },
    _isStub: true
  }
};

/**
 * Register a stub component if the real one isn't available
 * @param {string} name - Component name
 * @returns {boolean} - Whether a stub was registered
 */
function registerStubIfNeeded(name) {
  if (!self.MarvinComponents[name] && componentStubs[name]) {
    return self.registerComponent(name, componentStubs[name]);
  }
  return false;
}

/**
 * Register all stub components
 */
function registerAllStubs() {
  debugLog('Attempting to register all stubs...');
  if (!enableStubRegistration) {
    debugLog('Stub registration currently disabled');
    return;
  }
  
  for (const name in componentStubs) {
    registerStubIfNeeded(name);
  }
  debugLog('All stub components registered');
}

/**
 * Check if real components exist, otherwise register stubs
 */
function setupComponents() {
  debugLog('Setting up components');
  const requiredComponents = Object.keys(componentStubs);
  
  // Log current state of components
  requiredComponents.forEach(name => {
    if (self.MarvinComponents[name]) {
      if (self.MarvinComponents[name]._isStub) {
        debugLog(`Component ${name} is currently a stub`);
      } else {
        debugLog(`Component ${name} is a real implementation`);
      }
    } else {
      debugLog(`Component ${name} is not registered`);
    }
  });
  
  // Check for missing components
  const missingComponents = requiredComponents.filter(name => !self.MarvinComponents[name]);
  if (missingComponents.length > 0) {
    debugLog(`Missing components: ${missingComponents.join(', ')}`);
    
    // Register only missing stubs if stub registration is enabled
    if (enableStubRegistration) {
      missingComponents.forEach(name => {
        registerStubIfNeeded(name);
      });
    } else {
      debugLog('Stub registration disabled, not registering missing stubs');
    }
  } else {
    debugLog('All components already registered');
  }
}

// If global registration function doesn't exist, create it
if (typeof window !== 'undefined' && !window.registerComponent) {
  window.registerComponent = self.registerComponent;
}

// Delayed stub registration to give real components a chance to register
let stubRegistrationTimer = setTimeout(() => {
  debugLog(`Enabling stub registration after ${STUB_REGISTRATION_DELAY}ms delay`);
  enableStubRegistration = true;

  debugLog('Checking for missing components');
  let missingAny = false;
  
  for (const name in componentStubs) {
    if (!self.MarvinComponents[name]) {
      debugLog(`Real component missing: ${name}`);
      missingAny = true;
    }
  }
  
  if (missingAny) {
    debugLog('Some components missing, registering needed stubs');
    // Only register stubs that are needed
    for (const name in componentStubs) {
      if (!self.MarvinComponents[name]) {
        registerStubIfNeeded(name);
      }
    }
  } else {
    debugLog('All components present, no stubs needed');
  }
}, STUB_REGISTRATION_DELAY);

// Public API
export {
  setupComponents,
  registerStubIfNeeded,
  registerAllStubs,
  componentStubs
};

// Initialize the registry
debugLog('Component registry initialized');