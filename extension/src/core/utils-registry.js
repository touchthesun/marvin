// src/utils/utils-registry.js
import { LogManager } from '../utils/log-manager.js';
import { formatDate, formatTime, truncateText } from '../utils/formatting.js';
import { setupTimeout, clearTimeouts } from '../utils/timeout.js';
import { showSaveConfirmation, initSplitView } from '../utils/ui-utils.js';

// Export utils registry object
export const UtilsRegistry = {
  // Core utilities
  LogManager,
  
  // Formatting utilities
  formatting: {
    formatDate,
    formatTime,
    truncateText
  },
  
  // Timeout utilities
  timeout: {
    setupTimeout,
    clearTimeouts
  },
  
  // UI utilities
  ui: {
    showSaveConfirmation,
    initSplitView
  }
};