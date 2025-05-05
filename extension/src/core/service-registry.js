// src/services/service-registry.js - Updated for DI integration
import { container } from '../core/dependency-container.js';
import { ApiService } from './api-service.js';
import { NotificationService } from './notification-service.js';
import { StorageService } from './storage-service.js';
import { TaskService } from './task-service.js';
import { StatusService } from './status-service.js';
import { VisualizationService } from './visualization-service.js';

// ServiceRegistry that integrates with dependency container
export const ServiceRegistry = {
  // Register all services with the dependency container
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
  
  // Get service instances from the container
  getService(name) {
    return container.getService(name);
  },
  
  // Initialize all services in the correct order
  async initializeAll() {
    // Create instances if they don't exist
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

// Alternatively, create convenience functions for registration
// export function registerAllServices() {
//   ServiceRegistry.registerAll();
// }

// export function getService(name) {
//   return ServiceRegistry.getService(name);
// }

// export function initializeAllServices() {
//   return ServiceRegistry.initializeAll();
// }