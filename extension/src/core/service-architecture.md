# Manifest V3 Service Architecture

## Overview

This document outlines the proper service architecture for Chrome extensions using Manifest V3.

## Architecture Components

### 1. Service Worker (Background Script)
- **Location**: `background/background.js`
- **Context**: Service worker context
- **Capabilities**: 
  - Long-running processes
  - Browser API access (tabs, storage, etc.)
  - Network requests
  - Cross-tab communication
- **Responsibilities**:
  - Handle extension lifecycle
  - Manage browser state
  - Process background tasks
  - Coordinate between extension pages

### 2. Extension Pages
- **Locations**: 
  - `popup/popup.html` - Quick access interface
  - `dashboard/dashboard.html` - Full dashboard (new tab)
  - `options/options.html` - Settings page
- **Context**: Extension page context
- **Capabilities**:
  - Chrome extension APIs
  - DOM manipulation
  - Message passing to service worker
- **Responsibilities**:
  - UI rendering
  - User interactions
  - Local state management
  - Communication with service worker

### 3. Content Scripts
- **Location**: `content/content.js`
- **Context**: Web page context
- **Capabilities**:
  - DOM access
  - Page-specific data extraction
  - Message passing to extension
- **Responsibilities**:
  - Extract page data
  - Inject UI elements
  - Monitor page changes

## Communication Patterns

### Extension Page ↔ Service Worker
```javascript
// Extension page sends message
chrome.runtime.sendMessage({
  action: 'capturePage',
  data: { url: 'https://example.com' }
}, response => {
  console.log('Response:', response);
});

// Service worker receives message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capturePage') {
    // Handle capture
    sendResponse({ success: true });
  }
});
```

### Content Script ↔ Extension Page
```javascript
// Content script sends message
chrome.runtime.sendMessage({
  action: 'pageDataExtracted',
  data: { title: 'Page Title', content: '...' }
});

// Extension page receives message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pageDataExtracted') {
    // Update UI with extracted data
  }
});
```

## Service Organization

### Background Services (Service Worker)
- **StorageService**: Manage extension storage
- **ApiService**: Handle API communication
- **TaskService**: Manage background tasks
- **NotificationService**: Handle notifications

### Extension Page Services
- **UIService**: Manage UI state and interactions
- **ComponentService**: Manage component lifecycle
- **LocalStorageService**: Handle local page storage

### Shared Services
- **LogService**: Centralized logging
- **ConfigService**: Configuration management

## Best Practices

1. **Keep Service Worker Light**: Only essential background tasks
2. **Use Message Passing**: Don't share objects between contexts
3. **Handle Errors Gracefully**: Always check for API availability
4. **Minimize Cross-Context Communication**: Batch operations when possible
5. **Use Proper Lifecycle Management**: Clean up resources properly

## Migration Strategy

1. **Identify Context-Specific Code**: Separate background vs UI logic
2. **Implement Message Passing**: Replace direct service calls with messages
3. **Update Service Initialization**: Ensure services initialize in correct context
4. **Test Communication**: Verify all message passing works correctly
5. **Optimize Performance**: Minimize unnecessary cross-context communication 