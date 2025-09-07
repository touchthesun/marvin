# Analysis Service Analysis

## Overview

**File:** `extension/src/services/analysis-service.js`  
**Purpose:**  
Manages page analysis operations and task monitoring for the Marvin extension. Coordinates analysis task lifecycle, status polling, error handling, and user notifications. Integrates with backend API and notification services.

---

## Core Responsibilities

- **Task Monitoring:**  
  Tracks the lifecycle of analysis tasks, including creation, status updates, completion, and errors.
- **Backend Integration:**  
  Communicates with the backend API to check analysis status and manage task progress.
- **Event Handling:**  
  Listens for and dispatches custom events related to analysis tasks (created, updated, completed, error).
- **User Notification:**  
  Notifies users of task completion or failure via the notification service.
- **Resource Management:**  
  Cleans up event listeners and dependencies on unload or memory pressure.
- **Error Handling:**  
  Implements circuit breaker, retry logic, and robust error reporting.

---

## Key Features & Methods

- **Initialization & Cleanup:**
  - `_performInitialization()`: Validates dependencies, sets up event listeners.
  - `_performCleanup()`: Cleans up references and resources.
- **Task Lifecycle:**
  - `monitorAnalysisTask(taskId)`: Begins monitoring a new analysis task.
  - `_checkTaskStatus(taskId)`: Polls backend for task status, updates state, and handles completion/errors.
  - `_notifyTaskListeners(taskId, taskState)`: Notifies registered listeners of task state changes.
  - `_onAnalysisCompleted(taskId, response)`: Handles successful completion, notifies user/UI.
  - `_onAnalysisError(taskId, response)`: Handles errors, notifies user/UI.
- **Event Management:**
  - `_setupEventListeners()`: Registers event listeners for task events and window unload.
  - `_handleTaskEvent(event)`: Handles custom task events.
  - `_handleBeforeUnload()`: Triggers cleanup on unload.
- **Error Handling:**
  - Circuit breaker for repeated failures.
  - Retry logic with exponential backoff.
  - Informative logging at all stages.

---

## Dependencies

- **BaseService:**  
  Provides lifecycle, memory, and resource management.
- **LogManager:**  
  For logging and diagnostics.
- **API Service:**  
  Handles backend communication for analysis status.
- **Notification Service:**  
  Displays user notifications for task events.

---

## Migration Considerations

### 1. Context Adaptation

- **Current Context:**  
  Runs in extension page context (dashboard, panels).
- **Migration Target:**  
  Remains in extension page context, but must adapt to Manifest V3 message-passing architecture.
- **Key Changes Needed:**
  - All backend communication should be routed through the background script using message passing.
  - Decouple direct API calls; use a message protocol for status checks and task management.
  - Ensure event listeners and DOM operations are compatible with extension security restrictions.

### 2. Error Handling & Resilience

- **Current:**  
  Implements circuit breaker, retry logic, and user notifications.
- **Migration:**
  - Maintain robust error handling, but ensure errors from background/backend are surfaced via message responses.
  - Integrate with global diagnostics and status indicators.

### 3. Resource & Memory Management

- **Current:**  
  Uses resource tracker for event listeners and cleanup.
- **Migration:**
  - Ensure all listeners and resources are cleaned up on panel unload or memory pressure.
  - Test for leaks in ephemeral extension page contexts.

### 4. Testing

- **Current:**  
  No explicit test coverage noted.
- **Migration:**
  - Add Jest unit tests for task lifecycle, event handling, and error scenarios.
  - Add integration tests for message-passing and backend failure cases.

---

## Reusability & Refactoring

- **Reusable As-Is:**
  - Task monitoring, event handling, and notification logic are modular and can be reused with minor adaptation.
  - Resource management patterns are sound.
- **Needs Adaptation:**
  - All direct API calls must be refactored to use message passing to the background script.
  - Event dispatching and listening should be reviewed for extension context compatibility.
- **Potential Enhancements:**
  - Modularize task state management for easier testing.
  - Add more granular error and progress reporting for diagnostics.

---

## Migration Complexity

- **Overall:** Medium

**Risks:**
- Data flow changes (must adapt to message-passing, not direct API calls)
- Ensuring robust cleanup in ephemeral extension page contexts
- Maintaining user feedback and notification reliability

---

## Migration Tasks

1. **Refactor backend communication:**  
   Route all analysis status checks and task management through background script message passing.
2. **Adapt event handling:**  
   Ensure all custom events and listeners are compatible with extension context.
3. **Enhance error handling:**  
   Integrate with global diagnostics and status indicators.
4. **Test resource cleanup:**  
   Add tests for cleanup on unload and memory pressure.
5. **Add/Update tests:**  
   Unit and integration tests for all major methods and error scenarios.
6. **Document usage:**  
   Update documentation for new data flow and error handling patterns.

---

## Summary Table

| Area                | Current State         | Migration Target         | Complexity | Notes                                |
|---------------------|----------------------|-------------------------|------------|--------------------------------------|
| Data Flow           | Direct API calls     | Message passing only    | High       | Must decouple from direct API access |
| Error Handling      | Good                 | Maintain/enhance        | Medium     | Integrate with diagnostics panel     |
| Resource Management | Good                 | Maintain/enhance        | Medium     | Test cleanup on panel unload         |
| Testing             | Minimal              | Add Jest/unit/integration| Medium    | Focus on task lifecycle and errors   |

---

## References

See also:
- `codebase-inventory.md` (for service dependencies and migration matrix)
- `background-worker-refactoring-guide.md` (for message-passing and error handling patterns)
- `api-service-analysis.md` (for backend communication patterns)

---

*This analysis will be updated as migration progresses and new requirements emerge.*
