// src/core/component-system.js
// Import the centralized container initializer
import { LogManager } from '../utils/log-manager.js';
import { ensureContainerInitialized, getContainerStatus } from './container-init.js';
import { ComponentRegistry } from './component-registry.js';

/**
 * Component System - Simplified with centralized initialization
 * Now mainly handles component-specific initialization and management
 */
export class ComponentSystem {
  constructor() {
    this.initialized = false;
    this.validationResults = null;
    this.logger = null;
  }

  /**
   * Initialize the component system
   */
  async initialize() {
    if (this.initialized) {
      return this.getStatus();
    }

    try {
      // Ensure container is initialized first
      const containerStatus = await ensureContainerInitialized({
        isBackgroundScript: false,
        context: 'component-system'
      });

      // Get logger from container
      this.logger = new LogManager({
        context: 'component-system',
        isBackgroundScript: false,
        maxEntries: 1000
      });

      this.logger.info('Initializing component system');
      this.logger.debug('Container status:', containerStatus);

      // Register components if not already done
      if (containerStatus.components.count === 0) {
        this.logger.info('Registering components');
        ComponentRegistry.registerAll();
      }

      // Validate components
      this.validationResults = ComponentRegistry.validateComponents();
      this.logger.debug('Component validation results:', this.validationResults);

      // Initialize core components (like navigation)
      await this.initializeCoreComponents();

      this.initialized = true;
      this.logger.info('Component system initialized successfully');

      return this.getStatus();
    } catch (error) {
      this.logger?.error('Component system initialization failed:', error);
      console.error('Component system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize core components that other components might depend on
   */
  async initializeCoreComponents() {
    try {
      this.logger.info('Initializing core components');

      // Initialize navigation component first
      const navigationSuccess = await ComponentRegistry.initializeComponent('navigation');
      
      if (navigationSuccess) {
        this.logger.info('Navigation component initialized successfully');
      } else {
        this.logger.warn('Navigation component initialization failed or returned false');
      }

      // Add other core components here as needed
      // For example:
      // await ComponentRegistry.initializeComponent('another-core-component');

    } catch (error) {
      this.logger.error('Error initializing core components:', error);
      throw error;
    }
  }

  /**
   * Load and initialize a specific panel
   * @param {string} panelName - Name of the panel to initialize
   */
  async loadAndInitializePanel(panelName) {
    try {
      this.logger?.info(`Loading and initializing panel: ${panelName}`);
      
      // Ensure component system is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // Use ComponentRegistry to initialize the component
      const success = await ComponentRegistry.initializeComponent(panelName);
      
      this.logger?.debug(`Panel ${panelName} initialization result: ${success}`);
      return success;
    } catch (error) {
      this.logger?.error(`Error initializing panel ${panelName}:`, error);
      console.error(`Error initializing panel ${panelName}:`, error);
      return false;
    }
  }

  /**
   * Get the current component system status
   */
  getStatus() {
    const containerStatus = getContainerStatus();
    
    return {
      initialized: this.initialized,
      validationResults: this.validationResults,
      componentCount: containerStatus.components?.count || 0,
      serviceCount: containerStatus.services?.count || 0,
      utilityCount: containerStatus.utilities?.count || 0,
      componentInstanceCount: containerStatus.components?.instanceCount || 0,
      containerInitialized: containerStatus.initialized
    };
  }
}

// Create and export singleton instance
export const componentSystem = new ComponentSystem();

// Export convenience functions
export async function initializeComponentSystem() {
  return componentSystem.initialize();
}

export async function loadAndInitializePanel(panelName) {
  return componentSystem.loadAndInitializePanel(panelName);
}

export function getComponentSystemStatus() {
  return componentSystem.getStatus();
}