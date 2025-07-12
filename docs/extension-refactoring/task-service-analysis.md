# Task Service Analysis

## Overview

**File:** `extension/src/services/task-service.js`  
**Purpose:**  
Manages background tasks, polling, and status updates for the Marvin extension. Handles task creation, monitoring, cancellation, retry logic, and progress tracking. Integrates with backend API and notification services, with robust error handling and state persistence.

---

## Core Responsibilities

- **Task Lifecycle Management:**  
  Creates, monitors, cancels, and retries tasks with comprehensive state tracking.
- **Background Polling:**  
  Periodically polls for task updates from background script or API, with fallback mechanisms.
- **Progress Monitoring:**  
  Tracks task progress and provides real-time updates to UI components and listeners.
- **State Persistence:**  
  Persists task state to storage for recovery across extension sessions.
- **Error Handling & Recovery:**  
  Implements circuit breaker, retry logic with exponential backoff, and robust error reporting.
- **Resource Management:**  
  Tracks and cleans up tasks, timeouts, message ports, and WebSocket connections.

---

## Key Features & Methods

- **Initialization & Cleanup:**
  - `_performInitialization()`: Sets up logger, resolves dependencies, loads persisted state, and starts polling.
  - `_performCleanup()`: Stops polling, clears task tracking, and resets all state.
- **Task Operations:**
  - `createTask(taskData)`: Creates new tasks via background script or API.
  - `cancelTask(taskId)`: Cancels active tasks.
  - `retryTask(taskId)`: Retries failed tasks.
  - `getTaskById(taskId)`: Retrieves specific task by ID.
  - `getActiveTasks()`, `getCompletedTasks()`: Returns task lists.
- **Progress Monitoring:**
  - `monitorTaskProgress(taskId, progressCallback)`: Monitors task until completion with progress updates.
  - `createCaptureTask(captureData, progressCallback)`: Specialized capture task creation.
- **Polling & Updates:**
  - `_pollTasks()`: Periodic polling for task updates.
  - `_refreshTasks()`: Refreshes tasks from background script or API.
  - `_processTaskUpdates(tasks)`: Processes and notifies listeners of task changes.
- **State Management:**
  - `_loadPersistedState()`, `_persistState()`: State persistence and recovery.
  - `_validateState()`, `_validateTaskState()`: State validation.
- **Error Handling:**
  - Circuit breaker for repeated failures.
  - Retry logic with exponential backoff and jitter.
  - Custom `TaskError` class with error codes.

---

## Dependencies

- **BaseService:**  
  Provides lifecycle, memory, and resource management.
- **LogManager:**  
  For logging and diagnostics.
- **API Service:**  
  For backend communication (required).
- **Notification Service:**  
  For user notifications on task events (optional).
- **Storage Service:**  
  For state persistence (optional).
- **ResourceTracker:**  
  For timeout, interval, message port, and WebSocket cleanup.

---

## Migration Considerations

### 1. Context Adaptation

- **Current Context:**  
  Runs in extension page context (dashboard, panels).
- **Migration Target:**  
  Should be adapted for Manifest V3, with core task management in background script and UI updates via message passing.
- **Key Changes Needed:**
  - Move task polling and core management to background script for persistent operation.
  - Use message passing to relay task updates to UI contexts (dashboard, popup).
  - Decouple direct API calls from UI context; use background script as intermediary.

### 2. Error Handling & Resilience

- **Current:**  
  Implements circuit breaker, retry logic, and comprehensive error handling.
- **Migration:**
  - Maintain robust error handling, ensure errors from background/backend are surfaced via message responses.
  - Integrate with global diagnostics and status panels.

### 3. Resource & Memory Management

- **Current:**  
  Uses resource tracker for timeouts, intervals, message ports, and WebSockets.
- **Migration:**
  - Ensure all resources are cleaned up on panel unload or memory pressure.
  - Test for leaks in ephemeral extension page contexts.

### 4. Testing

- **Current:**  
  No explicit test coverage noted.
- **Migration:**
  - Add Jest unit tests for task lifecycle, polling, and error scenarios.
  - Add integration tests for message-passing and UI updates.

---

## Reusability & Refactoring

- **Reusable As-Is:**
  - Task lifecycle management, polling, and error handling logic are modular and can be reused with minor adaptation.
  - Resource and state management patterns are sound.
- **Needs Adaptation:**
  - Move core task management to background script; UI updates via message passing.
  - Decouple direct API calls from UI context.
- **Potential Enhancements:**
  - Modularize task types for easier testing and extension.
  - Add more granular error and progress reporting for diagnostics.
  - Support richer task management features (batch operations, task dependencies).

---

## Migration Complexity

- **Overall:** High

**Risks:**
- Data flow changes (must adapt to message-passing for task operations)
- Ensuring robust cleanup in ephemeral extension page contexts
- Maintaining real-time task monitoring and progress reliability

---

## Migration Tasks

1. **Move task management to background:**  
   Refactor core task creation, polling, and management logic to run in background script.
2. **Implement message passing for task operations:**  
   Relay task creation, updates, and progress to UI contexts via message passing.
3. **Adapt resource management:**  
   Ensure all timeouts, intervals, and connections are cleaned up on unload and memory pressure.
4. **Enhance error handling:**  
   Integrate with global diagnostics and status panels.
5. **Add/Update tests:**  
   Unit and integration tests for all task operations and error scenarios.
6. **Document usage:**  
   Update documentation for new data flow and error handling patterns.

---

## Summary Table

| Area                | Current State         | Migration Target         | Complexity | Notes                                |
|---------------------|----------------------|-------------------------|------------|--------------------------------------|
| Data Flow           | Direct API calls     | Message passing for UI  | High       | Must decouple from direct API access |
| Error Handling      | Good                 | Maintain/enhance        | Medium     | Integrate with diagnostics panel     |
| Resource Management | Good                 | Maintain/enhance        | Medium     | Test cleanup on panel unload         |
| Testing             | Minimal              | Add Jest/unit/integration| Medium    | Focus on task lifecycle and errors   |

---

## References

See also:
- `codebase-inventory.md` (for service dependencies and migration matrix)
- `background-worker-refactoring-guide.md` (for message-passing and error handling patterns)
- `notification-service-analysis.md` (for notification integration)
- `analysis-service-analysis.md` (for task/analysis integration)

---

*This analysis will be updated as migration progresses and new requirements emerge.*
