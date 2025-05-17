# Service Architecture and Dependency Management

## Overview

This document outlines the service architecture, dependency management patterns, and initialization order for the Marvin extension's centralized container system.

## Service Design Principles

### 1. No Container Access During Construction

Services should **never** access the container during class construction. This prevents initialization order issues and ensures proper dependency resolution.

```javascript
// ❌ WRONG - Don't do this
export class BadService {
  constructor() {
    this.logger = new (container.getUtil('LogManager'))({ context: 'bad-service' });
  }
}

// ✅ CORRECT - Do this
export class GoodService {
  constructor() {
    this.logger = null; // Initialize during async initialize()
  }
  
  async initialize() {
    this.logger = new LogManager({ context: 'good-service' });
  }
}
```

### 2. Import Utilities Directly

When possible, import utilities directly instead of getting them from the container:

```javascript
// ✅ PREFERRED - Direct import
import { LogManager } from '../utils/log-manager.js';

// Only use container for services that depend on other services
```

### 3. Lazy Initialization

All services should implement lazy initialization patterns and can be safely called multiple times:

```javascript
async performOperation() {
  if (!this.initialized) {
    await this.initialize();
  }
  // ... perform operation
}
```

## Service Dependencies and Initialization Order

Services are initialized by the `ServiceRegistry` in a carefully planned order to ensure dependencies are available when needed.

### Initialization Order

1. **StorageService** (no dependencies)
   - Provides persistent storage capabilities
   - Required by many other services for configuration

2. **MessageService** (no dependencies)
   - Handles communication with background script
   - Self-contained with direct LogManager import

3. **ApiService** (no dependencies)
   - Manages all external API communication
   - Base service for many application features

4. **TaskService** (depends on: ApiService)
   - Manages background tasks and operations
   - Uses ApiService for server communication

5. **StatusService** (depends on: StorageService)
   - Tracks extension and component status
   - Persists status information using StorageService

6. **NotificationService** (no dependencies)
   - Handles user notifications
   - Self-contained notification system

7. **VisualizationService** (depends on: ApiService)
   - Manages data visualization features
   - Fetches visualization data via ApiService

8. **AnalysisService** (depends on: ApiService)
   - Provides content analysis capabilities
   - Communicates with analysis endpoints via ApiService

9. **GraphService** (depends on: ApiService)
   - Handles knowledge graph operations
   - Uses ApiService for graph database communication

### Dependency Graph

```
StorageService ─── StatusService
MessageService (independent)
ApiService ┬─── TaskService
           ├─── VisualizationService
           ├─── AnalysisService
           └─── GraphService
NotificationService (independent)
```

## Service Registration

Services are registered in `ServiceRegistry`:

```javascript
// src/core/service-registry.js
export const ServiceRegistry = {
  registerAll() {
    container.registerService('storageService', StorageService);
    container.registerService('messageService', MessageService);
    container.registerService('apiService', ApiService);
    container.registerService('taskService', TaskService);
    container.registerService('statusService', StatusService);
    container.registerService('notificationService', NotificationService);
    container.registerService('visualizationService', VisualizationService);
    container.registerService('analysisService', AnalysisService);
    container.registerService('graphService', GraphService);
  }
};
```

## Implementation Guidelines

### Template Structure

Every service should follow this basic structure:

```javascript
export class ExampleService {
  constructor() {
    this.initialized = false;
    this.logger = null;
    // Don't resolve dependencies here!
  }
  
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // 1. Create logger
      this.logger = new LogManager({
        context: 'example-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      // 2. Load configuration
      await this.loadConfiguration();
      
      // 3. Resolve dependencies from container
      this.dependencyService = container.getService('dependencyService');
      
      // 4. Perform async setup
      await this.performSetup();
      
      this.initialized = true;
      this.logger.info('Service initialized successfully');
      return true;
    } catch (error) {
      this.logger?.error('Service initialization failed:', error);
      return false;
    }
  }
  
  // ... service methods
}
```

### Error Handling

- Always implement proper error handling in `initialize()`
- Return `boolean` success status from `initialize()`
- Log errors appropriately (use logger if available, console.error as fallback)
- Don't throw errors from `initialize()` - return `false` instead

### Dependency Resolution

- Only access other services during `initialize()`
- Check that dependencies are available before using them
- Document service dependencies clearly
- Consider making some dependencies optional with fallback behavior

## Adding New Services

When adding a new service:

1. **Design the service** following the template above
2. **Identify dependencies** on other services
3. **Add to ServiceRegistry** in the correct position
4. **Update initialization order** if necessary
5. **Update this documentation** with the new service
6. **Test initialization** in isolation and integration

## Best Practices

### For Service Authors

- ✅ Import `LogManager` directly
- ✅ Initialize logger in `initialize()` method
- ✅ Make `initialize()` idempotent (safe to call multiple times)
- ✅ Return boolean success status from `initialize()`
- ✅ Implement proper error handling
- ✅ Document service dependencies

### For Service Consumers

- ✅ Get services from container using `container.getService()`
- ✅ Access services only after container initialization
- ✅ Handle cases where services might not be available
- ✅ Don't cache service references at module level

## Container Initialization Integration

The service system integrates with the centralized container initialization:

1. **Container initializes utilities** (LogManager, etc.)
2. **ServiceRegistry registers all services** as classes
3. **ServiceRegistry initializes all services** in dependency order
4. **Components can safely access services** from container

This ensures that by the time any component runs, all services are properly initialized and ready to use.

## Troubleshooting

### Common Issues

**"Utility not found: LogManager"**
- Service is trying to access container before initialization
- Solution: Import LogManager directly

**"Service not found"**
- Service not registered in ServiceRegistry
- Solution: Add to ServiceRegistry.registerAll()

**Circular Dependencies**
- Two services depend on each other
- Solution: Restructure to eliminate circular dependency or use dependency injection

**Service Initialization Fails**
- Check dependencies are available in correct order
- Review service initialization order
- Check error logs for specific failure reasons