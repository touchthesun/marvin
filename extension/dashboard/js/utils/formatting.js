// utils/formatting.js

/**
 * Format a date for display
 * @param {number|string} timestamp - Timestamp to format
 * @returns {string} Formatted date
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  

/**
 * Format context for display
 * @param {Array} contexts - Browser context array
 * @returns {string} Formatted context string
 */
export function formatContext(contexts) {
    if (!contexts || contexts.length === 0) return '';
    
    const BrowserContextLabels = {
      'ACTIVE_TAB': 'Active Tab',
      'OPEN_TAB': 'Open Tab',
      'BOOKMARK': 'Bookmark',
      'HISTORY': 'History'
    };
    
    return contexts.map(c => BrowserContextLabels[c] || c).join(', ');
  }

/**
 * Format task status for display
 */
export function formatTaskStatus(status) {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      case 'analyzing':
        return 'Analyzing';
      case 'complete':
        return 'Completed';
      case 'error':
        return 'Failed';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

/**
 * Check if two dates are the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} Whether dates are the same day
 */
export function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }