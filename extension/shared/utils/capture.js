/**
 * Capture a URL with consistent handling across interfaces
 * @param {string} url - The URL to capture
 * @param {object} options - Optional parameters
 * @returns {Promise<object>} Capture result
 */
export async function captureUrl(url, options = {}) {
    const { 
      context = 'ACTIVE_TAB', 
      tabId = null,
      windowId = null,
      title = null,
      content = null
    } = options;
    
    try {
      console.log(`Capture request for ${url}`);
      
      // Always use a structured message
      const message = {
        action: 'captureUrl',
        data: {
          url,
          context,
          tabId,
          windowId,
          title,
          content,
          browser_contexts: [context]
        }
      };
      
      // Send message to background script
      const response = await chrome.runtime.sendMessage(message);
      
      console.log('Capture response:', response);
      
      // Validate response structure
      if (!response) {
        throw new Error('No response from background script');
      }
      
      return response;
    } catch (error) {
      console.error('Capture error:', error);
      // Return a structured error response
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
  
  /**
   * Capture the current active tab
   * @returns {Promise<object>} Capture result
   */
  export async function captureCurrentTab() {
    try {
      // Get current tab info
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs || tabs.length === 0) {
        throw new Error('No active tab found');
      }
      
      const currentTab = tabs[0];
      
      // Call the main capture function with tab details
      return await captureUrl(currentTab.url, {
        context: 'ACTIVE_TAB',
        tabId: currentTab.id.toString(),
        windowId: currentTab.windowId.toString(),
        title: currentTab.title
      });
    } catch (error) {
      console.error('Error capturing current tab:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
  
  /**
   * UI handler for capture buttons
   * @param {HTMLElement} button - The button element
   * @param {Function} captureFunction - The capture function to call
   * @param {Function} onComplete - Optional callback after capture completes
   */
  export function setupCaptureButton(button, captureFunction, onComplete = null) {
    if (!button) return;
    
    const originalText = button.textContent;
    
    button.addEventListener('click', async () => {
      console.log('Capture button clicked');
      
      // Update button state
      button.disabled = true;
      button.textContent = 'Capturing...';
      
      try {
        // Call the provided capture function
        const response = await captureFunction();
        
        if (response.success) {
          button.textContent = 'Captured!';
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
            
            // Call completion callback if provided
            if (onComplete && typeof onComplete === 'function') {
              onComplete(response);
            }
          }, 2000);
        } else {
          console.error('Capture failed:', response.error);
          button.textContent = 'Capture Failed';
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 2000);
        }
      } catch (error) {
        console.error('Capture button error:', error);
        button.textContent = 'Error';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      }
    });
  }