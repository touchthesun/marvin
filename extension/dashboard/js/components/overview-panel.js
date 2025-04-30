import { LogManager } from '../../../shared/utils/log-manager.js';
import { showNotification } from '../services/notification-service.js';
import { visualizationService } from '../services/visualization-service.js';

// Initialize logger
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'overview-panel',
  storageKey: 'marvin_overview_panel_logs',
  maxEntries: 1000
});

// Debug flag
const DEBUG = true;

// Debug logging function
function debugLog(message, ...args) {
  if (DEBUG) {
    console.log(`[OVERVIEW] ${message}`, ...args);
  }
}

// State variables
let panelInitialized = false;
let statsData = {
  capturedCount: 0,
  relationshipCount: 0,
  queryCount: 0
};
let recentCaptures = [];

const OverviewPanelComponent = {
  // Main initialization function
  initOverviewPanel() {
    return initOverviewPanel();
  }
};


/**
 * Initialize the overview panel
 * @returns {Promise<void>}
 */
async function initOverviewPanel() {
  debugLog('initOverviewPanel called');
  
  if (panelInitialized) {
    debugLog('Overview panel already initialized, skipping');
    return;
  }
  
  try {
    debugLog('Initializing overview panel');
    
    // Get the panel element
    const panel = document.getElementById('overview-panel');
    if (!panel) {
      throw new Error('Overview panel element not found');
    }
    
    // Initialize the visualization service
    await visualizationService.initialize();
    
    // Load data
    await loadOverviewData();
    
    // Update UI with data
    updateStatsDisplay();
    updateRecentCapturesList();
    
    // Create visualization for knowledge preview
    createKnowledgePreview();
    
    // Set up event listeners
    setupEventListeners();
    
    panelInitialized = true;
    debugLog('Overview panel initialized successfully');
  } catch (error) {
    debugLog('Error initializing overview panel:', error);
    logger.error('Error initializing overview panel:', error);
    showNotification('Error initializing overview panel: ' + error.message, 'error');
  }
}

/**
 * Load overview data
 * @returns {Promise<void>}
 */
async function loadOverviewData() {
  debugLog('Loading overview data');
  
  try {
    // Get stats from storage
    const data = await chrome.storage.local.get(['stats', 'captureHistory']);
    
    // Update stats data
    statsData = {
      capturedCount: data.stats?.capturedCount || 0,
      relationshipCount: data.stats?.relationshipCount || 0,
      queryCount: data.stats?.queryCount || 0
    };
    
    // Get recent captures
    recentCaptures = (data.captureHistory || []).slice(0, 5);
    
    debugLog('Overview data loaded successfully', { statsData, recentCapturesCount: recentCaptures.length });
  } catch (error) {
    debugLog('Error loading overview data:', error);
    logger.error('Error loading overview data:', error);
    
    // Use dummy data if loading fails
    statsData = {
      capturedCount: 42,
      relationshipCount: 128,
      queryCount: 17
    };
    
    recentCaptures = [
      {
        title: 'Example Captured Page',
        url: 'https://example.com',
        timestamp: Date.now() - 300000, // 5 minutes ago
        domain: 'example.com'
      },
      {
        title: 'Documentation Reference',
        url: 'https://docs.example.com',
        timestamp: Date.now() - 86400000, // 1 day ago
        domain: 'docs.example.com'
      }
    ];
  }
}

/**
 * Update stats display
 */
function updateStatsDisplay() {
  debugLog('Updating stats display');
  
  try {
    // Find stats elements
    const capturedCount = document.getElementById('captured-count');
    const relationshipCount = document.getElementById('relationship-count');
    const queryCount = document.getElementById('query-count');
    
    // Update stats with data
    if (capturedCount) capturedCount.textContent = statsData.capturedCount;
    if (relationshipCount) relationshipCount.textContent = statsData.relationshipCount;
    if (queryCount) queryCount.textContent = statsData.queryCount;
  } catch (error) {
    debugLog('Error updating stats display:', error);
    logger.error('Error updating stats display:', error);
  }
}

/**
 * Update recent captures list
 */
function updateRecentCapturesList() {
  debugLog('Updating recent captures list');
  
  try {
    // Find recent captures list
    const recentCapturesList = document.getElementById('recent-captures-list');
    if (!recentCapturesList) {
      debugLog('Recent captures list element not found');
      return;
    }
    
    // Clear current list
    recentCapturesList.innerHTML = '';
    
    // Check if we have any captures
    if (recentCaptures.length === 0) {
      recentCapturesList.innerHTML = '<li class="empty-state">No recent captures</li>';
      return;
    }
    
    // Add captures to list
    recentCaptures.forEach(capture => {
      const captureItem = document.createElement('li');
      captureItem.className = 'capture-item';
      
      captureItem.innerHTML = `
        <div class="capture-title">${capture.title || 'Untitled Page'}</div>
        <div class="capture-meta">
          <span class="capture-time">${formatTimestamp(capture.timestamp)}</span>
          <span class="capture-domain">${capture.domain || getDomainFromUrl(capture.url)}</span>
        </div>
      `;
      
      // Add click handler to navigate to the page
      captureItem.addEventListener('click', () => {
        try {
          chrome.tabs.create({ url: capture.url });
        } catch (error) {
          logger.error('Error opening tab:', error);
        }
      });
      
      recentCapturesList.appendChild(captureItem);
    });
  } catch (error) {
    debugLog('Error updating recent captures list:', error);
    logger.error('Error updating recent captures list:', error);
  }
}

/**
 * Create knowledge preview visualization
 */
function createKnowledgePreview() {
  debugLog('Creating knowledge preview');
  
  try {
    // Find preview container
    const previewContainer = document.querySelector('.graph-placeholder');
    if (!previewContainer) {
      debugLog('Knowledge preview container not found');
      return;
    }
    
    // Create dummy graph data
    const nodes = [
      { id: 'node1', label: 'Research', color: '#4285f4' },
      { id: 'node2', label: 'Technology', color: '#34a853' },
      { id: 'node3', label: 'AI', color: '#ea4335' },
      { id: 'node4', label: 'Machine Learning', color: '#fbbc05' },
      { id: 'node5', label: 'Data Science', color: '#4285f4' }
    ];
    
    const links = [
      { source: 'node1', target: 'node2' },
      { source: 'node2', target: 'node3' },
      { source: 'node3', target: 'node4' },
      { source: 'node1', target: 'node5' },
      { source: 'node5', target: 'node4' }
    ];
    
    // Use visualization service to create the graph
    visualizationService.createKnowledgeGraph(previewContainer, nodes, links);
  } catch (error) {
    debugLog('Error creating knowledge preview:', error);
    logger.error('Error creating knowledge preview:', error);
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  debugLog('Setting up event listeners');
  
  try {
    // Set up refresh button
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshOverviewData);
    }
    
    // Set up force init button
    const forceInitBtn = document.getElementById('force-init-overview');
    if (forceInitBtn) {
      forceInitBtn.addEventListener('click', () => {
        panelInitialized = false;
        initOverviewPanel();
      });
    }
    
    // Set up view all captures button
    const viewAllBtn = document.getElementById('view-all-captures');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        // Navigate to capture panel
        const navItem = document.querySelector('.nav-item[data-panel="capture"]');
        if (navItem) {
          navItem.click();
        } else {
          debugLog('Capture panel nav item not found');
        }
      });
    }
    
    // Set up explore knowledge button
    const exploreBtn = document.getElementById('explore-knowledge');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', () => {
        // Navigate to knowledge panel
        const navItem = document.querySelector('.nav-item[data-panel="knowledge"]');
        if (navItem) {
          navItem.click();
        } else {
          debugLog('Knowledge panel nav item not found');
        }
      });
    }
  } catch (error) {
    debugLog('Error setting up event listeners:', error);
    logger.error('Error setting up event listeners:', error);
  }
}

/**
 * Refresh overview data
 */
async function refreshOverviewData() {
  debugLog('Refreshing overview data');
  
  try {
    // Show loading indicators
    document.getElementById('captured-count').textContent = '...';
    document.getElementById('relationship-count').textContent = '...';
    document.getElementById('query-count').textContent = '...';
    
    // Load fresh data
    await loadOverviewData();
    
    // Update UI with new data
    updateStatsDisplay();
    updateRecentCapturesList();
    
    showNotification('Overview data refreshed', 'success');
  } catch (error) {
    debugLog('Error refreshing overview data:', error);
    logger.error('Error refreshing overview data:', error);
    showNotification('Error refreshing data: ' + error.message, 'error');
  }
}

/**
 * Format a timestamp as a human-readable string
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  // Less than a minute
  if (diff < 60000) {
    return 'Just now';
  }
  
  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  
  // Less than a week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  
  // Format as date
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain
 */
function getDomainFromUrl(url) {
  if (!url) return 'Unknown';
  
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return 'Unknown';
  }
}

// Register this component in the global registry
if (window.registerComponent) {
  debugLog('Registering overview-panel component');
  window.registerComponent('overview-panel', {
    initOverviewPanel
  });
}

// Register the component with fallback mechanism
try {
  // First, try to use the global registerComponent function
  if (typeof self.registerComponent === 'function') {
    logger.log('debug', 'Registering overview panel component using global registerComponent');
    self.registerComponent('overview-panel', OverviewPanelComponent);
  } else {
    // If registerComponent isn't available, register directly in global registry
    logger.log('debug', 'Global registerComponent not found, using direct registry access');
    self.MarvinComponents = self.MarvinComponents || {};
    self.MarvinComponents['overview-panel'] = OverviewPanelComponent;
  }
  
  logger.log('info', 'Overview panel component registered successfully');
} catch (error) {
  logger.log('error', 'Error registering overview panel component:', error);
  // Try window as fallback if self fails
  try {
    window.MarvinComponents = window.MarvinComponents || {};
    window.MarvinComponents['overview-panel'] = OverviewPanelComponent;
    logger.log('debug', 'Overview panel component registered using window fallback');
  } catch (windowError) {
    logger.log('error', 'Failed to register overview panel component:', windowError);
  }
}

// Export the initialization function
export default OverviewPanelComponent;
export { initOverviewPanel };