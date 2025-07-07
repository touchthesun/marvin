// Store global scope reference that works in both browser and service worker
const globalScope = typeof self !== 'undefined' ? self : 
                   (typeof window !== 'undefined' ? window : global);

/**
 * Sets up timeout monitoring - only works in browser context
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Function} Function to clear the timeout
 */
export function setupTimeout(timeout = 10000) {
  let timeoutId = null;
  
  // Only set up timeout in browser context (not in service worker)
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    // Set a timeout to detect if page is hanging
    timeoutId = setTimeout(() => {
      // If this runs, the page initialization is taking too long
      if (document.body) {
        document.body.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <h1>Dashboard Loading Error</h1>
            <p>The dashboard is taking too long to load or has encountered an error.</p>
            <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px;">
              Reload Dashboard
            </button>
            <button onclick="window.close()" style="padding: 10px 20px; margin-left: 10px;">
              Close Tab
            </button>
          </div>
        `;
      }
    }, timeout);
    
    // Clear the timeout if page loads successfully
    window.addEventListener('DOMContentLoaded', () => {
      clearTimeout(timeoutId);
    });
  }
  
  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Sets up memory monitoring - only works in browser context
 * @param {number} threshold - Memory threshold in MB
 * @param {number} interval - Check interval in milliseconds
 * @returns {Function} Function to stop monitoring
 */
export function setupMemoryMonitoring(threshold = 200, interval = 5000) {
  let intervalId = null;
  
  // Only setup memory monitoring in browser context with performance.memory
  if (typeof window !== 'undefined' && 
      typeof performance !== 'undefined' && 
      performance.memory) {
    
    intervalId = setInterval(() => {
      const usedHeap = performance.memory.usedJSHeapSize / (1024 * 1024);
      if (usedHeap > threshold) {
        console.warn(`High memory usage detected: ${Math.round(usedHeap)}MB`);
        // Optionally take action to reduce memory usage
      }
    }, interval);
  }
  
  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  };
}

/**
 * Clear all timeouts - works in any context
 */
export function clearTimeouts() {
  // This is a utility function to clear all timeouts - it actually doesn't do
  // what the name suggests (since there's no standard way to clear ALL timeouts)
  // but it's kept for API compatibility
  return true;
}

// Export default for compatibility with older code
export default {
  setupTimeout,
  setupMemoryMonitoring,
  clearTimeouts
};