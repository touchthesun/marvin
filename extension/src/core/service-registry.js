// src/services/service-registry.js
import { container } from '../core/dependency-container.js';
import { ApiService } from '../services/api-service.js';
import { NotificationService } from '../services/notification-service.js';
import { StorageService } from '../services/storage-service.js';
import { TaskService } from '../services/task-service.js';
import { StatusService } from '../services/status-service.js';
import { VisualizationService } from '../services/visualization-service.js';
import { AnalysisService } from '../services/analysis-service.js';
import { GraphService } from '../services/graph-service.js';
import { MessageService } from '../services/message-service.js';
 
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
    container.registerService('analysisService', AnalysisService);
    container.registerService('graphService', GraphService);
    container.registerService('messageService', MessageService);
    
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
    const analysisService = this.getService('analysisService');
    const graphService = this.getService('graphService');
    const messageService = this.getService('messageService');

    // Initialize in dependency order
    if (storageService && storageService.initialize) {
      await storageService.initialize();
    }

    if (messageService && messageService.initialize) {
      await messageService.initialize();
    }
    
    if (apiService && apiService.initialize) {
      await apiService.initialize();
    }
    
    if (taskService && taskService.initialize) {
      await taskService.initialize();
    }
    
    if (statusService && statusService.initialize) {
      await statusService.initialize();
    }
    
    if (notificationService && notificationService.initialize) {
      await notificationService.initialize();
    }
    
    if (visualizationService && visualizationService.initialize) {
      await visualizationService.initialize();
    }

    if (analysisService && analysisService.initialize) {
      await analysisService.initialize();
    }

    if (graphService && graphService.initialize) {
      await graphService.initialize();
    }
    
    console.log('All services initialized successfully');
    return this;
  }
};