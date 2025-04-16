# Marvin Browser Extension

## Technical Documentation

This document provides comprehensive technical documentation for the Marvin browser extension, designed for developers and open-source contributors to the project.

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Component Structure](#component-structure)
4. [Core Components](#core-components)
5. [UI Components](#ui-components)
6. [Services](#services)
7. [Utilities](#utilities)
8. [Data Flow](#data-flow)
9. [Manifest V3 Implementation](#manifest-v3-implementation)
10. [Development Guidelines](#development-guidelines)
11. [Testing](#testing)
12. [Future Enhancements](#future-enhancements)

## Introduction
 
Marvin is an intelligent research assistant that helps users organize and leverage their browsing history and research materials. Named after the character from "The Hitchhiker's Guide to the Galaxy," Marvin maintains a knowledge graph of browsing data while actively assisting users through both autonomous actions and direct queries.

### Core Principles

- **Privacy First**: All data storage and processing can run locally
- **Model Agnostic**: Support for both local and cloud-based LLM providers
- **Extensible**: Core architecture supports browser integration
- **Active Assistant**: Performs autonomous actions on user's behalf
- **Neo4j Backend**: Knowledge graph implemented in Neo4j

### Key Capabilities

1. **Knowledge Organization**
   - Automated context extraction from browsing data
   - Relationship discovery between content
   - Topic and concept mapping

2. **Autonomous Actions**
   - Related content discovery via web search
   - Tab context analysis and grouping
   - Bookmark relevance filtering
   - Research synthesis and summarization

3. **Interactive Features**
   - Natural language queries about stored knowledge
   - Visualization of knowledge relationships
   - Task status monitoring
   - Configuration of autonomous behaviors

## Architecture Overview

The extension follows a layered architecture with clear separation of concerns:

### Service Worker (Background)

The service worker acts as the central coordinator for the extension, managing:

- API communication
- Authentication
- Content capture
- Task execution
- State management

### Content Scripts

Content scripts run in the context of web pages to:

- Extract page content and metadata
- Handle DOM operations
- Monitor network status
- Provide UI overlays

### UI Components

The extension provides multiple user interfaces:

1. **Popup**: Quick access to core functionality
2. **Dashboard**: Full-featured control center
3. **Options Page**: Configuration settings

### Communication Patterns

Components communicate through:

- Message passing between contexts
- Event-based architecture
- Promise-based async operations

## Component Structure

The extension follows a modular directory structure:

```
extension
├── background
│   ├── analysis-queue.css
│   ├── analysis-queue.js
│   ├── api-client.js
│   ├── auth-manager.js
│   ├── background.js
│   ├── capture-manager.js
│   ├── progress-tracker.js
│   └── state-manager.js
├── content
│   ├── content.js
│   └── network-monitor.js
├── dashboard
│   ├── dashboard.css
│   ├── dashboard.html
│   ├── js
│   │   ├── components
│   │   │   ├── assistant-panel.js
│   │   │   ├── bookmarks-capture.js
│   │   │   ├── capture-panel.js
│   │   │   ├── capture-ui.js
│   │   │   ├── capture-utils.js
│   │   │   ├── graph-panel.js
│   │   │   ├── history-capture.js
│   │   │   ├── knowledge-panel.js
│   │   │   ├── navigation.js
│   │   │   ├── overview-panel.js
│   │   │   ├── settings-panel.js
│   │   │   ├── tabs-capture.js
│   │   │   └── tasks-panel.js
│   │   ├── dashboard.js
│   │   ├── services
│   │   │   ├── api-service.js
│   │   │   ├── notification-service.js
│   │   │   ├── status-service.js
│   │   │   ├── storage-service.js
│   │   │   └── task-service.js
│   │   └── utils
│   │       ├── constants.js
│   │       ├── formatting.js
│   │       └── ui-utils.js
│   └── services
│       ├── api-service.js
│       └── state-service.js
├── manifest.json
├── options
│   ├── options.css
│   ├── options.html
│   └── options.js
├── package-lock.json
├── package.json
├── popup
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
├── shared
│   ├── components
│   ├── constants.js
│   ├── styles
│   └── utils
│       ├── api.js
│       ├── capture.js
│       ├── log-manager.js
│       ├── progress-tracker.js
│       └── settings.js
└── webpack.config.js
```

## Core Components

### Background Service Worker

The background script (`background.js`) serves as the central coordinator for the extension. It initializes core services and handles message passing.

#### Key Responsibilities:

- Service initialization
- Message routing
- Task management
- Browser event handling

#### Initialization Flow:

```javascript
// Initialization sequence
async function initialize() {
  try {
    await authManager.initialize();
    await stateManager.initialize();
    
    // Load configuration from storage
    const config = await chrome.storage.local.get(['apiConfig', 'autoAnalyze', 'autoCapture']);
    
    // Update API base URL if configured
    if (config.apiConfig?.baseUrl) {
      apiClient.setBaseUrl(config.apiConfig.baseUrl);
    }
    
    // Check for any active trackers
    updateBadge();
    
    // Start badge update timer
    setInterval(updateBadge, 5000);
  } catch (error) {
    logger.error('Initialization error:', error);
  }
}
```

#### Message Handling:

The service worker uses a structured message handling approach:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return true to indicate we'll send a response asynchronously
  const isAsync = true;
  
  // Handle various message types with a switch statement
  switch (message.action) {
    case 'captureUrl':
      (async () => {
        try {
          const response = await captureUrl(/* params */);
          sendResponse({ success: true, ...response });
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      })();
      return isAsync;
      
    // Additional message handlers...
  }
});
```

### Analysis Queue

The analysis queue (`analysis-queue.js`) manages asynchronous analysis tasks:

- Task prioritization
- Progress tracking
- Status updates
- Retry handling

It implements a producer-consumer pattern where tasks are queued and processed based on available resources.

### State Manager

The state manager (`state-manager.js`) tracks and synchronizes browser state:

- Tab information
- Window structure
- Bookmark data
- User preferences

It handles events from the browser API and maintains a consistent state model.

### Auth Manager

The auth manager (`auth-manager.js`) handles authentication flow:

- Token management
- Session persistence
- Provider integration
- Security enforcement

## UI Components

### Dashboard Components

The dashboard is built with a modular component architecture:

#### Navigation Component

The navigation component (`navigation.js`) manages panel navigation and tab switching:

```javascript
async function handleNavigation(targetPanel, navItems, contentPanels, clickedItem) {
  // Update navigation highlighting
  navItems.forEach(navItem => navItem.classList.remove('active'));
  clickedItem.classList.add('active');
  
  // Show corresponding panel
  let panelFound = false;
  contentPanels.forEach(panel => {
    if (panel.id === `${targetPanel}-panel`) {
      panel.classList.add('active');
      panelFound = true;
    } else {
      panel.classList.remove('active');
    }
  });
  
  // Initialize panel if needed
  await initializeTargetPanel(targetPanel);
  
  // Save last active panel to storage
  try {
    chrome.storage.local.set({ lastActivePanel: targetPanel });
  } catch (storageError) {
    logger.warn('Error saving last active panel:', storageError);
  }
}
```

#### Panel Components

The dashboard includes specialized panel components:

1. **Overview Panel** (`overview-panel.js`)
   - Displays summary statistics
   - Shows recent activity
   - Provides quick access to key features

2. **Capture Panel** (`capture-panel.js`)
   - Manages tab, bookmark, and history capture
   - Handles batch operations
   - Tracks capture status

3. **Knowledge Panel** (`knowledge-panel.js`)
   - Displays captured content
   - Provides search and filtering
   - Shows relationships between items

4. **Assistant Panel** (`assistant-panel.js`)
   - Provides chat interface
   - Manages context selection
   - Handles query submission

5. **Tasks Panel** (`tasks-panel.js`)
   - Displays active and completed tasks
   - Allows task management
   - Shows progress information

6. **Settings Panel** (`settings-panel.js`)
   - Provides configuration options
   - Manages API settings
   - Controls capture and analysis behavior

### Capture UI Components

The capture functionality is split into specialized components:

1. **Tabs Capture** (`tabs-capture.js`)
   - Lists open tabs
   - Handles tab selection
   - Manages tab extraction

2. **Bookmarks Capture** (`bookmarks-capture.js`)
   - Lists bookmarks
   - Provides folder-based filtering
   - Handles bookmark selection

3. **History Capture** (`history-capture.js`)
   - Lists browsing history
   - Provides time-based filtering
   - Handles history item selection

### Graph Panel

The graph panel (`graph-panel.js`) provides visualization of the knowledge graph:

- D3.js-based visualization
- Interactive node display
- Relationship visualization
- Domain-based clustering

## Services

### API Service

The API service (`api-service.js`) manages communication with the backend:

```javascript
export async function fetchAPI(endpoint, options = {}) {
  try {
    // Get API base URL from storage
    const data = await chrome.storage.local.get('apiConfig');
    const baseURL = data.apiConfig?.baseURL || 'http://localhost:8000';
    
    // Ensure endpoint starts with /
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // Set default headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    
    // Send request
    logger.log('debug', `API Request: ${formattedEndpoint}`, { method: options.method || 'GET' });
    
    const response = await fetch(`${baseURL}${formattedEndpoint}`, {
      ...options,
      headers
    });
    
    // Parse response
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
  } catch (error) {
    logger.log('error', `API Error: ${endpoint}`, { error: error.message });
    throw error;
  }
}
```

### Notification Service

The notification service (`notification-service.js`) manages UI notifications:

- Toast-style notifications
- Progress indicators
- Error messages
- Success confirmations

### Storage Service

The storage service (`storage-service.js`) provides a consistent interface for data persistence:

- Settings management
- Capture history tracking
- Statistics collection
- State persistence

### Task Service

The task service (`task-service.js`) coordinates background tasks:

- Task creation
- Status monitoring
- Progress updates
- Completion handling

## Utilities

### Capture Utilities

The capture utilities (`capture.js`) provide consistent capture functionality:

```javascript
async function captureUrl(url, options = {}) {
  // Validate URL
  if (!url) {
    logger.error('Capture failed: No URL provided');
    return {
      success: false,
      error: 'No URL provided'
    };
  }
  
  // Extract and set default options
  const { 
    context = 'active_tab', 
    tabId = null,
    windowId = null,
    title = null,
    content = null,
    metadata = null,
    browser_contexts = null,
    timeout = DEFAULT_TIMEOUT
  } = options;
  
  try {
    // Create consistent browser_contexts array
    const contexts = browser_contexts || [context];
    
    // Always use a structured message
    const message = {
      action: 'captureUrl',
      data: {
        url,
        context,
        tabId,
        windowId,
        title,
        content,
        metadata,
        browser_contexts: contexts
      }
    };
    
    // Send message to background script with timeout handling
    const response = await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
      )
    ]);
    
    // Additional processing...
    
    return result;
  } catch (error) {
    // Error handling...
  }
}
```

### Log Manager

The log manager (`log-manager.js`) provides consistent logging:

- Multiple logging levels
- Context preservation
- Storage persistence
- Log export functionality

### Progress Tracker

The progress tracker (`progress-tracker.js`) manages operation progress:

- Stage-based tracking
- Event-based notifications
- Persistent status
- Error handling

## Data Flow

### Capture Flow

1. User initiates capture (manual or automatic)
2. Content extraction is performed
3. Data is sent to backend API
4. Progress is tracked and reported
5. Results are stored and updated in UI

### Analysis Flow

1. Content is submitted for analysis
2. Task is queued and managed
3. Progress is monitored and reported
4. Results are retrieved upon completion
5. Knowledge graph is updated

### Query Flow

1. User submits a query
2. Context is collected
3. Query is sent to LLM service
4. Response is streamed back
5. Results are displayed and stored

## Manifest V3 Implementation

The extension is built using Manifest V3, which introduces several constraints:

### Service Worker Lifecycle

The service worker has a limited lifecycle:

- Can be terminated when inactive
- State must be persisted
- Must be reinitialized on wake

### Background-Content Communication

Communication is handled through message passing:

- Content script initiation
- Background script responses
- Async message handling

### Resource Management

Resource usage is optimized:

- Efficient DOM operations
- Careful memory management
- Proper cleanup

## Development Guidelines

### Code Style

The project follows consistent coding conventions:

- ES6+ JavaScript features
- Async/await for asynchronous operations
- Clear error handling
- Comprehensive logging

### Component Structure

New components should follow the established pattern:

1. Import dependencies
2. Set up logger
3. Define state variables
4. Implement initialization function
5. Implement core functionality
6. Implement utility functions
7. Export public interface

### Error Handling

Error handling follows a consistent approach:

```javascript
try {
  // Operation that might fail
} catch (error) {
  logger.error('Operation failed:', error);
  // Clean up resources
  // Notify user if appropriate
  // Fallback behavior if possible
}
```

### Performance Considerations

- Use debounce for frequent operations
- Batch DOM updates
- Implement caching where appropriate
- Clean up event listeners and resources

## Testing

### Testing Strategy

The project implements a multi-level testing approach:

1. **Unit Testing**
   - Service functions
   - Utility methods
   - UI component logic

2. **Integration Testing**
   - Message passing
   - Service interactions
   - UI component integration

3. **End-to-End Testing**
   - Complete workflows
   - Browser interaction
   - API integration

### Testing Tools

Recommended testing tools:

- Jest for unit testing
- Puppeteer for browser automation
- Mock Service Worker for API mocking

## Future Enhancements

Potential areas for further development:

1. **Enhanced Visualization**
   - Interactive knowledge graph
   - Temporal visualization
   - Relationship mapping

2. **Advanced AI Integration**
   - Proactive suggestions
   - Content summarization
   - Research assistance

3. **Collaboration Features**
   - Shared research spaces
   - Team knowledge base
   - Annotation sharing

4. **Mobile Integration**
   - Mobile browser support
   - Cross-device synchronization
   - Touch-optimized interfaces

5. **API Expansion**
   - Additional data sources
   - Enhanced analysis capabilities
   - Integration with external tools

---

This documentation provides an overview of the Marvin browser extension architecture, components, and development guidelines. For more detailed information about specific components, refer to the inline documentation in the source code.
