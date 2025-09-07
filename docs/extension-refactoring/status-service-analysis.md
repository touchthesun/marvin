# Status Service Analysis

## Overview

**File:** `extension/src/services/status-service.js`  
**Purpose:**  
Monitors network and backend API status for the Marvin extension. Provides real-time status updates, health checks, and diagnostics for both network connectivity and backend API availability. Integrates with notification and storage services, and manages status indicators in the UI.

---

## Core Responsibilities

- **Network Status Monitoring:**  
  Tracks online/offline state, listens for browser network events, and updates UI indicators.
- **API Health Monitoring:**  
  Periodically checks backend API health, manages circuit breaker, and updates API status indicators.
- **Status History & Diagnostics:**  
  Maintains history of network and API status changes for diagnostics and troubleshooting.
- **User Notification:**  
  Notifies users of connectivity changes, API errors, and recovery events.
- **Resource Management:**  
  Tracks and cleans up DOM elements, event listeners, and status history.
- **Error Handling:**  
  Implements retry logic, circuit breaker, and robust error reporting for all status operations.

---

## Key Features & Methods

- **Initialization & Cleanup:**
  - `_performInitialization()`: Sets up logger, resolves dependencies, and starts status monitoring.
  - `_performCleanup()`: Cleans up intervals, event listeners, DOM references, and history.
- **Network Monitoring:**
  - Listens for `online`/`offline` events, updates status, and notifies user.
  - `_updateNetworkStatus()`: Updates UI indicators and sends status to background script.
- **API Health Checks:**
  - `_checkApiStatus()`: Performs health check on backend API, updates status, and manages circuit breaker.
  - `_setupApiStatusCheck()`: Schedules periodic API checks.
  - `_updateApiStatusIndicator()`: Updates UI indicators for API status.
- **Status History & Statistics:**
  - Tracks network/API status changes, maintains capped history for diagnostics.
  - `getStatusHistory()`, `getStatistics()`, `getStatus()`: Exposes status and diagnostic info.
- **User Notification:**
  - Notifies user of status changes via notification service.
- **Error Handling:**
  - Circuit breaker for repeated failures.
  - Informative logging at all stages.

---

## Dependencies

- **BaseService:**  
  Provides lifecycle, memory, and resource management.
- **LogManager:**  
  For logging and diagnostics.
- **NotificationService:**  
  For user notifications on status changes (optional).
- **StorageService:**  
  For retrieving backend API configuration (optional).
- **ResourceTracker:**  
  For DOM and event listener cleanup.

---

## Migration Considerations

### 1. Context Adaptation

- **Current Context:**  
  Runs in extension page context (dashboard, panels).
- **Migration Target:**  
  Should be adapted for Manifest V3, with status monitoring logic in the background script and UI status indicators in extension pages.
- **Key Changes Needed:**
  - Move core status monitoring and health checks to background script for persistent monitoring.
  - Use message passing to relay status updates to UI contexts (dashboard, popup).
  - Decouple direct DOM/UI updates from status logic; use a message protocol for status events.

### 2. Error Handling & Resilience

- **Current:**  
  Implements circuit breaker, retry logic, and user notifications.
- **Migration:**
  - Maintain robust error handling, ensure errors from background/backend are surfaced via message responses and UI indicators.
  - Integrate with global diagnostics and status panels.

### 3. Resource & Memory Management

- **Current:**  
  Uses resource tracker for DOM elements, event listeners, and status history.
- **Migration:**
  - Ensure all DOM and event resources are cleaned up on panel unload or memory pressure.
  - Test for leaks in ephemeral extension page contexts.

### 4. Testing

- **Current:**  
  No explicit test coverage noted.
- **Migration:**
  - Add Jest unit tests for status monitoring, health checks, and error scenarios.
  - Add integration tests for message-passing and UI indicator updates.

---

## Reusability & Refactoring

- **Reusable As-Is:**
  - Status monitoring, health check, and notification logic are modular and can be reused with minor adaptation.
  - Resource and history management patterns are sound.
- **Needs Adaptation:**
  - Move core monitoring logic to background script; UI updates via message passing.
  - Decouple direct DOM manipulation from status logic.
- **Potential Enhancements:**
  - Modularize status indicator components for easier testing and extension.
  - Add more granular error and recovery reporting for diagnostics.
  - Support richer diagnostics and troubleshooting tools in the UI.

---

## Migration Complexity

- **Overall:** Medium-High

**Risks:**
- Data flow changes (must adapt to message-passing for status updates)
- Ensuring robust cleanup in ephemeral extension page contexts
- Maintaining real-time status and diagnostics reliability

---

## Migration Tasks

1. **Move status monitoring to background:**  
   Refactor core status and health check logic to run in background script.
2. **Implement message passing for status updates:**  
   Relay status changes to UI contexts for indicator updates.
3. **Adapt resource management:**  
   Ensure all DOM and event resources are cleaned up on unload and memory pressure.
4. **Enhance error handling:**  
   Integrate with global diagnostics and status panels.
5. **Add/Update tests:**  
   Unit and integration tests for all status operations and error scenarios.
6. **Document usage:**  
   Update documentation for new data flow and error handling patterns.

---

## Summary Table

| Area                | Current State         | Migration Target         | Complexity | Notes                                |
|---------------------|----------------------|-------------------------|------------|--------------------------------------|
| Data Flow           | Direct DOM/UI update | Message passing for UI  | High       | Must decouple from direct DOM access |
| Error Handling      | Good                 | Maintain/enhance        | Medium     | Integrate with diagnostics panel     |
| Resource Management | Good                 | Maintain/enhance        | Medium     | Test cleanup on panel unload         |
| Testing             | Minimal              | Add Jest/unit/integration| Medium    | Focus on status/health checks       |

---

## References

See also:
- `codebase-inventory.md` (for service dependencies and migration matrix)
- `background-worker-refactoring-guide.md` (for message-passing and error handling patterns)
- `notification-service-analysis.md` (for notification integration)

---

*This analysis will be updated as migration progresses and new requirements emerge.*

---

## Refactoring Implementation Results

### Overview
Successfully completed the StatusService refactoring using TDD for a broken system approach. All 6 tests now pass, demonstrating robust network status monitoring, API health checks, and proper error handling with circuit breaker patterns.

### Key Changes Implemented

#### 1. Force Parameter for API Health Checks
- **Problem:** `forceApiStatusCheck()` method wasn't actually bypassing throttling due to internal timestamp management
- **Solution:** Added `force` parameter to `_checkApiStatus(force = false)` method
- **Implementation:** Modified throttling logic to respect the `force` parameter: `if (!force && timeSinceLastCheck < 10000)`
- **Result:** Forced API checks now truly bypass throttling and perform immediate health checks

#### 2. Browser API Mocking Strategy
- **Problem:** `navigator.onLine` is read-only in Node/Jest environment, causing TypeError
- **Solution:** Used `Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true })`
- **Pattern:** Set navigator state before creating service instance to ensure proper initialization
- **Result:** Network status detection works correctly in test environment

#### 3. Mock Setup for Multiple API Calls
- **Problem:** Service initialization triggers API check, then forced check triggers second API call, but mocks only handled single calls
- **Solution:** Used `mockResolvedValue`/`mockRejectedValue` instead of `*Once` variants
- **Result:** Both initialization and forced API checks work correctly without mock exhaustion

#### 4. Proper Error Type Handling
- **Problem:** Timeout scenarios weren't being recognized as AbortError, causing incorrect status classification
- **Solution:** Created proper AbortError with correct `name` property: `abortError.name = 'AbortError'`
- **Result:** Timeout scenarios now correctly return "error" status instead of "offline"

### Test Results
- **Initial State:** 6 failing tests (0% pass rate)
- **Final State:** 6 passing tests (100% pass rate)
- **Test Categories Covered:**
  - ✅ Network status detection and changes
  - ✅ Network status history tracking
  - ✅ Successful API health checks
  - ✅ API timeout handling
  - ✅ Circuit breaker implementation

### Integration with BaseService
- **Successfully integrated** with BaseService lifecycle management
- **Resource tracking** works correctly for timeouts, intervals, and cleanup
- **Memory pressure handling** properly triggers cleanup
- **Circuit breaker patterns** inherited from BaseService

### API Health Check Flow
- **Initialization:** Service performs initial API check during setup
- **Forced Checks:** `forceApiStatusCheck()` bypasses throttling and performs immediate check
- **Error Handling:** Proper classification of timeouts (error) vs unreachable (offline)
- **Status Persistence:** API status properly maintained across multiple checks

### Lessons Learned
1. **TDD for broken systems** is highly effective for refactoring legacy services
2. **Browser API mocking** requires careful attention to read-only properties
3. **Service initialization patterns** can trigger multiple API calls that need proper mocking
4. **Error type precision** is critical for correct status classification
5. **Incremental debugging** with systematic logging helps identify root causes

### Next Steps
The StatusService is now ready for:
- Integration with the background script context
- Message passing implementation for UI status updates
- Real backend API integration with proper error handling
- Performance optimization and monitoring
- Additional test categories (Public API methods, Resource Management, Integration tests)

This refactoring demonstrates the effectiveness of the TDD approach for transforming untested, legacy services into robust, well-tested components with proper error handling and status management.
