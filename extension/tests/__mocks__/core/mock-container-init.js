class MockContainerInitializer {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this._memoryMetrics = {
      peakUsage: 0,
      lastSnapshot: null,
      cleanupCount: 0
    };
    this.initializationProgress = {
      phase: null,
      progress: 0,
      details: {},
      memoryUsage: null
    };
  }

  async initialize(options = {}) {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
  
    if (this.initialized) {
      return this.getStatus();
    }

    const { mockSystem } = options;
    if (!mockSystem) {
      throw new Error('Mock system is required');
    }

    this.logger = mockSystem.logger;
    this._resourceTracker = mockSystem.resourceTracker;
    this._memoryMonitor = mockSystem.memoryMonitor;
  
    this.initializationPromise = (async () => {
      try {
        // Start memory monitoring
        this._memoryMonitor.start();
        
        // Phase 1: Essential utilities (includes core utilities)
        this._updateProgress('essential-utilities', 0);
        await this._registerEssentialUtilities(mockSystem, options.isBackgroundScript, options.context);
        
        // Phase 2: Core services (previously Phase 3)
        this._updateProgress('core-services', 40);
        await this._registerCoreServices(mockSystem);
        
        // Phase 3: Initialize core services (previously Phase 4)
        this._updateProgress('core-service-initialization', 60);
        await this._initializeCoreServices(mockSystem);
        
        // Phase 4: Optional services (previously Phase 5)
        this._updateProgress('optional-services', 80);
        await this._registerOptionalServices(mockSystem);
        
        // Phase 5: Components (previously Phase 6)
        this._updateProgress('components', 90);
        await this._registerComponents(mockSystem);
        
        // Final validation
        this._updateProgress('validation', 100);
        this.initialized = true;
        
        return {
          initialized: true,
          memoryMetrics: this._memoryMetrics
        };
      } catch (error) {
        await this.reset(mockSystem);
        throw error;
      } finally {
        this._memoryMonitor.stop();
        this.initializationPromise = null;
      }
    })();
  
    return this.initializationPromise;
  }

  async reset(mockSystem) {
    // Clear initialization state
    this.initialized = false;
    this.initializationPromise = null;
    this.initializationProgress = {
      phase: null,
      progress: 0,
      details: {},
      memoryUsage: null
    };
    
    await mockSystem.resourceTracker.cleanup();
    
    // Reset container
    await mockSystem.container.reset();
    
    // Reset memory metrics
    this._memoryMetrics = {
      peakUsage: 0,
      lastSnapshot: null,
      cleanupCount: 0
    };
  }

  _updateProgress(phase, progress, details = {}) {
    this.initializationProgress = {
      phase,
      progress,
      details,
      memoryUsage: process.memoryUsage()
    };
    
    // Log progress if logger is available
    if (this.logger) {
      this.logger.debug(`Initialization progress: ${phase} (${progress}%)`, {
        details,
        memoryUsage: this.initializationProgress.memoryUsage
      });
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      progress: this.initializationProgress,
      memoryMetrics: this._memoryMetrics
    };
  }

  async _registerEssentialUtilities(mockSystem, isBackgroundScript, context) {
    this.logger = mockSystem.logger;
    this._resourceTracker = mockSystem.resourceTracker;
    this._memoryMonitor = mockSystem.memoryMonitor;
  
    this.logger.info('Initializing essential utilities');
    
    // Register LogManager first
    mockSystem.container.registerUtil('LogManager', mockSystem.logger);
    
    // Debug logging
    console.log('Container utils:', Array.from(mockSystem.container.utils.entries()));
    console.log('Mock system logger:', mockSystem.logger);
    
    // Verify LogManager is registered
    if (!mockSystem.container.utils.has('LogManager')) {
      throw new Error('LogManager not found in container');
    }
    
    this.logger.info('Essential utilities initialized');
  }

  async _initializeCoreServices(mockSystem) {
    this.logger.debug('Initializing core services');
    
    // Get core services
    const coreServices = ['apiService', 'storageService', 'messageService'];
    
    // Initialize each core service
    for (const serviceName of coreServices) {
      try {
        this.logger.debug(`Initializing service: ${serviceName}`);
        const service = mockSystem.container.getService(serviceName);
        await service.initialize();
        
        // Update service metadata
        mockSystem.container.serviceMetadata.set(serviceName, { initialized: true });
      } catch (error) {
        this.logger.error(`Failed to initialize service ${serviceName}:`, error);
        throw error;
      }
    }
  }

  async _registerCoreServices(mockSystem) {
    this.logger.debug('Registering core services');

    // Debug: Log what mockSystem we're using
    console.log('Mock initializer received mockSystem.services:', mockSystem.services);
    console.log('Mock initializer received mockSystem.services.apiService:', mockSystem.services.apiService);
    
    // Debug logging
    console.log('Mock system services:', mockSystem.services);
    console.log('Container services before registration:', Array.from(mockSystem.container.services.entries()));
    
    // Register core services
    mockSystem.container.registerService('apiService', mockSystem.services.apiService);
    mockSystem.container.registerService('storageService', mockSystem.services.storageService);
    mockSystem.container.registerService('messageService', mockSystem.services.messageService);
    
    // Debug logging
    console.log('Container services after registration:', Array.from(mockSystem.container.services.entries()));
    
    // Verify registrations
    const coreServices = ['apiService', 'storageService', 'messageService'];
    const missingServices = coreServices.filter(service => !mockSystem.container.services.has(service));
    if (missingServices.length > 0) {
      throw new Error(`Failed to register core services: ${missingServices.join(', ')}`);
    }
  }

  async _registerOptionalServices(mockSystem) {
    this.logger.debug('Registering optional services');
    
    // Register optional services
    mockSystem.container.registerService('visualizationService', mockSystem.services.visualizationService);
    mockSystem.container.registerService('analysisService', mockSystem.services.analysisService);
    
    // Verify registrations
    const optionalServices = ['visualizationService', 'analysisService'];
    const missingServices = optionalServices.filter(service => !mockSystem.container.services.has(service));
    if (missingServices.length > 0) {
      throw new Error(`Failed to register optional services: ${missingServices.join(', ')}`);
    }
  }

  async _registerComponents(mockSystem) {
    this.logger.debug('Registering components');
    
    // Register core components
    mockSystem.container.registerComponent('navigation', mockSystem.components.navigation);
    mockSystem.container.registerComponent('overview-panel', mockSystem.components['overview-panel']);
    
    // Register optional components
    mockSystem.container.registerComponent('assistant-panel', mockSystem.components['assistant-panel']);
    mockSystem.container.registerComponent('tasks-panel', mockSystem.components['tasks-panel']);
    
    // Verify registrations
    const allComponents = ['navigation', 'overview-panel', 'assistant-panel', 'tasks-panel'];
    const missingComponents = allComponents.filter(component => !mockSystem.container.components.has(component));
    if (missingComponents.length > 0) {
      throw new Error(`Failed to register components: ${missingComponents.join(', ')}`);
    }
  }
}

// Create and export a single instance
const containerInitializer = new MockContainerInitializer();

const initializeContainer = async (options) => containerInitializer.initialize(options);
const getContainerStatus = () => containerInitializer.getStatus();
const resetContainer = async (mockSystem) => containerInitializer.reset(mockSystem);

export {
  MockContainerInitializer,
  containerInitializer,
  initializeContainer,
  getContainerStatus,
  resetContainer
};