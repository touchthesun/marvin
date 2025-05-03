// services/notification-service.js
import { LogManager } from '../utils/log-manager';

// Initialize logger
const logger = new LogManager({
  context: 'notification-service',
  maxEntries: 100
});

// Configuration defaults
const DEFAULT_CONFIG = {
  autoHideDuration: 3000,  // Duration before auto-hiding notifications (ms)
  maxNotifications: 3,     // Maximum number of notifications to show at once
  position: 'top-right',   // Position of notifications
  transitionDuration: 300  // Duration of fade animations (ms)
};

// Store for active notifications
const activeNotifications = {
  standard: [],
  progress: null
};

/**
 * Show notification with optional progress bar
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, info, warning)
 * @param {number|null} progress - Progress percentage (0-100) or null for no progress bar
 * @param {object} options - Additional options
 * @param {number} options.duration - Custom duration in ms before hiding
 * @param {boolean} options.dismissible - Whether notification can be dismissed manually
 * @param {string} options.id - Custom ID for the notification
 * @returns {HTMLElement} Notification element
 */
export function showNotification(message, type = 'success', progress = null, options = {}) {
    logger.debug(`Showing ${type} notification: ${message}${progress !== null ? ` (progress: ${progress}%)` : ''}`);
    
    if (!message) {
      logger.warn('Attempted to show notification with empty message');
      message = 'Notification';
    }
    
    // Validate notification type
    const validTypes = ['success', 'error', 'info', 'warning'];
    if (!validTypes.includes(type)) {
      logger.warn(`Invalid notification type: ${type}, defaulting to 'info'`);
      type = 'info';
    }
    
    // Validate progress value if provided
    if (progress !== null) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
        progress = Math.max(0, Math.min(100, Number(progress) || 0));
      }
    }
    
    // Merge options with defaults
    const config = { ...DEFAULT_CONFIG, ...options };
    
    // Handle progress notifications differently
    if (progress !== null) {
      return createOrUpdateProgressNotification(message, type, progress, config);
    }
    
    // Manage standard notifications
    return createStandardNotification(message, type, config);
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
function createOrUpdateProgressNotification(message, type, progress, config) {
    // Remove any existing progress notification
    const existingNotification = document.querySelector('.notification.progress-notification');
    if (existingNotification) {
      // If we have an existing progress notification, update it instead of creating a new one
      const messageEl = existingNotification.querySelector('.notification-message');
      const progressBar = existingNotification.querySelector('.notification-progress-bar');
      
      if (messageEl) messageEl.textContent = message;
      if (progressBar) progressBar.style.width = `${progress}%`;
      
      // Update the notification type if it changed
      existingNotification.className = `notification ${type} progress-notification show`;
      
      // Store reference
      activeNotifications.progress = existingNotification;
      
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
    document.body.appendChild(notification);
    
    // Add close button handler if dismissible
    if (config.dismissible) {
      const closeButton = notification.querySelector('.notification-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          hideNotification(notification);
        });
      }
    }
    
    // Fade in
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    // Store reference
    activeNotifications.progress = notification;
    
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
function createStandardNotification(message, type, config) {
    // Manage notification limit
    manageNotificationLimit(config.maxNotifications);
    
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
    document.body.appendChild(notification);
    
    // Add close button handler if dismissible
    if (config.dismissible) {
      const closeButton = notification.querySelector('.notification-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          hideNotification(notification);
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
        hideNotification(notification);
      }, duration);
    }
    
    // Store reference
    activeNotifications.standard.push(notification);
    
    return notification;
}

/**
 * Ensures we don't exceed the maximum number of standard notifications
 * @param {number} maxNotifications - Maximum allowed notifications
 * @private
 */
function manageNotificationLimit(maxNotifications) {
    if (activeNotifications.standard.length >= maxNotifications) {
      // Remove oldest notifications to make room
      const notificationsToRemove = activeNotifications.standard.slice(
        0, 
        activeNotifications.standard.length - maxNotifications + 1
      );
      
      notificationsToRemove.forEach(notification => {
        hideNotification(notification, true); // true = immediate
      });
    }
}

/**
 * Hides and removes a notification
 * @param {HTMLElement} notification - Notification element to hide
 * @param {boolean} immediate - Whether to remove immediately without animation
 * @private
 */
function hideNotification(notification, immediate = false) {
    if (!notification || !notification.parentNode) {
      return;
    }
    
    // Remove from active notifications tracking
    if (notification.classList.contains('progress-notification')) {
      activeNotifications.progress = null;
    } else {
      const index = activeNotifications.standard.indexOf(notification);
      if (index !== -1) {
        activeNotifications.standard.splice(index, 1);
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
    }, DEFAULT_CONFIG.transitionDuration);
}

/**
 * Update an existing progress notification
 * @param {string} message - Updated message
 * @param {number} progress - Updated progress percentage
 * @param {string} type - Optional notification type to change
 * @returns {HTMLElement|null} Updated notification element or null if not found
 */
export function updateNotificationProgress(message, progress, type = null) {
    logger.debug(`Updating progress notification: ${message} (${progress}%)`);
    
    // Validate progress value
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      logger.warn(`Invalid progress value: ${progress}, clamping to valid range`);
      progress = Math.max(0, Math.min(100, Number(progress) || 0));
    }
    
    const notification = document.querySelector('.notification.progress-notification');
    
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
      logger.debug('No existing progress notification found, creating new one');
      return showNotification(message, type || 'info', progress);
    }
}

/**
 * Dismiss all active notifications
 * @param {boolean} immediate - Whether to remove immediately without animation
 */
export function dismissAllNotifications(immediate = false) {
    logger.debug('Dismissing all notifications');
    
    // Get all notifications
    const notifications = document.querySelectorAll('.notification');
    
    // Hide each notification
    notifications.forEach(notification => {
      hideNotification(notification, immediate);
    });
    
    // Clear tracking arrays
    activeNotifications.standard = [];
    activeNotifications.progress = null;
}

/**
 * Dismiss a specific notification by ID
 * @param {string} id - ID of the notification to dismiss
 * @param {boolean} immediate - Whether to remove immediately without animation
 * @returns {boolean} Whether the notification was found and dismissed
 */
export function dismissNotificationById(id, immediate = false) {
    if (!id) {
      logger.warn('Attempted to dismiss notification with no ID');
      return false;
    }
    
    logger.debug(`Dismissing notification with ID: ${id}`);
    
    const notification = document.getElementById(id);
    if (notification && notification.classList.contains('notification')) {
      hideNotification(notification, immediate);
      return true;
    }
    
    logger.debug(`No notification found with ID: ${id}`);
    return false;
}

/**
 * Get the count of currently active notifications
 * @returns {object} Counts of active notifications by type
 */
export function getActiveNotificationCount() {
    return {
      standard: activeNotifications.standard.length,
      progress: activeNotifications.progress ? 1 : 0,
      total: activeNotifications.standard.length + (activeNotifications.progress ? 1 : 0)
    };
}

/**
 * Configure global notification defaults
 * @param {object} config - Configuration options to set
 */
export function configureNotifications(config = {}) {
    logger.debug('Updating notification configuration', config);
    
    // Update default configuration
    Object.assign(DEFAULT_CONFIG, config);
}
