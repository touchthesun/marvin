// tests/notification-service-robustness.test.js
import { NotificationService } from '../src/services/notification-service.js';

/**
 * Test suite for notification service robustness improvements
 * This test verifies that the notification service handles errors gracefully
 * and provides fallback mechanisms when the service is unavailable
 */
describe('Notification Service Robustness', () => {
  let mockLogger;
  
  beforeEach(() => {
    // Mock the LogManager
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Mock console methods
    global.console = {
      ...console,
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };
    
    // Mock document and DOM methods
    global.document = {
      createElement: jest.fn(() => ({
        className: '',
        style: {},
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => [])
      })),
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
      },
      querySelector: jest.fn()
    };
    
    // Mock window
    global.window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      alert: jest.fn(),
      navigator: {
        userAgent: 'jsdom'
      }
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should handle invalid message inputs gracefully', async () => {
    const service = new NotificationService();
    
    // Test with null message
    await service.showNotification(null, 'info');
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid message provided:', null);
    
    // Test with empty string
    await service.showNotification('', 'error');
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid message provided:', '');
    
    // Test with non-string message
    await service.showNotification(123, 'success');
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid message provided:', 123);
  });
  
  test('should handle invalid notification types gracefully', async () => {
    const service = new NotificationService();
    
    // Test with invalid type
    await service.showNotification('Test message', 'invalid-type');
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid notification type: invalid-type, defaulting to \'info\'');
    
    // Test with null type
    await service.showNotification('Test message', null);
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid notification type: null, defaulting to \'info\'');
  });
  
  test('should handle invalid progress values gracefully', async () => {
    const service = new NotificationService();
    
    // Test with negative progress
    await service.showNotification('Test message', 'info', -10);
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid progress value: -10, clamping to valid range');
    
    // Test with progress over 100
    await service.showNotification('Test message', 'info', 150);
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid progress value: 150, clamping to valid range');
    
    // Test with non-number progress
    await service.showNotification('Test message', 'info', 'invalid');
    expect(console.warn).toHaveBeenCalledWith('[NotificationService] Invalid progress value: invalid, clamping to valid range');
  });
  
  test('should provide fallback notifications when service fails to initialize', async () => {
    const service = new NotificationService();
    
    // Mock initialization failure
    service.initialize = jest.fn().mockRejectedValue(new Error('Initialization failed'));
    
    // Should not throw an error
    await expect(service.showNotification('Test message', 'error')).resolves.not.toThrow();
    
    // Should log fallback notification
    expect(console.error).toHaveBeenCalledWith('[Notification ERROR] Test message');
  });
  
  test('should provide fallback notifications when container creation fails', async () => {
    const service = new NotificationService();
    
    // Mock successful initialization but failed container creation
    service.initialize = jest.fn().mockResolvedValue(true);
    service._ensureNotificationContainer = jest.fn().mockResolvedValue(null);
    
    // Should not throw an error
    await expect(service.showNotification('Test message', 'warning')).resolves.not.toThrow();
    
    // Should log fallback notification
    expect(console.warn).toHaveBeenCalledWith('[Notification WARNING] Test message');
  });
  
  test('should handle service worker context gracefully', async () => {
    // Mock service worker context by setting the internal flag
    const service = new NotificationService();
    service._isServiceWorkerContext = true; // Force service worker context
    
    // Should not throw an error
    await expect(service.showNotification('Test message', 'info')).resolves.not.toThrow();
    
    // Should log fallback notification
    expect(console.info).toHaveBeenCalledWith('[Notification INFO] Test message');
  });
  
  test('should handle circuit breaker open state gracefully', async () => {
    const service = new NotificationService();
    
    // Mock circuit breaker open
    service._isCircuitBreakerOpen = jest.fn().mockReturnValue(true);
    
    // Should not throw an error
    await expect(service.showNotification('Test message', 'success')).resolves.not.toThrow();
    
    // Should log fallback notification
    expect(console.log).toHaveBeenCalledWith('[Notification SUCCESS] Test message');
  });
  
  test('should handle unexpected errors gracefully', async () => {
    const service = new NotificationService();
    
    // Mock an unexpected error in the main flow
    service._trackNotificationHistory = jest.fn().mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    
    // Should not throw an error
    await expect(service.showNotification('Test message', 'error')).resolves.not.toThrow();
    
    // Should log the error and fallback notification
    expect(console.error).toHaveBeenCalledWith('[NotificationService] Error showing notification:', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith('[Notification ERROR] Test message');
  });
  
  test('static safeShowNotification should work without service instance', async () => {
    // Should not throw an error
    await expect(NotificationService.safeShowNotification('Test message', 'info')).resolves.not.toThrow();
    
    // Should log to console
    expect(console.info).toHaveBeenCalledWith('[Notification INFO] Test message');
  });
  
  test('static safeShowNotification should work with service instance', async () => {
    const mockService = {
      showNotification: jest.fn().mockResolvedValue('success')
    };
    
    // Should not throw an error
    await expect(NotificationService.safeShowNotification('Test message', 'success', mockService)).resolves.not.toThrow();
    
    // Should call the service
    expect(mockService.showNotification).toHaveBeenCalledWith('Test message', 'success');
  });
  
  test('static safeShowNotification should handle service errors gracefully', async () => {
    const mockService = {
      showNotification: jest.fn().mockRejectedValue(new Error('Service error'))
    };
    
    // Should not throw an error
    await expect(NotificationService.safeShowNotification('Test message', 'error', mockService)).resolves.not.toThrow();
    
    // Should log the error and fallback
    expect(console.error).toHaveBeenCalledWith('[NotificationService] Safe notification failed:', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith('[NotificationService] Original message: [ERROR] Test message');
  });
  
  test('fallback notification should log messages correctly', async () => {
    const service = new NotificationService();
    
    // Test different notification types
    service._fallbackNotification('Success message', 'success');
    expect(console.log).toHaveBeenCalledWith('[Notification SUCCESS] Success message');
    
    service._fallbackNotification('Error message', 'error');
    expect(console.error).toHaveBeenCalledWith('[Notification ERROR] Error message');
    
    service._fallbackNotification('Warning message', 'warning');
    expect(console.warn).toHaveBeenCalledWith('[Notification WARNING] Warning message');
    
    service._fallbackNotification('Info message', 'info');
    expect(console.info).toHaveBeenCalledWith('[Notification INFO] Info message');
  });
});
