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
    // State initialization
    this.initialized = false;
    this.logger = null;
    
    // Configuration defaults
    this.config = {
      autoHideDuration: 3000,     // Duration before auto-hiding notifications (ms)
      maxNotifications: 3,        // Maximum number of notifications to show at once
      position: 'top-right',      // Position of notifications
      transitionDuration: 300,    // Duration of fade animations (ms)
      maxCreatedNotifications: 50 // Track created notifications for diagnostics
    };

    // Store for active notifications
    this.activeNotifications = {
      standard: [],
      progress: null
    };
    
    // Track event handlers for cleanup
    this.eventHandlers = new Map();
    
    // Track created DOM elements for cleanup
    this.createdElements = new Set();
    
    // Track notification statistics
    this.stats = {
      created: 0,
      dismissed: 0,
      byType: {
        success: 0,
        error: 0,
        warning: 0,
        info: 0
      },
      history: [] // Store recent notifications for debugging
    };
    
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
        await this.ensureNotificationContainer();
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
   * @returns {Promise<HTMLElement|null>} The container element or null
   * @private
   */
  async ensureNotificationContainer() {
    // Only run in browser context
    if (this.isServiceWorkerContext) {
      return null;
    }
    
    try {
      // Check if container already exists
      let container = document.getElementById('notification-container');
      if (container) {
        return container;
      }
      
      // Create container
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = `notification-container ${this.config.position}`;
      document.body.appendChild(container);
      
      // Track created element
      this.createdElements.add(container);
      
      // Add styles if they don't exist
      if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = this.getNotificationStyles();
        document.head.appendChild(style);
        
        // Track created element
        this.createdElements.add(style);
      }
      
      this.logger.debug('Notification container created');
      return container;
    } catch (error) {
      this.logger.error('Error creating notification container:', error);
      return null;
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
        pointer-events: none;
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
        position: relative;
        pointer-events: auto;
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
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
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
   * @returns {Promise<HTMLElement|null>} Notification element or null
   */
  async showNotification(message, type = 'success', progress = null, options = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return null;
      }
    }
    
    // Track notification creation
    this.stats.created++;
    if (this.stats.byType[type] !== undefined) {
      this.stats.byType[type]++;
    }
    
    // Add to history with limited size
    this.trackNotificationHistory(message, type, progress);
    
    this.logger.debug(`Showing ${type} notification: ${message}${progress !== null ? ` (progress: ${progress}%)` : ''}`);

    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      // We can still log the notification but can't show UI
      return null;
    }
    
    if (!message) {
      this.logger.warn('Attempted to show notification with empty message');
      message = 'Notification';
    }
    
    // Validate notification type
    const validTypes = ['success', 'error', 'info', 'warning'];
    if (!validTypes.includes(type)) {
      this.logger.warn(`Invalid notification type: ${type}, defaulting to 'info'`);
      type = 'info';
    }
    
    // Validate progress value if provided
    if (progress !== null) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        this.logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
    }
    
    // Merge options with defaults
    const config = { ...this.config, ...options };
    
    try {
      // Ensure notification container exists
      const container = await this.ensureNotificationContainer();
      if (!container) {
        this.logger.error('Failed to create notification container');
        return null;
      }
      
      // Handle progress notifications differently
      if (progress !== null) {
        return this.createOrUpdateProgressNotification(message, type, progress, config);
      }
      
      // Manage standard notifications
      return this.createStandardNotification(message, type, config);
    } catch (error) {
      this.logger.error('Error showing notification:', error);
      return null;
    }
  }
  
  /**
   * Track notification in history for debugging
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @param {number|null} progress - Progress value if any
   * @private
   */
  trackNotificationHistory(message, type, progress) {
    // Add to history with timestamp
    this.stats.history.unshift({
      message,
      type,
      progress,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.stats.history.length > this.config.maxCreatedNotifications) {
      this.stats.history.pop();
    }
  }
  
  /**
   * Creates or updates a progress notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type
   * @param {number} progress - Progress percentage
   * @param {object} config - Configuration options
   * @returns {HTMLElement|null} Notification element
   * @private
   */
  createOrUpdateProgressNotification(message, type, progress, config) {
    try {
      const container = document.getElementById('notification-container');
      if (!container) {
        this.logger.warn('Notification container not found');
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
        ${config.dismissible !== false ? '<button class="notification-close" aria-label="Close notification">&times;</button>' : ''}
      `;
      
      // Add to DOM and track
      container.appendChild(notification);
      this.createdElements.add(notification);
      
      // Add close button handler if dismissible
      if (config.dismissible !== false) {
        const closeButton = notification.querySelector('.notification-close');
        if (closeButton) {
          const handleClick = () => {
            this.hideNotification(notification);
          };
          
          closeButton.addEventListener('click', handleClick);
          
          // Store handler reference for cleanup
          this.eventHandlers.set(closeButton, {
            event: 'click',
            handler: handleClick
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
    } catch (error) {
      this.logger.error('Error creating progress notification:', error);
      return null;
    }
  }
  
  /**
   * Creates a standard (non-progress) notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type
   * @param {object} config - Configuration options
   * @returns {HTMLElement|null} Notification element
   * @private
   */
  createStandardNotification(message, type, config) {
    try {
      const container = document.getElementById('notification-container');
      if (!container) {
        this.logger.warn('Notification container not found');
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
        ${config.dismissible !== false ? '<button class="notification-close" aria-label="Close notification">&times;</button>' : ''}
      `;
      
      // Add to DOM and track
      container.appendChild(notification);
      this.createdElements.add(notification);
      
      // Add close button handler if dismissible
      if (config.dismissible !== false) {
        const closeButton = notification.querySelector('.notification-close');
        if (closeButton) {
          const handleClick = () => {
            this.hideNotification(notification);
          };
          
          closeButton.addEventListener('click', handleClick);
          
          // Store handler reference for cleanup
          this.eventHandlers.set(closeButton, {
            event: 'click',
            handler: handleClick
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
        const timeoutId = setTimeout(() => {
          this.hideNotification(notification);
        }, duration);
        
        // Store timeout ID on the element for cleanup
        notification.dataset.timeoutId = String(timeoutId);
      }
      
      // Store reference
      this.activeNotifications.standard.push(notification);
      
      return notification;
    } catch (error) {
      this.logger.error('Error creating standard notification:', error);
      return null;
    }
  }
  
  /**
   * Ensures we don't exceed the maximum number of standard notifications
   * @param {number} maxNotifications - Maximum allowed notifications
   * @private
   */
  manageNotificationLimit(maxNotifications) {
    try {
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
    } catch (error) {
      this.logger.error('Error managing notification limit:', error);
    }
  }
  
  /**
   * Hides and removes a notification
   * @param {HTMLElement} notification - Notification element to hide
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @private
   */
  hideNotification(notification, immediate = false) {
    try {
      if (!notification || !notification.parentNode) {
        return;
      }
      
      // Track dismissal
      this.stats.dismissed++;
      
      // Clear any auto-hide timeout
      if (notification.dataset.timeoutId) {
        clearTimeout(Number(notification.dataset.timeoutId));
        delete notification.dataset.timeoutId;
      }
      
      // Remove event listeners
      const closeButton = notification.querySelector('.notification-close');
      if (closeButton && this.eventHandlers.has(closeButton)) {
        const { event, handler } = this.eventHandlers.get(closeButton);
        closeButton.removeEventListener(event, handler);
        this.eventHandlers.delete(closeButton);
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
      
      // Stop tracking this element
      this.createdElements.delete(notification);
      
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
    } catch (error) {
      this.logger.error('Error hiding notification:', error);
      
      // Force removal on error
      if (notification && notification.parentNode) {
        notification.remove();
      }
    }
  }
  
  /**
   * Update an existing progress notification
   * @param {string} message - Updated message
   * @param {number} progress - Updated progress percentage
   * @param {string} type - Optional notification type to change
   * @returns {Promise<HTMLElement|null>} Updated notification element or null if not found
   */
  async updateNotificationProgress(message, progress, type = null) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return null;
      }
    }
    
    this.logger.debug(`Updating progress notification: ${message} (${progress}%)`);
    
    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      return null;
    }
    
    try {
      // Validate progress value
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        this.logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
      
      const container = document.getElementById('notification-container');
      if (!container) {
        this.logger.warn('Notification container not found');
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
        this.logger.debug('No existing progress notification found, creating new one');
        return this.showNotification(message, type || 'info', progress);
      }
    } catch (error) {
      this.logger.error('Error updating progress notification:', error);
      return null;
    }
  }
  
  /**
   * Dismiss all active notifications
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @returns {Promise<void>}
   */
  async dismissAllNotifications(immediate = false) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return;
      }
    }
    
    this.logger.debug('Dismissing all notifications');
    
    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      return;
    }
    
    try {
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
    } catch (error) {
      this.logger.error('Error dismissing all notifications:', error);
    }
  }
  
  /**
   * Dismiss a specific notification by ID
   * @param {string} id - ID of the notification to dismiss
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @returns {Promise<boolean>} Whether the notification was found and dismissed
   */
  async dismissNotificationById(id, immediate = false) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return false;
      }
    }
    
    if (!id) {
      this.logger.warn('Attempted to dismiss notification with no ID');
      return false;
    }
    
    // Early return in service worker context
    if (this.isServiceWorkerContext) {
      return false;
    }
    
    try {
      this.logger.debug(`Dismissing notification with ID: ${id}`);
      
      const notification = document.getElementById(id);
      if (notification && notification.classList.contains('notification')) {
        this.hideNotification(notification, immediate);
        return true;
      }
      
      this.logger.debug(`No notification found with ID: ${id}`);
      return false;
    } catch (error) {
      this.logger.error(`Error dismissing notification with ID ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Get the count of currently active notifications
   * @returns {Promise<object>} Counts of active notifications by type
   */
  async getActiveNotificationCount() {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return { standard: 0, progress: 0, total: 0 };
      }
    }
    
    return {
      standard: this.activeNotifications.standard.length,
      progress: this.activeNotifications.progress ? 1 : 0,
      total: this.activeNotifications.standard.length + (this.activeNotifications.progress ? 1 : 0)
    };
  }
  
  /**
   * Configure global notification defaults
   * @param {object} config - Configuration options to set
   * @returns {Promise<void>}
   */
  async configureNotifications(config = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        return;
      }
    }
    
    this.logger.debug('Updating notification configuration', config);
    
    // Update default configuration
    Object.assign(this.config, config);
    
    // Update position if it changed
    if (config.position && !this.isServiceWorkerContext) {
      try {
        const container = document.getElementById('notification-container');
        if (container) {
          // Remove all position classes
          container.classList.remove('top-right', 'top-left', 'bottom-right', 'bottom-left');
          // Add new position class
          container.classList.add(config.position);
        }
      } catch (error) {
        this.logger.error('Error updating notification position:', error);
      }
    }
  }
  
  /**
   * Service worker compatible notification that only logs
   * @param {string} message - Message to log
   * @param {string} type - Type of notification
   * @returns {Promise<void>}
   */
  async log(message, type = 'info') {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
      }
    }
    
    switch (type) {
      case 'error':
        this.logger.error(message);
        break;
      case 'warning':
        this.logger.warn(message);
        break;
      case 'success':
        this.logger.info(`[SUCCESS] ${message}`);
        break;
      case 'info':
        this.logger.info(message);
        break;
      default:
        this.logger.debug(message);
    }
  }
  
  /**
   * Get notification service statistics
   * @returns {object} Service statistics
   */
  getStatistics() {
    return {
      created: this.stats.created,
      dismissed: this.stats.dismissed,
      active: this.activeNotifications.standard.length + (this.activeNotifications.progress ? 1 : 0),
      byType: { ...this.stats.byType },
      recentNotifications: this.stats.history.slice(0, 10) // Return most recent 10
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasLogger: !!this.logger,
      isServiceWorkerContext: this.isServiceWorkerContext,
      activeElements: this.createdElements.size,
      activeEventHandlers: this.eventHandlers.size,
      activeNotifications: {
        standard: this.activeNotifications.standard.length,
        progress: this.activeNotifications.progress ? 1 : 0,
        total: this.activeNotifications.standard.length + (this.activeNotifications.progress ? 1 : 0)
      },
      stats: {
        created: this.stats.created,
        dismissed: this.stats.dismissed
      }
    };
  }
  
  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up notification service');
    
    // Dismiss all notifications
    await this.dismissAllNotifications(true);
    
    // Remove event listeners
    this.eventHandlers.forEach((data, element) => {
      try {
        const { event, handler } = data;
        element.removeEventListener(event, handler);
      } catch (error) {
        this.logger.warn('Error removing event listener:', error);
      }
    });
    
    // Clear event handlers map
    this.eventHandlers.clear();
    
    // Remove created DOM elements
    this.createdElements.forEach(element => {
      try {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      } catch (error) {
        this.logger.warn('Error removing DOM element:', error);
      }
    });
    
    // Clear created elements set
    this.createdElements.clear();
    
    // Reset state
    this.activeNotifications.standard = [];
    this.activeNotifications.progress = null;
    this.initialized = false;
    
    this.logger.debug('Notification service cleanup complete');
  }
}