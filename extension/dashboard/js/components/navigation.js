// components/navigation.js
import { LogManager } from '../../../shared/utils/log-manager.js';
import { showNotification } from '../services/notification-service.js';

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
 * Initialize the target panel based on panel name
 * @param {string} targetPanel - Panel name to initialize
 * @returns {Promise<void>}
 */
async function initializeTargetPanel(targetPanel) {
  logger.debug(`Initializing panel: ${targetPanel}`);
  
  try {
    switch (targetPanel) {
      case 'overview':
        logger.info('Initializing overview panel from navigation');
        // Dynamically import to avoid circular dependencies
        const { initOverviewPanel } = await import('./overview-panel.js');
        await initOverviewPanel();
        break;
        
      case 'capture':
        logger.info('Initializing capture panel from navigation');
        const { initCapturePanel } = await import('./capture-panel.js');
        await initCapturePanel();
        break;
        
      case 'knowledge':
        logger.info('Initializing knowledge panel from navigation');
        const knowledgeModule = await import('./knowledge-panel.js');
        await knowledgeModule.initKnowledgePanel();
        await knowledgeModule.initKnowledgeGraph();
        break;
        
      case 'assistant':
        logger.info('Initializing assistant panel from navigation');
        const { initAssistantPanel } = await import('./assistant-panel.js');
        await initAssistantPanel();
        break;
        
      case 'settings':
        logger.info('Initializing settings panel from navigation');
        const { initSettingsPanel } = await import('./settings-panel.js');
        await initSettingsPanel();
        break;
        
      case 'tasks':
        logger.info('Initializing tasks panel from navigation');
        const { initTasksPanel } = await import('./tasks-panel.js');
        await initTasksPanel();
        break;
        
      // Handle the case where 'analysis' is used instead of 'tasks'
      case 'analysis':
        logger.info('Initializing analysis panel (redirecting to tasks) from navigation');
        const { initTasksPanel: initAnalysisPanel } = await import('./tasks-panel.js');
        await initAnalysisPanel();
        break;
        
      default:
        logger.warn(`Unknown panel type: ${targetPanel}`);
    }
    
    logger.debug(`Panel ${targetPanel} initialized successfully`);
  } catch (error) {
    logger.error(`Error initializing panel ${targetPanel}:`, error);
    showNotification(`Error initializing ${targetPanel} panel: ${error.message}`, 'error');
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

/**
 * Register a callback for panel navigation events
 * @param {Function} callback - Function to call when navigation occurs
 * @returns {Function} Function to remove the listener
 */
function onPanelChange(callback) {
  logger.debug('Registering panel change callback');
  
  if (typeof callback !== 'function') {
    logger.error('Invalid callback provided to onPanelChange');
    return () => {}; // Return no-op removal function
  }
  
  try {
    // Create event listener function
    const handlePanelChange = (event) => {
      if (event.detail && event.detail.panelId) {
        callback(event.detail.panelId, event.detail);
      }
    };
    
    // Add listener for custom event
    document.addEventListener('panelChanged', handlePanelChange);
    
    // Return function to remove listener
    return () => {
      document.removeEventListener('panelChanged', handlePanelChange);
      logger.debug('Panel change callback removed');
    };
  } catch (error) {
    logger.error('Error setting up panel change callback:', error);
    return () => {}; // Return no-op removal function
  }
}

/**
 * Register a callback for tab change events
 * @param {Function} callback - Function to call when tab changes
 * @returns {Function} Function to remove the listener
 */
function onTabChange(callback) {
  logger.debug('Registering tab change callback');
  
  if (typeof callback !== 'function') {
    logger.error('Invalid callback provided to onTabChange');
    return () => {}; // Return no-op removal function
  }
  
  try {
    // Create event listener function
    const handleTabChange = (event) => {
      if (event.detail && event.detail.tabId) {
        callback(event.detail.tabId, event.detail);
      }
    };
    
    // Add listener for custom event
    document.addEventListener('tabActivated', handleTabChange);
    
    // Return function to remove listener
    return () => {
      document.removeEventListener('tabActivated', handleTabChange);
      logger.debug('Tab change callback removed');
    };
  } catch (error) {
    logger.error('Error setting up tab change callback:', error);
    return () => {}; // Return no-op removal function
  }
}

/**
 * Get the currently active panel
 * @returns {string|null} ID of the active panel or null if none found
 */
function getActivePanel() {
  try {
    const activePanel = document.querySelector('.content-panel.active');
    if (activePanel) {
      const panelId = activePanel.id.replace('-panel', '');
      logger.debug(`Active panel: ${panelId}`);
      return panelId;
    }
    
    logger.debug('No active panel found');
    return null;
  } catch (error) {
    logger.error('Error getting active panel:', error);
    return null;
  }
}

/**
 * Get the currently active tab within a panel
 * @param {string} [panelId] - ID of the panel (uses active panel if not provided)
 * @returns {string|null} ID of the active tab or null if none found
 */
function getActiveTab(panelId) {
  try {
    // If no panel ID provided, use the active panel
    if (!panelId) {
      const activePanel = document.querySelector('.content-panel.active');
      if (!activePanel) {
        logger.debug('No active panel found');
        return null;
      }
      panelId = activePanel.id;
    } else {
      // Ensure panel ID has the -panel suffix
      if (!panelId.endsWith('-panel')) {
        panelId = `${panelId}-panel`;
      }
    }
    
    // Find active tab in the specified panel
    const activeTab = document.querySelector(`#${panelId} .tab-pane.active`);
    if (activeTab) {
      const tabId = activeTab.id.replace('-content', '');
      logger.debug(`Active tab in panel ${panelId}: ${tabId}`);
      return tabId;
    }
    
    logger.debug(`No active tab found in panel ${panelId}`);
    return null;
  } catch (error) {
    logger.error(`Error getting active tab for panel ${panelId}:`, error);
    return null;
  }
}

/**
 * Safely set up event listeners for navigation elements
 * @param {string} selector - CSS selector for the element
 * @param {string} eventType - Event type (e.g., 'click')
 * @param {Function} handler - Event handler function
 * @returns {boolean} - Whether the setup was successful
 */
function setupSafeEventListener(selector, eventType, handler) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      logger.warn(`Element not found for selector: ${selector}`);
      return false;
    }
    
    // Clone and replace to remove any existing listeners
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
    
    // Add the new event listener
    newElement.addEventListener(eventType, handler);
    logger.debug(`Event listener (${eventType}) set up for ${selector}`);
    return true;
  } catch (error) {
    logger.error(`Error setting up event listener for ${selector}:`, error);
    return false;
  }
}

/**
 * Verify that all navigation items have corresponding panels
 * @returns {Array} - Array of issues found
 */
function verifyNavigationStructure() {
  logger.debug('Verifying navigation structure');
  const issues = [];
  
  try {
    // Check that all nav items have corresponding panels
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const panelName = item.getAttribute('data-panel');
      if (!panelName) {
        issues.push(`Navigation item missing data-panel attribute: ${item.textContent.trim()}`);
        return;
      }
      
      const panel = document.getElementById(`${panelName}-panel`);
      if (!panel) {
        issues.push(`Panel not found for navigation item: ${panelName}`);
      }
    });
    
    // Check that all tab buttons have corresponding panes
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
      const tabName = button.getAttribute('data-tab');
      if (!tabName) {
        issues.push(`Tab button missing data-tab attribute: ${button.textContent.trim()}`);
        return;
      }
      
      const tabPane = document.getElementById(`${tabName}-content`);
      if (!tabPane) {
        issues.push(`Tab pane not found for tab button: ${tabName}`);
      }
    });
    
    if (issues.length > 0) {
      logger.warn('Navigation structure issues found:', issues);
    } else {
      logger.debug('Navigation structure verified successfully');
    }
    
    return issues;
  } catch (error) {
    logger.error('Error verifying navigation structure:', error);
    issues.push(`Error verifying structure: ${error.message}`);
    return issues;
  }
}

/**
 * Fix common navigation structure issues
 * @returns {boolean} - Whether fixes were applied
 */
function fixNavigationStructure() {
  logger.info('Attempting to fix navigation structure issues');
  let fixesApplied = false;
  
  try {
    // Fix tab pane IDs that don't follow the expected format
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
      const tabName = button.getAttribute('data-tab');
      if (!tabName) return;
      
      // Look for tab panes that might have the wrong ID format
      const expectedId = `${tabName}-content`;
      const tabPane = document.getElementById(expectedId);
      
      if (!tabPane) {
        // Try to find a tab pane with an ID that contains the tab name
        const possiblePanes = document.querySelectorAll('.tab-pane');
        possiblePanes.forEach(pane => {
          if (pane.id.includes(tabName) && pane.id !== expectedId) {
            logger.debug(`Fixing tab pane ID: ${pane.id} -> ${expectedId}`);
            pane.id = expectedId;
            fixesApplied = true;
          }
        });
      }
    });
    
    // Fix panel IDs that don't follow the expected format
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const panelName = item.getAttribute('data-panel');
      if (!panelName) return;
      
      // Look for panels that might have the wrong ID format
      const expectedId = `${panelName}-panel`;
      const panel = document.getElementById(expectedId);
      
      if (!panel) {
        // Try to find a panel with an ID that contains the panel name
        const possiblePanels = document.querySelectorAll('.content-panel');
        possiblePanels.forEach(p => {
          if (p.id.includes(panelName) && p.id !== expectedId) {
            logger.debug(`Fixing panel ID: ${p.id} -> ${expectedId}`);
            p.id = expectedId;
            fixesApplied = true;
          }
        });
      }
    });
    
    if (fixesApplied) {
      logger.info('Navigation structure fixes applied');
    } else {
      logger.debug('No navigation structure fixes needed');
    }
    
    return fixesApplied;
  } catch (error) {
    logger.error('Error fixing navigation structure:', error);
    return false;
  }
}

// Periodically check if extension context is still valid
let contextCheckInterval;
function startContextCheck() {
  debugLog('Starting extension context validity check');
  
  if (contextCheckInterval) {
    clearInterval(contextCheckInterval);
  }
  
  contextCheckInterval = setInterval(() => {
    try {
      chrome.runtime.getURL('');
      // Context is still valid
    } catch (e) {
      debugLog('Extension context has become invalid');
      handleExtensionContextError();
      clearInterval(contextCheckInterval);
    }
  }, 5000); // Check every 5 seconds
}

// Start the context check
startContextCheck();

// Export functions needed by other modules
export {
  initNavigation,
  initTabs,
  restoreLastActivePanel,
  restoreLastActiveTab,
  navigateToPanel,
  navigateToTab,
  onPanelChange,
  onTabChange,
  getActivePanel,
  getActiveTab,
  setupSafeEventListener,
  verifyNavigationStructure,
  fixNavigationStructure
};