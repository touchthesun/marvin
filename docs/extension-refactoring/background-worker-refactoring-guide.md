# Marvin Extension Background Worker Refactoring Guide

## Overview

This document outlines the comprehensive refactoring plan for migrating the Marvin browser extension from its current problematic architecture to a proper Manifest V3 Chrome extension architecture. The refactoring prioritizes backend integration as the central nervous system of the application.

## Current State Analysis

### Problems with Current Architecture
- **Dashboard Context Issue**: Dashboard runs as web accessible resource via HTTP server (`http://localhost:8080/dashboard/dashboard.html`)
- **Service Communication Failure**: Services try to communicate with background script but fail due to context mismatch
- **Mixed Architecture**: UI components expect extension APIs that aren't available in web page context
- **Backend Integration Risk**: Critical FastAPI backend communication is compromised by architectural issues

### Current System Dependencies
- **FastAPI Backend**: Central hub for Neo4j knowledge graph, content analysis, LLM agent, and extension communication
- **Backend Location**: Local during development, potentially remote in production
- **Critical Path**: All extension functionality depends on backend availability

## Target Architecture

### System Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Extension     │    │   Background    │    │   FastAPI       │
│   (UI Layer)    │◄──►│   Script        │◄──►│   Backend       │
│                 │    │   (Service      │    │   (Central Hub) │
│                 │    │    Worker)      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Chrome APIs   │    │   Neo4j + LLM   │
                       │   (Storage,     │    │   (Knowledge    │
                       │    Tabs, etc.)  │    │    Graph)       │
                       └─────────────────┘    └─────────────────┘
```

### Component Responsibilities

#### Extension Pages (Dashboard & Popup)
- **Dashboard**: Full interface accessible via new tab override
- **Popup**: Quick access interface via extension icon
- **Responsibilities**:
  - UI rendering and user interactions
  - Local component lifecycle management
  - Message sending to background script
  - Local state management
  - Backend status display and error handling

#### Background Script (Service Worker)
- **Responsibilities**:
  - Backend communication and health monitoring
  - Data storage and retrieval via Chrome APIs
  - Browser state management (tabs, bookmarks, history)
  - Long-running tasks and processing
  - Message routing between UI and backend

#### Content Scripts
- **Responsibilities**:
  - Page data extraction
  - DOM monitoring
  - Communication with extension pages

## Migration Plan

### Phase 0: Discovery & Inventory (Week 1)

#### 0.1 Codebase Inventory
- [ ] **Service Layer Audit**: Catalog all existing services and their current responsibilities
- [ ] **Component Analysis**: Review all UI components and their dependencies
- [ ] **Utility Library Review**: Identify reusable utilities in `extension/src/utils/`
- [ ] **Configuration Analysis**: Review existing configuration patterns
- [ ] **Testing Infrastructure**: Document current test structure and coverage

#### 0.2 File Classification Matrix
Create a reference guide mapping files to migration phases:

**Background Script Candidates:**
- `services/storage-service.js` - Chrome storage operations
- `services/api-service.js` - Backend communication
- `services/task-service.js` - Background task processing
- `services/notification-service.js` - Browser notifications
- `services/status-service.js` - Network/API monitoring

**Extension Page Candidates:**
- `services/component-service.js` - UI component lifecycle
- `services/ui-service.js` - UI state management
- `components/panels/*` - All panel components
- `components/core/*` - Core UI components

**Shared/Utility Candidates:**
- `utils/log-manager.js` - Centralized logging
- `utils/config-manager.js` - Configuration management
- `utils/resource-tracker.js` - Resource cleanup
- `utils/memory-monitor.js` - Memory management

#### 0.3 Existing Backend Integration Analysis
- [ ] **Status Service Review**: Analyze `status-service.js` for backend health monitoring patterns
- [ ] **API Service Review**: Review `api-service.js` for backend communication patterns
- [ ] **Error Handling Patterns**: Document existing error handling approaches
- [ ] **Configuration Patterns**: Review how backend URLs are currently managed

#### 0.4 Migration Impact Assessment
- [ ] **Dependency Mapping**: Create dependency graph of services
- [ ] **Breaking Change Analysis**: Identify what will break during migration
- [ ] **Testing Impact**: Assess which tests need updating
- [ ] **Development Workflow Impact**: Document how development process will change

#### 0.5 Reusable Component Identification
**For BackendHealthMonitor:**
- `utils/log-manager.js` - Logging infrastructure
- `utils/config-manager.js` - Configuration management
- `services/status-service.js` - Health check patterns
- `utils/resource-tracker.js` - Resource management

**For BackendStatusIndicator:**
- `services/status-service.js` - Status monitoring and UI updates
- `components/shared/status-indicator.js` - Status display components
- `utils/notification-manager.js` - User notification patterns

**For Message Passing:**
- `services/message-service.js` - Message routing infrastructure
- `background/background-service.js` - Message handling patterns

#### 0.6 Discovery Phase Deliverables
**Documents to Create:**
- [ ] **Service Inventory Report**: Complete catalog of all services with responsibilities
- [ ] **Component Dependency Map**: Visual representation of component relationships
- [ ] **Migration Impact Report**: Detailed analysis of what will break and why
- [ ] **Reusable Code Catalog**: List of existing code that can be adapted vs. needs rewriting
- [ ] **Testing Strategy Document**: How to test each phase of migration

**Code Analysis Reports:**
- [ ] **Status Service Analysis**: How `status-service.js` can be adapted for backend health monitoring
- [ ] **API Service Analysis**: How `api-service.js` handles backend communication
- [ ] **Message Service Analysis**: How `message-service.js` routes messages
- [ ] **Configuration Analysis**: How backend URLs and settings are currently managed

### Phase 1: Backend Integration Foundation (Week 2)

#### 1.1 Backend Health & Configuration
- [ ] Create `BackendHealthMonitor` service
- [ ] Implement configuration management for local/remote backends
- [ ] Add health check endpoint to FastAPI backend (`/health`)
- [ ] Create diagnostic tools for backend connectivity

#### 1.2 Message Protocol for Backend Operations
```javascript
// Dashboard → Background → Backend
{
  action: 'capturePage',
  data: { url: 'https://example.com' },
  requestId: 'unique-id'
}

// Background → Backend
POST /api/v1/pages/
{
  "url": "https://example.com",
  "context": "EXTENSION_CAPTURE"
}

// Background → Dashboard
{
  success: true,
  data: { pageId: '123', analysisStatus: 'pending' },
  requestId: 'unique-id'
}
```

#### 1.3 Error Handling Strategy
```javascript
// Background script error handling
async handleBackendRequest(action, data) {
  try {
    const response = await this.apiService.request(action, data);
    return { success: true, data: response };
  } catch (error) {
    if (error.code === 'NETWORK_ERROR') {
      return { 
        success: false, 
        error: 'Backend server unreachable',
        diagnostic: await this.getDiagnosticInfo()
      };
    }
    return { success: false, error: error.message };
  }
}
```

### Phase 2: Service Migration (Week 3-4)

#### 2.1 Background Services (Service Worker)
Priority order:
1. **ApiService** - Backend communication (CRITICAL)
2. **StorageService** - Local data persistence
3. **TaskService** - Background task management
4. **NotificationService** - User notifications

#### 2.2 Extension Page Services (Dashboard/Popup)
1. **ComponentService** - UI component lifecycle
2. **UIService** - UI state management
3. **LocalStorageService** - Page-specific data

#### 2.3 Shared Services
1. **LogService** - Centralized logging
2. **ConfigService** - Configuration management
3. **BackendHealthMonitor** - Backend status tracking (adapted from status-service.js)

### Phase 3: UI Layer Migration (Week 5)

#### 3.1 Dashboard as Extension Page
- [ ] Update manifest for new tab override
- [ ] Migrate dashboard to extension context
- [ ] Implement message passing for all backend operations
- [ ] Add backend status indicators (adapted from status-service.js)

#### 3.2 Popup Integration
- [ ] Keep popup for quick access
- [ ] Implement same message passing pattern
- [ ] Add "Open Dashboard" button for full interface

#### 3.3 Error UI Components
```javascript
// Backend status component
class BackendStatusIndicator {
  constructor() {
    this.element = document.getElementById('backend-status');
  }
  
  updateStatus(isHealthy, error = null) {
    if (isHealthy) {
      this.element.className = 'status-indicator healthy';
      this.element.textContent = 'Backend Connected';
    } else {
      this.element.className = 'status-indicator error';
      this.element.textContent = 'Backend Unreachable';
      this.showDiagnostics(error);
    }
  }
}
```

### Phase 4: Testing & Diagnostics (Week 6)

#### 4.1 Backend Integration Tests
```javascript
// Test backend connectivity
describe('Backend Integration', () => {
  test('should connect to local backend', async () => {
    const healthMonitor = new BackendHealthMonitor();
    const isHealthy = await healthMonitor.checkBackendHealth();
    expect(isHealthy).toBe(true);
  });
  
  test('should handle backend unavailability gracefully', async () => {
    // Mock network failure
    const response = await handleBackendRequest('test', {});
    expect(response.success).toBe(false);
    expect(response.error).toContain('Backend server unreachable');
  });
});
```

#### 4.2 Diagnostic Tools
- [ ] Backend connectivity test
- [ ] API endpoint availability check
- [ ] Network configuration validation
- [ ] Error log collection and reporting

## Configuration Management

### Backend Configuration
```javascript
// config/backend-config.js
export const BackendConfig = {
  development: {
    baseUrl: 'http://localhost:8000',
    timeout: 5000,
    retryAttempts: 3
  },
  production: {
    baseUrl: process.env.API_BASE_URL || 'https://api.marvin.example.com',
    timeout: 10000,
    retryAttempts: 5
  }
};
```

### Manifest Changes
```json
{
  "chrome_url_overrides": {
    "newtab": "dashboard/dashboard.html"
  },
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

## Development Workflow

### Discovery Phase Approach
1. **File-by-File Review**: Systematically review each file in the codebase
2. **Pattern Identification**: Look for reusable patterns and approaches
3. **Dependency Mapping**: Create visual maps of service dependencies
4. **Code Reuse Planning**: Identify what can be adapted vs. rewritten
5. **Documentation Creation**: Create comprehensive reference guides

### Local Development Setup
```bash
# Terminal 1: Backend server
cd /path/to/marvin
python run.py

# Terminal 2: Extension development
cd extension
npm run dev  # Build extension in watch mode

# Terminal 3: Extension testing
npm run test:watch
```

### Extension Loading Process
1. Load unpacked extension in Chrome
2. Dashboard opens as new tab
3. Popup accessible via extension icon
4. Backend communication via background script

---

## Test-Driven Development & Testing Strategy

### Principles for Refactoring a Broken System

- **Write Specification Tests First:**
  - For each service or feature, write tests for the *desired* (not current) behavior.
  - Expect these tests to fail (red) at first—this is normal and necessary.
- **Characterization vs. Specification Tests:**
  - Use characterization tests to lock in current behavior if needed.
  - Focus on specification tests to describe the correct, future behavior.
- **Incremental Fixes:**
  - Tackle one failing test or feature at a time.
  - Refactor or rewrite code until the test passes.
- **Track Progress:**
  - Use your test suite as a progress tracker: as more tests turn green, you’re closer to your goal.
- **Document Known Failures:**
  - Keep a list of known failing tests and what they represent.
- **Never Ignore Failing Tests:**
  - Only allow red tests if they represent unimplemented or broken features you’re actively working on.

### Types of Tests to Prioritize

- **Unit Tests:**
  - For all core logic in services (task management, error handling, resource cleanup, etc.).
  - Use Jest for TypeScript/JS, pytest for Python backend.
- **Integration Tests:**
  - For message passing between background, content, and UI scripts.
  - For backend API communication (mock the backend for local tests).
- **End-to-End (E2E) Tests:**
  - For user flows: e.g., “user triggers analysis → task is created → progress is shown → notification is displayed.”
  - Use tools like Selenium, Playwright, or Puppeteer for browser automation.
- **Regression Tests:**
  - For every bug fixed during the refactor, add a test to prevent recurrence.
- **Contract/Interface Tests:**
  - For message protocols between extension contexts (background <-> UI <-> content).
  - For API contracts between extension and backend.

### Best Practices

- **Test Harnesses and Mocks:**
  - Use mocks for backend APIs, Chrome extension APIs, and storage to isolate tests.
  - Leverage your existing `test_harness/` and `extension/tests/__mocks__/` infrastructure.
- **Incremental Migration with Feature Flags:**
  - Use feature flags or environment toggles to switch between old and new implementations during migration.
- **Continuous Integration (CI):**
  - Run the full test suite on every commit/PR.
  - Block merges if coverage drops or tests fail.
- **Code Coverage Monitoring:**
  - Maintain 80%+ coverage, but focus on critical paths (task creation, error handling, message passing).
- **Documentation-Driven Testing:**
  - For each service, document expected behaviors and edge cases in markdown (as you’ve been doing).
  - Use these docs as the basis for your test cases.

### TDD Workflow for Each Service Refactor

1. **Inventory and Document:**
   - List all public methods, message protocols, and side effects.
   - Document expected behaviors and edge cases.
2. **Write/Expand Tests:**
   - Add/expand unit and integration tests for all behaviors.
   - Add regression tests for known bugs.
3. **Refactor (One Step at a Time):**
   - Make a small, isolated change.
   - Run the tests.
   - If green, commit and proceed. If red, fix or revert.
4. **Repeat:**
   - Continue until the service is fully migrated and all tests pass.
5. **E2E Validation:**
   - After each major milestone, run E2E tests to ensure the extension works as a whole.

### Adapting TDD for a Broken System

- **Red-Green-Refactor:**
  - Write tests for the *desired* behavior (expect red).
  - Refactor and implement until the tests pass (green).
  - Clean up code and ensure tests remain green.
- **Marking Expected Failures:**
  - Use `test.todo` or `test.skip` in Jest for not-yet-implemented features.
  - Use `pytest.mark.xfail` in pytest for known failures.
- **CI/CD:**
  - Allow red tests only if they are explicitly marked as “work in progress” or “expected failure.”
- **Documentation:**
  - Keep a changelog or progress board of which tests are red/green and why.

### Recommended Tools

- **Jest** (with jsdom and Chrome API mocks) for extension JS/TS
- **pytest** for backend Python
- **Playwright/Puppeteer** for E2E browser automation
- **nyc/Istanbul** for JS coverage
- **coverage.py** for Python coverage
- **Mock Service Worker (MSW)** for API mocking in tests

### Example: TDD for Refactoring a Service

1. **Before refactoring `TaskService`:**
   - Write tests for:  
     - Task creation, cancellation, retry
     - Polling and progress updates
     - Error/circuit breaker behavior
     - Message passing to/from background
   - Run tests, ensure they pass or are marked as expected failures.
2. **Refactor a single method (e.g., move polling to background):**
   - Update code.
   - Run tests.
   - Fix any failures.
3. **Repeat for next method/feature.**

### Test Categories (for reference)
- **Unit Tests**: Individual services and components
- **Integration Tests**: Message passing between contexts
- **E2E Tests**: Full user workflows with backend
- **Backend Tests**: API endpoints and data flow

### Test Environment Requirements
- Mock Chrome APIs for unit tests
- Real backend for integration tests
- Extension context for E2E tests
- Network failure simulation for error handling

---

## Risk Mitigation

### High Risk Areas
1. **Backend Communication**: Critical path for all features
2. **State Synchronization**: Data consistency between contexts
3. **Error Handling**: Graceful degradation when backend is down
4. **Configuration Management**: Local vs remote backend switching

### Mitigation Strategies
1. **Comprehensive Testing**: Test all backend communication paths
2. **Feature Flags**: Disable features when backend is unavailable
3. **Fallback Data**: Use cached data when backend is down
4. **Monitoring**: Real-time backend health monitoring
5. **Incremental Migration**: Move one service at a time
6. **Rollback Plan**: Ability to revert if issues arise

## Success Criteria

### Functional Requirements
- [ ] Dashboard loads as new tab with full functionality
- [ ] Popup provides quick access to key features
- [ ] All backend communication works reliably
- [ ] Graceful error handling when backend is unavailable
- [ ] Clear diagnostic information for troubleshooting

### Performance Requirements
- [ ] Dashboard loads within 2 seconds
- [ ] Backend requests complete within 5 seconds
- [ ] UI remains responsive during backend operations
- [ ] Memory usage stays within reasonable limits

### Development Requirements
- [ ] Clear error messages for debugging
- [ ] Comprehensive test coverage
- [ ] Easy configuration management
- [ ] Fast development feedback loops

## Post-Migration Tasks

### Documentation Updates
- [ ] Update API documentation
- [ ] Create troubleshooting guide
- [ ] Document configuration options
- [ ] Update development setup instructions

### Performance Optimization
- [ ] Optimize message passing efficiency
- [ ] Implement request caching
- [ ] Reduce unnecessary background script activity
- [ ] Optimize bundle sizes

### Monitoring & Maintenance
- [ ] Set up error tracking
- [ ] Implement usage analytics
- [ ] Create health monitoring dashboard
- [ ] Establish maintenance procedures

## Conclusion

This refactoring plan prioritizes backend integration as the central concern while establishing a proper Manifest V3 architecture. The incremental approach ensures system stability throughout the migration process while maintaining the critical FastAPI backend communication that powers the entire application.

The success of this refactoring depends on thorough testing, clear communication between components, and robust error handling for backend connectivity issues. By following this plan, we'll achieve a maintainable, scalable extension architecture that properly leverages Chrome's extension capabilities while maintaining the critical backend integration.

## Lessons Learned: MessageService Refactor & Testing Patterns

### 1. TDD for a Broken System: Philosophy in Practice
- **Tests as Specification:** When refactoring legacy or broken code, treat tests as the source of truth for desired behavior. If a test fails, assume the code is wrong, not the test, unless proven otherwise.
- **Incremental Progress:** Fix one failing test at a time. Each green test is a step closer to a working, demo-ready product.
- **Red-Green-Refactor:** Write/expand tests for the correct behavior, expect them to fail (red), then refactor code until they pass (green). Clean up as you go.

### 2. Mocks vs. Real Code: When and How to Use
- **Mocking Hides Real Integration Issues:** Over-mocking (e.g., ResourceTracker, BaseService) can mask real problems. Use mocks for external dependencies (e.g., Chrome APIs, logging), but prefer real code for core service logic.
- **Patch After Construction:** If you must mock internal methods (e.g., resource tracking), patch them on the real service instance after construction, not at the module level.
- **Remove Unnecessary Mocks:** As the codebase stabilizes, remove mocks for internal logic to surface real integration issues.

### 3. Service vs. Component Patterns
- **Service Classes Are Not DOM Elements:** Avoid treating services like UI components. Do not use DOM-centric resource tracking (e.g., addEventListener) on service classes unless you implement a custom event system.
- **Track Only What Matters:** For services, track message handlers and pending requests in plain Maps/arrays. Only use resource tracking for actual resources (timers, intervals, etc.).

### 4. Test Isolation and Setup
- **Reset All Mocks in beforeEach/afterEach:** Prevents state leakage between tests.
- **Patch Chrome APIs and Globals Early:** Set up global.chrome and any other globals before constructing services.
- **Patch ResourceTracker Methods as Needed:** Only mock methods you need to observe (e.g., trackTimeout), and only if you assert on their calls.

### 5. Debugging and Logging
- **Verbose Logging:** Use console logs and temporary log files to trace test execution and variable state, especially for persistent or unclear failures.
- **Check Stack Traces:** Always trace errors to their source in the codebase. This often reveals incorrect assumptions about what is being called.
- **Remove Obsolete Tests:** If a test no longer matches the code's intent (e.g., tracking message listeners as event listeners), remove or update it.

### 6. Patterns for MessageService
- **Context Detection:** Use robust checks for background, extension page, and service worker contexts. Mock global.self and related globals in tests as needed.
- **Timeout Tracking:** Use ResourceTracker for timers, but only assert on mocks if you patch them in the test setup.
- **Message Routing:** Keep service and action handlers separate. Use Maps for handler registration and removal.
- **Pending Requests:** Track pending requests in a Map with requestId as the key. Clean up old requests on memory pressure or service worker restart.

### 7. General Advice for Future Developers
- **Favor Simplicity:** Remove unnecessary abstractions and tracking. Only add complexity when justified by real requirements.
- **Document as You Go:** Update this guide and related docs with every major lesson or pattern discovered.
- **Celebrate Progress:** Each passing test is a win. The process is slow but builds a solid, maintainable foundation.

---

These lessons and patterns are distilled from the real-world process of refactoring MessageService and its test suite. Future contributors should review this section before making changes to the messaging infrastructure or its tests.
