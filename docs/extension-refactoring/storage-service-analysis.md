# StorageService Deep Dive Analysis

## Overview

The StorageService is a core infrastructure component responsible for all browser storage operations, settings management, and local data caching for the Marvin extension. It is currently designed to run in the extension page context, but the new architecture will require it to be adapted for the background script (service worker) context.

## Current Implementation Analysis

### Core Architecture

1. Service Foundation
Base Class: Extends BaseService for lifecycle and resource management.
Context: Runs in extension page context, assumes persistent state.
Purpose: Centralized storage, settings, and cache management.
Size: 1000+ lines, highly modular and feature-rich.

2. Key Features
Settings Management
Default settings with deep merging and validation.
Methods: getSettings, updateSettings, resetSettings.
Listens for storage changes and invalidates cache as needed.

Capture History Management
Methods: getCaptureHistory, updateCaptureHistory.
Deduplication, sorting, and limiting of history entries.
Cache with TTL for performance.

Stats Management
Methods: getStats, updateStats, incrementStatsCounter.
Tracks captures, relationships, queries, etc.
Cache with TTL.

Data Export/Import
Methods: exportData, importData.
Handles merging or overwriting of settings, history, and stats.
Redacts sensitive data (e.g., API keys) on export.

Active State Management
Methods: saveActiveState, getActiveState.
Remembers last active panel and tab for UI restoration.

Cache Management
In-memory cache for settings, history, and stats with TTL.
Automatic invalidation on storage changes.
Notification Integration
Optionally uses a notification service for user feedback.
Event Listener Management
Uses resource tracker for Chrome storage event listeners.
Error Handling
Extensive try/catch blocks, logging, and fallback to defaults.

## Critical Methods

getSettings(skipInitializationCheck = false)
- Loads settings from Chrome storage, merges with defaults.
- Uses cache if valid.
- Returns defaults on error.

updateSettings(settings)
- Updates only provided sections.
- Notifies background script of changes.
- Invalidates cache.

getCaptureHistory(limit = 0)
- Loads and sorts history from storage.
- Deduplicates by URL.
- Uses cache if valid.

clearLocalData(keepSettings = true)
- Removes all or selected storage keys.
- Resets stats and caches.
- Notifies background script and user.

exportData(dataTypes)
- Exports selected data types, redacts sensitive info.
- importData(importData, overwrite = false)
- Imports and merges or overwrites data.
- Notifies background script and user.

## Major Refactoring Challenges

1. Context Adaptation
Current: Assumes extension page context, persistent state.
Target: Must work in background script (service worker) context.
Implications: Service worker can be terminated/restarted, so must ensure all state is persisted in Chrome storage.

2. Event Listener Management
Current: Uses resource tracker for Chrome storage listeners.
Target: Must ensure listeners are re-registered on service worker restart.

3. Notification Service
Current: Optionally uses notification service for user feedback.
Target: Notification logic may need to be adapted for background context.

4. Cache Management
Current: In-memory cache for performance.
Target: Cache will be lost on service worker restart; must gracefully handle cache misses and rehydrate from storage.

5. Message Passing
Current: Notifies background script of changes via chrome.runtime.sendMessage.
Target: In background context, may need to notify UI pages instead.

6. Error Handling
Current: Extensive error handling and fallback to defaults.
Target: Must ensure errors are surfaced to the correct context (UI, background, etc.).

## Migration Strategy

Phase 1: Context Adaptation
Refactor initialization and event listener setup for service worker context.
Ensure all state is persisted in Chrome storage.

Phase 2: Message Passing Enhancement
Adapt notification logic to send messages to UI pages from background.
Ensure settings and data changes are propagated to all relevant contexts.

Phase 3: Cache Management
Accept that in-memory cache is ephemeral in service worker.
Always rehydrate from storage on startup.

Phase 4: Testing & Diagnostics
Add tests for service worker restart and state restoration.
Ensure all storage operations are robust to context loss.

## Reusable Code Identification

### High-Value Components (Keep & Adapt)
Settings, history, and stats management logic.
Data export/import logic.
Error handling and logging.

### Components Needing Adaptation
Event listener setup and teardown.
Notification logic.
Message passing for data change events.

### Components to Remove/Replace
Assumptions of persistent in-memory cache.
Any direct UI update logic.

## Migration Complexity Assessment

### Medium Complexity Areas
Context adaptation for service worker.
Event listener management.
Notification and message passing logic.

### Low Complexity Areas
Core storage logic (get/set/merge).
Data export/import.
Error handling.

## Testing Strategy
Unit Tests: Storage operations, cache invalidation, error handling.
Integration Tests: Service worker restart, event listener re-registration.
E2E Tests: Data persistence across extension reloads, notification delivery.

Success Criteria
[ ] StorageService works reliably in background script context.
[ ] All data persists across service worker restarts.
[ ] Notifications and data change events are delivered to UI.
[ ] No data loss or corruption on extension reload.