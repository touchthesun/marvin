// Import LogManager directly first
import { LogManager } from '../utils/log-manager.js';

// Create logger directly
const logger = new LogManager({
  context: 'component-system',
  isBackgroundScript: false,
  maxEntries: 1000
});

// Then import other dependencies
import { container } from './dependency-container.js';
import { ServiceRegistry } from './service-registry.js';
import { UtilsRegistry } from './utils-registry.js';

// Import all components directly
import { Navigation } from '../components/core/navigation.js';
import { OverviewPanel } from '../components/panels/overview/overview-panel.js';
import { CapturePanel } from '../components/panels/capture/capture-panel.js';
import { KnowledgePanel } from '../components/panels/knowledge/knowledge-panel.js';
import { SettingsPanel } from '../components/panels/settings/settings-panel.js';
import { TasksPanel } from '../components/panels/tasks/tasks-panel.js';
import { AssistantPanel } from '../components/panels/assistant/assistant-panel.js';

// Register LogManager immediately
function registerEssentialUtilities() {
  if (!container.utils.has('LogManager')) {
    container.registerUtil('LogManager', LogManager);
    console.log('LogManager registered directly in component-system.js');
  }
}

// Register essential utilities
registerEssentialUtilities();

/**
 * Component System - Handles all component management with DI
 */
export class ComponentSystem {
  constructor() {
    this.initialized = false;
    this.validationResults = null;
  }

  /**
   * Initialize the entire component system
   */
  async initialize() {
    if (this.initialized) {
      console.log('Component system already initialized');
      return this.validationResults;
    }

    try {
      // Ensure LogManager is registered
      registerEssentialUtilities();
      
      // Register remaining utilities
      this.registerUtilities();
      
      // Register and initialize services
      try {
        ServiceRegistry.registerAll();
        await ServiceRegistry.initializeAll();
      } catch (serviceError) {
        console.error('Error initializing services:', serviceError);
        logger.error('Error initializing services:', serviceError);
        // Continue with component initialization anyway
      }
      
      // Register components
      this.registerComponents();
      
      // Validate components
      this.validationResults = this.validateComponents();
      
      // Initialize core components (like navigation)
      await this.initializeCoreComponents();
      
      this.initialized = true;
      console.log('Component system initialized successfully');
      logger.info('Component system initialized successfully');
      
      return this.validationResults;
    } catch (error) {
      console.error('Component system initialization failed:', error);
      logger.error('Component system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register all utilities
   */
  registerUtilities() {
    // LogManager is already registered, so register the rest
    
    // Register nested utilities
    if (UtilsRegistry.formatting) {
      container.registerUtil('formatting', UtilsRegistry.formatting);
    }
    if (UtilsRegistry.timeout) {
      container.registerUtil('timeout', UtilsRegistry.timeout);
    }
    if (UtilsRegistry.ui) {
      container.registerUtil('ui', UtilsRegistry.ui);
    }
    
    // Note: We don't register component system functions as utilities anymore
    // as they're imported directly where needed
  }

  /**
   * Register all components
   */
  registerComponents() {
    const componentDefinitions = [
      { name: 'navigation', implementation: Navigation },
      { name: 'overview-panel', implementation: OverviewPanel },
      { name: 'capture-panel', implementation: CapturePanel },
      { name: 'knowledge-panel', implementation: KnowledgePanel },
      { name: 'settings-panel', implementation: SettingsPanel },
      { name: 'tasks-panel', implementation: TasksPanel },
      { name: 'assistant-panel', implementation: AssistantPanel }
    ];

    componentDefinitions.forEach(({ name, implementation }) => {
      container.registerComponent(name, implementation);
    });
  }

  /**
   * Initialize core components that other components might depend on
   */
  async initializeCoreComponents() {
    try {
      // Get the navigation component instance
      const navigation = container.getComponent('navigation');
      
      // Initialize navigation if it has an init method
      if (navigation && navigation.initNavigation) {
        console.log('Initializing navigation component...');
        logger.info('Initializing navigation component...');
        await navigation.initNavigation();
        console.log('Navigation component initialized successfully');
        logger.info('Navigation component initialized successfully');
      } else {
        console.warn('Navigation component missing initNavigation method');
        logger.warn('Navigation component missing initNavigation method');
      }
    } catch (error) {
      console.error('Error initializing core components:', error);
      logger.error('Error initializing core components:', error);
      throw error;
    }
  }

  /**
   * Validate all components have required initialization functions
   */
  validateComponents() {
    const results = {};
    let allValid = true;

    // Get all registered components from the container
    container.components.forEach((component, name) => {
      const initFuncName = `init${this.capitalizeFirst(this.toCamelCase(name))}`;
      const hasInitFunc = !!component[initFuncName];
      
      results[name] = hasInitFunc;
      
      if (!hasInitFunc) {
        allValid = false;
        console.warn(`Component ${name} missing ${initFuncName}`);
        logger.warn(`Component ${name} missing ${initFuncName}`);
      }
    });

    console.log(`Component validation: ${allValid ? 'PASSED' : 'FAILED'}`);
    logger.info(`Component validation: ${allValid ? 'PASSED' : 'FAILED'}`);

    return {
      allValid,
      results,
      componentCount: container.components.size
    };
  }

  /**
   * Load and initialize a specific panel
   * @param {string} panelName - Name of the panel to initialize
   */
  async loadAndInitializePanel(panelName) {
    try {
      // Get component instance - this will create an instance if it doesn't exist
      const component = container.getComponent(panelName);
      const initFuncName = `init${this.capitalizeFirst(this.toCamelCase(panelName))}`;
      
      if (component && component[initFuncName]) {
        console.log(`Initializing panel: ${panelName}`);
        logger.info(`Initializing panel: ${panelName}`);
        const success = await component[initFuncName]();
        console.log(`Panel ${panelName} initialized with result: ${success}`);
        logger.info(`Panel ${panelName} initialized with result: ${success}`);
        return success;
      }
      
      console.error(`Cannot initialize ${panelName}: missing ${initFuncName}`);
      logger.error(`Cannot initialize ${panelName}: missing ${initFuncName}`);
      return false;
    } catch (error) {
      console.error(`Error initializing panel ${panelName}:`, error);
      logger.error(`Error initializing panel ${panelName}:`, error);
      return false;
    }
  }

  /**
   * Helper: Convert kebab-case to camelCase
   */
  toCamelCase(str) {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * Helper: Capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get the current component system status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      validationResults: this.validationResults,
      componentCount: container.components.size,
      serviceCount: container.services.size,
      utilityCount: container.utils.size,
      componentInstanceCount: container.componentInstances?.size || 0
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