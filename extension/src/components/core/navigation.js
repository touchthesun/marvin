import { LogManager } from '../../utils/log-manager.js';
import { showNotification } from '../../services/notification-service.js';
import { componentStubs } from '../../core/component-registry.js';

// Debug flag - set to true to enable verbose debugging
const DEBUG_NAVIGATION = true;

// Direct console logging to bypass LogManager for debugging
function debugLog(message, ...args) {
  if (DEBUG_NAVIGATION) {
    // Use the native console directly to avoid any LogManager issues
    const originalConsoleLog = console.log;
    originalConsoleLog.call(console, `[NAV DEBUG] ${message}`, ...args);
  }
}

// Immediately log that the navigation module is loaded
debugLog('Navigation module loaded');

/**
 * Logger for navigation operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'navigation',
  storageKey: 'marvin_navigation_logs',
  maxEntries: 1000
});

// Initialization flags
let navigationInitialized = false;
let tabsInitialized = false;

// Define NavigationComponent object
const NavigationComponent = {
  // Initialize function - main entry point
  initNavigation() {
    return initNavigation();
  },
  
  // Initialize tabs function
  initTabs() {
    return initTabs();
  },
  
  // Other functions exposed as part of the public API
  restoreLastActivePanel,
  restoreLastActiveTab,
  navigateToPanel,
  navigateToTab
};



/**
 * Initialize the target panel based on panel name
 * @param {string} targetPanel - Panel name to initialize
 * @returns {Promise<void>}
 */
async function initializeTargetPanel(targetPanel) {
  logger.debug(`Initializing panel: ${targetPanel}`);
  
  try {
    const componentName = `${targetPanel}-panel`;
    
    // First check the global component registry
    if (window.MarvinComponents && window.MarvinComponents[componentName]) {
      const component = window.MarvinComponents[componentName];
      logger.debug(`Using registered component for ${componentName}`);
      await callInitFunction(targetPanel, component);
      return;
    }
    
    // If not in registry, use stub implementation
    if (componentStubs[componentName]) {
      logger.warn(`Component ${componentName} not found in registry, using stub`);
      await callInitFunction(targetPanel, componentStubs[componentName]);
      return;
    }
    
    // No stub available
    logger.error(`No implementation or stub available for ${componentName}`);
    showNotification(`Panel ${targetPanel} could not be loaded`, 'error');
  } catch (error) {
    logger.error(`Error initializing panel ${targetPanel}:`, error);
    showNotification(`Error initializing panel ${targetPanel}: ${error.message}`, 'error');
  }
}

/**
 * Call the appropriate initialization function from a module
 * @param {string} panelName - Name of the panel
 * @param {Object} module - The component implementation
 * @returns {Promise<void>}
 */
async function callInitFunction(panelName, module) {
  try {
    // Determine which init function to call based on panel name
    switch (panelName) {
      case 'overview':
        if (typeof module.initOverviewPanel === 'function') {
          await module.initOverviewPanel();
        }
        break;
        
      case 'capture':
        if (typeof module.initCapturePanel === 'function') {
          await module.initCapturePanel();
        }
        break;
        
      case 'knowledge':
        if (typeof module.initKnowledgePanel === 'function') {
          await module.initKnowledgePanel();
        }
        if (typeof module.initKnowledgeGraph === 'function') {
          await module.initKnowledgeGraph();
        }
        break;
        
      case 'assistant':
        if (typeof module.initAssistantPanel === 'function') {
          await module.initAssistantPanel();
        }
        break;
        
      case 'settings':
        if (typeof module.initSettingsPanel === 'function') {
          await module.initSettingsPanel();
        }
        break;
        
      case 'tasks':
      case 'analysis':
        if (typeof module.initTasksPanel === 'function') {
          await module.initTasksPanel();
        }
        break;
        
      default:
        // Try to find a generic init function
        const initFunctionName = `init${panelName.charAt(0).toUpperCase() + panelName.slice(1)}Panel`;
        if (typeof module[initFunctionName] === 'function') {
          await module[initFunctionName]();
        } else {
          logger.warn(`No initialization function found for panel: ${panelName}`);
        }
    }
    
    logger.debug(`Panel ${panelName} initialized successfully`);
  } catch (error) {
    logger.error(`Error calling init function for ${panelName}:`, error);
    throw error;
  }
}

function handleExtensionContextError() {
  debugLog('Extension context may be invalidated, attempting recovery');
  
  // Create a visible error message for the user
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background-color: #f44336; color: white; padding: 15px; text-align: center; z-index: 9999;';
  errorDiv.innerHTML = `
    Extension context has been invalidated. 
    <button id="reload-extension" style="margin-left: 10px; padding: 5px 10px; background: white; color: #f44336; border: none; border-radius: 4px; cursor: pointer;">
      Reload Extension
    </button>
  `;
  
  document.body.appendChild(errorDiv);
  
  // Add reload button functionality
  document.getElementById('reload-extension').addEventListener('click', () => {
    // Attempt to reload the extension page
    window.location.reload();
  });
  
  // Try to recover by checking if we can still access chrome APIs
  try {
    chrome.runtime.getURL('');
    debugLog('Chrome API still accessible');
  } catch (e) {
    debugLog('Chrome API not accessible, extension context is definitely invalid');
    // At this point, only a page reload or extension reload will help
  }
}

/**
 * Initialize navigation system for the dashboard
 * Sets up event listeners for navigation items and handles panel switching
 * @returns {void}
 */
function initNavigation() {
  debugLog('initNavigation called');
  
  try {
    // This will throw if context is invalid
    chrome.runtime.getURL('');
  } catch (e) {
    debugLog('Extension context invalid at initNavigation start');
    handleExtensionContextError();
    return; // Don't proceed with initialization
  }
  
  if (navigationInitialized) {
    debugLog('Navigation already initialized, skipping');
    return;
  }
  
  try {
    debugLog('Initializing navigation');
    
    const navItems = document.querySelectorAll('.nav-item');
    const contentPanels = document.querySelectorAll('.content-panel');
    
    debugLog(`Found nav items: ${navItems.length}, content panels: ${contentPanels.length}`);
    
    // Debug: Log all nav items and panels found
    if (navItems.length > 0) {
      navItems.forEach((item, index) => {
        const panelName = item.getAttribute('data-panel');
        debugLog(`Nav item ${index}: panel=${panelName}, text=${item.textContent.trim()}`);
      });
    }
    
    if (contentPanels.length > 0) {
      contentPanels.forEach((panel, index) => {
        debugLog(`Content panel ${index}: id=${panel.id}, active=${panel.classList.contains('active')}`);
      });
    }
    
    if (navItems.length === 0) {
      debugLog('WARNING: No navigation items found');
      return; // Exit early if no nav items found
    }
    
    if (contentPanels.length === 0) {
      debugLog('WARNING: No content panels found');
      return; // Exit early if no content panels found
    }
    
    // Set up click handlers for each navigation item
    navItems.forEach(item => {
      try {
        const panelName = item.getAttribute('data-panel');
        if (!panelName) {
          debugLog('WARNING: Navigation item missing data-panel attribute', item);
          return;
        }
        
        debugLog(`Setting up click handler for nav item: ${panelName}`);
        
        // Remove any existing click handlers to avoid duplicates
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // Add a direct click handler with debug logging
        newItem.addEventListener('click', async (event) => {
          debugLog(`CLICK DETECTED on nav item: ${panelName}`);
          
          try {
            // Prevent default if it's a link
            if (event.currentTarget.tagName === 'A') {
              event.preventDefault();
            }
            
            debugLog(`Processing click for nav item: ${panelName}`);
            await handleNavigation(panelName, navItems, contentPanels, newItem);
          } catch (navError) {
            debugLog(`ERROR handling navigation to ${panelName}:`, navError);
            logger.error(`Error handling navigation to ${panelName}:`, navError);
            showNotification(`Error navigating to ${panelName}: ${navError.message}`, 'error');
            
            // Try fallback navigation (just show the panel without initialization)
            debugLog(`Attempting fallback navigation to ${panelName}`);
            fallbackNavigation(panelName, navItems, contentPanels);
          }
        });
        
        // Add a direct style to ensure it's clickable
        newItem.style.cursor = 'pointer';
        
        // Debug: Add a direct test click handler
        newItem.setAttribute('data-debug-initialized', 'true');
      } catch (itemError) {
        debugLog(`ERROR setting up navigation item:`, itemError);
        logger.error('Error setting up navigation item:', itemError);
      }
    });
    
    // Set default panel if none is active
    setTimeout(() => {
      debugLog('Checking for active panel');
      const hasActivePanel = Array.from(contentPanels).some(panel => panel.classList.contains('active'));
      debugLog(`Has active panel: ${hasActivePanel}`);
      
      if (!hasActivePanel && navItems.length > 0) {
        debugLog('No active panel found, activating default panel');
        
        // Try to click the first nav item directly
        try {
          const firstItem = document.querySelector('.nav-item');
          debugLog('Clicking first nav item:', firstItem?.getAttribute('data-panel'));
          firstItem?.click();
        } catch (clickError) {
          debugLog('ERROR clicking first nav item:', clickError);
        }
      }
    }, 100);
    
    navigationInitialized = true;
    debugLog('Navigation initialization completed');
  } catch (error) {
    navigationInitialized = false;
    debugLog('ERROR initializing navigation:', error);
    logger.error('Error initializing navigation:', error);
    showNotification('Error initializing navigation: ' + error.message, 'error');
  }
}

/**
 * Fallback navigation - simply show the panel without initialization
 * @param {string} targetPanel - Name of the panel to show
 * @param {NodeList} navItems - All navigation items
 * @param {NodeList} contentPanels - All content panels
 */
function fallbackNavigation(targetPanel, navItems, contentPanels) {
  debugLog(`FALLBACK: Simple navigation to ${targetPanel}`);
  
  try {
    // Update navigation highlighting
    navItems.forEach(navItem => navItem.classList.remove('active'));
    const clickedItem = document.querySelector(`.nav-item[data-panel="${targetPanel}"]`);
    if (clickedItem) {
      clickedItem.classList.add('active');
    }
    
    // Show the target panel and hide others
    contentPanels.forEach(panel => {
      if (panel.id === `${targetPanel}-panel`) {
        panel.classList.add('active');
        debugLog(`FALLBACK: Showing panel ${panel.id}`);
        
        // Add a message to the panel indicating fallback mode
        const messageEl = document.createElement('div');
        messageEl.className = 'fallback-navigation-message';
        messageEl.style.cssText = 'margin: 20px; padding: 15px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 4px; color: #856404;';
        messageEl.innerHTML = `
          <h3>Panel Loaded in Fallback Mode</h3>
          <p>The ${targetPanel} panel has been loaded without full initialization due to module loading errors.</p>
          <p>Some functionality may be limited. Check the browser console for more details.</p>
        `;
        
        // Add the message as the first child after the header
        const header = panel.querySelector('.panel-header');
        if (header && header.nextSibling) {
          panel.insertBefore(messageEl, header.nextSibling);
        } else {
          panel.appendChild(messageEl);
        }
      } else {
        panel.classList.remove('active');
      }
    });
    
    debugLog(`FALLBACK: Navigation to ${targetPanel} completed`);
  } catch (error) {
    debugLog(`ERROR in fallback navigation to ${targetPanel}:`, error);
  }
}

/**
 * Handle navigation to a specific panel
 * @param {string} targetPanel - Panel name to navigate to
 * @param {NodeList} navItems - All navigation items
 * @param {NodeList} contentPanels - All content panels
 * @param {HTMLElement} clickedItem - The clicked navigation item
 * @returns {Promise<void>}
 */
async function handleNavigation(targetPanel, navItems, contentPanels, clickedItem) {
  debugLog(`handleNavigation called for panel: ${targetPanel}`);
  
  try {
    // Update navigation highlighting
    debugLog('Updating navigation highlighting');
    navItems.forEach(navItem => navItem.classList.remove('active'));
    clickedItem.classList.add('active');
    
    // Show corresponding panel
    debugLog('Showing corresponding panel');
    let panelFound = false;
    
    // The expected panel ID format is "{targetPanel}-panel"
    const expectedPanelId = `${targetPanel}-panel`;
    debugLog(`Looking for panel with ID: ${expectedPanelId}`);
    
    contentPanels.forEach(panel => {
      const panelId = panel.id;
      debugLog(`Checking panel: ${panelId} against target: ${expectedPanelId}`);
      
      if (panelId === expectedPanelId) {
        debugLog(`Activating panel: ${panelId}`);
        panel.classList.add('active');
        panelFound = true;
        
        // Dispatch custom event
        try {
          const event = new CustomEvent('panelChanged', {
            detail: { panelId: targetPanel, panelElement: panel }
          });
          document.dispatchEvent(event);
          debugLog(`Dispatched panelChanged event for ${targetPanel}`);
        } catch (eventError) {
          debugLog(`ERROR dispatching panel event:`, eventError);
        }
      } else {
        panel.classList.remove('active');
      }
    });
    
    if (!panelFound) {
      debugLog(`WARNING: Panel not found for target: ${targetPanel}`);
      showNotification(`Panel not found: ${targetPanel}`, 'error');
    }
    
    // Initialize panel if needed
    if (panelFound) {
      debugLog(`Initializing target panel: ${targetPanel}`);
      await initializeTargetPanel(targetPanel);
    }
    
    // Save last active panel to storage
    try {
      debugLog(`Saving last active panel: ${targetPanel}`);
      chrome.storage.local.set({ lastActivePanel: targetPanel });
    } catch (storageError) {
      debugLog(`ERROR saving last active panel:`, storageError);
      logger.warn('Error saving last active panel:', storageError);
    }
    
    debugLog(`Navigation to ${targetPanel} completed successfully`);
  } catch (error) {
    debugLog(`ERROR in handleNavigation for ${targetPanel}:`, error);
    logger.error(`Error in handleNavigation for ${targetPanel}:`, error);
    throw error;
  }
}

/**
 * Initialize tabs within panels
 * @returns {void}
 */
function initTabs() {
  logger.debug('initTabs called');
  
  if (tabsInitialized) {
    logger.info('Tabs already initialized, skipping');
    return;
  }
  
  try {
    logger.info('Initializing tabs');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    logger.debug(`Found tab buttons: ${tabButtons.length}, tab panes: ${tabPanes.length}`);
    
    // Debug: Log all tab buttons and panes
    if (tabButtons.length > 0) {
      tabButtons.forEach((btn, index) => {
        const tabName = btn.getAttribute('data-tab');
        logger.debug(`Tab button ${index}: tab=${tabName}, text=${btn.textContent.trim()}`);
      });
    }
    
    if (tabPanes.length > 0) {
      tabPanes.forEach((pane, index) => {
        logger.debug(`Tab pane ${index}: id=${pane.id}, active=${pane.classList.contains('active')}`);
      });
    }
    
    if (tabButtons.length === 0) {
      logger.warn('No tab buttons found');
      return;
    }
    
    if (tabPanes.length === 0) {
      logger.warn('No tab panes found');
      return;
    }
    
    tabButtons.forEach(button => {
      try {
        const targetTab = button.getAttribute('data-tab');
        if (!targetTab) {
          logger.warn('Tab button missing data-tab attribute', button);
          return;
        }
        
        logger.debug(`Setting up click handler for tab: ${targetTab}`);
        
        // Remove any existing click handlers to avoid duplicates
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', () => {
          try {
            logger.debug(`Tab button clicked: ${targetTab}`);
            handleTabChange(targetTab, tabButtons, tabPanes, newButton);
          } catch (tabError) {
            logger.error(`Error handling tab change to ${targetTab}:`, tabError);
            showNotification(`Error changing tab: ${tabError.message}`, 'error');
          }
        });
      } catch (buttonError) {
        logger.error('Error setting up tab button:', buttonError);
      }
    });
    
    // Set default tab if none is active
    setTimeout(() => {
      const hasActiveTab = Array.from(tabPanes).some(pane => pane.classList.contains('active'));
      if (!hasActiveTab && tabButtons.length > 0) {
        logger.debug('No active tab found, activating default tab');
        tabButtons[0].click();
      }
    }, 100);
    
    tabsInitialized = true;
    logger.info('Tabs initialized successfully');
  } catch (error) {
    tabsInitialized = false;
    logger.error('Error initializing tabs:', error);
    showNotification('Error initializing tabs: ' + error.message, 'error');
  }
}

/**
 * Handle tab change
 * @param {string} targetTab - Tab name to change to
 * @param {NodeList} tabButtons - All tab buttons
 * @param {NodeList} tabPanes - All tab panes
 * @param {HTMLElement} clickedButton - The clicked tab button
 * @returns {void}
 */
function handleTabChange(targetTab, tabButtons, tabPanes, clickedButton) {
  logger.debug(`Handling tab change to: ${targetTab}`);
  
  try {
    // Update tab highlighting
    tabButtons.forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    
    // Show corresponding tab content
    let tabFound = false;
    
    // The expected tab pane ID format is "{targetTab}-content"
    const expectedTabId = `${targetTab}-content`;
    logger.debug(`Looking for tab pane with ID: ${expectedTabId}`);
    
    tabPanes.forEach(pane => {
      const paneId = pane.id;
      logger.debug(`Checking tab pane: ${paneId} against target: ${expectedTabId}`);
      
      if (paneId === expectedTabId) {
        pane.classList.add('active');
        tabFound = true;
        
        // Trigger a custom event for tab activation
        try {
          const tabActivatedEvent = new CustomEvent('tabActivated', {
            detail: { tabId: targetTab, paneElement: pane }
          });
          document.dispatchEvent(tabActivatedEvent);
          logger.debug(`Dispatched tabActivated event for ${targetTab}`);
        } catch (eventError) {
          logger.warn(`Error dispatching tab event for ${targetTab}:`, eventError);
        }
      } else {
        pane.classList.remove('active');
      }
    });
    
    if (!tabFound) {
      logger.warn(`Tab pane not found for target: ${targetTab}`);
      
      // Try to find a tab pane with an ID that contains the target tab name
      // This is a fallback for cases where the naming convention might be different
      let fallbackFound = false;
      tabPanes.forEach(pane => {
        if (pane.id.includes(targetTab) && !fallbackFound) {
          pane.classList.add('active');
          fallbackFound = true;
          logger.debug(`Used fallback: activated tab pane with ID ${pane.id} for target ${targetTab}`);
        }
      });
      
      if (!fallbackFound) {
        logger.error(`No matching tab pane found for ${targetTab}, even with fallback`);
      }
    }
    
    // Save last active tab to storage
    try {
      // Get the parent panel to store tab context
      const parentPanel = clickedButton.closest('.content-panel');
      const panelId = parentPanel ? parentPanel.id : null;
      
      if (panelId) {
        const storageKey = `lastActiveTab_${panelId}`;
        chrome.storage.local.set({ [storageKey]: targetTab });
        logger.debug(`Saved last active tab for ${panelId}: ${targetTab}`);
      }
    } catch (storageError) {
      logger.warn('Error saving last active tab:', storageError);
    }
  } catch (error) {
    logger.error(`Error in handleTabChange for ${targetTab}:`, error);
    throw error;
  }
}

/**
 * Restore last active panel from storage
 * @returns {Promise<void>}
 */
async function restoreLastActivePanel() {
  logger.debug('Restoring last active panel');
  
  try {
    const data = await chrome.storage.local.get('lastActivePanel');
    const lastActivePanel = data.lastActivePanel;
    
    if (lastActivePanel) {
      logger.info(`Restoring last active panel: ${lastActivePanel}`);
      
      const navItem = document.querySelector(`.nav-item[data-panel="${lastActivePanel}"]`);
      if (navItem) {
        navItem.click();
        logger.debug(`Clicked nav item for ${lastActivePanel}`);
        return true;
      } else {
        logger.warn(`Nav item for last active panel ${lastActivePanel} not found`);
        // Fall back to first panel
        const firstNavItem = document.querySelector('.nav-item');
        if (firstNavItem) {
          firstNavItem.click();
          logger.debug('Clicked first nav item as fallback');
          return true;
        }
      }
    } else {
      logger.debug('No last active panel found, using default');
      // Default to first panel
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        firstNavItem.click();
        logger.debug('Clicked first nav item as default');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('Error restoring last active panel:', error);
    
    // Fall back to first panel
    try {
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        firstNavItem.click();
        logger.debug('Clicked first nav item after error');
        return true;
      }
    } catch (fallbackError) {
      logger.error('Error activating fallback panel:', fallbackError);
    }
    
    return false;
  }
}

/**
 * Restore last active tab for a specific panel
 * @param {string} panelId - ID of the panel
 * @returns {Promise<boolean>} - Whether restoration was successful
 */
async function restoreLastActiveTab(panelId) {
  if (!panelId) {
    logger.warn('No panel ID provided for restoring last active tab');
    return false;
  }
  
  logger.debug(`Restoring last active tab for panel: ${panelId}`);
  
  try {
    const storageKey = `lastActiveTab_${panelId}`;
    const data = await chrome.storage.local.get(storageKey);
    const lastActiveTab = data[storageKey];
    
    if (lastActiveTab) {
      logger.info(`Restoring last active tab for ${panelId}: ${lastActiveTab}`);
      
      const tabButton = document.querySelector(`#${panelId} .tab-btn[data-tab="${lastActiveTab}"]`);
      if (tabButton) {
        tabButton.click();
        logger.debug(`Clicked tab button for ${lastActiveTab}`);
        return true;
      } else {
        logger.warn(`Tab button for last active tab ${lastActiveTab} not found in panel ${panelId}`);
        // Fall back to first tab in this panel
        const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
        if (firstTabButton) {
          firstTabButton.click();
          logger.debug(`Clicked first tab button in panel ${panelId} as fallback`);
          return true;
        }
      }
    } else {
      logger.debug(`No last active tab found for panel ${panelId}, using default`);
      // Default to first tab in this panel
      const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
      if (firstTabButton) {
        firstTabButton.click();
        logger.debug(`Clicked first tab button in panel ${panelId} as default`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error(`Error restoring last active tab for panel ${panelId}:`, error);
    
    // Fall back to first tab in this panel
    try {
      const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
      if (firstTabButton) {
        firstTabButton.click();
        logger.debug(`Clicked first tab button in panel ${panelId} after error`);
        return true;
      }
    } catch (fallbackError) {
      logger.error(`Error activating fallback tab for panel ${panelId}:`, fallbackError);
    }
    
    return false;
  }
}

/**
 * Navigate to a specific panel programmatically
 * @param {string} panelName - Name of the panel to navigate to
 * @returns {Promise<boolean>} True if navigation was successful
 */
async function navigateToPanel(panelName) {
  logger.info(`Programmatically navigating to panel: ${panelName}`);
  
  try {
    const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
    if (navItem) {
      navItem.click();
      logger.debug(`Successfully navigated to ${panelName}`);
      return true;
    } else {
      logger.warn(`Navigation item for panel ${panelName} not found`);
      showNotification(`Panel "${panelName}" not found`, 'error');
      return false;
    }
  } catch (error) {
    logger.error(`Error navigating to panel ${panelName}:`, error);
    showNotification(`Error navigating to panel: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Navigate to a specific tab within a panel programmatically
 * @param {string} panelName - Name of the panel containing the tab
 * @param {string} tabName - Name of the tab to navigate to
 * @returns {Promise<boolean>} True if navigation was successful
 */
async function navigateToTab(panelName, tabName) {
  logger.info(`Programmatically navigating to tab: ${tabName} in panel: ${panelName}`);
  
  try {
    // First navigate to the panel if needed
    const panelElement = document.getElementById(`${panelName}-panel`);
    if (!panelElement || !panelElement.classList.contains('active')) {
      const panelNavigated = await navigateToPanel(panelName);
      if (!panelNavigated) {
        return false;
      }
      
      // Give the panel time to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Now navigate to the tab
    const tabButton = document.querySelector(`#${panelName}-panel .tab-btn[data-tab="${tabName}"]`);
    if (tabButton) {
      tabButton.click();
      logger.debug(`Successfully navigated to tab ${tabName} in panel ${panelName}`);
      return true;
    } else {
      logger.warn(`Tab button for ${tabName} not found in panel ${panelName}`);
      showNotification(`Tab "${tabName}" not found in panel "${panelName}"`, 'error');
      return false;
    }
  } catch (error) {
    logger.error(`Error navigating to tab ${tabName} in panel ${panelName}:`, error);
    showNotification(`Error navigating to tab: ${error.message}`, 'error');
    return false;
  }
}

// Register the component with fallback mechanism
try {
  // First, try to use the global registerComponent function
  if (typeof self.registerComponent === 'function') {
    debugLog('Registering navigation component using global registerComponent');
    self.registerComponent('navigation', NavigationComponent);
  } else {
    // If registerComponent isn't available, register directly in global registry
    debugLog('Global registerComponent not found, using direct registry access');
    self.MarvinComponents = self.MarvinComponents || {};
    self.MarvinComponents['navigation'] = NavigationComponent;
  }
  
  debugLog('Navigation component registered successfully');
} catch (error) {
  debugLog('Error registering navigation component:', error);
  // Try window as fallback if self fails
  try {
    window.MarvinComponents = window.MarvinComponents || {};
    window.MarvinComponents['navigation'] = NavigationComponent;
    debugLog('Navigation component registered using window fallback');
  } catch (windowError) {
    debugLog('Failed to register navigation component:', windowError);
  }
}

export default NavigationComponent;

// Export functions needed by other modules
export {
  initNavigation,
  initTabs,
  restoreLastActivePanel,
  restoreLastActiveTab,
  navigateToPanel,
  navigateToTab
};