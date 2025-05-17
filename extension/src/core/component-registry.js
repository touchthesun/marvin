// src/core/component-registry.js
import { container } from './dependency-container.js';

// Import all components
import { Navigation } from '../components/core/navigation.js';
import { OverviewPanel } from '../components/panels/overview/overview-panel.js';
import { CapturePanel } from '../components/panels/capture/capture-panel.js';
import { KnowledgePanel } from '../components/panels/knowledge/knowledge-panel.js';
import { SettingsPanel } from '../components/panels/settings/settings-panel.js';
import { TasksPanel } from '../components/panels/tasks/tasks-panel.js';
import { AssistantPanel } from '../components/panels/assistant/assistant-panel.js';

/**
 * ComponentRegistry - Central component registration
 * Handles registration of all UI components with the dependency container
 */
export const ComponentRegistry = {
  /**
   * Register all components with the dependency container
   * @returns {Object} ComponentRegistry instance for chaining
   */
  registerAll() {
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

    console.log(`ComponentRegistry: Registered ${componentDefinitions.length} components`);
    return this;
  },

  /**
   * Get component instance from the container
   * @param {string} name - Component name to retrieve
   * @returns {Object} Component instance
   */
  getComponent(name) {
    return container.getComponent(name);
  },

  /**
   * Check if a component is registered
   * @param {string} name - Component name to check
   * @returns {boolean} Whether component is registered
   */
  hasComponent(name) {
    return container.components.has(name);
  },

  /**
   * Get all registered component names
   * @returns {Array<string>} Array of component names
   */
  getComponentNames() {
    return Array.from(container.components.keys());
  },

  /**
   * Initialize a specific component by name
   * @param {string} name - Component name
   * @returns {Promise<boolean>} Success status
   */
  async initializeComponent(name) {
    try {
      const component = this.getComponent(name);
      
      if (!component) {
        throw new Error(`Component not found: ${name}`);
      }

      // Generate initialization method name
      const initMethodName = `init${this.capitalizeFirst(this.toCamelCase(name))}`;
      
      if (typeof component[initMethodName] === 'function') {
        const result = await component[initMethodName]();
        console.log(`ComponentRegistry: Initialized ${name} with result: ${result}`);
        return !!result;
      } else {
        console.warn(`ComponentRegistry: ${name} missing ${initMethodName} method`);
        return false;
      }
    } catch (error) {
      console.error(`ComponentRegistry: Error initializing ${name}:`, error);
      return false;
    }
  },

  /**
   * Validate all components have proper initialization methods
   * @returns {Object} Validation results
   */
  validateComponents() {
    const results = {};
    let allValid = true;

    container.components.forEach((component, name) => {
      const initMethodName = `init${this.capitalizeFirst(this.toCamelCase(name))}`;
      const hasInitMethod = typeof component[initMethodName] === 'function';
      
      results[name] = {
        hasInitMethod,
        initMethodName,
        type: typeof component
      };
      
      if (!hasInitMethod) {
        allValid = false;
        console.warn(`ComponentRegistry: ${name} missing ${initMethodName} method`);
      }
    });

    return {
      allValid,
      results,
      componentCount: container.components.size
    };
  },

  /**
   * Helper: Convert kebab-case to camelCase
   */
  toCamelCase(str) {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  },

  /**
   * Helper: Capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
};