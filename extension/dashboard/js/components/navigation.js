// components/navigation.js
import { LogManager } from '../../../shared/utils/log-manager.js';
import { showNotification } from '../services/notification-service.js';

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
  logger.debug('initNavigation called');
  
  if (navigationInitialized) {
    logger.info('Navigation already initialized, skipping');
    return;
  }
  
  try {
    logger.info('Initializing navigation');
    navigationInitialized = true;
    
    const navItems = document.querySelectorAll('.nav-item');
    const contentPanels = document.querySelectorAll('.content-panel');
    
    logger.debug(`Found nav items: ${navItems.length}, content panels: ${contentPanels.length}`);
    
    if (navItems.length === 0) {
      logger.warn('No navigation items found');
    }
    
    if (contentPanels.length === 0) {
      logger.warn('No content panels found');
    }
    
    // Set up click handlers for each navigation item
    navItems.forEach(item => {
      try {
        const panelName = item.getAttribute('data-panel');
        if (!panelName) {
          logger.warn('Navigation item missing data-panel attribute', item);
          return;
        }
        
        logger.debug(`Setting up click handler for nav item: ${panelName}`);
        
        item.addEventListener('click', async (event) => {
          try {
            // Prevent default if it's a link
            if (event.currentTarget.tagName === 'A') {
              event.preventDefault();
            }
            
            logger.info(`Nav item clicked: ${panelName}`);
            await handleNavigation(panelName, navItems, contentPanels, item);
          } catch (navError) {
            logger.error(`Error handling navigation to ${panelName}:`, navError);
            showNotification(`Error navigating to ${panelName}: ${navError.message}`, 'error');
          }
        });
      } catch (itemError) {
        logger.error('Error setting up navigation item:', itemError);
      }
    });
    
    // Set default panel if none is active
    setTimeout(() => {
      const hasActivePanel = Array.from(contentPanels).some(panel => panel.classList.contains('active'));
      if (!hasActivePanel && navItems.length > 0) {
        logger.debug('No active panel found, activating default panel');
        navItems[0].click();
      }
    }, 100);
    
    logger.info('Navigation initialized successfully');
  } catch (error) {
    navigationInitialized = false;
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
  logger.debug(`Handling navigation to panel: ${targetPanel}`);
  
  try {
    // Update navigation highlighting
    navItems.forEach(navItem => navItem.classList.remove('active'));
    clickedItem.classList.add('active');
    
    // Show corresponding panel
    let panelFound = false;
    contentPanels.forEach(panel => {
      if (panel.id === `${targetPanel}-panel`) {
        logger.debug(`Activating panel: ${panel.id}`);
        panel.classList.add('active');
        panelFound = true;
        
        // Debug capture button when capture panel is activated
        if (targetPanel === 'capture') {
          setTimeout(debugCaptureButton, 500);
        }
      } else {
        panel.classList.remove('active');
      }
    });
    
    if (!panelFound) {
      logger.warn(`Panel not found for target: ${targetPanel}`);
    }
    
    // Initialize panel if needed
    await initializeTargetPanel(targetPanel);
    
    // Save last active panel to storage
    try {
      chrome.storage.local.set({ lastActivePanel: targetPanel });
      logger.debug(`Saved last active panel: ${targetPanel}`);
    } catch (storageError) {
      logger.warn('Error saving last active panel:', storageError);
    }
  } catch (error) {
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
 * Debug function for capture button
 * @returns {void}
 */
function debugCaptureButton() {
  logger.debug('Debugging capture button');
  
  try {
    const captureBtn = document.getElementById('capture-btn');
    if (captureBtn) {
      logger.debug('Capture button found, checking state');
      logger.debug(`Button disabled: ${captureBtn.disabled}`);
      logger.debug(`Button text: ${captureBtn.textContent}`);
      logger.debug(`Button classes: ${captureBtn.className}`);
    } else {
      logger.warn('Capture button not found');
    }
  } catch (error) {
    logger.error('Error debugging capture button:', error);
  }
}

/**
 * Set up navigation between dashboard views
 * @returns {void}
 */
function setupNavigation() {
  logger.debug('Setting up navigation');
  
  try {
    const navLinks = document.querySelectorAll('.nav-link');
    
    if (navLinks.length === 0) {
      logger.warn('No navigation links found');
      return;
    }
    
    logger.debug(`Found ${navLinks.length} navigation links`);
    
    navLinks.forEach(link => {
      try {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const view = e.target.dataset.view;
          
          if (view) {
            logger.info('Changing view to', view);
            changeView(view);
          } else {
            logger.warn('Navigation link clicked without data-view attribute');
          }
        });
      } catch (linkError) {
        logger.error('Error setting up navigation link:', linkError);
      }
    });
    
    logger.info('Navigation setup completed');
  } catch (error) {
    logger.error('Error setting up navigation:', error);
    showNotification('Error setting up navigation: ' + error.message, 'error');
  }
}

/**
 * Change the current view
 * @param {string} view - View name to change to
 * @returns {void}
 */
function changeView(view) {
  logger.debug(`Changing view to: ${view}`);
  
  try {
    // Hide all views
    document.querySelectorAll('.dashboard-view').forEach(el => {
      el.classList.remove('active');
    });
    
    // Show requested view
    const targetView = document.getElementById(`${view}-view`);
    if (targetView) {
      targetView.classList.add('active');
      logger.debug(`View changed to ${view}`);
      
      // Update navigation highlighting
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.view === view) {
          link.classList.add('active');
        }
      });
      
      // Save last active view to storage
      try {
        chrome.storage.local.set({ lastActiveView: view });
      } catch (storageError) {
        logger.warn('Error saving last active view:', storageError);
      }
    } else {
      logger.error(`View not found: ${view}`);
      showNotification(`View not found: ${view}`, 'error');
    }
  } catch (error) {
    logger.error(`Error changing view to ${view}:`, error);
    showNotification(`Error changing view: ${error.message}`, 'error');
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
    tabsInitialized = true;
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    logger.debug(`Found tab buttons: ${tabButtons.length}, tab panes: ${tabPanes.length}`);
    
    if (tabButtons.length === 0) {
      logger.warn('No tab buttons found');
    }
    
    if (tabPanes.length === 0) {
      logger.warn('No tab panes found');
    }
    
    tabButtons.forEach(button => {
      try {
        const targetTab = button.getAttribute('data-tab');
        if (!targetTab) {
          logger.warn('Tab button missing data-tab attribute', button);
          return;
        }
        
        logger.debug(`Setting up click handler for tab: ${targetTab}`);
        
        button.addEventListener('click', () => {
          try {
            logger.debug(`Tab button clicked: ${targetTab}`);
            handleTabChange(targetTab, tabButtons, tabPanes, button);
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
    tabPanes.forEach(pane => {
      if (pane.id === `${targetTab}-content`) {
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
      } else {
        logger.warn(`Nav item for last active panel ${lastActivePanel} not found`);
        // Fall back to first panel
        document.querySelector('.nav-item')?.click();
      }
    } else {
      logger.debug('No last active panel found, using default');
      // Default to first panel
      document.querySelector('.nav-item')?.click();
    }
  } catch (error) {
    logger.error('Error restoring last active panel:', error);
    
    // Fall back to first panel
    try {
      document.querySelector('.nav-item')?.click();
    } catch (fallbackError) {
      logger.error('Error activating fallback panel:', fallbackError);
    }
  }
}

/**
 * Restore last active tab for a specific panel
 * @param {string} panelId - ID of the panel
 * @returns {Promise<void>}
 */
async function restoreLastActiveTab(panelId) {
  if (!panelId) {
    logger.warn('No panel ID provided for restoring last active tab');
    return;
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
      } else {
        logger.warn(`Tab button for last active tab ${lastActiveTab} not found in panel ${panelId}`);
        // Fall back to first tab in this panel
        document.querySelector(`#${panelId} .tab-btn`)?.click();
      }
    } else {
      logger.debug(`No last active tab found for panel ${panelId}, using default`);
      // Default to first tab in this panel
      document.querySelector(`#${panelId} .tab-btn`)?.click();
    }
  } catch (error) {
    logger.error(`Error restoring last active tab for panel ${panelId}:`, error);
    
    // Fall back to first tab in this panel
    try {
      document.querySelector(`#${panelId} .tab-btn`)?.click();
    } catch (fallbackError) {
      logger.error(`Error activating fallback tab for panel ${panelId}:`, fallbackError);
    }
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

// Export functions needed by other modules
export {
  initNavigation,
  setupNavigation,
  initTabs,
  restoreLastActivePanel,
  restoreLastActiveTab,
  navigateToPanel,
  navigateToTab,
  onPanelChange,
  onTabChange,
  getActivePanel,
  getActiveTab
};
