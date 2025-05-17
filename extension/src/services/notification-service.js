// services/notification-service.js
import { LogManager } from '../utils/log-manager.js';

/**
 * Notification Service - Manages UI notifications throughout the extension
 */
export class NotificationService {
  /**
   * Create a new NotificationService instance
   */
  constructor() {
    // Configuration defaults
    this.config = {
      autoHideDuration: 3000,  // Duration before auto-hiding notifications (ms)
      maxNotifications: 3,     // Maximum number of notifications to show at once
      position: 'top-right',   // Position of notifications
      transitionDuration: 300  // Duration of fade animations (ms)
    };

    // Store for active notifications
    this.activeNotifications = {
      standard: [],
      progress: null
    };
    
    this.initialized = false;
    this.logger = null;
    
    // Detect if we're in a service worker context
    this.isServiceWorkerContext = typeof self !== 'undefined' && 
                                 typeof document === 'undefined';
  }
  
  /**
   * Initialize the notification service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly - no container access needed
      this.logger = new LogManager({
        context: 'notification-service',
        isBackgroundScript: this.isServiceWorkerContext,
        maxEntries: 100
      });
      
      this.logger.info('Initializing notification service');
      
      // Create notification container if in browser context
      if (!this.isServiceWorkerContext) {
        this.ensureNotificationContainer();
      } else {
        this.logger.info('Running in service worker context - UI notifications disabled');
      }
      
      this.initialized = true;
      this.logger.info('Notification service initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing notification service:', error);
      return false;
    }
  }
  
  /**
   * Ensure notification container exists in the DOM
   * @private
   */
  ensureNotificationContainer() {
    // Only run in browser context
    if (this.isServiceWorkerContext) return;
    
    // Check if container already exists
    if (document.getElementById('notification-container')) {
      return;
    }
    
    // Create container
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = `notification-container ${this.config.position}`;
    document.body.appendChild(container);
    
    // Add styles if they don't exist
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = this.getNotificationStyles();
      document.head.appendChild(style);
    }
    
    if (this.logger) {
      this.logger.debug('Notification container created');
    }
  }
  
  /**
   * Get CSS styles for notifications
   * @returns {string} CSS styles
   * @private
   */
  getNotificationStyles() {
    return `
      .notification-container {
        position: fixed;
        z-index: 9999;
        max-width: 300px;
      }
      .notification-container.top-right {
        top: 20px;
        right: 20px;
      }
      .notification-container.top-left {
        top: 20px;
        left: 20px;
      }
      .notification-container.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      .notification-container.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      .notification {
        margin-bottom: 10px;
        padding: 12px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        background-color: #fff;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity ${this.config.transitionDuration}ms, transform ${this.config.transitionDuration}ms;
      }
      .notification.show {
        opacity: 1;
        transform: translateY(0);
      }
      .notification.success {
        border-left: 4px solid #4caf50;
      }
      .notification.error {
        border-left: 4px solid #f44336;
      }
      .notification.warning {
        border-left: 4px solid #ff9800;
      }
      .notification.info {
        border-left: 4px solid #2196f3;
      }
      .notification-message {
        margin-right: 20px;
      }
      .notification-close {
        position: absolute;
        top: 8px;
        right: 8px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 16px;
        opacity: 0.6;
      }
      .notification-close:hover {
        opacity: 1;
      }
      .notification-progress-container {
        height: 4px;
        margin-top: 8px;
        background-color: #e0e0e0;
        border-radius: 2px;
        overflow: hidden;
      }
      .notification-progress-bar {
        height: 100%;
        background-color: currentColor;
        transition: width 0.3s ease;
      }
    `;
  }
  
  /**
   * Show notification with optional progress bar
   * @param {string} message - Message to display
   * @param {string} type - Type of notification (success, error, info, warning)
   * @param {number|null} progress - Progress percentage (0-100) or null for no progress bar
   * @param {object} options - Additional options
   * @returns {HTMLElement} Notification element
   */
  showNotification(message, type = 'success', progress = null, options = {}) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (this.logger) {
      this.logger.debug(`Showing ${type} notification: ${message}${progress !== null ? ` (progress: ${progress}%)` : ''}`);
    }

    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      // We can still log the notification but can't show UI
      return null;
    }
    
    if (!message) {
      if (this.logger) {
        this.logger.warn('Attempted to show notification with empty message');
      }
      message = 'Notification';
    }
    
    // Validate notification type
    const validTypes = ['success', 'error', 'info', 'warning'];
    if (!validTypes.includes(type)) {
      if (this.logger) {
        this.logger.warn(`Invalid notification type: ${type}, defaulting to 'info'`);
      }
      type = 'info';
    }
    
    // Validate progress value if provided
    if (progress !== null) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        if (this.logger) {
          this.logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        }
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
    }
    
    // Merge options with defaults
    const config = { ...this.config, ...options };
    
    // Ensure notification container exists
    this.ensureNotificationContainer();
    
    // Handle progress notifications differently
    if (progress !== null) {
      return this.createOrUpdateProgressNotification(message, type, progress, config);
    }
    
    // Manage standard notifications
    return this.createStandardNotification(message, type, config);
  }
  
  /**
   * Creates or updates a progress notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type
   * @param {number} progress - Progress percentage
   * @param {object} config - Configuration options
   * @returns {HTMLElement} Notification element
   * @private
   */
  createOrUpdateProgressNotification(message, type, progress, config) {
    const container = document.getElementById('notification-container');
    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      // We can still log the notification but can't show UI
      return null;
    }

    if (!container) {
      if (this.logger) {
        this.logger.warn('Notification container not found');
      }
      return null;
    }
    
    // Remove any existing progress notification
    const existingNotification = container.querySelector('.notification.progress-notification');
    if (existingNotification) {
      // If we have an existing progress notification, update it instead of creating a new one
      const messageEl = existingNotification.querySelector('.notification-message');
      const progressBar = existingNotification.querySelector('.notification-progress-bar');
      
      if (messageEl) messageEl.textContent = message;
      if (progressBar) progressBar.style.width = `${progress}%`;
      
      // Update the notification type if it changed
      existingNotification.className = `notification ${type} progress-notification show`;
      
      // Store reference
      this.activeNotifications.progress = existingNotification;
      
      return existingNotification;
    }
    
    // Create a new progress notification
    const notification = document.createElement('div');
    notification.className = `notification ${type} progress-notification`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');
    
    // Add custom ID if provided
    if (config.id) {
      notification.id = config.id;
    }
    
    // Create notification content
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <div class="notification-progress-container">
        <div class="notification-progress-bar" style="width: ${progress}%"></div>
      </div>
      ${config.dismissible ? '<button class="notification-close" aria-label="Close notification">&times;</button>' : ''}
    `;
    
    // Add to DOM
    container.appendChild(notification);
    
    // Add close button handler if dismissible
    if (config.dismissible) {
      const closeButton = notification.querySelector('.notification-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          this.hideNotification(notification);
        });
      }
    }
    
    // Fade in
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    // Store reference
    this.activeNotifications.progress = notification;
    
    return notification;
  }
  
  /**
   * Creates a standard (non-progress) notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type
   * @param {object} config - Configuration options
   * @returns {HTMLElement} Notification element
   * @private
   */
  createStandardNotification(message, type, config) {
    const container = document.getElementById('notification-container');
    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      return null;
    }

    if (!container) {
      if (this.logger) {
        this.logger.warn('Notification container not found');
      }
      return null;
    }
    
    // Manage notification limit
    this.manageNotificationLimit(config.maxNotifications);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    
    // Add custom ID if provided
    if (config.id) {
      notification.id = config.id;
    }
    
    // Create notification content
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      ${config.dismissible ? '<button class="notification-close" aria-label="Close notification">&times;</button>' : ''}
    `;
    
    // Add to DOM
    container.appendChild(notification);
    
    // Add close button handler if dismissible
    if (config.dismissible) {
      const closeButton = notification.querySelector('.notification-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          this.hideNotification(notification);
        });
      }
    }
    
    // Fade in
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    // Auto-hide after duration
    const duration = typeof config.duration === 'number' ? config.duration : config.autoHideDuration;
    if (duration > 0) {
      setTimeout(() => {
        this.hideNotification(notification);
      }, duration);
    }
    
    // Store reference
    this.activeNotifications.standard.push(notification);
    
    return notification;
  }
  
  /**
   * Ensures we don't exceed the maximum number of standard notifications
   * @param {number} maxNotifications - Maximum allowed notifications
   * @private
   */
  manageNotificationLimit(maxNotifications) {
    if (this.activeNotifications.standard.length >= maxNotifications) {
      // Remove oldest notifications to make room
      const notificationsToRemove = this.activeNotifications.standard.slice(
        0, 
        this.activeNotifications.standard.length - maxNotifications + 1
      );
      
      notificationsToRemove.forEach(notification => {
        this.hideNotification(notification, true); // true = immediate
      });
    }
  }
  
  /**
   * Hides and removes a notification
   * @param {HTMLElement} notification - Notification element to hide
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @private
   */
  hideNotification(notification, immediate = false) {
    if (!notification || !notification.parentNode) {
      return;
    }
    
    // Remove from active notifications tracking
    if (notification.classList.contains('progress-notification')) {
      this.activeNotifications.progress = null;
    } else {
      const index = this.activeNotifications.standard.indexOf(notification);
      if (index !== -1) {
        this.activeNotifications.standard.splice(index, 1);
      }
    }
    
    if (immediate) {
      notification.remove();
      return;
    }
    
    // Animate out
    notification.classList.remove('show');
    
    // Remove after animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, this.config.transitionDuration);
  }
  
  /**
   * Update an existing progress notification
   * @param {string} message - Updated message
   * @param {number} progress - Updated progress percentage
   * @param {string} type - Optional notification type to change
   * @returns {HTMLElement|null} Updated notification element or null if not found
   */
  updateNotificationProgress(message, progress, type = null) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (this.logger) {
      this.logger.debug(`Updating progress notification: ${message} (${progress}%)`);
    }
    
    // Validate progress value
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      if (this.logger) {
        this.logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
      }
      progress = Math.max(0, Math.min(100, Number(progress) || 0));
    }
    
    const container = document.getElementById('notification-container');
    if (!container) {
      if (this.logger) {
        this.logger.warn('Notification container not found');
      }
      return null;
    }
    
    const notification = container.querySelector('.notification.progress-notification');
    
    if (notification) {
      const messageEl = notification.querySelector('.notification-message');
      const progressBar = notification.querySelector('.notification-progress-bar');
      
      if (messageEl) messageEl.textContent = message;
      if (progressBar) progressBar.style.width = `${progress}%`;
      
      // Update type if specified
      if (type && ['success', 'error', 'info', 'warning'].includes(type)) {
        // Remove existing type classes
        notification.classList.remove('success', 'error', 'info', 'warning');
        // Add new type class
        notification.classList.add(type);
      }
      
      return notification;
    } else {
      // Create a new one if it doesn't exist
      if (this.logger) {
        this.logger.debug('No existing progress notification found, creating new one');
      }
      return this.showNotification(message, type || 'info', progress);
    }
  }
  
  /**
   * Dismiss all active notifications
   * @param {boolean} immediate - Whether to remove immediately without animation
   */
  dismissAllNotifications(immediate = false) {
    if (this.logger) {
      this.logger.debug('Dismissing all notifications');
    }
    
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    // Get all notifications
    const notifications = container.querySelectorAll('.notification');
    
    // Hide each notification
    notifications.forEach(notification => {
      this.hideNotification(notification, immediate);
    });
    
    // Clear tracking arrays
    this.activeNotifications.standard = [];
    this.activeNotifications.progress = null;
  }
  
  /**
   * Dismiss a specific notification by ID
   * @param {string} id - ID of the notification to dismiss
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @returns {boolean} Whether the notification was found and dismissed
   */
  dismissNotificationById(id, immediate = false) {
    if (!id) {
      if (this.logger) {
        this.logger.warn('Attempted to dismiss notification with no ID');
      }
      return false;
    }
    
    if (this.logger) {
      this.logger.debug(`Dismissing notification with ID: ${id}`);
    }
    
    const notification = document.getElementById(id);
    if (notification && notification.classList.contains('notification')) {
      this.hideNotification(notification, immediate);
      return true;
    }
    
    if (this.logger) {
      this.logger.debug(`No notification found with ID: ${id}`);
    }
    return false;
  }
  
  /**
   * Get the count of currently active notifications
   * @returns {object} Counts of active notifications by type
   */
  getActiveNotificationCount() {
    return {
      standard: this.activeNotifications.standard.length,
      progress: this.activeNotifications.progress ? 1 : 0,
      total: this.activeNotifications.standard.length + (this.activeNotifications.progress ? 1 : 0)
    };
  }
  
  /**
   * Configure global notification defaults
   * @param {object} config - Configuration options to set
   */
  configureNotifications(config = {}) {
    if (this.logger) {
      this.logger.debug('Updating notification configuration', config);
    }
    
    // Update default configuration
    Object.assign(this.config, config);
  }
  
  /**
   * Service worker compatible notification that only logs
   * @param {string} message - Message to log
   * @param {string} type - Type of notification
   */
  log(message, type = 'info') {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (this.logger) {
      switch (type) {
        case 'error':
          this.logger.error(message);
          break;
        case 'warning':
          this.logger.warn(message);
          break;
        case 'info':
          this.logger.info(message);
          break;
        default:
          this.logger.debug(message);
      }
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}