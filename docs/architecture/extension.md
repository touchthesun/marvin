# Marvin Extension Architecture Documentation

## Overview

This document outlines the architecture of the Marvin browser extension, focusing on the component system, dependency injection patterns, and development guidelines. The architecture has been recently standardized to improve maintainability, testability, and developer experience.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component System](#component-system)
- [Dependency Injection](#dependency-injection)
- [Panel Components](#panel-components)
- [Services](#services)
- [Utilities](#utilities)
- [Development Patterns](#development-patterns)
- [File Structure](#file-structure)

## Architecture Overview

The Marvin extension uses a modular architecture with the following key principles:

1. **Dependency Injection** - All components use a centralized DI container
2. **Component System** - Standardized loading and initialization
3. **Webpack Bundling** - Clean module resolution with aliases
4. **Service Layer** - Separated business logic
5. **Utility Layer** - Reusable helper functions

### High-Level Architecture

```
Extension Entry Points
└── Webpack Bundler
    ├── Background Script
    ├── Dashboard
    ├── Popup
    └── Options Page
        └── Component System
            ├── Dependency Container
            ├── Service Registry
            └── Utils Registry
```

## Component System

### Overview

The component system is the cornerstone of the Marvin extension architecture. It manages component lifecycle, dependencies, and initialization.

**File Location**: `src/core/component-system.js`

### Key Features

1. **Centralized Registration** - All components registered in one place
2. **Dependency Management** - Components receive dependencies via DI
3. **Initialization Control** - Ordered and validated initialization
4. **Error Handling** - Comprehensive error catching and reporting

### Component System API

```javascript
// Initialize the entire system
await initializeComponentSystem();

// Load specific panel
await loadAndInitializePanel('overview-panel');

// Get system status
const status = getComponentSystemStatus();
```

### Registration Process

Components are registered directly in the component system:

```javascript
// src/core/component-system.js
registerComponents() {
  const componentDefinitions = [
    { name: 'navigation', implementation: NavigationComponent },
    { name: 'overview-panel', implementation: OverviewPanel },
    // ... other components
  ];
  
  componentDefinitions.forEach(({ name, implementation }) => {
    container.registerComponent(name, implementation);
  });
}
```

### Initialization Order

1. Register utilities (no dependencies)
2. Register and initialize services (may depend on utilities)
3. Register components (may depend on services)
4. Validate components (check for required methods)

## Dependency Injection

### Dependency Container

**File Location**: `src/core/dependency-container.js`

The dependency container manages three types of dependencies:

1. **Services** - Business logic and API interactions
2. **Components** - UI components and panels
3. **Utilities** - Helper functions and tools

### Usage Pattern

```javascript
// Get service instance
const apiService = container.getService('apiService');

// Get utility (create instance with options)
const logger = new (container.getUtil('LogManager'))({
  context: 'panel-name'
});

// Get component
const panel = container.getComponent('overview-panel');
```

### Lazy Loading

Services are instantiated only when first requested:

```javascript
// Service classes are stored, not instances
container.registerService('apiService', ApiService);

// Instance created on first use
const api = container.getService('apiService');
```

## Panel Components

### Component Template

All panel components follow this standard pattern:

```javascript
// src/components/panels/[panel-name]/[panel-name].js
import { container } from '@core/dependency-container.js';

const PanelName = {
  // REQUIRED: Init method with naming convention
  initPanelName() {
    // Get dependencies
    const logger = new (container.getUtil('LogManager'))({
      context: 'panel-name'
    });
    
    const service = container.getService('serviceName');
    
    // Initialization logic
    logger.info('Initializing panel');
    
    try {
      // Panel setup
      this.setupPanel();
      logger.debug('Panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing panel:', error);
      return false;
    }
  },
  
  // Additional methods...
  setupPanel() { /* ... */ },
  refreshPanel() { /* ... */ }
};

// REQUIRED: Named export only
export { PanelName };
```

### Panel Naming Convention

| Panel Type | Object Name | Init Method | File Name |
|------------|-------------|-------------|-----------|
| Overview | `OverviewPanel` | `initOverviewPanel()` | `overview-panel.js` |
| Capture | `CapturePanel` | `initCapturePanel()` | `capture-panel.js` |
| Knowledge | `KnowledgePanel` | `initKnowledgePanel()` | `knowledge-panel.js` |
| Settings | `SettingsPanel` | `initSettingsPanel()` | `settings-panel.js` |

### Panel Lifecycle

1. Component system registers panel
2. Panel is loaded on demand via `loadAndInitializePanel()`
3. Panel's `init[PanelName]()` method is called
4. Dependencies are injected via container
5. Panel initializes its UI and event handlers

## Services

### Service Registry

**File Location**: `src/services/service-registry.js`

The service registry manages all application services:

```javascript
export const ServiceRegistry = {
  registerAll() {
    container.registerService('apiService', ApiService);
    container.registerService('notificationService', NotificationService);
    // ... other services
  },
  
  async initializeAll() {
    // Initialize services in dependency order
    await storageService.initialize();
    await apiService.initialize();
    // ... other services
  }
};
```

### Service Pattern

```javascript
// src/services/[service-name].js
export class ServiceName {
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    // Service initialization logic
    this.initialized = true;
  }
  
  // Service methods...
}
```

### Available Services

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| `apiService` | API communication | `fetchAPI()`, `setBaseUrl()` |
| `notificationService` | User notifications | `showNotification()` |
| `storageService` | Browser storage | `getSettings()`, `updateSettings()` |
| `taskService` | Task management | `createTask()`, `getActiveTasks()` |
| `stateService` | Application state | `syncState()`, `updateState()` |

## Utilities

### Utils Registry

**File Location**: `src/utils/utils-registry.js`

Utilities are organized by category:

```javascript
export const UtilsRegistry = {
  LogManager,
  
  formatting: {
    formatDate,
    formatTime,
    truncateText
  },
  
  timeout: {
    setupTimeout,
    clearTimeouts
  },
  
  ui: {
    showSaveConfirmation,
    initSplitView
  }
};
```

### Common Utilities

| Utility | Purpose | Usage |
|---------|---------|-------|
| `LogManager` | Logging system | `new LogManager(options)` |
| `formatting` | Text formatting | `formatting.truncateText()` |
| `ui` | UI helpers | `ui.initSplitView()` |

## Development Patterns

### Import Pattern

Always use webpack aliases:

```javascript
// CORRECT
import { container } from '@core/dependency-container.js';
import { ApiService } from '@services/api-service.js';
import { LogManager } from '@utils/log-manager.js';

// INCORRECT
import { container } from '../../../core/dependency-container.js';
```

### Dependency Pattern

Get dependencies from container:

```javascript
// CORRECT
const logger = new (container.getUtil('LogManager'))({ context: 'panel' });
const service = container.getService('apiService');

// INCORRECT
import { LogManager } from '@utils/log-manager.js';
const logger = new LogManager({ context: 'panel' });
```

### Export Pattern

Use named exports only:

```javascript
// CORRECT
const ComponentName = { /* ... */ };
export { ComponentName };

// INCORRECT
export default ComponentName;
```

### Error Handling

Standard error handling pattern:

```javascript
try {
  // Operation
  logger.debug('Operation successful');
  return true;
} catch (error) {
  logger.error('Operation failed:', error);
  notificationService.showNotification('Error message', 'error');
  return false;
}
```

## File Structure

```
src/
├── core/
│   ├── component-system.js      # Component management
│   ├── dependency-container.js  # DI container
│   └── service-registry.js      # Service registration
├── components/
│   ├── navigation.js           # Navigation component
│   └── panels/
│       ├── overview/
│       │   └── overview-panel.js
│       ├── capture/
│       │   └── capture-panel.js
│       ├── knowledge/
│       │   ├── knowledge-panel.js
│       │   └── graph-panel.js
│       ├── settings/
│       │   └── settings-panel.js
│       ├── tasks/
│       │   └── tasks-panel.js
│       └── assistant/
│           └── assistant-panel.js
├── services/
│   ├── service-registry.js
│   ├── api-service.js
│   ├── notification-service.js
│   ├── storage-service.js
│   └── task-service.js
├── utils/
│   ├── utils-registry.js
│   ├── log-manager.js
│   ├── formatting.js
│   └── ui-utils.js
├── background/
│   ├── background-service.js  # Main logic
│   ├── message-handlers.js    # Message handling
│   └── browser-events.js      # Chrome API events
├── dashboard/
│   ├── dashboard.js          # Main logic
│   └── dashboard.html
├── popup/
│   ├── popup.js
│   └── popup.html
└── manifest.json
```

## Webpack Configuration

### Entry Points

```javascript
module.exports = {
  entry: {
    popup: './src/popup/popup.js',
    options: './src/options/options.js'
  },
  // ...
};
```

### Aliases

```javascript
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@core': path.resolve(__dirname, 'src/core'),
    '@components': path.resolve(__dirname, 'src/components'),
    '@services': path.resolve(__dirname, 'src/services'),
    '@utils': path.resolve(__dirname, 'src/utils')
  }
}
```

## Migration Guide

### Updating Existing Components

1. **Change imports** to use webpack aliases
2. **Add dependency injection** using container
3. **Standardize component object** structure
4. **Remove default exports**
5. **Follow naming conventions**

### Common Refactoring Tasks

```javascript
// BEFORE
import AuthManager from './auth-manager.js';
const authManager = new AuthManager();

// AFTER
const authManager = container.getService('authManager');
```

```javascript
// BEFORE
export default KnowledgePanelComponent;

// AFTER
export { KnowledgePanel };
```

## Best Practices

1. **Use dependency injection** for all dependencies
2. **Follow naming conventions** consistently
3. **Handle errors properly** with logging
4. **Keep components focused** (single responsibility)
5. **Use async/await** for asynchronous operations
6. **Validate all user input**
7. **Log operations** at appropriate levels

## Troubleshooting

### Common Issues

1. **Webpack warnings**: Usually import/export mismatches
2. **Component not found**: Check registration in component system
3. **Service not found**: Ensure registered in service registry
4. **Initialization errors**: Check dependency order

### Debugging Tools

```javascript
// Check component status
console.log(getComponentSystemStatus());

// Verify service registration
console.log(container.services);

// Test component loading
await loadAndInitializePanel('panel-name');
```

## Future Improvements

1. TypeScript integration for better type safety
2. Component lazy loading for improved performance
3. Hot module replacement for development
4. Automated component validation

## References

- [Chrome Extension Architecture](https://developer.chrome.com/docs/extensions/mv3/architecture-overview/)
- [Dependency Injection Patterns](https://martinfowler.com/articles/injection.html)
- [Webpack Module Resolution](https://webpack.js.org/concepts/module-resolution/)

## Version History

- **v2.0.0** - Introduced component system with dependency injection
- **v1.0.0** - Initial architecture with direct imports