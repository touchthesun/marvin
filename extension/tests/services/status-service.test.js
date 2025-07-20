// extension/tests/services/status-service.test.js
import { StatusService } from '../../src/services/status-service.js';

describe('StatusService', () => {
  let statusService;
  let mockContainer;
  let mockNotificationService;
  let mockStorageService;
  
  beforeEach(() => {
    // Setup mocks
    mockContainer = {
      getService: jest.fn()
    };
    
    mockNotificationService = {
      showNotification: jest.fn()
    };
    
    mockStorageService = {
      get: jest.fn()
    };

    
    // Mock browser APIs
    global.navigator = { onLine: true };
    global.fetch = jest.fn();
    global.chrome = {
      runtime: {
        connect: jest.fn(() => ({
          postMessage: jest.fn(),
          onDisconnect: { addListener: jest.fn() }
        }))
      },
      storage: {
        local: {
          get: jest.fn()
        }
      }
    };
    
    // Mock DOM
    global.document = {
      querySelector: jest.fn()
    };
    
    statusService = new StatusService({
      container: mockContainer
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });
  
  describe('Status Monitoring', () => {
    describe('Network Status Detection', () => {
      test('should detect initial network status correctly', async () => {
        // Arrange: Set up navigator.onLine state
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        
        // Act: Initialize service
        await statusService.initialize();
        
        // Assert: Service should reflect correct network status
        const networkStatus = await statusService.getNetworkStatus();
        expect(networkStatus).toBe(true);
      });
  
      test('should handle network status changes', async () => {
        // Arrange: Start with online
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        await statusService.initialize();
        
        // Act: Simulate going offline
        Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });
        const offlineEvent = new Event('offline');
        window.dispatchEvent(offlineEvent);
        
        // Assert: Service should detect offline status
        const networkStatus = await statusService.getNetworkStatus();
        expect(networkStatus).toBe(false);
      });
  
      test('should track network status changes in history', async () => {
        // Arrange: Initialize service
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        await statusService.initialize();
        
        // Act: Trigger multiple status changes
        Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });
        window.dispatchEvent(new Event('offline'));
        
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        window.dispatchEvent(new Event('online'));
        
        // Assert: History should contain both changes
        const history = statusService.getStatusHistory();
        expect(history.network).toHaveLength(2);
        expect(history.network[0].status).toBe('online');
        expect(history.network[1].status).toBe('offline');
      });
    });
  
    describe('API Health Checks', () => {
      test('should perform successful API health check', async () => {
        // Arrange: Set navigator.onLine BEFORE creating service
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        
        // Create a fresh service instance with online state
        const onlineStatusService = new StatusService({
          container: mockContainer
        });
        
        // Mock successful API response for ALL calls (not just once)
        global.fetch.mockResolvedValue({
          ok: true,
          status: 200
        });
        
        // Act: Initialize and force API check
        await onlineStatusService.initialize();
        const apiStatus = await onlineStatusService.forceApiStatusCheck();
        
        // Assert: Should return 'online' status
        expect(apiStatus).toBe('online');
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/health'),
          expect.objectContaining({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          })
        );
      });
  
      test('should handle API timeout scenarios', async () => {
        // Arrange: Set navigator.onLine BEFORE creating service
        Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
        
        // Create a fresh service instance with online state
        const onlineStatusService = new StatusService({
          container: mockContainer
        });
        
        // Mock timeout error for ALL calls (not just once)
        // Create proper AbortError with correct name property
        const abortError = new Error('Request aborted');
        abortError.name = 'AbortError';
        global.fetch.mockRejectedValue(abortError);
        
        // Act: Force API check
        await onlineStatusService.initialize();
        const apiStatus = await onlineStatusService.forceApiStatusCheck();
        
        // Assert: Should return 'error' status
        expect(apiStatus).toBe('error');
      });
  
      test('should implement circuit breaker for repeated failures', async () => {
        // Arrange: Mock repeated API failures
        global.fetch.mockRejectedValue(new Error('Network error'));
        
        // Act: Make multiple failed API calls
        await statusService.initialize();
        
        // First few calls should attempt API check
        await statusService.forceApiStatusCheck();
        await statusService.forceApiStatusCheck();
        await statusService.forceApiStatusCheck();
        await statusService.forceApiStatusCheck();
        await statusService.forceApiStatusCheck();
   
        // Assert: Circuit breaker should open after threshold
        // (Assume threshold is 5, as in config)
        // The next call should not attempt fetch and should return previous status
        const apiStatus = await statusService.forceApiStatusCheck();
        expect(apiStatus).not.toBe('online');
        expect(global.fetch).toHaveBeenCalledTimes(5); // No 6th call
  
        // Optionally, check internal state if accessible
        // expect(statusService._isCircuitBreakerOpen()).toBe(true);
      });
    });
  });
});
