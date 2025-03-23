// content/content.js

// Helper function to safely send messages to the extension
function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message);
    return true;
  } catch (error) {
    console.log('Failed to send message to extension, context may be invalidated');
    return false;
  }
}

// Notify background script that content script is active
safeSendMessage({ 
  action: 'contentScriptLoaded', 
  url: window.location.href 
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractContent') {
    try {
      // Extract page content
      const content = document.documentElement.outerHTML;
      
      // Basic metadata extraction
      const metadata = {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        author: document.querySelector('meta[name="author"]')?.content || '',
        // Open Graph metadata
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
        ogImage: document.querySelector('meta[property="og:image"]')?.content || ''
      };
      
      sendResponse({ content, metadata });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return true;
  } else if (message.action === 'updateCaptureStatus') {
    showCaptureOverlay(message.status);
    return true;
  }
});

// Show status overlay when a page is captured
function showCaptureOverlay(status) {
  // Create overlay element if it doesn't exist
  let overlay = document.getElementById('marvin-capture-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'marvin-capture-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '20px';
    overlay.style.right = '20px';
    overlay.style.padding = '10px 15px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.color = 'white';
    overlay.style.borderRadius = '5px';
    overlay.style.zIndex = '9999';
    overlay.style.fontSize = '14px';
    overlay.style.transition = 'opacity 0.3s ease-in-out';
    document.body.appendChild(overlay);
  }
  
  // Update overlay content based on status
  if (status === 'capturing') {
    overlay.textContent = 'Marvin is capturing this page...';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  } else if (status === 'success') {
    overlay.textContent = 'Page captured successfully!';
    overlay.style.backgroundColor = 'rgba(27, 94, 32, 0.8)';
    
    // Hide overlay after delay
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }, 3000);
  } else if (status === 'error') {
    overlay.textContent = 'Error capturing page';
    overlay.style.backgroundColor = 'rgba(183, 28, 28, 0.8)';
    
    // Hide overlay after delay
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }, 3000);
  }
}

// Report network status to service worker
function reportNetworkStatus() {
  safeSendMessage({ 
    action: 'networkStatusChange', 
    isOnline: navigator.onLine 
  });
}

// Listen for online/offline events
window.addEventListener('online', reportNetworkStatus);
window.addEventListener('offline', reportNetworkStatus);

// Report initial network status
reportNetworkStatus();

// Handle page visibility for auto-capture logic
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    safeSendMessage({ action: 'pageVisible', url: window.location.href });
  } else {
    safeSendMessage({ action: 'pageHidden', url: window.location.href });
  }
});

// Re-establish connection with extension after reloads
window.addEventListener('focus', () => {
  // Try to reconnect with extension
  if (safeSendMessage({ action: 'contentScriptPing' })) {
    console.log('Reconnected with extension');
  }
});