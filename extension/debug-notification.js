// Debug script to check notification service status
import { container } from './src/core/dependency-container.js';

console.log('=== NOTIFICATION SERVICE DEBUG ===');

try {
  const notificationService = container.getService('notificationService');
  console.log('NotificationService instance:', !!notificationService);
  console.log('NotificationService type:', typeof notificationService);
  console.log('NotificationService methods:', Object.getOwnPropertyNames(notificationService));
  console.log('NotificationService _initialized:', notificationService._initialized);
  console.log('NotificationService showNotification method:', typeof notificationService.showNotification);
  
  // Try to call showNotification
  if (typeof notificationService.showNotification === 'function') {
    console.log('Attempting to call showNotification...');
    notificationService.showNotification('Test notification', 'info')
      .then(() => console.log('showNotification succeeded'))
      .catch(err => console.error('showNotification failed:', err));
  }
} catch (error) {
  console.error('Error getting notification service:', error);
}
