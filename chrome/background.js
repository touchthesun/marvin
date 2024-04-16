chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "captureTabs") {
      chrome.tabs.query({}, (tabs) => {
        const urls = tabs.map(tab => tab.url);
        // Store or process URLs
        console.log(urls);
      });
    }
  });
  