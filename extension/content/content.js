// Import Readability for content extraction
import { Readability } from '@mozilla/readability';
import { LogManager } from '../background/log-manager.js';

// Initialize logger
const logger = new LogManager({
  isBackgroundScript: false,
  storageKey: 'marvin_content_logs',
  maxEntries: 1000,
  deduplicationTimeout: 5000 // 5 seconds deduplication for content script
});


// Mark the document as having Marvin initialized
document.body.dataset.marvinInitialized = 'true';
document.body.dataset.context = 'content';

// Helper function to safely send messages to the extension
function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message);
    return true;
  } catch (error) {
    logger.log('error', 'Failed to send message to extension, context may be invalidated', error);
    return false;
  }
}

// Initialize the content script
function initialize() {
  logger.log('info', 'Marvin content script initialized');
  
  // Notify background script that content script is active
  safeSendMessage({ 
    action: 'contentScriptLoaded', 
    url: window.location.href 
  });
  
  // Report initial network status
  reportNetworkStatus();
  
  // Set up event listeners
  setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
  // Listen for online/offline events
  window.addEventListener('online', reportNetworkStatus);
  window.addEventListener('offline', reportNetworkStatus);
  
  // Handle page visibility for auto-capture logic
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      logger.log('debug', 'Page became visible', window.location.href);
      safeSendMessage({ action: 'pageVisible', url: window.location.href });
    } else {
      logger.log('debug', 'Page hidden', window.location.href);
      safeSendMessage({ action: 'pageHidden', url: window.location.href });
    }
  });
  
  // Re-establish connection with extension after reloads
  window.addEventListener('focus', () => {
    // Try to reconnect with extension
    if (safeSendMessage({ action: 'contentScriptPing' })) {
      logger.log('debug', 'Reconnected with extension');
    }
  });
}


// Report network status to service worker
function reportNetworkStatus() {
  const isOnline = navigator.onLine;
  logger.log('info', 'Network status changed', isOnline ? 'online' : 'offline');
  
  safeSendMessage({ 
    action: 'networkStatusChange', 
    isOnline: isOnline 
  });
}

/**
 * Get the content of the current page
 * @returns {Promise<string>} Page content
 */
async function getPageContent() {
  try {
    // Create a clone of the document
    const documentClone = document.cloneNode(true);
    
    // Use Readability to extract content
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (!article) {
      throw new Error('Could not extract content');
    }
    
    logger.log('debug', 'Content extracted successfully', { 
      contentLength: article.content.length,
      title: article.title
    });
    
    return article.content;
  } catch (e) {
    logger.log('error', 'Error in getPageContent:', e);
    
    // Fallback: Just get the HTML of the body
    return document.body.innerHTML;
  }
}

/**
 * Get metadata from the current page
 * @returns {object} Page metadata
 */
function getPageMetadata() {
  const metadata = {
    title: document.title,
    url: window.location.href,
    domain: window.location.hostname,
    canonicalUrl: getCanonicalUrl(),
    description: getMetaDescription(),
    keywords: getMetaKeywords(),
    author: getMetaAuthor(),
    publicationDate: getPublicationDate(),
    modifiedDate: getModifiedDate(),
    language: document.documentElement.lang || navigator.language,
    ogTags: getOpenGraphTags(),
    twitterTags: getTwitterTags(),
    headings: extractHeadings()
  };
  
  return metadata;
}

/**
 * Get canonical URL
 * @returns {string|null} Canonical URL
 */
function getCanonicalUrl() {
  const link = document.querySelector('link[rel="canonical"]');
  return link ? link.href : null;
}

/**
 * Get meta description
 * @returns {string|null} Meta description
 */
function getMetaDescription() {
  const meta = document.querySelector('meta[name="description"]');
  return meta ? meta.content : null;
}

/**
 * Get meta keywords
 * @returns {string[]|null} Meta keywords
 */
function getMetaKeywords() {
  const meta = document.querySelector('meta[name="keywords"]');
  if (!meta || !meta.content) return null;
  
  return meta.content.split(',').map(keyword => keyword.trim());
}

/**
 * Get meta author
 * @returns {string|null} Meta author
 */
function getMetaAuthor() {
  const meta = document.querySelector('meta[name="author"]');
  return meta ? meta.content : null;
}

/**
 * Get publication date
 * @returns {string|null} Publication date
 */
function getPublicationDate() {
  // Try various methods to find publication date
  
  // Method 1: Look for <time> elements with pubdate attribute
  const pubTimeEl = document.querySelector('time[pubdate]');
  if (pubTimeEl && pubTimeEl.dateTime) {
    return pubTimeEl.dateTime;
  }
  
  // Method 2: Look for <meta> tags
  const pubDateMeta = document.querySelector('meta[property="article:published_time"]');
  if (pubDateMeta && pubDateMeta.content) {
    return pubDateMeta.content;
  }
  
  // Method 3: Look for elements with datePublished in itemProp
  const pubDateEl = document.querySelector('[itemprop="datePublished"]');
  if (pubDateEl && pubDateEl.content) {
    return pubDateEl.content;
  }
  
  return null;
}

/**
 * Get modified date
 * @returns {string|null} Modified date
 */
function getModifiedDate() {
  // Try various methods to find modified date
  
  // Method 1: Look for <meta> tags
  const modDateMeta = document.querySelector('meta[property="article:modified_time"]');
  if (modDateMeta && modDateMeta.content) {
    return modDateMeta.content;
  }
  
  // Method 2: Look for elements with dateModified in itemProp
  const modDateEl = document.querySelector('[itemprop="dateModified"]');
  if (modDateEl && modDateEl.content) {
    return modDateEl.content;
  }
  
  return null;
}

/**
 * Get OpenGraph tags
 * @returns {object} OpenGraph tags
 */
function getOpenGraphTags() {
  const ogTags = {};
  const metaTags = document.querySelectorAll('meta[property^="og:"]');
  
  metaTags.forEach(tag => {
    const property = tag.getAttribute('property').substring(3); // Remove 'og:' prefix
    ogTags[property] = tag.content;
  });
  
  return ogTags;
}

/**
 * Get Twitter card tags
 * @returns {object} Twitter card tags
 */
function getTwitterTags() {
  const twitterTags = {};
  const metaTags = document.querySelectorAll('meta[name^="twitter:"]');
  
  metaTags.forEach(tag => {
    const name = tag.getAttribute('name').substring(8); // Remove 'twitter:' prefix
    twitterTags[name] = tag.content;
  });
  
  return twitterTags;
}

/**
 * Extract headings from the page
 * @returns {object} Extracted headings
 */
function extractHeadings() {
  const headings = {
    h1: [],
    h2: [],
    h3: []
  };
  
  // Extract h1 headings
  document.querySelectorAll('h1').forEach(h1 => {
    headings.h1.push(h1.textContent.trim());
  });
  
  // Extract h2 headings
  document.querySelectorAll('h2').forEach(h2 => {
    headings.h2.push(h2.textContent.trim());
  });
  
  // Extract h3 headings
  document.querySelectorAll('h3').forEach(h3 => {
    headings.h3.push(h3.textContent.trim());
  });
  
  return headings;
}

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

/**
 * Handle messages from the extension
 * @param {object} message - Message object
 * @param {object} sender - Sender information
 * @param {function} sendResponse - Function to send response
 * @returns {boolean} Whether response will be sent asynchronously
 */
function handleMessages(message, sender, sendResponse) {
  logger.log('debug', 'Content script received message:', message);
  
  switch (message.action) {
    case 'extractContent':
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
        logger.log('error', 'Error extracting content:', error);
        sendResponse({ error: error.message });
      }
      return true;
      
    case 'updateCaptureStatus':
      showCaptureOverlay(message.status);
      return true;
      
    case 'getPageContent':
      // Extract and return page content
      getPageContent()
        .then(content => {
          logger.log('debug', 'Extracted content length:', content.length);
          sendResponse({ success: true, content });
        })
        .catch(error => {
          logger.log('error', 'Error extracting content:', error);
          sendResponse({ success: false, error: String(error) });
        });
      
      // Return true to indicate we'll send response asynchronously
      return true;
      
    case 'getPageMetadata':
      // Extract and return page metadata
      const metadata = getPageMetadata();
      logger.log('debug', 'Extracted metadata', metadata);
      sendResponse({ success: true, metadata });
      return false; // Synchronous response
      
    case 'exportLogs':
      // Export logs from content script
      logger.exportLogs(message.format || 'json')
        .then(logs => {
          sendResponse({ success: true, logs });
        })
        .catch(error => {
          logger.log('error', 'Error exporting logs:', error);
          sendResponse({ success: false, error: String(error) });
        });
      return true;
  }
  
  return false; // Not handled
}


// Listen for messages from background script
chrome.runtime.onMessage.addListener(handleMessages);

// Initialize the content script
initialize();
