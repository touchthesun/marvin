// src/components/core/navigation.js
import { LogManager } from '../../utils/log-manager.js';
import { showNotification } from '../../services/notification-service.js';
import { componentStubs } from '../../core/component-registry.js';

export class Navigation {
  constructor(dependencies = {}) {
    // Dependency injection
    this.logger = dependencies.logger || new LogManager({
      isBackgroundScript: false,
      context: 'navigation',
      storageKey: 'marvin_navigation_logs',
      maxEntries: 1000
    });
    
    this.notificationService = dependencies.notificationService || {
      show: showNotification
    };
    
    this.chrome = dependencies.chrome || window.chrome;
    this.componentRegistry = dependencies.componentRegistry || window.MarvinComponents;
    this.componentStubs = dependencies.componentStubs || componentStubs;
    
    // State initialization
    this.navigationInitialized = false;
    this.tabsInitialized = false;
    this.DEBUG_NAVIGATION = true;
    
    // Bind methods to preserve 'this' context
    this.handleExtensionContextError = this.handleExtensionContextError.bind(this);
    this.initNavigation = this.initNavigation.bind(this);
    this.initTabs = this.initTabs.bind(this);
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleTabChange = this.handleTabChange.bind(this);
    this.fallbackNavigation = this.fallbackNavigation.bind(this);
    this.initializeTargetPanel = this.initializeTargetPanel.bind(this);
    this.callInitFunction = this.callInitFunction.bind(this);
    this.restoreLastActivePanel = this.restoreLastActivePanel.bind(this);
    this.restoreLastActiveTab = this.restoreLastActiveTab.bind(this);
    this.navigateToPanel = this.navigateToPanel.bind(this);
    this.navigateToTab = this.navigateToTab.bind(this);
  }
  
  // ----- PUBLIC API METHODS -----
  
  async initNavigation() {
    this.debugLog('initNavigation called');
    
    try {
      // Check if extension context is valid
      this.chrome.runtime.getURL('');
    } catch (e) {
      this.debugLog('Extension context invalid at initNavigation start');
      this.handleExtensionContextError();
      return;
    }
    
    if (this.navigationInitialized) {
      this.debugLog('Navigation already initialized, skipping');
      return;
    }
    
    try {
      this.debugLog('Initializing navigation');
      
      const navItems = document.querySelectorAll('.nav-item');
      const contentPanels = document.querySelectorAll('.content-panel');
      
      this.debugLog(`Found nav items: ${navItems.length}, content panels: ${contentPanels.length}`);
      
      // Debug: Log all nav items and panels found
      if (navItems.length > 0) {
        navItems.forEach((item, index) => {
          const panelName = item.getAttribute('data-panel');
          this.debugLog(`Nav item ${index}: panel=${panelName}, text=${item.textContent.trim()}`);
        });
      }
      
      if (contentPanels.length > 0) {
        contentPanels.forEach((panel, index) => {
          this.debugLog(`Content panel ${index}: id=${panel.id}, active=${panel.classList.contains('active')}`);
        });
      }
      
      if (navItems.length === 0) {
        this.debugLog('WARNING: No navigation items found');
        return; // Exit early if no nav items found
      }
      
      if (contentPanels.length === 0) {
        this.debugLog('WARNING: No content panels found');
        return; // Exit early if no content panels found
      }
      
      // Set up click handlers for each navigation item
      navItems.forEach(item => {
        try {
          const panelName = item.getAttribute('data-panel');
          if (!panelName) {
            this.debugLog('WARNING: Navigation item missing data-panel attribute', item);
            return;
          }
          
          this.debugLog(`Setting up click handler for nav item: ${panelName}`);
          
          // Remove any existing click handlers to avoid duplicates
          const newItem = item.cloneNode(true);
          item.parentNode.replaceChild(newItem, item);
          
          // Add a direct click handler with debug logging
          newItem.addEventListener('click', async (event) => {
            this.debugLog(`CLICK DETECTED on nav item: ${panelName}`);
            
            try {
              // Prevent default if it's a link
              if (event.currentTarget.tagName === 'A') {
                event.preventDefault();
              }
              
              this.debugLog(`Processing click for nav item: ${panelName}`);
              await this.handleNavigation(panelName, navItems, contentPanels, newItem);
            } catch (navError) {
              this.debugLog(`ERROR handling navigation to ${panelName}:`, navError);
              this.logger.error(`Error handling navigation to ${panelName}:`, navError);
              this.notificationService.show(`Error navigating to ${panelName}: ${navError.message}`, 'error');
              
              // Try fallback navigation (just show the panel without initialization)
              this.debugLog(`Attempting fallback navigation to ${panelName}`);
              this.fallbackNavigation(panelName, navItems, contentPanels);
            }
          });
          
          // Add a direct style to ensure it's clickable
          newItem.style.cursor = 'pointer';
          
          // Debug: Add a direct test click handler
          newItem.setAttribute('data-debug-initialized', 'true');
        } catch (itemError) {
          this.debugLog(`ERROR setting up navigation item:`, itemError);
          this.logger.error('Error setting up navigation item:', itemError);
        }
      });
      
      // Set default panel if none is active
      setTimeout(() => {
        this.debugLog('Checking for active panel');
        const hasActivePanel = Array.from(contentPanels).some(panel => panel.classList.contains('active'));
        this.debugLog(`Has active panel: ${hasActivePanel}`);
        
        if (!hasActivePanel && navItems.length > 0) {
          this.debugLog('No active panel found, activating default panel');
          
          // Try to click the first nav item directly
          try {
            const firstItem = document.querySelector('.nav-item');
            this.debugLog('Clicking first nav item:', firstItem?.getAttribute('data-panel'));
            firstItem?.click();
          } catch (clickError) {
            this.debugLog('ERROR clicking first nav item:', clickError);
          }
        }
      }, 100);
      
      this.navigationInitialized = true;
      this.debugLog('Navigation initialization completed');
    } catch (error) {
      this.navigationInitialized = false;
      this.debugLog('ERROR initializing navigation:', error);
      this.logger.error('Error initializing navigation:', error);
      this.notificationService.show('Error initializing navigation: ' + error.message, 'error');
    }
  }
  
  async initTabs() {
    this.logger.debug('initTabs called');
    
    if (this.tabsInitialized) {
      this.logger.info('Tabs already initialized, skipping');
      return;
    }
    
    try {
      this.logger.info('Initializing tabs');
      
      const tabButtons = document.querySelectorAll('.tab-btn');
      const tabPanes = document.querySelectorAll('.tab-pane');
      
      this.logger.debug(`Found tab buttons: ${tabButtons.length}, tab panes: ${tabPanes.length}`);
      
      // Debug: Log all tab buttons and panes
      if (tabButtons.length > 0) {
        tabButtons.forEach((btn, index) => {
          const tabName = btn.getAttribute('data-tab');
          this.logger.debug(`Tab button ${index}: tab=${tabName}, text=${btn.textContent.trim()}`);
        });
      }
      
      if (tabPanes.length > 0) {
        tabPanes.forEach((pane, index) => {
          this.logger.debug(`Tab pane ${index}: id=${pane.id}, active=${pane.classList.contains('active')}`);
        });
      }
      
      if (tabButtons.length === 0) {
        this.logger.warn('No tab buttons found');
        return;
      }
      
      if (tabPanes.length === 0) {
        this.logger.warn('No tab panes found');
        return;
      }
      
      tabButtons.forEach(button => {
        try {
          const targetTab = button.getAttribute('data-tab');
          if (!targetTab) {
            this.logger.warn('Tab button missing data-tab attribute', button);
            return;
          }
          
          this.logger.debug(`Setting up click handler for tab: ${targetTab}`);
          
          // Remove any existing click handlers to avoid duplicates
          const newButton = button.cloneNode(true);
          button.parentNode.replaceChild(newButton, button);
          
          newButton.addEventListener('click', () => {
            try {
              this.logger.debug(`Tab button clicked: ${targetTab}`);
              this.handleTabChange(targetTab, tabButtons, tabPanes, newButton);
            } catch (tabError) {
              this.logger.error(`Error handling tab change to ${targetTab}:`, tabError);
              this.notificationService.show(`Error changing tab: ${tabError.message}`, 'error');
            }
          });
        } catch (buttonError) {
          this.logger.error('Error setting up tab button:', buttonError);
        }
      });
      
      // Set default tab if none is active
      setTimeout(() => {
        const hasActiveTab = Array.from(tabPanes).some(pane => pane.classList.contains('active'));
        if (!hasActiveTab && tabButtons.length > 0) {
          this.logger.debug('No active tab found, activating default tab');
          tabButtons[0].click();
        }
      }, 100);
      
      this.tabsInitialized = true;
      this.logger.info('Tabs initialized successfully');
    } catch (error) {
      this.tabsInitialized = false;
      this.logger.error('Error initializing tabs:', error);
      this.notificationService.show('Error initializing tabs: ' + error.message, 'error');
    }
  }
  
  async navigateToPanel(panelName) {
    this.logger.info(`Programmatically navigating to panel: ${panelName}`);
    
    try {
      const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
      if (navItem) {
        navItem.click();
        this.logger.debug(`Successfully navigated to ${panelName}`);
        return true;
      } else {
        this.logger.warn(`Navigation item for panel ${panelName} not found`);
        this.notificationService.show(`Panel "${panelName}" not found`, 'error');
        return false;
      }
    } catch (error) {
      this.logger.error(`Error navigating to panel ${panelName}:`, error);
      this.notificationService.show(`Error navigating to panel: ${error.message}`, 'error');
      return false;
    }
  }
  
  async navigateToTab(panelName, tabName) {
    this.logger.info(`Programmatically navigating to tab: ${tabName} in panel: ${panelName}`);
    
    try {
      // First navigate to the panel if needed
      const panelElement = document.getElementById(`${panelName}-panel`);
      if (!panelElement || !panelElement.classList.contains('active')) {
        const panelNavigated = await this.navigateToPanel(panelName);
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
        this.logger.debug(`Successfully navigated to tab ${tabName} in panel ${panelName}`);
        return true;
      } else {
        this.logger.warn(`Tab button for ${tabName} not found in panel ${panelName}`);
        this.notificationService.show(`Tab "${tabName}" not found in panel "${panelName}"`, 'error');
        return false;
      }
    } catch (error) {
      this.logger.error(`Error navigating to tab ${tabName} in panel ${panelName}:`, error);
      this.notificationService.show(`Error navigating to tab: ${error.message}`, 'error');
      return false;
    }
  }
  
  async restoreLastActivePanel() {
    this.logger.debug('Restoring last active panel');
    
    try {
      const data = await this.chrome.storage.local.get('lastActivePanel');
      const lastActivePanel = data.lastActivePanel;
      
      if (lastActivePanel) {
        this.logger.info(`Restoring last active panel: ${lastActivePanel}`);
        
        const navItem = document.querySelector(`.nav-item[data-panel="${lastActivePanel}"]`);
        if (navItem) {
          navItem.click();
          this.logger.debug(`Clicked nav item for ${lastActivePanel}`);
          return true;
        } else {
          this.logger.warn(`Nav item for last active panel ${lastActivePanel} not found`);
          // Fall back to first panel
          const firstNavItem = document.querySelector('.nav-item');
          if (firstNavItem) {
            firstNavItem.click();
            this.logger.debug('Clicked first nav item as fallback');
            return true;
          }
        }
      } else {
        this.logger.debug('No last active panel found, using default');
        // Default to first panel
        const firstNavItem = document.querySelector('.nav-item');
        if (firstNavItem) {
          firstNavItem.click();
          this.logger.debug('Clicked first nav item as default');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error restoring last active panel:', error);
      
      // Fall back to first panel
      try {
        const firstNavItem = document.querySelector('.nav-item');
        if (firstNavItem) {
          firstNavItem.click();
          this.logger.debug('Clicked first nav item after error');
          return true;
        }
      } catch (fallbackError) {
        this.logger.error('Error activating fallback panel:', fallbackError);
      }
      
      return false;
    }
  }
  
  async restoreLastActiveTab(panelId) {
    if (!panelId) {
      this.logger.warn('No panel ID provided for restoring last active tab');
      return false;
    }
    
    this.logger.debug(`Restoring last active tab for panel: ${panelId}`);
    
    try {
      const storageKey = `lastActiveTab_${panelId}`;
      const data = await this.chrome.storage.local.get(storageKey);
      const lastActiveTab = data[storageKey];
      
      if (lastActiveTab) {
        this.logger.info(`Restoring last active tab for ${panelId}: ${lastActiveTab}`);
        
        const tabButton = document.querySelector(`#${panelId} .tab-btn[data-tab="${lastActiveTab}"]`);
        if (tabButton) {
          tabButton.click();
          this.logger.debug(`Clicked tab button for ${lastActiveTab}`);
          return true;
        } else {
          this.logger.warn(`Tab button for last active tab ${lastActiveTab} not found in panel ${panelId}`);
          // Fall back to first tab in this panel
          const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
          if (firstTabButton) {
            firstTabButton.click();
            this.logger.debug(`Clicked first tab button in panel ${panelId} as fallback`);
            return true;
          }
        }
      } else {
        this.logger.debug(`No last active tab found for panel ${panelId}, using default`);
        // Default to first tab in this panel
        const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
        if (firstTabButton) {
          firstTabButton.click();
          this.logger.debug(`Clicked first tab button in panel ${panelId} as default`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Error restoring last active tab for panel ${panelId}:`, error);
      
      // Fall back to first tab in this panel
      try {
        const firstTabButton = document.querySelector(`#${panelId} .tab-btn`);
        if (firstTabButton) {
          firstTabButton.click();
          this.logger.debug(`Clicked first tab button in panel ${panelId} after error`);
          return true;
        }
      } catch (fallbackError) {
        this.logger.error(`Error activating fallback tab for panel ${panelId}:`, fallbackError);
      }
      
      return false;
    }
  }
  
  // ----- PRIVATE HELPER METHODS -----
  
  debugLog(message, ...args) {
    if (this.DEBUG_NAVIGATION) {
      const originalConsoleLog = console.log;
      originalConsoleLog.call(console, `[NAV DEBUG] ${message}`, ...args);
    }
  }
  
  handleExtensionContextError() {
    this.debugLog('Extension context may be invalidated, attempting recovery');
    
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
      this.chrome.runtime.getURL('');
      this.debugLog('Chrome API still accessible');
    } catch (e) {
      this.debugLog('Chrome API not accessible, extension context is definitely invalid');
      // At this point, only a page reload or extension reload will help
    }
  }
  
  async handleNavigation(targetPanel, navItems, contentPanels, clickedItem) {
    this.debugLog(`handleNavigation called for panel: ${targetPanel}`);
    
    try {
      // Update navigation highlighting
      this.debugLog('Updating navigation highlighting');
      navItems.forEach(navItem => navItem.classList.remove('active'));
      clickedItem.classList.add('active');
      
      // Show corresponding panel
      this.debugLog('Showing corresponding panel');
      let panelFound = false;
      
      // The expected panel ID format is "{targetPanel}-panel"
      const expectedPanelId = `${targetPanel}-panel`;
      this.debugLog(`Looking for panel with ID: ${expectedPanelId}`);
      
      contentPanels.forEach(panel => {
        const panelId = panel.id;
        this.debugLog(`Checking panel: ${panelId} against target: ${expectedPanelId}`);
        
        if (panelId === expectedPanelId) {
          this.debugLog(`Activating panel: ${panelId}`);
          panel.classList.add('active');
          panelFound = true;
          
          // Dispatch custom event
          try {
            const event = new CustomEvent('panelChanged', {
              detail: { panelId: targetPanel, panelElement: panel }
            });
            document.dispatchEvent(event);
            this.debugLog(`Dispatched panelChanged event for ${targetPanel}`);
          } catch (eventError) {
            this.debugLog(`ERROR dispatching panel event:`, eventError);
          }
        } else {
          panel.classList.remove('active');
        }
      });
      
      if (!panelFound) {
        this.debugLog(`WARNING: Panel not found for target: ${targetPanel}`);
        this.notificationService.show(`Panel not found: ${targetPanel}`, 'error');
      }
      
      // Initialize panel if needed
      if (panelFound) {
        this.debugLog(`Initializing target panel: ${targetPanel}`);
        await this.initializeTargetPanel(targetPanel);
      }
      
      // Save last active panel to storage
      try {
        this.debugLog(`Saving last active panel: ${targetPanel}`);
        this.chrome.storage.local.set({ lastActivePanel: targetPanel });
      } catch (storageError) {
        this.debugLog(`ERROR saving last active panel:`, storageError);
        this.logger.warn('Error saving last active panel:', storageError);
      }
      
      this.debugLog(`Navigation to ${targetPanel} completed successfully`);
    } catch (error) {
      this.debugLog(`ERROR in handleNavigation for ${targetPanel}:`, error);
      this.logger.error(`Error in handleNavigation for ${targetPanel}:`, error);
      throw error;
    }
  }
  
  handleTabChange(targetTab, tabButtons, tabPanes, clickedButton) {
    this.logger.debug(`Handling tab change to: ${targetTab}`);
    
    try {
      // Update tab highlighting
      tabButtons.forEach(btn => btn.classList.remove('active'));
      clickedButton.classList.add('active');
      
      // Show corresponding tab content
      let tabFound = false;
      
      // The expected tab pane ID format is "{targetTab}-content"
      const expectedTabId = `${targetTab}-content`;
      this.logger.debug(`Looking for tab pane with ID: ${expectedTabId}`);
      
      tabPanes.forEach(pane => {
        const paneId = pane.id;
        this.logger.debug(`Checking tab pane: ${paneId} against target: ${expectedTabId}`);
        
        if (paneId === expectedTabId) {
          pane.classList.add('active');
          tabFound = true;
          
          // Trigger a custom event for tab activation
          try {
            const tabActivatedEvent = new CustomEvent('tabActivated', {
              detail: { tabId: targetTab, paneElement: pane }
            });
            document.dispatchEvent(tabActivatedEvent);
            this.logger.debug(`Dispatched tabActivated event for ${targetTab}`);
          } catch (eventError) {
            this.logger.warn(`Error dispatching tab event for ${targetTab}:`, eventError);
          }
        } else {
          pane.classList.remove('active');
        }
      });
      
      if (!tabFound) {
        this.logger.warn(`Tab pane not found for target: ${targetTab}`);
        
        // Try to find a tab pane with an ID that contains the target tab name
        // This is a fallback for cases where the naming convention might be different
        let fallbackFound = false;
        tabPanes.forEach(pane => {
          if (pane.id.includes(targetTab) && !fallbackFound) {
            pane.classList.add('active');
            fallbackFound = true;
            this.logger.debug(`Used fallback: activated tab pane with ID ${pane.id} for target ${targetTab}`);
          }
        });
        
        if (!fallbackFound) {
          this.logger.error(`No matching tab pane found for ${targetTab}, even with fallback`);
        }
      }
      
      // Save last active tab to storage
      try {
        // Get the parent panel to store tab context
        const parentPanel = clickedButton.closest('.content-panel');
        const panelId = parentPanel ? parentPanel.id : null;
        
        if (panelId) {
          const storageKey = `lastActiveTab_${panelId}`;
          this.chrome.storage.local.set({ [storageKey]: targetTab });
          this.logger.debug(`Saved last active tab for ${panelId}: ${targetTab}`);
        }
      } catch (storageError) {
        this.logger.warn('Error saving last active tab:', storageError);
      }
    } catch (error) {
      this.logger.error(`Error in handleTabChange for ${targetTab}:`, error);
      throw error;
    }
  }
  
  fallbackNavigation(targetPanel, navItems, contentPanels) {
    this.debugLog(`FALLBACK: Simple navigation to ${targetPanel}`);
    
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
          this.debugLog(`FALLBACK: Showing panel ${panel.id}`);
          
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
      
      this.debugLog(`FALLBACK: Navigation to ${targetPanel} completed`);
    } catch (error) {
      this.debugLog(`ERROR in fallback navigation to ${targetPanel}:`, error);
    }
  }
  
  async initializeTargetPanel(targetPanel) {
    this.logger.debug(`Initializing panel: ${targetPanel}`);
    
    try {
      const componentName = `${targetPanel}-panel`;
      
      // First check the global component registry
      if (this.componentRegistry && this.componentRegistry[componentName]) {
        const component = this.componentRegistry[componentName];
        this.logger.debug(`Using registered component for ${componentName}`);
        await this.callInitFunction(targetPanel, component);
        return;
      }
      
      // If not in registry, use stub implementation
      if (this.componentStubs[componentName]) {
        this.logger.warn(`Component ${componentName} not found in registry, using stub`);
        await this.callInitFunction(targetPanel, this.componentStubs[componentName]);
        return;
      }
      
      // No stub available
      this.logger.error(`No implementation or stub available for ${componentName}`);
      this.notificationService.show(`Panel ${targetPanel} could not be loaded`, 'error');
    } catch (error) {
      this.logger.error(`Error initializing panel ${targetPanel}:`, error);
      this.notificationService.show(`Error initializing panel ${targetPanel}: ${error.message}`, 'error');
    }
  }
  
  async callInitFunction(panelName, module) {
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
            this.logger.warn(`No initialization function found for panel: ${panelName}`);
          }
      }
      
      this.logger.debug(`Panel ${panelName} initialized successfully`);
    } catch (error) {
        this.logger.error(`Error calling init function for ${panelName}:`, error);
        throw error;
      }
    }
  }
  
  // Backward compatibility wrapper
  export const NavigationComponent = {
    // Create a singleton instance for backward compatibility
    _instance: null,
    
    get instance() {
      if (!this._instance) {
        this._instance = new Navigation();
      }
      return this._instance;
    },
    
    initNavigation() {
      return this.instance.initNavigation();
    },
    
    initTabs() {
      return this.instance.initTabs();
    },
    
    restoreLastActivePanel() {
      return this.instance.restoreLastActivePanel();
    },
    
    restoreLastActiveTab(panelId) {
      return this.instance.restoreLastActiveTab(panelId);
    },
    
    navigateToPanel(panelName) {
      return this.instance.navigateToPanel(panelName);
    },
    
    navigateToTab(panelName, tabName) {
      return this.instance.navigateToTab(panelName, tabName);
    }
  };
  
  // Also export individual functions for backward compatibility
  export const {
    initNavigation,
    initTabs,
    restoreLastActivePanel,
    restoreLastActiveTab,
    navigateToPanel,
    navigateToTab
  } = NavigationComponent;
  
  // Register the component with fallback mechanism
  try {
    // First, try to use the global registerComponent function
    if (typeof self.registerComponent === 'function') {
      console.log('Registering navigation component using global registerComponent');
      self.registerComponent('navigation', NavigationComponent);
    } else {
      // If registerComponent isn't available, register directly in global registry
      console.log('Global registerComponent not found, using direct registry access');
      self.MarvinComponents = self.MarvinComponents || {};
      self.MarvinComponents['navigation'] = NavigationComponent;
    }
    
    console.log('Navigation component registered successfully');
  } catch (error) {
    console.error('Error registering navigation component:', error);
    // Try window as fallback if self fails
    try {
      window.MarvinComponents = window.MarvinComponents || {};
      window.MarvinComponents['navigation'] = NavigationComponent;
      console.log('Navigation component registered using window fallback');
    } catch (windowError) {
      console.error('Failed to register navigation component:', windowError);
    }
  }
  
  // Export default as Navigation class
  export default Navigation;
  