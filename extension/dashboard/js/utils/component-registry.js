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

self.MarvinComponents = self.MarvinComponents || {};

// Add registration function
self.registerComponent = function(name, implementation) {
  console.log(`[COMPONENT REGISTRY] Registering component: ${name}`);
  self.MarvinComponents[name] = implementation;
};

// Define component stubs here
export const componentStubs = {
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
      
      message.innerHTML = `
        <h3>Overview Panel (Stub)</h3>
        <p>This is a stub implementation of the overview panel.</p>
        <p>The actual component module could not be loaded.</p>
      `;
      
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
  if (!window.MarvinComponents[name] && componentStubs[name]) {
    window.registerComponent(name, componentStubs[name]);
    debugLog(`Registered stub component: ${name}`);
    return true;
  }
  return false;
}

/**
 * Register all stub components
 */
function registerAllStubs() {
  for (const name in componentStubs) {
    registerStubIfNeeded(name);
  }
  debugLog('All stub components registered');
}

// If global component registry doesn't exist, create it
if (typeof window !== 'undefined' && !window.MarvinComponents) {
  window.MarvinComponents = {};
}

// If global registration function doesn't exist, create it
if (typeof window !== 'undefined' && !window.registerComponent) {
  window.registerComponent = function(name, implementation) {
    debugLog(`Registering component: ${name}`);
    window.MarvinComponents[name] = implementation;
  };
}

// Pre-register all stub implementations
registerAllStubs();

// Export functions
export {
  registerStubIfNeeded,
  registerAllStubs
};

// Initialize the registry
debugLog('Component registry initialized');
