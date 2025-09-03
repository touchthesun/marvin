// Test script to verify tabs loading functionality
// Run this in the browser console on the dashboard page

console.log('Testing tabs loading functionality...');

// Check if the tabs list element exists
const tabsList = document.getElementById('tabs-list');
if (!tabsList) {
  console.error('❌ tabs-list element not found');
} else {
  console.log('✅ tabs-list element found');
  
  // Check current content
  const currentContent = tabsList.innerHTML;
  console.log('Current tabs-list content:', currentContent);
  
  if (currentContent.includes('Loading tabs...')) {
    console.log('⚠️  Still showing loading indicator');
    
    // Try to manually trigger tabs loading
    if (window.TabsCapture && window.TabsCapture.initTabsCapture) {
      console.log('Attempting to manually initialize tabs...');
      window.TabsCapture.initTabsCapture().then(() => {
        console.log('✅ Manual tabs initialization completed');
      }).catch(error => {
        console.error('❌ Manual tabs initialization failed:', error);
      });
    } else {
      console.log('TabsCapture not available in global scope');
    }
  } else if (currentContent.includes('error-state')) {
    console.log('❌ Error state detected in tabs list');
  } else if (currentContent.includes('tab-item')) {
    console.log('✅ Tabs appear to be loaded successfully');
  } else {
    console.log('⚠️  Unknown state in tabs list');
  }
}

// Check if Chrome APIs are available
if (typeof chrome !== 'undefined' && chrome.windows) {
  console.log('✅ Chrome windows API is available');
  
  // Test direct API call
  chrome.windows.getAll({ populate: true }, (windows) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Chrome API error:', chrome.runtime.lastError.message);
    } else {
      console.log(`✅ Chrome API working: Got ${windows.length} windows`);
      const totalTabs = windows.reduce((sum, window) => sum + window.tabs.length, 0);
      console.log(`Total tabs: ${totalTabs}`);
    }
  });
} else {
  console.log('❌ Chrome windows API not available');
}

// Check if background script communication works
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('Testing background script communication...');
  chrome.runtime.sendMessage({ action: 'getTabs' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Background communication error:', chrome.runtime.lastError.message);
    } else if (response && response.success) {
      console.log(`✅ Background communication working: Got ${response.windows.length} windows`);
    } else {
      console.error('❌ Background communication failed:', response);
    }
  });
} else {
  console.log('❌ Chrome runtime API not available');
}
