// src/services/service-registry.js
import { container } from '../core/dependency-container.js';
import { ApiService } from '../services/api-service.js';
import { NotificationService } from '../services/notification-service.js';
import { StorageService } from '../services/storage-service.js';
import { TaskService } from '../services/task-service.js';
import { StatusService } from '../services/status-service.js';
import { VisualizationService } from '../services/visualization-service.js';
 
/**
 * ServiceRegistry - Central service management for Marvin extension
 * Handles registration and initialization of all application services
 */
export const ServiceRegistry = {
  /**
   * Register all services with the dependency container
   * @returns {Object} ServiceRegistry instance for chaining
   */
  registerAll() {
    // Register services with their classes, not instances
    container.registerService('apiService', ApiService);
    container.registerService('notificationService', NotificationService);
    container.registerService('storageService', StorageService);
    container.registerService('taskService', TaskService);
    container.registerService('statusService', StatusService);
    container.registerService('visualizationService', VisualizationService);
    
    return this;
  },
  
  /**
   * Get service instance from the container
   * @param {string} name - Service name to retrieve
   * @returns {Object} Service instance
   */
  getService(name) {
    return container.getService(name);
  },
  
  /**
   * Initialize all services in the correct dependency order
   * @returns {Promise<Object>} ServiceRegistry instance for chaining
   */
  async initializeAll() {
    // Get service instances - they will be created if they don't exist
    const storageService = this.getService('storageService');
    const apiService = this.getService('apiService');
    const taskService = this.getService('taskService');
    const statusService = this.getService('statusService');
    const notificationService = this.getService('notificationService');
    const visualizationService = this.getService('visualizationService');
    
    // Initialize in dependency order
    await storageService.initialize();
    await apiService.initialize();
    await taskService.initialize();
    await statusService.initialize();
    await notificationService.initialize();
    await visualizationService.initialize();
    
    return this;
  }
};