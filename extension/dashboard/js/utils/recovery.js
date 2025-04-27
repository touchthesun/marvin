// Check if extension context is valid on page load
window.addEventListener('load', function() {
    try {
      // This will throw if context is invalid
      chrome.runtime.getURL('');
      console.log('Extension context valid on page load');
    } catch (e) {
      console.error('Extension context invalid on page load:', e);
      
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background-color: #f44336; color: white; padding: 15px; text-align: center; z-index: 9999;';
      errorDiv.innerHTML = `
        Extension context has been invalidated. Please reload the extension.
        <button id="reload-page" style="margin-left: 10px; padding: 5px 10px; background: white; color: #f44336; border: none; border-radius: 4px; cursor: pointer;">
          Reload Page
        </button>
      `;
      
      document.body.appendChild(errorDiv);
      
      // Add reload button functionality
      document.getElementById('reload-page').addEventListener('click', () => {
        window.location.reload();
      });
    }
  });
  