import { container } from './dependency-container.js';
import { registerAllServices, initializeAllServices } from '../services/service-registry.js';
import { UtilsRegistry } from '../utils/utils-registry.js';

// Import all components directly
import { Navigation } from '../components/navigation.js';
import { OverviewPanel } from '../components/panels/overview/overview-panel.js';
import { CapturePanel } from '../components/panels/capture/capture-panel.js';
import { KnowledgePanel } from '../components/panels/knowledge/knowledge-panel.js';
import { GraphPanel } from '../../../notes/archive-code/graph-panel.js';
import { SettingsPanel } from '../components/panels/settings/settings-panel.js';
import { TasksPanel } from '../components/panels/tasks/tasks-panel.js';
import { AssistantPanel } from '../components/panels/assistant/assistant-panel.js';

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
      // 1. Register utilities first
      this.registerUtilities();
      
      // 2. Register and initialize services
      registerAllServices();
      await initializeAllServices();
      
      // 3. Register components
      this.registerComponents();
      
      // 4. Validate components
      this.validationResults = this.validateComponents();
      
      this.initialized = true;
      console.log('Component system initialized successfully');
      
      return this.validationResults;
    } catch (error) {
      console.error('Component system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register all utilities
   */
  registerUtilities() {
    // Register top-level utilities
    if (UtilsRegistry.LogManager) {
      container.registerUtil('LogManager', UtilsRegistry.LogManager);
    }
    
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
      { name: 'graph-panel', implemen },
      { name: 'settings-panel', implementation: SettingsPanel },
      { name: 'tasks-panel', implementation: TasksPanel },
      { name: 'assistant-panel', implementation: AssistantPanel }
    ];

    componentDefinitions.forEach(({ name, implementation }) => {
      container.registerComponent(name, implementation);
    });
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
      }
    });

    console.log(`Component validation: ${allValid ? 'PASSED' : 'FAILED'}`);
    console.log('Validation results:', results);

    return {
      allValid,
      results,
      componentCount: container.components.size
    };
  }

  /**
   * Load and initialize a specific panel
   */
  async loadAndInitializePanel(panelName) {
    try {
      const component = container.getComponent(panelName);
      const initFuncName = `init${this.capitalizeFirst(this.toCamelCase(panelName))}`;
      
      if (component && component[initFuncName]) {
        await component[initFuncName]();
        console.log(`Panel ${panelName} initialized successfully`);
        return true;
      }
      
      console.error(`Cannot initialize ${panelName}: missing ${initFuncName}`);
      return false;
    } catch (error) {
      console.error(`Error initializing panel ${panelName}:`, error);
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
      serviceCount: container.serviceInstances.size,
      utilityCount: container.utils.size
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