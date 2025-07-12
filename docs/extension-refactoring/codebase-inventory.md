# Marvin Extension Codebase Inventory

## Overview

This document provides a comprehensive inventory of the Marvin browser extension codebase, organized by functionality and migration relevance. This inventory will be updated as we progress through the discovery phase.

## File Structure Overview

```
extension/src/
├── background/          # Background script (Service Worker)
├── components/          # UI Components
│   ├── core/           # Core UI components
│   ├── panels/         # Dashboard panels
│   └── shared/         # Shared UI utilities
├── services/           # Service layer
├── utils/              # Utility libraries
├── dashboard/          # Dashboard interface
├── popup/              # Popup interface
├── options/            # Options page
├── content/            # Content scripts
└── core/               # Core system components
```

## Service Layer Inventory

### Background Services (Service Worker Candidates)

#### 1. Storage Service
- **File**: `services/storage-service.js`
- **Purpose**: Chrome storage operations and data persistence
- **Current Context**: Extension page context
- **Migration Target**: Background script (Service Worker)
- **Key Features**:
  - Chrome storage API management
  - Settings persistence
  - Capture history management
  - Statistics tracking
  - Data import/export
- **Dependencies**: Chrome APIs, LogManager
- **Migration Complexity**: Medium (needs context adaptation)

#### 2. API Service
- **File**: `services/api-service.js`
- **Purpose**: Backend communication with FastAPI server
- **Current Context**: Extension page context
- **Migration Target**: Background script (Service Worker) - CRITICAL
- **Key Features**:
  - HTTP request handling
  - Authentication management
  - Error handling and retries
  - Request/response logging
- **Dependencies**: Fetch API, LogManager, ConfigService
- **Migration Complexity**: High (central to backend integration)

#### 3. Task Service
- **File**: `services/task-service.js`
- **Purpose**: Background task management and processing
- **Current Context**: Extension page context
- **Migration Target**: Background script (Service Worker)
- **Key Features**:
  - Task queue management
  - Background processing
  - Task status tracking
  - Progress monitoring
- **Dependencies**: StorageService, ApiService, LogManager
- **Migration Complexity**: Medium

#### 4. Notification Service
- **File**: `services/notification-service.js`
- **Purpose**: Browser notifications and user alerts
- **Current Context**: Extension page context
- **Migration Target**: Background script (Service Worker)
- **Key Features**:
  - Browser notification API
  - Toast notifications
  - Error alerts
  - Success confirmations
- **Dependencies**: Chrome notification APIs
- **Migration Complexity**: Low

#### 5. Status Service
- **File**: `services/status-service.js`
- **Purpose**: Network and API status monitoring
- **Current Context**: Extension page context
- **Migration Target**: Background script (Service Worker) - ADAPT FOR BackendHealthMonitor
- **Key Features**:
  - Network connectivity monitoring
  - API health checks
  - Status history tracking
  - UI status indicators
  - Circuit breaker patterns
- **Dependencies**: Fetch API, Chrome storage, LogManager
- **Migration Complexity**: Medium (excellent foundation for BackendHealthMonitor)

### Extension Page Services (UI Layer)

#### 1. Component Service
- **File**: `services/component-service.js`
- **Purpose**: UI component lifecycle management
- **Current Context**: Extension page context
- **Migration Target**: Extension pages (Dashboard/Popup)
- **Key Features**:
  - Component registration
  - Lifecycle management
  - Dependency injection
- **Dependencies**: LogManager, ResourceTracker
- **Migration Complexity**: Low

#### 2. Message Service
- **File**: `services/message-service.js`
- **Purpose**: Message routing and communication
- **Current Context**: Extension page context
- **Migration Target**: Both contexts (adapt for message passing)
- **Key Features**:
  - Message routing
  - Request/response handling
  - Error handling
  - Timeout management
- **Dependencies**: Chrome runtime APIs, LogManager
- **Migration Complexity**: High (needs adaptation for cross-context communication)

### Shared Services

#### 1. Base Service
- **File**: `services/base-service.js`
- **Purpose**: Base class for all services
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Common service functionality
  - Resource tracking
  - Memory management
  - Lifecycle management
- **Dependencies**: LogManager, ResourceTracker, MemoryMonitor
- **Migration Complexity**: Low (foundation class)

## Component Layer Inventory

### Core Components

#### 1. Navigation Component
- **File**: `components/core/navigation.js`
- **Purpose**: Dashboard navigation and panel switching
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Panel navigation
  - Active state management
  - Event handling
- **Dependencies**: LogManager, ResourceTracker
- **Migration Complexity**: Low

### Panel Components

#### 1. Overview Panel
- **File**: `components/panels/overview/overview-panel.js`
- **Purpose**: Dashboard overview and statistics
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Statistics display
  - Recent captures list
  - Knowledge graph preview
- **Dependencies**: StorageService, ApiService, LogManager
- **Migration Complexity**: Medium (needs message passing adaptation)

#### 2. Capture Panel
- **File**: `components/panels/capture/capture-panel.js`
- **Purpose**: Page capture and tab management
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Tab listing and selection
  - Page capture functionality
  - Bookmark management
- **Dependencies**: Chrome tabs API, ApiService, LogManager
- **Migration Complexity**: Medium

#### 3. Knowledge Panel
- **File**: `components/panels/knowledge/knowledge-panel.js`
- **Purpose**: Knowledge graph exploration
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Graph visualization
  - Search functionality
  - Relationship exploration
- **Dependencies**: ApiService, VisualizationService, LogManager
- **Migration Complexity**: Medium

#### 4. Assistant Panel
- **File**: `components/panels/assistant/assistant-panel.js`
- **Purpose**: AI assistant interface
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Chat interface
  - Context management
  - Response handling
- **Dependencies**: ApiService, LogManager
- **Migration Complexity**: Medium

#### 5. Tasks Panel
- **File**: `components/panels/tasks/tasks-panel.js`
- **Purpose**: Task management and monitoring
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Task listing
  - Status monitoring
  - Task management
- **Dependencies**: TaskService, LogManager
- **Migration Complexity**: Medium

#### 6. Settings Panel
- **File**: `components/panels/settings/settings-panel.js`
- **Purpose**: Extension configuration
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Settings management
  - Configuration UI
  - Data export/import
- **Dependencies**: StorageService, LogManager
- **Migration Complexity**: Medium

## Utility Layer Inventory

### Core Utilities

#### 1. Log Manager
- **File**: `utils/log-manager.js`
- **Purpose**: Centralized logging system
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Multi-level logging
  - Context-aware logging
  - Log persistence
  - Performance monitoring
- **Dependencies**: Chrome storage (optional)
- **Migration Complexity**: Low (foundation utility)

#### 2. Resource Tracker
- **File**: `utils/resource-tracker.js`
- **Purpose**: Resource cleanup and management
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Event listener tracking
  - Timeout/interval tracking
  - DOM element tracking
  - Automatic cleanup
- **Dependencies**: None
- **Migration Complexity**: Low (foundation utility)

#### 3. Memory Monitor
- **File**: `utils/memory-monitor.js`
- **Purpose**: Memory usage monitoring
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Memory pressure detection
  - Performance monitoring
  - Cleanup triggers
- **Dependencies**: Performance API
- **Migration Complexity**: Low

#### 4. Config Manager
- **File**: `utils/config-manager.js`
- **Purpose**: Configuration management
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Configuration loading
  - Environment detection
  - Default values
  - Validation
- **Dependencies**: None
- **Migration Complexity**: Low

## Core System Components

### 1. Dependency Container
- **File**: `core/dependency-container.js`
- **Purpose**: Service dependency injection
- **Current Context**: All contexts
- **Migration Target**: All contexts
- **Key Features**:
  - Service registration
  - Dependency resolution
  - Lifecycle management
- **Dependencies**: None
- **Migration Complexity**: Low

### 2. Component Registry
- **File**: `core/component-registry.js`
- **Purpose**: Component registration and management
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - Component registration
  - Initialization management
  - Validation
- **Dependencies**: DependencyContainer
- **Migration Complexity**: Low

### 3. Component System
- **File**: `core/component-system.js`
- **Purpose**: Component system orchestration
- **Current Context**: Extension page context
- **Migration Target**: Extension pages
- **Key Features**:
  - System initialization
  - Component lifecycle
  - Status management
- **Dependencies**: ComponentRegistry, LogManager
- **Migration Complexity**: Low

## Background Script Components

### 1. Background Service
- **File**: `background/background-service.js`
- **Purpose**: Main background script service
- **Current Context**: Background script (Service Worker)
- **Migration Target**: Background script (Service Worker) - ENHANCE
- **Key Features**:
  - Message handling
  - Service coordination
  - Event management
- **Dependencies**: All background services
- **Migration Complexity**: Medium (needs enhancement for new architecture)

## Interface Components

### 1. Dashboard
- **File**: `dashboard/dashboard.js`
- **Purpose**: Main dashboard interface
- **Current Context**: Web page context (HTTP served)
- **Migration Target**: Extension page context (new tab)
- **Key Features**:
  - Component initialization
  - Navigation setup
  - Event handling
- **Dependencies**: ComponentSystem, LogManager
- **Migration Complexity**: High (context change)

### 2. Popup
- **File**: `popup/popup.js`
- **Purpose**: Extension popup interface
- **Current Context**: Extension page context
- **Migration Target**: Extension page context (enhance)
- **Key Features**:
  - Quick access interface
  - Status display
  - Basic controls
- **Dependencies**: Various services
- **Migration Complexity**: Medium

## Content Scripts

### 1. Content Script
- **File**: `content/content.js`
- **Purpose**: Page content interaction
- **Current Context**: Web page context
- **Migration Target**: Web page context (enhance)
- **Key Features**:
  - Page data extraction
  - DOM monitoring
  - Communication with extension
- **Dependencies**: Chrome runtime APIs
- **Migration Complexity**: Low

## Migration Priority Matrix

### High Priority (Critical for Backend Integration)
1. **ApiService** - Backend communication
2. **StatusService** - Health monitoring (adapt for BackendHealthMonitor)
3. **MessageService** - Cross-context communication
4. **Dashboard** - Context migration

### Medium Priority (Core Functionality)
1. **StorageService** - Data persistence
2. **TaskService** - Background processing
3. **NotificationService** - User alerts
4. **Panel Components** - UI functionality

### Low Priority (Foundation/Utilities)
1. **BaseService** - Foundation class
2. **LogManager** - Logging infrastructure
3. **ResourceTracker** - Resource management
4. **ConfigManager** - Configuration
5. **Core Components** - System infrastructure

## Next Steps

1. **Detailed Service Analysis**: Deep dive into each service's implementation
2. **Dependency Mapping**: Create visual dependency graphs
3. **Breaking Change Analysis**: Identify migration impacts
4. **Reusable Code Identification**: Mark code for adaptation vs. rewriting
5. **Testing Strategy**: Plan test coverage for each phase

---

*This inventory will be updated as we progress through the discovery phase.* 