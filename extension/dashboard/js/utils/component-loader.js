// Debug flag
const DEBUG = true;

// Debug logging function
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[COMPONENT LOADER] ${message}`, ...args);
  }
}

debugLog('Component loader script initialized');

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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
  }
};

// Register all stub components
for (const name in componentStubs) {
  if (!window.MarvinComponents[name]) {
    window.registerComponent(name, componentStubs[name]);
    debugLog(`Registered stub component: ${name}`);
  }
}

// Initialize navigation system using stub
document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOM loaded, initializing navigation from component loader');
  
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
});

// Export functions
window.ComponentLoader = {
  registerAllStubs: function() {
    for (const name in componentStubs) {
      window.registerComponent(name, componentStubs[name]);
      debugLog(`Registered stub component: ${name}`);
    }
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



// Component stubs for fallback pulled from navigation.js
// const componentStubs = {
//   'overview-panel': {
//     initOverviewPanel: async function() {
//       debugLog('STUB: initOverviewPanel called');
//       // Basic implementation for overview panel
//       const panel = document.getElementById('overview-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Overview Panel (Stub)</h3>
//         <p>This is a stub implementation of the overview panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     }
//   },
//   'capture-panel': {
//     initCapturePanel: async function() {
//       debugLog('STUB: initCapturePanel called');
//       // Basic implementation for capture panel
//       const panel = document.getElementById('capture-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Capture Panel (Stub)</h3>
//         <p>This is a stub implementation of the capture panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     }
//   },
//   'knowledge-panel': {
//     initKnowledgePanel: async function() {
//       debugLog('STUB: initKnowledgePanel called');
//       // Basic implementation for knowledge panel
//       const panel = document.getElementById('knowledge-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Knowledge Panel (Stub)</h3>
//         <p>This is a stub implementation of the knowledge panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     },
//     initKnowledgeGraph: async function() {
//       debugLog('STUB: initKnowledgeGraph called');
//       // Nothing to do in stub implementation
//     }
//   },
//   'assistant-panel': {
//     initAssistantPanel: async function() {
//       debugLog('STUB: initAssistantPanel called');
//       // Basic implementation for assistant panel
//       const panel = document.getElementById('assistant-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Assistant Panel (Stub)</h3>
//         <p>This is a stub implementation of the assistant panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     }
//   },
//   'settings-panel': {
//     initSettingsPanel: async function() {
//       debugLog('STUB: initSettingsPanel called');
//       // Basic implementation for settings panel
//       const panel = document.getElementById('settings-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Settings Panel (Stub)</h3>
//         <p>This is a stub implementation of the settings panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     }
//   },
//   'tasks-panel': {
//     initTasksPanel: async function() {
//       debugLog('STUB: initTasksPanel called');
//       // Basic implementation for tasks panel
//       const panel = document.getElementById('tasks-panel');
//       if (!panel) return;
      
//       // Add stub message
//       const message = document.createElement('div');
//       message.style.padding = '20px';
//       message.style.margin = '20px';
//       message.style.backgroundColor = '#f9e9c9';
//       message.style.border = '1px solid #f8d188';
//       message.style.borderRadius = '4px';
      
//       message.innerHTML = `
//         <h3>Tasks Panel (Stub)</h3>
//         <p>This is a stub implementation of the tasks panel.</p>
//         <p>The actual component module could not be loaded.</p>
//       `;
      
//       // Find a place to insert the message
//       const header = panel.querySelector('.panel-header');
//       if (header && header.nextSibling) {
//         panel.insertBefore(message, header.nextSibling);
//       } else {
//         panel.appendChild(message);
//       }
//     }
//   }
// };