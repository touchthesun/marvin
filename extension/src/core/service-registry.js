import { StorageService } from '../services/storage-service.js';
import { AnalysisService } from '../services/analysis-service.js';
import { GraphService } from '../services/graph-service.js';
import { NotificationService } from '../services/notification-service.js';
import { StatusService } from '../services/status-service.js';
import { TaskService } from '../services/task-service.js';
import { VisualizationService } from '../services/visualization-service.js';
import { MessageService } from '../services/message-service.js';
import { ApiService } from '../services/api-service.js';
import { ResourceTracker } from '../utils/resource-tracker.js';
import { MemoryMonitor } from '../utils/memory-monitor.js';

/**
 * ServiceRegistry class for managing service registration and dependency resolution
 */
export class ServiceRegistry {
    constructor() {
        this._services = new Map();
        this._dependencies = new Map();
        this._instances = new WeakMap();
        this._resourceTracker = new ResourceTracker();
        this._memoryMonitor = new MemoryMonitor({
            threshold: 0.8,
            interval: 5000
        });
        this._memoryMetrics = {
            peakUsage: 0,
            lastSnapshot: null,
            cleanupCount: 0
        };
        this._initializeServiceRegistry();
    }

    /**
     * Initialize the service registry with all services
     * @private
     */
    _initializeServiceRegistry() {
        // Register core services first
        this.registerService('storageService', StorageService, {
            dependencies: [],
            phase: 'core',
            maxMemoryUsage: 50 * 1024 * 1024 // 50MB limit
        });

        this.registerService('apiService', ApiService, {
            dependencies: ['storageService'],
            phase: 'core',
            maxMemoryUsage: 30 * 1024 * 1024 // 30MB limit
        });

        this.registerService('messageService', MessageService, {
            dependencies: ['storageService', 'apiService'],
            phase: 'core',
            maxMemoryUsage: 20 * 1024 * 1024 // 20MB limit
        });

        // Register services that depend on core services
        this.registerService('analysisService', AnalysisService, {
            dependencies: ['storageService', 'apiService'],
            phase: 'optional',
            maxMemoryUsage: 100 * 1024 * 1024 // 100MB limit
        });

        this.registerService('graphService', GraphService, {
            dependencies: ['storageService', 'analysisService'],
            phase: 'optional',
            maxMemoryUsage: 200 * 1024 * 1024 // 200MB limit
        });

        this.registerService('notificationService', NotificationService, {
            dependencies: ['storageService', 'messageService'],
            phase: 'core',
            maxMemoryUsage: 10 * 1024 * 1024 // 10MB limit
        });

        this.registerService('statusService', StatusService, {
            dependencies: ['storageService', 'messageService', 'apiService'],
            phase: 'core',
            maxMemoryUsage: 15 * 1024 * 1024 // 15MB limit
        });

        this.registerService('taskService', TaskService, {
            dependencies: ['storageService', 'messageService', 'apiService'],
            phase: 'core',
            maxMemoryUsage: 40 * 1024 * 1024 // 40MB limit
        });

        this.registerService('visualizationService', VisualizationService, {
            dependencies: ['storageService', 'graphService', 'analysisService'],
            phase: 'optional',
            maxMemoryUsage: 150 * 1024 * 1024 // 150MB limit
        });
    }
  
    /**
     * Register a service
     * @param {string} name - Service name
     * @param {Function} ServiceClass - Service class constructor
     * @param {Object} options - Registration options
     * @throws {Error} If service registration fails
     */
    registerService(name, ServiceClass, options = {}) {
      if (this._services.has(name)) {
          throw new Error(`Service ${name} is already registered`);
      }

      // Validate dependencies
      if (options.dependencies) {
          this._validateDependencies(name, options.dependencies);
      }

      // Track service registration as a resource
      this._resourceTracker.trackOperation(`registerService:${name}`, () => {
          this._services.set(name, {
              class: ServiceClass,
              options: options
          });

          if (options.dependencies) {
              this._dependencies.set(name, options.dependencies);
          }
      });
  }
  
    /**
     * Get a service instance
     * @param {string} name - Service name
     * @returns {BaseService} Service instance
     * @throws {Error} If service is not found or initialization fails
     */
    async getService(name) {
      if (!this._services.has(name)) {
          throw new Error(`Service ${name} is not registered`);
      }

      // Check if instance exists
      const service = this._services.get(name);
      let instance = this._instances.get(service);

      if (!instance) {
          // Create new instance
          instance = new service.class();
          
          // Initialize dependencies first
          if (this._dependencies.has(name)) {
              const deps = this._dependencies.get(name);
              for (const dep of deps) {
                  await this.getService(dep);
              }
          }

          // Initialize service
          await instance.initialize();
          
          // Track service instance
          this._instances.set(service, instance);
          
          // Monitor service memory usage
          this._monitorServiceMemory(name, instance);
      }

      return instance;
  }

        /**
     * Monitor service memory usage
     * @param {string} name - Service name
     * @param {BaseService} instance - Service instance
     * @private
     */
        _monitorServiceMemory(name, instance) {
          const service = this._services.get(name);
          const maxMemory = service.options.maxMemoryUsage;
  
          this._memoryMonitor.onMemoryPressure(async (snapshot) => {
              const serviceMemory = instance.memoryMonitor?.getLastSnapshot();
              if (serviceMemory && serviceMemory.usedJSHeapSize > maxMemory) {
                  await this._handleServiceMemoryPressure(name, instance, snapshot);
              }
          });
      }
  
      /**
       * Handle service memory pressure
       * @param {string} name - Service name
       * @param {BaseService} instance - Service instance
       * @param {Object} snapshot - Memory snapshot
       * @private
       */
      async _handleServiceMemoryPressure(name, instance, snapshot) {
          console.warn(`Memory pressure detected in service ${name}`);
          
          // Update memory metrics
          this._updateMemoryMetrics(snapshot);
          
          // Perform service-specific cleanup
          const pressureLevel = this._calculatePressureLevel(snapshot);
          await instance._performServiceSpecificCleanup(pressureLevel);
          
          // Force garbage collection if available
          if (global.gc) {
              global.gc();
          }
      }
  
      /**
       * Update memory metrics
       * @param {Object} snapshot - Memory snapshot
       * @private
       */
      _updateMemoryMetrics(snapshot) {
          this._memoryMetrics.lastSnapshot = snapshot;
          this._memoryMetrics.peakUsage = Math.max(
              this._memoryMetrics.peakUsage,
              snapshot.usedJSHeapSize
          );
      }
  
    /**
     * Clean up all services
     */
    async cleanup() {
      // Clean up services in reverse dependency order
      const cleanupOrder = this._getCleanupOrder();
      
      for (const name of cleanupOrder) {
          const service = this._services.get(name);
          const instance = this._instances.get(service);
          
          if (instance) {
              await instance.cleanup();
              this._instances.delete(service);
          }
      }

      // Clean up resources
      await this._resourceTracker.cleanup();
      
      // Reset memory metrics
      this._memoryMetrics = {
          peakUsage: 0,
          lastSnapshot: null,
          cleanupCount: 0
      };
  }
  
    /**
     * Validate service dependencies
     * @param {string} name - Service name
     * @param {string[]} dependencies - Service dependencies
     * @throws {Error} If dependency validation fails
     * @private
     */
    static _validateDependencies(service, dependencies) {
      const visited = new Set();
      const visiting = new Set();
      
      const visit = (name) => {
          if (visiting.has(name)) {
              throw new Error(`Circular dependency detected: ${name}`);
          }
          if (visited.has(name)) return;
          
          visiting.add(name);
          const deps = dependencies.get(name) || [];
          for (const dep of deps) {
              visit(dep);
          }
          visiting.delete(name);
          visited.add(name);
      };
      
      visit(service);
  }

    /**
     * Get service cleanup order based on dependencies
     * @returns {string[]} Service names in cleanup order
     * @private
     */
    _getCleanupOrder() {
        const visited = new Set();
        const order = [];
        
        const visit = (name) => {
            if (visited.has(name)) return;
            
            if (this._dependencies.has(name)) {
                const deps = this._dependencies.get(name);
                for (const dep of deps) {
                    visit(dep);
                }
            }
            
            visited.add(name);
            order.push(name);
        };
        
        for (const name of this._services.keys()) {
            visit(name);
        }
        
        return order.reverse();
    }
  
    async checkServiceHealth(name) {
      const service = await this.getService(name);
      const serviceInfo = this._services.get(name);
      
      return {
          initialized: service.isInitialized,
          memoryUsage: service.memoryMonitor?.getLastSnapshot(),
          resourceCount: service.resourceTracker?.getResourceCount(),
          dependencies: this._dependencies.get(name) || [],
          maxMemoryUsage: serviceInfo.options.maxMemoryUsage,
          phase: serviceInfo.options.phase
      };
  }

    /**
     * Get service metrics
     * @returns {Object} Service metrics
     */
    getMetrics() {
      const metrics = {
          totalServices: this._services.size,
          initializedServices: 0,
          dependencies: new Map(),
          memoryUsage: new Map(),
          memoryMetrics: this._memoryMetrics
      };

      for (const [name, service] of this._services) {
          const instance = this._instances.get(service);
          if (instance) {
              metrics.initializedServices++;
              metrics.dependencies.set(name, this._dependencies.get(name) || []);
              metrics.memoryUsage.set(name, instance.memoryMonitor?.getLastSnapshot());
          }
      }

      return metrics;
  }
}