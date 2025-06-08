// extension/tests/utils/mock-system.js
export const createMockSystem = () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  const mockMemoryMonitor = {
    start: jest.fn(),
    stop: jest.fn(),
    onMemoryPressure: jest.fn()
  };

  const mockResourceTracker = {
    trackEventListener: jest.fn(),
    trackTimeout: jest.fn(),
    trackInterval: jest.fn(),
    trackDOMElement: jest.fn(),
    cleanup: jest.fn(),
    cleanupNonEssential: jest.fn(),
    getResourceCounts: jest.fn().mockReturnValue({
      eventListeners: 0,
      timeouts: 0,
      intervals: 0,
      domRefs: 0
    })
  };

  const mockContainer = {
    getService: jest.fn()
  };

  const mockSystem = {
    logger: mockLogger,
    memoryMonitor: mockMemoryMonitor,
    resourceTracker: mockResourceTracker,
    container: mockContainer,
    reset: () => {
      Object.values(mockLogger).forEach(fn => fn.mockClear());
      Object.values(mockMemoryMonitor).forEach(fn => fn.mockClear());
      Object.values(mockResourceTracker).forEach(fn => fn.mockClear());
      Object.values(mockContainer).forEach(fn => fn.mockClear());
    }
  };

  // Verify the mock system is created correctly
  if (!mockSystem.reset || typeof mockSystem.reset !== 'function') {
    throw new Error('Mock system not created correctly');
  }

  return mockSystem;
};