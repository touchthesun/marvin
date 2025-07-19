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

## Migration Plan

### Phase 1: Inventory & Documentation
- [ ] List all public methods, message protocols, and side effects in `TaskService`.
- [ ] Document expected behaviors and edge cases (expand this analysis as needed).

### Phase 2: Write/Expand Tests
- [ ] Add/expand Jest unit tests for:
  - Task creation, polling, progress, cancellation, retry, and error handling.
  - Resource cleanup (timers, intervals, ports, websockets).
  - Circuit breaker and retry logic.
- [ ] Add integration tests for message passing (background <-> UI).

### Phase 3: Refactor for Background Script
- [ ] Move core task management (polling, state, backend calls) to background script context.
- [ ] Decouple direct API calls from UI; use message passing for all UI <-> background interactions.
- [ ] Ensure all resource tracking and cleanup is robust in both background and UI contexts.

### Phase 4: Message Passing & UI Updates
- [ ] Implement message passing for:
  - Task creation, updates, progress, and completion notifications.
  - Error and status reporting to UI.
- [ ] Update UI components to listen for task updates via message service.

### Phase 5: Error Handling & Diagnostics
- [ ] Maintain and enhance circuit breaker, retry, and error reporting.
- [ ] Integrate with diagnostics/status panels for visibility.

### Phase 6: Testing & Validation
- [ ] Run all unit and integration tests.
- [ ] Add regression tests for any bugs found during migration.
- [ ] Validate with E2E flows (user triggers task, sees progress, gets notified on completion/failure).

### Phase 7: Documentation & Knowledge Transfer
- [ ] Update this analysis and migration guides with lessons learned and new patterns.
- [ ] Document new message protocols and data flows.

---

This phased migration plan is designed to ensure a robust, test-driven, and maintainable transition of TaskService to the new Manifest V3 architecture, with a focus on backend integration, reliability, and developer clarity.

## Public Method Inventory

Below is an inventory of all public methods in `TaskService` as of this migration phase, with a brief description of each method's current responsibility:

| Method Name                | Description / Responsibility                                                      |
|---------------------------|----------------------------------------------------------------------------------|
| constructor(options)       | Initializes TaskService with configuration, state, dependencies, and logger.      |
| createTask(taskData)       | Creates a new task via background script or API; adds to active tasks and notifies listeners. |
| cancelTask(taskId)         | Cancels an active task via background script or API; refreshes task lists.        |
| retryTask(taskId)          | Retries a failed task via background script or API; refreshes task lists.         |
| getTaskById(taskId)        | Retrieves a specific task by ID from active or completed tasks.                   |
| getActiveTasks()           | Returns an array of all active task objects.                                      |
| getCompletedTasks()        | Returns an array of all completed task objects.                                   |
| addTaskListener(listener)  | Registers a listener for task updates; returns a function to remove the listener. |
| notifyTaskListeners(updateData) | Notifies all registered listeners about task updates.                        |
| createCaptureTask(captureData, progressCallback) | Creates and monitors a capture task, with progress callback. |
| monitorTaskProgress(taskId, progressCallback) | Monitors a task's progress until completion, calling callback. |

**Lifecycle/Internal (called by framework or internally, but may be relevant):**
| Method Name                | Description / Responsibility                                                      |
|---------------------------|----------------------------------------------------------------------------------|
| _performInitialization()   | Sets up logger, resolves dependencies, loads state, starts polling and persistence.|
| _performCleanup()          | Stops polling, clears state, resets dependencies and statistics.                  |
| _handleMemoryPressure(snapshot) | Handles memory pressure events, triggers cleanup.                           |

**Polling/Resource Management:**
| Method Name                | Description / Responsibility                                                      |
|---------------------------|----------------------------------------------------------------------------------|
| _startTaskPolling()        | Starts periodic polling for task updates.                                         |
| _stopTaskPolling()         | Stops polling for task updates.                                                   |
| _refreshTasks()            | Refreshes tasks from background or API.                                           |
| _fetchTasksFromApi()       | Fetches tasks from backend API.                                                   |
| _processTaskUpdates(tasks) | Processes and splits tasks into active/completed, notifies listeners.             |
| _startStatePersistence()   | Starts periodic state persistence.                                                |
| _stopStatePersistence()    | Stops state persistence interval.                                                 |
| _loadPersistedState()      | Loads persisted state from storage.                                               |
| _persistState()            | Persists current state to storage.                                                |
| _validateState(state)      | Validates state before loading or persisting.                                     |
| _validateTaskState(task)   | Validates a single task's state.                                                  |
| _cleanupOldTasks()         | Cleans up old/completed/expired tasks and retry records.                          |
| _cleanupNonEssentialResources() | Cleans up non-critical resources (old tasks, retries, etc.).                |

**Circuit Breaker/Retry:**
| Method Name                | Description / Responsibility                                                      |
|---------------------------|----------------------------------------------------------------------------------|
| _checkCircuitBreaker()     | Checks and manages circuit breaker state.                                         |
| _recordFailure()           | Records a failure for circuit breaker logic.                                      |
| _calculateRetryDelay(attempt) | Calculates retry delay with exponential backoff and jitter.                   |
| _shouldRetryTask(task, error) | Determines if a task should be retried based on error and retry count.         |

**WebSocket/Port Tracking:**
| Method Name                | Description / Responsibility                                                      |
|---------------------------|----------------------------------------------------------------------------------|
| _trackWebSocket(ws)        | Tracks a WebSocket for cleanup.                                                   |
| _trackMessagePort(port)    | Tracks a message port for cleanup.                                                |

This inventory should be updated as methods are added, removed, or refactored during the migration process.

## Expected Behaviors and Edge Cases

### createTask(taskData)
- **Expected Behavior:**
  - Creates a new task using the background script if available, otherwise falls back to the backend API.
  - Adds the new task to the active tasks map.
  - Notifies all registered listeners of the new task.
  - Returns the created task object.
- **Edge Cases:**
  - `taskData` is missing required fields (should throw/return error).
  - Background script is unavailable (should fallback to API).
  - API call fails (should throw/return error and record failure).
  - Duplicate task creation requests (should not create duplicate tasks).
  - Service not initialized (should auto-initialize or throw error).

### cancelTask(taskId)
- **Expected Behavior:**
  - Cancels the specified task via background script or API.
  - Refreshes the task list after cancellation.
  - Returns `true` if successful, `false` or error if not.
- **Edge Cases:**
  - `taskId` is invalid or missing (should warn and return false).
  - Task does not exist (should warn and return false).
  - Background/API call fails (should throw/return error).
  - Service not initialized (should auto-initialize or throw error).

### retryTask(taskId)
- **Expected Behavior:**
  - Retries a failed task via background script or API.
  - Refreshes the task list after retry.
  - Returns `true` if successful, `false` or error if not.
- **Edge Cases:**
  - `taskId` is invalid or missing.
  - Task is not in a retryable state (e.g., already complete).
  - Exceeds max retry attempts (should not retry, should warn).
  - Circuit breaker is open (should not retry, should warn).
  - Service not initialized.

### getTaskById(taskId)
- **Expected Behavior:**
  - Returns the task object with the given ID from active or completed tasks.
- **Edge Cases:**
  - `taskId` is invalid or missing (should throw/return error).
  - Task does not exist (should throw/return error).

### getActiveTasks()
- **Expected Behavior:**
  - Returns an array of all currently active task objects.
- **Edge Cases:**
  - No active tasks (should return empty array).
  - Service not initialized.

### getCompletedTasks()
- **Expected Behavior:**
  - Returns an array of all completed task objects.
- **Edge Cases:**
  - No completed tasks (should return empty array).
  - Service not initialized.

### addTaskListener(listener)
- **Expected Behavior:**
  - Registers a listener function for task updates.
  - Returns a function to remove the listener.
- **Edge Cases:**
  - `listener` is not a function (should warn and return no-op).
  - Service not initialized.

### notifyTaskListeners(updateData)
- **Expected Behavior:**
  - Calls all registered listeners with the provided update data.
- **Edge Cases:**
  - No listeners registered (should do nothing).
  - A listener throws an error (should catch and log, continue notifying others).

### createCaptureTask(captureData, progressCallback)
- **Expected Behavior:**
  - Creates a new capture task and monitors its progress.
  - Calls `progressCallback` with progress updates.
  - Returns the final task result on completion.
- **Edge Cases:**
  - `captureData` is invalid.
  - Task creation fails.
  - Progress callback is not a function (should not throw).
  - Task fails or times out (should reject with error).

### monitorTaskProgress(taskId, progressCallback)
- **Expected Behavior:**
  - Monitors the specified task until completion or failure.
  - Calls `progressCallback` with progress/status updates.
  - Resolves with task result on completion, rejects on error or timeout.
- **Edge Cases:**
  - `taskId` is invalid or missing.
  - Task disappears during monitoring (should reject).
  - Task never completes (should timeout and reject).
  - Progress callback throws (should catch and log, continue monitoring).

### General Edge Cases for All Methods
- Service not initialized (should auto-initialize or throw/warn).
- Dependencies (API, storage, notification) unavailable (should handle gracefully).
- Memory pressure or cleanup events (should not lose critical state).
