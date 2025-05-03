// content/network-monitor.js

// Monitor network status and relay to service worker
window.addEventListener('online', () => {
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: true 
    });
  });
  
  window.addEventListener('offline', () => {
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: false 
    });
  });
  
  // Send initial status
  chrome.runtime.sendMessage({ 
    action: 'networkStatusChange', 
    isOnline: navigator.onLine 
  });