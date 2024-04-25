chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "captureTabs") {
      chrome.tabs.query({}, (tabs) => {
        const urls = tabs.map(tab => tab.url);
        // Store or process URLs
        console.log(urls);
      });
    }
  });
  

  chrome.storage.local.get(['session_active'], function(result) {
    if (!result.session_active) {
        // Close the chat modal or clean up the UI
        closeChatModal();
    }
});