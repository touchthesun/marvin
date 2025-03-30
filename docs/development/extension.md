# Marvin Browser Extension Technical Design Document

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [UI Design Strategy](#ui-design-strategy)
4. [Component Structure](#component-structure)
5. [Manifest V3 Considerations](#manifest-v3-considerations)
6. [Implementation Plan](#implementation-plan)
7. [API Integration](#api-integration)
8. [State Management](#state-management)
9. [Testing Strategy](#testing-strategy)
10. [Best Practices](#best-practices)
11. [Future Extensions](#future-extensions)

## Introduction

Marvin is an intelligent research assistant that helps users organize and leverage their browsing history and research materials. This document outlines the technical design for implementing the browser extension component of Marvin, focusing on a hybrid UI approach that balances quick access with comprehensive functionality.

### Key Requirements

1. **Content Capture**: Extract and analyze web content from active tabs, bookmarks, and browsing history
2. **Knowledge Graph Integration**: Connect with backend services for content analysis and relationship mapping
3. **LLM Agent Interface**: Provide an interface for AI-assisted insights and queries
4. **Browser Integration**: Sync browser state, including tabs, windows, and bookmarks
5. **Privacy-First Design**: Support local-first architecture with opt-in cloud integration

## Architecture Overview

The extension follows a layered architecture with clear separation of concerns:

### Service Worker (Background)
- API client for backend communication
- Authentication management
- Browser state tracking
- Content capture coordination
- Task execution monitoring

### Content Scripts
- Page content extraction
- Metadata collection
- UI overlays and notifications
- Network status monitoring
- DOM event handling

### UI Components
- Popup for quick actions
- Full-page dashboard for complex interactions
- Options page for configuration
- Possible sidebar for contextual information

### Communication Patterns
- Message passing between components
- Event-based interactions
- Async request/response handling

## UI Design Strategy

### Hybrid Approach

We will implement a hybrid UI approach that combines:

1. **Compact Popup**
   - Quick capture controls
   - Status indicators
   - Recent activity summary
   - Link to full dashboard

2. **Full-Page Dashboard**
   - Multi-panel layout
   - Comprehensive feature access
   - Knowledge visualization
   - Chat interface for LLM agent
   - Batch operations management

3. **Options Page**
   - Configuration settings
   - Authentication management
   - Data management controls

### Popup Design

The popup provides quick access to core functionality:

- Size: ~400x600px (responsive)
- Components:
  - Status bar (online/offline, auth status)
  - Capture current page button
  - Recent captures list (scrollable)
  - Quick tools section
  - "Open Dashboard" button (prominent)

### Dashboard Design

The full-page dashboard is the central hub for advanced functionality:

- Layout: 
  - Left sidebar for navigation
  - Main content area (context-dependent)
  - Optional right sidebar for details/context

- Main Sections:
  - Home/Overview: Recent activity, stats, knowledge graph preview
  - Capture: Batch capture UI for tabs, bookmarks, history
  - Knowledge: Browse and search captured content
  - Research Assistant: LLM chat interface with context support
  - Settings: Advanced configuration

### Options Page

The options page provides detailed configuration:

- Authentication settings
- API configuration
- Capture settings (automatic vs. manual)
- Privacy controls
- Data management

## Component Structure

### Directory Structure

```
marvin-extension/
├── manifest.json
├── background/
│   ├── background.js         # Service worker entry point
│   ├── api-client.js         # API communication
│   ├── auth-manager.js       # Authentication handling
│   ├── capture-manager.js    # Content capture logic
│   └── state-manager.js      # Browser state tracking
├── content/
│   ├── content.js            # Content script entry point
│   ├── extraction.js         # Content extraction logic
│   ├── overlay.js            # UI overlay components
│   └── network-monitor.js    # Network status monitoring
├── popup/
│   ├── popup.html            # Popup HTML
│   ├── popup.js              # Popup logic
│   └── popup.css             # Popup styles
├── dashboard/
│   ├── dashboard.html        # Dashboard HTML
│   ├── dashboard.js          # Dashboard main logic
│   ├── components/           # Dashboard UI components
│   │   ├── navigation.js     # Nav sidebar component
│   │   ├── capture-panel.js  # Batch capture UI
│   │   ├── knowledge-panel.js # Knowledge browsing UI
│   │   ├── chat-panel.js     # LLM chat interface
│   │   └── ...
│   ├── services/             # Dashboard services
│   │   ├── api-service.js    # API communication
│   │   ├── state-service.js  # State management
│   │   └── ...
│   └── dashboard.css         # Dashboard styles
├── options/
│   ├── options.html          # Options page HTML
│   ├── options.js            # Options logic
│   └── options.css           # Options styles
├── shared/
│   ├── styles/               # Shared styles
│   ├── utils/                # Shared utilities
│   └── components/           # Shared UI components
└── icons/                    # Extension icons
```

### Key Components

#### Background Service Worker

The service worker is the central coordinator for the extension:

- **API Client**: Manages communication with backend services
- **Auth Manager**: Handles authentication and token management
- **Capture Manager**: Coordinates content extraction and processing
- **State Manager**: Tracks and syncs browser state

#### Content Scripts

Content scripts handle page interaction:

- **Content Extractor**: Extracts page content and metadata
- **UI Overlay**: Provides status indicators and user feedback
- **Network Monitor**: Reports network status to service worker

#### Dashboard Components

The dashboard consists of several specialized components:

- **Navigation**: Sidebar navigation with section links
- **Capture Panel**: UI for batch capture operations
- **Knowledge Browser**: Interface for exploring captured content
- **Chat Interface**: LLM agent interaction panel
- **Visualization**: Knowledge graph visualization

## Manifest V3 Considerations

Manifest V3 introduces several important constraints that shape our implementation:

### Service Worker Limitations

- **No DOM Access**: Service workers cannot access window, document, or DOM APIs
- **Event-Based Lifecycle**: Service workers can be terminated when inactive
- **Limited Resources**: Memory and CPU usage is constrained

### Adaptation Strategies

1. **Content Script Delegation**
   - Delegate DOM operations to content scripts
   - Use message passing for communication
   - Content scripts handle UI overlays and direct page interactions

2. **Message-Based Architecture**
   - Replace direct function calls with message passing
   - Implement robust message handling patterns
   - Use return values for async operations

3. **State Persistence**
   - Use chrome.storage for persistent state
   - Implement recovery mechanisms for service worker restarts
   - Cache important data for quick restoration

4. **Network Status Handling**
   - Monitor network status in content scripts
   - Report changes to service worker via messages
   - Implement offline queuing for operations

### Code Patterns

```javascript
// In content script (with DOM access)
window.addEventListener('online', () => {
  chrome.runtime.sendMessage({ 
    action: 'networkStatusChange', 
    isOnline: true 
  });
});

// In service worker (no DOM access)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'networkStatusChange') {
    updateNetworkStatus(message.isOnline);
  }
});
```

## Implementation Plan

The implementation is divided into phases to enable incremental development and testing:

### Phase 1: Foundation & Core Capture (2 weeks)

1. **Week 1: Basic Structure & Authentication**
   - Complete extension scaffolding
   - Implement authentication flow
   - Set up API client structure
   - Create basic popup UI

2. **Week 2: Page Capture & Content Scripts**
   - Implement content extraction
   - Create capture flow
   - Add status overlays
   - Develop offline handling

### Phase 2: Dashboard Development (3 weeks)

1. **Week 3: Dashboard Framework**
   - Create dashboard shell
   - Implement navigation
   - Design component structure
   - Connect to background services

2. **Week 4: Batch Capture UI**
   - Develop tab listing and selection
   - Implement bookmark integration
   - Create batch operation controls
   - Add progress tracking

3. **Week 5: Knowledge Browser**
   - Create content browsing interface
   - Implement search functionality
   - Develop filtering controls
   - Add relationship visualization

### Phase 3: Advanced Features (3 weeks)

1. **Week 6: LLM Integration**
   - Implement chat interface
   - Create context management
   - Add query handling
   - Develop response rendering

2. **Week 7: Sidebar & Contextual Features**
   - Design and implement optional sidebar
   - Add contextual content recommendations
   - Create smart capture suggestions
   - Implement keyboard shortcuts

3. **Week 8: Polish & Performance**
   - Optimize performance
   - Enhance error handling
   - Improve visual design
   - Add animations and transitions

### Testing Milestones

- **T1**: Basic authentication and capture (end of Week 2)
- **T2**: Dashboard functionality (end of Week 5)
- **T3**: Complete feature set (end of Week 8)

## API Integration

The extension will integrate with several API endpoints:

### Core Endpoints

1. **Authentication**
   - `/api/v1/auth/validate`: Validate authentication token
   - `/api/v1/auth/providers`: Manage provider credentials

2. **Content Capture**
   - `/api/v1/pages/`: Submit individual pages
   - `/api/v1/pages/batch`: Submit multiple pages
   - `/api/v1/analysis/analyze`: Submit URLs for analysis

3. **Knowledge Graph**
   - `/api/v1/graph/related/{url}`: Get related content
   - `/api/v1/graph/search`: Search knowledge graph

4. **Browser State**
   - `/api/v1/browser/sync`: Sync browser state

5. **LLM Agent**
   - `/api/v1/agent/query`: Submit questions to LLM agent
   - `/api/v1/agent/status/{task_id}`: Check task status

### Integration Patterns

1. **Authentication Flow**
   - Token-based authentication
   - Automatic token refresh
   - Session persistence

2. **Request/Response Handling**
   - Standard error handling
   - Retry mechanisms
   - Response normalization

3. **Offline Support**
   - Request queuing
   - Batch synchronization
   - Conflict resolution

## State Management

The extension requires robust state management across components:

### State Categories

1. **Authentication State**
   - Current authentication status
   - Token information
   - Provider credentials

2. **Capture State**
   - Capture history
   - Pending captures
   - Processing status

3. **Browser State**
   - Tab information
   - Window structure
   - Bookmark data

4. **UI State**
   - Current view
   - Selected items
   - Form values

### Storage Strategy

1. **chrome.storage.local**
   - Authentication tokens
   - Capture history
   - User preferences
   - Offline queue

2. **In-Memory State**
   - Current UI state
   - Temporary data
   - Session-specific information

3. **Background State**
   - Active operations
   - Service status
   - Runtime configuration

### State Synchronization

1. **Component Communication**
   - Message-based state updates
   - Event listeners for changes
   - Polling for long-running operations

2. **Persistence Patterns**
   - Debounced storage updates
   - Atomic transactions where possible
   - Version tracking for conflicts

## Testing Strategy

### Testing Levels

1. **Unit Testing**
   - Background service functions
   - UI component rendering
   - Utility functions

2. **Integration Testing**
   - Message passing between components
   - API client and backend communication
   - Authentication flow

3. **End-to-End Testing**
   - Complete user workflows
   - Browser integration
   - Extension lifecycle

### Testing Tools

1. **Jest**: For unit and integration tests
2. **Puppeteer**: For browser automation and E2E tests
3. **Mock Service Worker**: For API mocking

### Test Environments

1. **Development**: Local testing with mock API
2. **Staging**: Testing against staging API environment
3. **Production**: Verification in production environment

## Best Practices

### Code Organization

1. **Separation of Concerns**
   - Clear component boundaries
   - Single responsibility principle
   - Interface-based design

2. **Error Handling**
   - Comprehensive error catching
   - User-friendly error messages
   - Automatic recovery where possible

3. **Performance**
   - Lazy loading of heavy components
   - Efficient DOM operations
   - Resource cleanup

### Browser Extension Guidelines

1. **Permission Usage**
   - Request only necessary permissions
   - Explain permission requirements to users
   - Graceful degradation when permissions are denied

2. **Resource Management**
   - Efficient service worker usage
   - Minimize memory footprint
   - Clean up unused resources

3. **Cross-Browser Compatibility**
   - Follow WebExtensions API standards
   - Avoid browser-specific features
   - Test across multiple browsers

### Security Considerations

1. **Data Protection**
   - Secure storage of sensitive information
   - Proper authentication token handling
   - Content security policy implementation

2. **API Security**
   - HTTPS for all communication
   - Token validation
   - Rate limiting compliance

3. **User Privacy**
   - Clear data usage policies
   - User control over captured data
   - Compliance with privacy regulations

## Future Extensions

Potential future enhancements include:

1. **Advanced Visualizations**
   - Interactive knowledge graph
   - Semantic clustering
   - Timeline views

2. **AI Enhancements**
   - Proactive research suggestions
   - Personalized content organization
   - Automated summarization

3. **Collaboration Features**
   - Shared research spaces
   - Collaborative annotation
   - Team knowledge base

4. **Integration Ecosystem**
   - Note-taking app integrations
   - Document management connections
   - Academic research tools

---

This technical design document outlines the approach, architecture, and implementation plan for the Marvin browser extension. It provides a roadmap for development while highlighting important considerations related to Manifest V3 compatibility, user experience, and extension best practices.

By following this hybrid UI approach and phased implementation plan, we can deliver a powerful research assistant that balances quick access with comprehensive functionality, all while maintaining compatibility with modern browser extension requirements.
