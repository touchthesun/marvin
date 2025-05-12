// src/components/core/navigation.js
// Simplified navigation component with very basic event handlers

/**
 * Navigation component for the dashboard
 * Manages panel switching and navigation state
 */
const Navigation = {
  // Track state
  initialized: false,
  currentPanel: null,
  
  /**
   * Initialize the navigation system
   * @returns {Promise<boolean>} Success status
   */
  async initNavigation() {
    console.log('[Navigation] Initializing navigation component');
    
    try {
      if (this.initialized) {
        console.log('[Navigation] Already initialized, skipping');
        return true;
      }
      
      // Find navigation elements
      const navItems = document.querySelectorAll('.nav-item');
      const contentPanels = document.querySelectorAll('.content-panel');
      
      console.log(`[Navigation] Found ${navItems.length} navigation items and ${contentPanels.length} content panels`);
      
      if (navItems.length === 0 || contentPanels.length === 0) {
        throw new Error('Navigation elements not found');
      }
      
      // Set up click handlers on nav items
      this.setupNavClickHandlers(navItems, contentPanels);
      
      // Try to restore last active panel
      await this.restoreLastPanel();
      
      // Set initialized flag
      this.initialized = true;
      console.log('[Navigation] Initialization complete');
      return true;
    } catch (error) {
      console.error('[Navigation] Error initializing:', error);
      return false;
    }
  },
  
  /**
   * Set up click handlers on navigation items
   * @param {NodeList} navItems - Navigation items
   * @param {NodeList} contentPanels - Content panels
   */
  setupNavClickHandlers(navItems, contentPanels) {
    console.log('[Navigation] Setting up click handlers');
    
    // Use direct reference to this object to maintain context in event handlers
    const self = this;
    
    navItems.forEach(item => {
      // Get panel name from data attribute
      const panelName = item.getAttribute('data-panel');
      if (!panelName) {
        console.warn('[Navigation] Nav item missing data-panel attribute');
        return;
      }
      
      console.log(`[Navigation] Adding click handler for ${panelName}`);
      
      // Set explicit click handler without cloning
      item.onclick = function(event) {
        event.preventDefault();
        console.log(`[Navigation] Clicked: ${panelName}`);
        
        // Activate this nav item
        navItems.forEach(ni => ni.classList.remove('active'));
        this.classList.add('active');
        
        // Show corresponding panel
        contentPanels.forEach(panel => {
          if (panel.id === `${panelName}-panel`) {
            panel.classList.add('active');
            console.log(`[Navigation] Activated panel: ${panel.id}`);
          } else {
            panel.classList.remove('active');
          }
        });
        
        // Save active panel
        self.saveActivePanel(panelName);
        
        // Initialize the panel
        self.initializePanel(panelName);
        
        return false;
      };
    });
  },
  
  /**
   * Save active panel to storage
   * @param {string} panelName - Panel name
   */
  saveActivePanel(panelName) {
    try {
      chrome.storage.local.set({ lastActivePanel: panelName });
      console.log(`[Navigation] Saved active panel: ${panelName}`);
    } catch (error) {
      console.error('[Navigation] Error saving active panel:', error);
    }
  },
  
  /**
   * Restore last active panel from storage
   * @returns {Promise<boolean>} Success status
   */
  async restoreLastPanel() {
    try {
      // Get last active panel from storage
      const data = await chrome.storage.local.get('lastActivePanel');
      const lastPanel = data.lastActivePanel;
      
      if (lastPanel) {
        console.log(`[Navigation] Restoring last panel: ${lastPanel}`);
        
        // Find the nav item
        const navItem = document.querySelector(`.nav-item[data-panel="${lastPanel}"]`);
        if (navItem) {
          // Call the click handler directly
          if (typeof navItem.onclick === 'function') {
            navItem.onclick(new Event('click'));
            return true;
          } else {
            // Fallback to click() if onclick is not a function
            navItem.click();
            return true;
          }
        } else {
          console.warn(`[Navigation] Nav item for panel ${lastPanel} not found`);
        }
      }
      
      // No saved panel, default to first nav item
      console.log('[Navigation] No saved panel, using first nav item');
      const firstNavItem = document.querySelector('.nav-item');
      if (firstNavItem) {
        if (typeof firstNavItem.onclick === 'function') {
          firstNavItem.onclick(new Event('click'));
        } else {
          firstNavItem.click();
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Navigation] Error restoring last panel:', error);
      return false;
    }
  },
  
  /**
   * Initialize panel
   * @param {string} panelName - Panel name
   */
  async initializePanel(panelName) {
    try {
      console.log(`[Navigation] Initializing panel: ${panelName}-panel`);
      
      // Try to get access to the dashboard API
      if (typeof self !== 'undefined' && self.marvinDashboard && self.marvinDashboard.initPanel) {
        await self.marvinDashboard.initPanel(`${panelName}-panel`);
        console.log(`[Navigation] Panel initialized via dashboard API`);
      } else {
        console.warn('[Navigation] Dashboard API not available, panel may not initialize properly');
      }
    } catch (error) {
      console.error(`[Navigation] Error initializing panel ${panelName}:`, error);
    }
  },
  
  /**
   * Navigate to panel programmatically
   * @param {string} panelName - Panel name
   * @returns {Promise<boolean>} Success status
   */
  async navigateToPanel(panelName) {
    try {
      console.log(`[Navigation] Navigating to panel: ${panelName}`);
      
      // Find the nav item
      const navItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
      
      if (navItem) {
        // Call click handler directly if available
        if (typeof navItem.onclick === 'function') {
          navItem.onclick(new Event('click'));
        } else {
          // Fallback to standard click
          navItem.click();
        }
        return true;
      } else {
        console.warn(`[Navigation] Nav item for panel ${panelName} not found`);
        return false;
      }
    } catch (error) {
      console.error(`[Navigation] Error navigating to panel ${panelName}:`, error);
      return false;
    }
  }
};

// Export the navigation component
export { Navigation };