// src/utils/utils-registry.js
import { LogManager } from '../utils/log-manager';
import { formatDate, formatTime, truncateText } from '../utils/formatting';
import { setupTimeout, clearTimeouts } from '../utils/timeout.js';
import { showSaveConfirmation, initSplitView } from '../utils/ui-utils';

// Export utils registry object
export const UtilsRegistry = {
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