// content/network-monitor.js

// Helper function to safely send messages to the extension
function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      // Check for connection errors and handle gracefully
      if (chrome.runtime.lastError) {
        // Don't log connection errors to avoid spam
        if (chrome.runtime.lastError.message !== 'Could not establish connection. Receiving end does not exist.') {
          console.warn('Network monitor: Failed to send message to extension:', chrome.runtime.lastError.message);
        }
      }
    });
    return true;
  } catch (error) {
    console.warn('Network monitor: Failed to send message to extension, context may be invalidated', error);
    return false;
  }
}

// Monitor network status and relay to service worker
window.addEventListener('online', () => {
  safeSendMessage({ 
    action: 'networkStatusChange', 
    isOnline: true 
  });
});

window.addEventListener('offline', () => {
  safeSendMessage({ 
    action: 'networkStatusChange', 
    isOnline: false 
  });
});

// Send initial status
safeSendMessage({ 
  action: 'networkStatusChange', 
  isOnline: navigator.onLine 
});