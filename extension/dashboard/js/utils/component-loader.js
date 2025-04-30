// Debug flag
const DEBUG = true;

// Debug logging function
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[COMPONENT LOADER] ${message}`, ...args);
  }
}
 
debugLog('Component loader script initialized');

// Track whether stubs have been registered
let stubsRegistered = false;

// Simple stub implementations for components in case of load failure
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
  
  'capture-panel': {
    initCapturePanel: function() {
      debugLog('STUB: capture-panel.initCapturePanel called');
      
      // Get the panel element
      const panel = document.getElementById('capture-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      message.innerHTML = `
        <h3>Capture Panel (Stub)</h3>
        <p>This is a stub implementation of the capture panel.</p>
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
  
  'knowledge-panel': {
    initKnowledgePanel: function() {
      debugLog('STUB: knowledge-panel.initKnowledgePanel called');
      
      // Get the panel element
      const panel = document.getElementById('knowledge-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      message.innerHTML = `
        <h3>Knowledge Panel (Stub)</h3>
        <p>This is a stub implementation of the knowledge panel.</p>
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
  
  'settings-panel': {
    initSettingsPanel: function() {
      debugLog('STUB: settings-panel.initSettingsPanel called');
      
      // Get the panel element
      const panel = document.getElementById('settings-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      message.innerHTML = `
        <h3>Settings Panel (Stub)</h3>
        <p>This is a stub implementation of the settings panel.</p>
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
  
  'tasks-panel': {
    initTasksPanel: function() {
      debugLog('STUB: tasks-panel.initTasksPanel called');
      
      // Get the panel element
      const panel = document.getElementById('tasks-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      message.innerHTML = `
        <h3>Tasks Panel (Stub)</h3>
        <p>This is a stub implementation of the tasks panel.</p>
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
  
  'assistant-panel': {
    initAssistantPanel: function() {
      debugLog('STUB: assistant-panel.initAssistantPanel called');
      
      // Get the panel element
      const panel = document.getElementById('assistant-panel');
      if (!panel) return;
      
      // Add stub message
      const message = document.createElement('div');
      message.style.padding = '20px';
      message.style.margin = '20px';
      message.style.backgroundColor = '#f9e9c9';
      message.style.border = '1px solid #f8d188';
      message.style.borderRadius = '4px';
      
      message.innerHTML = `
        <h3>Assistant Panel (Stub)</h3>
        <p>This is a stub implementation of the assistant panel.</p>
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
  }
};

/**
 * Register a stub component if the real one isn't available
 * @param {string} name - Component name
 * @returns {boolean} - Whether a stub was registered
 */
function registerStubIfNeeded(name) {
  if (!window.MarvinComponents[name]) {
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
  if (stubsRegistered) return;
  
  for (const name in componentStubs) {
    registerStubIfNeeded(name);
  }
  
  stubsRegistered = true;
  debugLog('All stub components registered');
}

// Delay stub registration to give real components a chance to load
setTimeout(() => {
  debugLog('Checking for missing components');
  const requiredComponents = [
    'navigation', 'overview-panel', 'capture-panel', 
    'knowledge-panel', 'settings-panel', 'tasks-panel', 
    'assistant-panel'
  ];
  
  let missingComponents = false;
  
  for (const name of requiredComponents) {
    if (!window.MarvinComponents[name]) {
      debugLog(`Component ${name} not found, will register stub`);
      missingComponents = true;
    }
  }
  
  if (missingComponents) {
    debugLog('Some components are missing, registering stubs');
    registerAllStubs();
  } else {
    debugLog('All components found, no stubs needed');
  }
}, 1000); // Wait 1 second to give real components a chance to load

// Initialize navigation system using stub
document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOM loaded, initializing navigation from component loader');
  
  // Wait a bit to ensure components have had time to load
  setTimeout(() => {
    // Make sure navigation is available, even if it's a stub
    registerStubIfNeeded('navigation');
    
    const navComponent = window.MarvinComponents['navigation'];
    if (navComponent && navComponent.initNavigation) {
      debugLog('Initializing navigation system');
      navComponent.initNavigation();
      
      if (navComponent.initTabs) {
        debugLog('Initializing tabs system');
        navComponent.initTabs();
      }
      
      // Activate the first panel
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        debugLog('Activating first panel');
        firstNavItem.click();
      }
    } else {
      debugLog('ERROR: Navigation component not found!');
    }
  }, 500);
});

// Export functions
window.ComponentLoader = {
  registerAllStubs: function() {
    registerAllStubs();
  },
  
  registerStubIfNeeded: function(name) {
    return registerStubIfNeeded(name);
  },
  
  initializeNavigation: function() {
    const navComponent = window.MarvinComponents['navigation'];
    if (navComponent && navComponent.initNavigation) {
      navComponent.initNavigation();
      
      if (navComponent.initTabs) {
        navComponent.initTabs();
      }
    }
  }
};

debugLog('Component loader script loaded successfully');
