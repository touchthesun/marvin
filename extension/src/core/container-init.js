// src/core/container-init.js
import { LogManager } from '../utils/log-manager.js';
import { container } from './dependency-container.js';
import { ServiceRegistry } from './service-registry.js';
import { UtilsRegistry } from './utils-registry.js';
 
/**
 * Container Initializer - Centralized initialization of the dependency container
 * This ensures all utilities, services, and components are registered in the correct order
 */
export class ContainerInitializer {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.logger = null;
  }

  /**
   * Initialize the entire container system
   * @param {Object} options - Initialization options
   * @param {boolean} options.isBackgroundScript - Whether this is running in background
   * @param {string} options.context - Context name for logging
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // Return existing promise if initialization is in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Return success if already initialized
    if (this.initialized) {
      return this.getStatus();
    }

    // Start initialization
    this.initializationPromise = this._performInitialization(options);
    
    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null; // Reset on error so we can retry
      throw error;
    }
  }

  /**
   * Perform the actual initialization
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async _performInitialization(options) {
    const { isBackgroundScript = false, context = 'container-init' } = options;

    // Step 1: Register LogManager first (always needed)
    await this._registerEssentialUtilities(isBackgroundScript, context);

    // Step 2: Register all other utilities
    await this._registerUtilities();

    // Step 3: Register all services
    await this._registerServices();

    // Step 4: Initialize all services
    await this._initializeServices();

    // Step 5: Register all components
    await this._registerComponents();

    // Step 6: Validate the container state
    const status = this._validateContainer();

    this.logger.info('Container initialization completed successfully');
    
    return status;
  }

  /**
   * Register essential utilities first
   */
  async _registerEssentialUtilities(isBackgroundScript, context) {
    // Create logger instance if not already created
    if (!this.logger) {
      this.logger = new LogManager({
        isBackgroundScript,
        context,
        maxEntries: 2000
      });
    }

    // Register LogManager first if not already registered
    if (!container.utils.has('LogManager')) {
      container.registerUtil('LogManager', LogManager);
      this.logger.debug('LogManager registered in container');
    }

    // Ensure logger is available throughout the system
    this.logger.info('Starting container initialization');
  }

  /**
   * Register all utilities from UtilsRegistry
   */
  async _registerUtilities() {
    this.logger.debug('Registering utilities');

    // Register formatting utilities
    if (UtilsRegistry.formatting) {
      container.registerUtil('formatting', UtilsRegistry.formatting);
      this.logger.debug('Formatting utilities registered');
    }

    // Register timeout utilities
    if (UtilsRegistry.timeout) {
      container.registerUtil('timeout', UtilsRegistry.timeout);
      this.logger.debug('Timeout utilities registered');
    }

    // Register UI utilities
    if (UtilsRegistry.ui) {
      container.registerUtil('ui', UtilsRegistry.ui);
      this.logger.debug('UI utilities registered');
    }

    this.logger.info(`Registered ${container.utils.size} utilities`);
  }

  /**
   * Register all services
   */
  async _registerServices() {
    this.logger.debug('Registering services');
    
    try {
      ServiceRegistry.registerAll();
      this.logger.info(`Registered ${container.services.size} services`);
    } catch (error) {
      this.logger.error('Error registering services:', error);
      throw new Error(`Service registration failed: ${error.message}`);
    }
  }

  /**
   * Initialize all services
   */
  async _initializeServices() {
    this.logger.debug('Initializing services');
    
    try {
      await ServiceRegistry.initializeAll();
      this.logger.info(`Initialized ${container.serviceInstances.size} service instances`);
    } catch (error) {
      this.logger.error('Error initializing services:', error);
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }

  /**
   * Register all components
   */
  async _registerComponents() {
    this.logger.debug('Registering components');
    
    try {
      // Import ComponentRegistry dynamically to avoid circular dependencies
      const { ComponentRegistry } = await import('./component-registry.js');
      ComponentRegistry.registerAll();
      this.logger.info(`Registered ${container.components.size} components`);
    } catch (error) {
      this.logger.warn('ComponentRegistry not available, skipping component registration');
      // Components can be registered later by specific modules
    }
  }

  /**
   * Validate container state
   */
  _validateContainer() {
    const status = {
      initialized: true,
      timestamp: Date.now(),
      utilities: {
        count: container.utils.size,
        names: Array.from(container.utils.keys())
      },
      services: {
        count: container.services.size,
        names: Array.from(container.services.keys()),
        instanceCount: container.serviceInstances.size,
        instances: Array.from(container.serviceInstances.keys())
      },
      components: {
        count: container.components.size,
        names: Array.from(container.components.keys()),
        instanceCount: container.componentInstances?.size || 0
      }
    };

    // Validate essential utilities are present
    const requiredUtils = ['LogManager'];
    const missingUtils = requiredUtils.filter(util => !container.utils.has(util));
    
    if (missingUtils.length > 0) {
      this.logger.warn('Missing essential utilities:', missingUtils);
      status.warnings = status.warnings || [];
      status.warnings.push(`Missing utilities: ${missingUtils.join(', ')}`);
    }

    this.logger.debug('Container validation completed', status);
    return status;
  }

  /**
   * Get current container status
   */
  getStatus() {
    if (!this.initialized) {
      return {
        initialized: false,
        message: 'Container not initialized'
      };
    }

    return this._validateContainer();
  }

  /**
   * Reset container (for testing)
   */
  reset() {
    this.initialized = false;
    this.initializationPromise = null;
    
    // Clear all container maps
    container.utils.clear();
    container.services.clear();
    container.serviceInstances.clear();
    container.components.clear();
    if (container.componentInstances) {
      container.componentInstances.clear();
    }
    
    this.logger = null;
  }

  /**
   * Ensure container is initialized (convenience method)
   */
  async ensureInitialized(options = {}) {
    if (!this.initialized && !this.initializationPromise) {
      await this.initialize(options);
    } else if (this.initializationPromise) {
      await this.initializationPromise;
    }
    return this.getStatus();
  }
}

// Create and export singleton instance
export const containerInitializer = new ContainerInitializer();

// Export convenience functions
export async function initializeContainer(options = {}) {
  return containerInitializer.initialize(options);
}

export async function ensureContainerInitialized(options = {}) {
  return containerInitializer.ensureInitialized(options);
}

export function getContainerStatus() {
  return containerInitializer.getStatus();
}

export function resetContainer() {
  return containerInitializer.reset();
}