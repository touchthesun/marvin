// services/notification-service.js
import { BaseService } from '../core/base-service.js';
import { LogManager } from '../utils/log-manager.js';

/**
 * Notification Service - Manages UI notifications throughout the extension
 */
export class NotificationService extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    autoHideDuration: 3000,     // Duration before auto-hiding notifications (ms)
    maxNotifications: 3,        // Maximum number of notifications to show at once
    position: 'top-right',      // Position of notifications
    transitionDuration: 300,    // Duration of fade animations (ms)
    maxCreatedNotifications: 50, // Track created notifications for diagnostics
    maxHistorySize: 100,        // Maximum size of notification history
    maxActiveElements: 100      // Maximum number of active DOM elements
  };

  /**
   * Create a new NotificationService instance
   * @param {object} options - Service options
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 3,
      retryBackoffBase: 1000,
      retryBackoffMax: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });

    // State initialization
    this._config = {
      ...NotificationService._DEFAULT_CONFIG,
      ...options
    };

    // Store for active notifications
    this._activeNotifications = {
      standard: [],
      progress: null
    };
    
    // Track notification statistics
    this._stats = {
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
    this._isServiceWorkerContext = typeof self !== 'undefined' && 
                                 typeof document === 'undefined';
  }

  /**
   * Initialize the notification service
   * @returns {Promise<boolean>} Success state
   * @private
   */
  async _performInitialization() {
    try {
      // Create logger
      this._logger = new LogManager({
        context: 'notification-service',
        isBackgroundScript: this._isServiceWorkerContext,
        maxEntries: 100
      });
      
      this._logger.info('Initializing notification service');
      
      // Create notification container if in browser context
      if (!this._isServiceWorkerContext) {
        await this._ensureNotificationContainer();
      } else {
        this._logger.info('Running in service worker context - UI notifications disabled');
      }
      
      this._logger.info('Notification service initialized successfully');
      return true;
    } catch (error) {
      this._logger?.error('Error initializing notification service:', error);
      throw error;
    }
  }

  /**
   * Ensure notification container exists in the DOM
   * @returns {Promise<HTMLElement|null>} The container element or null
   * @private
   */
  async _ensureNotificationContainer() {
    // Only run in browser context
    if (this._isServiceWorkerContext) {
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
      container.className = `notification-container ${this._config.position}`;
      document.body.appendChild(container);
      
      // Track created element
      this._resourceTracker.trackDOMElement(container);
      
      // Add styles if they don't exist
      if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = this._getNotificationStyles();
        document.head.appendChild(style);
        
        // Track created element
        this._resourceTracker.trackDOMElement(style);
      }
      
      this._logger.debug('Notification container created');
      return container;
    } catch (error) {
      this._logger.error('Error creating notification container:', error);
      return null;
    }
  }

  /**
   * Get CSS styles for notifications
   * @returns {string} CSS styles
   * @private
   */
  _getNotificationStyles() {
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
        transition: opacity ${this._config.transitionDuration}ms, transform ${this._config.transitionDuration}ms;
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
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return null;
      }
    }

    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      this._logger?.warn('Circuit breaker open, notification suppressed');
      return null;
    }
    
    // Track notification creation
    this._stats.created++;
    if (this._stats.byType[type] !== undefined) {
      this._stats.byType[type]++;
    }
    
    // Add to history with limited size
    this._trackNotificationHistory(message, type, progress);
    
    this._logger?.debug(`Showing ${type} notification: ${message}${progress !== null ? ` (progress: ${progress}%)` : ''}`);

    // Early return in service worker context
    if (this._isServiceWorkerContext) {
      return null;
    }
    
    if (!message) {
      this._logger.warn('Attempted to show notification with empty message');
      message = 'Notification';
    }
    
    // Validate notification type
    const validTypes = ['success', 'error', 'info', 'warning'];
    if (!validTypes.includes(type)) {
      this._logger.warn(`Invalid notification type: ${type}, defaulting to 'info'`);
      type = 'info';
    }
    
    // Validate progress value if provided
    if (progress !== null) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        this._logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
    }
    
    // Merge options with defaults
    const config = { ...this._config, ...options };
    
    try {
      // Ensure notification container exists
      const container = await this._ensureNotificationContainer();
      if (!container) {
        this._logger.error('Failed to create notification container');
        return null;
      }
      
      // Handle progress notifications differently
      if (progress !== null) {
        return this._createOrUpdateProgressNotification(message, type, progress, config);
      }
      
      // Manage standard notifications
      return this._createStandardNotification(message, type, config);
    } catch (error) {
      this._logger.error('Error showing notification:', error);
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
  _trackNotificationHistory(message, type, progress) {
    // Add to history with timestamp
    this._stats.history.unshift({
      message,
      type,
      progress,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this._stats.history.length > this._config.maxCreatedNotifications) {
      this._stats.history.pop();
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
  _createOrUpdateProgressNotification(message, type, progress, config) {
    try {
      const container = document.getElementById('notification-container');
      if (!container) {
        this._logger.warn('Notification container not found');
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
        this._activeNotifications.progress = existingNotification;
        
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
      this._resourceTracker.trackDOMElement(notification);
      
      // Add close button handler if dismissible
      if (config.dismissible !== false) {
        const closeButton = notification.querySelector('.notification-close');
        if (closeButton) {
          const handleClick = () => {
            this._hideNotification(notification);
          };
          
          this._resourceTracker.trackEventListener(closeButton, 'click', handleClick);
        }
      }
      
      // Fade in
      requestAnimationFrame(() => {
        notification.classList.add('show');
      });
      
      // Store reference
      this._activeNotifications.progress = notification;
      
      return notification;
    } catch (error) {
      this._logger.error('Error creating progress notification:', error);
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
  _createStandardNotification(message, type, config) {
    try {
      const container = document.getElementById('notification-container');
      if (!container) {
        this._logger.warn('Notification container not found');
        return null;
      }
      
      // Manage notification limit
      this._manageNotificationLimit(config.maxNotifications);
      
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
      this._resourceTracker.trackDOMElement(notification);
      
      // Add close button handler if dismissible
      if (config.dismissible !== false) {
        const closeButton = notification.querySelector('.notification-close');
        if (closeButton) {
          const handleClick = () => {
            this._hideNotification(notification);
          };
          
          this._resourceTracker.trackEventListener(closeButton, 'click', handleClick);
        }
      }
      
      // Fade in
      requestAnimationFrame(() => {
        notification.classList.add('show');
      });
      
      // Auto-hide after duration
      const duration = typeof config.duration === 'number' ? config.duration : config.autoHideDuration;
      if (duration > 0) {
        const timeoutId = this._resourceTracker.trackTimeout(() => {
          this._hideNotification(notification);
        }, duration);
        
        // Store timeout ID on the element for cleanup
        notification.dataset.timeoutId = String(timeoutId);
      }
      
      // Store reference
      this._activeNotifications.standard.push(notification);
      
      return notification;
    } catch (error) {
      this._logger.error('Error creating standard notification:', error);
      return null;
    }
  }

  /**
   * Ensures we don't exceed the maximum number of standard notifications
   * @param {number} maxNotifications - Maximum allowed notifications
   * @private
   */
  _manageNotificationLimit(maxNotifications) {
    try {
      if (this._activeNotifications.standard.length >= maxNotifications) {
        // Remove oldest notifications to make room
        const notificationsToRemove = this._activeNotifications.standard.slice(
          0, 
          this._activeNotifications.standard.length - maxNotifications + 1
        );
        
        notificationsToRemove.forEach(notification => {
          this._hideNotification(notification, true); // true = immediate
        });
      }
    } catch (error) {
      this._logger.error('Error managing notification limit:', error);
    }
  }

  /**
   * Hides and removes a notification
   * @param {HTMLElement} notification - Notification element to hide
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @private
   */
  _hideNotification(notification, immediate = false) {
    try {
      if (!notification || !notification.parentNode) {
        return;
      }
      
      // Track dismissal
      this._stats.dismissed++;
      
      // Clear any auto-hide timeout
      if (notification.dataset.timeoutId) {
        clearTimeout(Number(notification.dataset.timeoutId));
        delete notification.dataset.timeoutId;
      }
      
      // Remove from active notifications tracking
      if (notification.classList.contains('progress-notification')) {
        this._activeNotifications.progress = null;
      } else {
        const index = this._activeNotifications.standard.indexOf(notification);
        if (index !== -1) {
          this._activeNotifications.standard.splice(index, 1);
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
      }, this._config.transitionDuration);
    } catch (error) {
      this._logger.error('Error hiding notification:', error);
      
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
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return null;
      }
    }
    
    this._logger.debug(`Updating progress notification: ${message} (${progress}%)`);
    
    // Early return in service worker context
    if (this._isServiceWorkerContext) {
      return null;
    }
    
    try {
      // Validate progress value
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        this._logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
      
      const container = document.getElementById('notification-container');
      if (!container) {
        this._logger.warn('Notification container not found');
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
        this._logger.debug('No existing progress notification found, creating new one');
        return this.showNotification(message, type || 'info', progress);
      }
    } catch (error) {
      this._logger.error('Error updating progress notification:', error);
      return null;
    }
  }

  /**
   * Dismiss all active notifications
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @returns {Promise<void>}
   */
  async dismissAllNotifications(immediate = false) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return;
      }
    }
    
    this._logger.debug('Dismissing all notifications');
    
    // Early return in service worker context
    if (this._isServiceWorkerContext) {
      return;
    }
    
    try {
      const container = document.getElementById('notification-container');
      if (!container) return;
      
      // Get all notifications
      const notifications = container.querySelectorAll('.notification');
      
      // Hide each notification
      notifications.forEach(notification => {
        this._hideNotification(notification, immediate);
      });
      
      // Clear tracking arrays
      this._activeNotifications.standard = [];
      this._activeNotifications.progress = null;
    } catch (error) {
      this._logger.error('Error dismissing all notifications:', error);
    }
  }

  /**
   * Dismiss a specific notification by ID
   * @param {string} id - ID of the notification to dismiss
   * @param {boolean} immediate - Whether to remove immediately without animation
   * @returns {Promise<boolean>} Whether the notification was found and dismissed
   */
  async dismissNotificationById(id, immediate = false) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return false;
      }
    }
    
    if (!id) {
      this._logger.warn('Attempted to dismiss notification with no ID');
      return false;
    }
    
    // Early return in service worker context
    if (this._isServiceWorkerContext) {
      return false;
    }
    
    try {
      this._logger.debug(`Dismissing notification with ID: ${id}`);
      
      const notification = document.getElementById(id);
      if (notification && notification.classList.contains('notification')) {
        this._hideNotification(notification, immediate);
        return true;
      }
      
      this._logger.debug(`No notification found with ID: ${id}`);
      return false;
    } catch (error) {
      this._logger.error(`Error dismissing notification with ID ${id}:`, error);
      return false;
    }
  }

  /**
   * Get the count of currently active notifications
   * @returns {Promise<object>} Counts of active notifications by type
   */
  async getActiveNotificationCount() {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return { standard: 0, progress: 0, total: 0 };
      }
    }
    
    return {
      standard: this._activeNotifications.standard.length,
      progress: this._activeNotifications.progress ? 1 : 0,
      total: this._activeNotifications.standard.length + (this._activeNotifications.progress ? 1 : 0)
    };
  }

  /**
   * Configure global notification defaults
   * @param {object} config - Configuration options to set
   * @returns {Promise<void>}
   */
  async configureNotifications(config = {}) {
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        return;
      }
    }
    
    this._logger.debug('Updating notification configuration', config);
    
    // Update default configuration
    Object.assign(this._config, config);
    
    // Update position if it changed
    if (config.position && !this._isServiceWorkerContext) {
      try {
        const container = document.getElementById('notification-container');
        if (container) {
          // Remove all position classes
          container.classList.remove('top-right', 'top-left', 'bottom-right', 'bottom-left');
          // Add new position class
          container.classList.add(config.position);
        }
      } catch (error) {
        this._logger.error('Error updating notification position:', error);
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
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger?.error('Failed to initialize notification service:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
      }
    }
    
    switch (type) {
      case 'error':
        this._logger.error(message);
        break;
      case 'warning':
        this._logger.warn(message);
        break;
      case 'success':
        this._logger.info(`[SUCCESS] ${message}`);
        break;
      case 'info':
        this._logger.info(message);
        break;
      default:
        this._logger.debug(message);
    }
  }

  /**
   * Get notification service statistics
   * @returns {object} Service statistics
   */
  getStatistics() {
    return {
      created: this._stats.created,
      dismissed: this._stats.dismissed,
      active: this._activeNotifications.standard.length + (this._activeNotifications.progress ? 1 : 0),
      byType: { ...this._stats.byType },
      recentNotifications: this._stats.history.slice(0, 10) // Return most recent 10
    };
  }

  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      hasLogger: !!this._logger,
      isServiceWorkerContext: this._isServiceWorkerContext,
      activeElements: this._resourceTracker.getDOMElementCount(),
      activeEventHandlers: this._resourceTracker.getEventListenerCount(),
      activeNotifications: {
        standard: this._activeNotifications.standard.length,
        progress: this._activeNotifications.progress ? 1 : 0,
        total: this._activeNotifications.standard.length + (this._activeNotifications.progress ? 1 : 0)
      },
      stats: {
        created: this._stats.created,
        dismissed: this._stats.dismissed
      }
    };
  }

  /**
   * Handle memory pressure
   * @param {object} snapshot - Memory snapshot
   * @private
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Clean up old notifications
    await this._cleanupOldNotifications();
    
    // Clear notification history
    this._clearNotificationHistory();
  }

  /**
   * Clean up old notifications
   * @private
   */
  async _cleanupOldNotifications() {
    const now = Date.now();
    const oldNotifications = this._activeNotifications.standard.filter(notification => {
      const timestamp = parseInt(notification.dataset.timestamp || '0');
      return now - timestamp > this._maxTaskAge;
    });

    for (const notification of oldNotifications) {
      await this._hideNotification(notification, true);
    }

    if (oldNotifications.length > 0) {
      this._logger?.warn(`Cleaned up ${oldNotifications.length} old notifications`);
    }
  }

  /**
   * Clear notification history
   * @private
   */
  _clearNotificationHistory() {
    if (this._stats.history.length > this._config.maxHistorySize) {
      this._stats.history = this._stats.history.slice(0, this._config.maxHistorySize);
      this._logger?.debug('Cleared notification history');
    }
  }

  /**
   * Clean up resources
   * @private
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up notification service');
    
    // Dismiss all notifications
    await this._dismissAllNotifications(true);
    
    // Clear and nullify active notifications
    this._activeNotifications.standard = [];
    this._activeNotifications.progress = null;
    this._activeNotifications = null;
    
    // Clear and nullify configuration
    this._config = null;
    
    // Clear and nullify statistics
    this._stats = null;
  }
}