// extension/src/components/core/navigation.js
import { BaseComponent } from '../../core/base-component.js';
import { ServiceRegistry } from '../../core/service-registry.js';

export class Navigation extends BaseComponent {
  constructor() {
    super();
    this.currentPanel = null;
    this.navElement = null;
    this.navItems = null;
    this.contentPanels = null;
    
    // Add service registry
    this._serviceRegistry = new ServiceRegistry();
  }

  // Keep existing _performInitialization as is, since it's working well
  async _performInitialization() {
    // Find navigation elements
    this.navElement = document.querySelector('.navigation');
    this.navItems = this.navElement?.querySelectorAll('.nav-item');
    this.contentPanels = document.querySelectorAll('.content-panel');
    
    this.logger.debug(
      `Found ${this.navItems?.length || 0} navigation items and ${this.contentPanels.length} content panels`
    );
    
    if (!this.navItems?.length || !this.contentPanels.length) {
      throw new Error('Navigation elements not found');
    }
    
    // Set up click handlers on nav items
    this.setupNavClickHandlers();
    
    // Try to restore last active panel
    await this.restoreLastPanel();
    
    this.logger.info('Navigation initialization complete');
  }

  setupNavClickHandlers() {
    this.navItems.forEach(item => {
      const panelName = item.getAttribute('data-panel');
      if (!panelName) return;
      
      const clickHandler = (event) => {
        event.preventDefault();
        this.handleNavClick(panelName, item);
      };
      
      this.trackEventListener(item, 'click', clickHandler);
    });
  }
  
  async handleNavClick(panelName, item) {
    try {
      await this.activatePanel(panelName, item);
    } catch (error) {
      this.logger.error(`Error handling navigation click for ${panelName}:`, error);
    }
  }

  async activatePanel(panelName, item) {
    // Deactivate current panel
    if (this.currentPanel) {
      const currentItem = this.navElement.querySelector(`.nav-item[data-panel="${this.currentPanel}"]`);
      const currentPanel = document.getElementById(`${this.currentPanel}-panel`);
      if (currentItem) currentItem.classList.remove('active');
      if (currentPanel) currentPanel.classList.remove('active');
    }

    // Activate new panel
    const panel = document.getElementById(`${panelName}-panel`);
    if (panel) {
      item.classList.add('active');
      panel.classList.add('active');
      this.currentPanel = panelName;
      await this.saveActivePanel(panelName);
    }
  }

  async saveActivePanel(panelName) {
    try {
      const storageService = await this._serviceRegistry.getService('storageService');
      await storageService.set('lastActivePanel', panelName);
      this.logger.debug(`Saved active panel: ${panelName}`);
    } catch (error) {
      this.logger.error('Error saving active panel:', error);
      throw error;
    }
  }

  async restoreLastPanel() {
    try {
      const storageService = await this._serviceRegistry.getService('storageService');
      const lastPanel = await storageService.get('lastActivePanel');
      
      if (lastPanel) {
        this.logger.debug(`Restoring last panel: ${lastPanel}`);
        const navItem = this.navElement?.querySelector(`.nav-item[data-panel="${lastPanel}"]`);
        if (navItem) {
          await this.activatePanel(lastPanel, navItem);
          return true;
        }
        this.logger.warn(`Nav item for panel ${lastPanel} not found`);
      }
      
      // No saved panel, default to first nav item
      this.logger.debug('No saved panel, using first nav item');
      const firstNavItem = this.navElement?.querySelector('.nav-item');
      if (firstNavItem) {
        const panelName = firstNavItem.getAttribute('data-panel');
        if (panelName) {
          await this.activatePanel(panelName, firstNavItem);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error restoring last panel:', error);
      return false;
    }
  }


  async _performCleanup() {
    // Navigation-specific cleanup
    this.currentPanel = null;
    this.navElement = null;
    this.navItems = null;
    this.contentPanels = null;

    // Add service registry cleanup
    await this._serviceRegistry.cleanup();
  }
}