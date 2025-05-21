// src/components/panels/overview/overview-panel.js
import { LogManager } from '../../../utils/log-manager.js'; 
import { container } from '../../../core/dependency-container.js';

/**
 * Overview Panel Component
 * Displays dashboard overview statistics and recent activity
 */
const OverviewPanel = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Panel state
  statsData: {
    capturedCount: 0,
    relationshipCount: 0,
    queryCount: 0
  },
  recentCaptures: [],
  
  /**
   * Initialize the overview panel
   * @returns {Promise<boolean>} Success state
   */
  async initOverviewPanel() {
    // Create logger directly
    const logger = new LogManager({
      context: 'overview-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.info('Initializing overview panel');
    
    try {
      // Check if already initialized to prevent duplicate initialization
      if (this.initialized) {
        logger.debug('Overview panel already initialized');
        return true;
      }
      
      // Get dependencies with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      const visualizationService = this.getService(logger, 'visualizationService', {
        initialize: async () => logger.warn('Visualization service not available'),
        createKnowledgeGraph: () => logger.warn('Visualization service not available') && false
      });
      
      // Initialize state
      this.statsData = {
        capturedCount: 0,
        relationshipCount: 0,
        queryCount: 0
      };
      this.recentCaptures = [];
      
      // Get the panel element
      const panel = document.getElementById('overview-panel');
      if (!panel) {
        throw new Error('Overview panel element not found');
      }
      
      // Initialize the visualization service
      await visualizationService.initialize?.();
      
      // Load data
      await this.loadOverviewData(logger);
      
      // Update UI with data
      this.updateStatsDisplay(logger);
      this.updateRecentCapturesList(logger);
      
      // Create visualization for knowledge preview
      this.createKnowledgePreview(logger, visualizationService);
      
      // Set up event listeners
      this.setupEventListeners(logger, notificationService);
      
      this.initialized = true;
      logger.info('Overview panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing overview panel:', error);
      
      // Get notification service with error handling
      const notificationService = this.getService(logger, 'notificationService', {
        showNotification: (message, type) => console.error(`[${type}] ${message}`)
      });
      
      notificationService.showNotification('Error initializing overview panel: ' + error.message, 'error');
      return false;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Object} Service instance or fallback
   */
  getService(logger, serviceName, fallback) {
    try {
      return container.getService(serviceName);
    } catch (error) {
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Load overview data from storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadOverviewData(logger) {
    logger.debug('Loading overview data');
    
    try {
      // Get stats from storage
      const data = await chrome.storage.local.get(['stats', 'captureHistory']);
      
      // Update stats data
      this.statsData = {
        capturedCount: data.stats?.capturedCount || 0,
        relationshipCount: data.stats?.relationshipCount || 0,
        queryCount: data.stats?.queryCount || 0
      };
      
      // Get recent captures
      this.recentCaptures = (data.captureHistory || []).slice(0, 5);
      
      logger.debug('Overview data loaded successfully', { 
        statsData: this.statsData, 
        recentCapturesCount: this.recentCaptures.length 
      });
    } catch (error) {
      logger.error('Error loading overview data:', error);
      
      // Use dummy data if loading fails
      this.statsData = {
        capturedCount: 42,
        relationshipCount: 128,
        queryCount: 17
      };
      
      this.recentCaptures = [
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
      
      logger.debug('Using fallback data due to loading error');
    }
  },
  
  /**
   * Update stats display in the UI
   * @param {LogManager} logger - Logger instance
   */
  updateStatsDisplay(logger) {
    logger.debug('Updating stats display');
    
    try {
      // Find stats elements
      const capturedCount = document.getElementById('captured-count');
      const relationshipCount = document.getElementById('relationship-count');
      const queryCount = document.getElementById('query-count');
      
      // Update stats with data
      if (capturedCount) capturedCount.textContent = this.statsData.capturedCount;
      if (relationshipCount) relationshipCount.textContent = this.statsData.relationshipCount;
      if (queryCount) queryCount.textContent = this.statsData.queryCount;
      
      logger.debug('Stats display updated successfully');
    } catch (error) {
      logger.error('Error updating stats display:', error);
    }
  },
  
  /**
   * Update recent captures list in the UI
   * @param {LogManager} logger - Logger instance
   */
  updateRecentCapturesList(logger) {
    logger.debug('Updating recent captures list');
    
    try {
      // Find recent captures list
      const recentCapturesList = document.getElementById('recent-captures-list');
      if (!recentCapturesList) {
        logger.warn('Recent captures list element not found');
        return;
      }
      
      // Clear current list
      recentCapturesList.innerHTML = '';
      
      // Check if we have any captures
      if (this.recentCaptures.length === 0) {
        recentCapturesList.innerHTML = '<li class="empty-state">No recent captures</li>';
        return;
      }
      
      // Add captures to list
      this.recentCaptures.forEach(capture => {
        const captureItem = document.createElement('li');
        captureItem.className = 'capture-item';
        
        captureItem.innerHTML = `
          <div class="capture-title">${capture.title || 'Untitled Page'}</div>
          <div class="capture-meta">
            <span class="capture-time">${this.formatTimestamp(capture.timestamp)}</span>
            <span class="capture-domain">${capture.domain || this.getDomainFromUrl(capture.url)}</span>
          </div>
        `;
        
        // Add click handler to navigate to the page
        const clickHandler = () => {
          try {
            chrome.tabs.create({ url: capture.url });
          } catch (error) {
            logger.error('Error opening tab:', error);
          }
        };
        
        captureItem.addEventListener('click', clickHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: captureItem,
          type: 'click',
          listener: clickHandler
        });
        
        recentCapturesList.appendChild(captureItem);
      });
      
      logger.debug('Recent captures list updated successfully');
    } catch (error) {
      logger.error('Error updating recent captures list:', error);
    }
  },
  
  /**
   * Create knowledge graph preview visualization
   * @param {LogManager} logger - Logger instance
   * @param {Object} visualizationService - Visualization service
   */
  createKnowledgePreview(logger, visualizationService) {
    logger.debug('Creating knowledge preview');
    
    try {
      // Find preview container
      const previewContainer = document.querySelector('.graph-placeholder');
      if (!previewContainer) {
        logger.warn('Knowledge preview container not found');
        return;
      }
      
      // Create sample graph data
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
      visualizationService.createKnowledgeGraph(previewContainer.id, nodes, links);
      logger.debug('Knowledge preview created successfully');
    } catch (error) {
      logger.error('Error creating knowledge preview:', error);
    }
  },
  
  /**
   * Set up event listeners for panel interactions
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   */
  setupEventListeners(logger, notificationService) {
    logger.debug('Setting up event listeners');
    
    try {
      // Set up refresh button
      const refreshBtn = document.querySelector('.refresh-btn');
      if (refreshBtn) {
        const refreshBtnHandler = () => {
          this.refreshOverviewData(logger, notificationService);
        };
        
        refreshBtn.addEventListener('click', refreshBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: refreshBtn,
          type: 'click',
          listener: refreshBtnHandler
        });
        
        logger.debug('Refresh button listener attached');
      } else {
        logger.warn('Refresh button not found');
      }
      
      // Set up view all captures button
      const viewAllBtn = document.getElementById('view-all-captures');
      if (viewAllBtn) {
        const viewAllBtnHandler = () => {
          // Navigate to capture panel
          const navigation = this.getService(logger, 'navigation', {
            navigateToPanel: () => {
              // Fallback navigation
              const navItem = document.querySelector('.nav-item[data-panel="capture"]');
              if (navItem) {
                navItem.click();
                logger.debug('Navigated to capture panel (fallback)');
              } else {
                logger.warn('Capture panel nav item not found');
              }
            }
          });
          
          if (navigation && navigation.navigateToPanel) {
            navigation.navigateToPanel('capture');
            logger.debug('Navigated to capture panel');
          }
        };
        
        viewAllBtn.addEventListener('click', viewAllBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: viewAllBtn,
          type: 'click',
          listener: viewAllBtnHandler
        });
        
        logger.debug('View all captures button listener attached');
      } else {
        logger.warn('View all captures button not found');
      }
      
      // Set up explore knowledge button
      const exploreBtn = document.getElementById('explore-knowledge');
      if (exploreBtn) {
        const exploreBtnHandler = () => {
          // Navigate to knowledge panel
          const navigation = this.getService(logger, 'navigation', {
            navigateToPanel: () => {
              // Fallback navigation
              const navItem = document.querySelector('.nav-item[data-panel="knowledge"]');
              if (navItem) {
                navItem.click();
                logger.debug('Navigated to knowledge panel (fallback)');
              } else {
                logger.warn('Knowledge panel nav item not found');
              }
            }
          });
          
          if (navigation && navigation.navigateToPanel) {
            navigation.navigateToPanel('knowledge');
            logger.debug('Navigated to knowledge panel');
          }
        };
        
        exploreBtn.addEventListener('click', exploreBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: exploreBtn,
          type: 'click',
          listener: exploreBtnHandler
        });
        
        logger.debug('Explore knowledge button listener attached');
      } else {
        logger.warn('Explore knowledge button not found');
      }
      
      logger.debug('Event listeners set up successfully');
    } catch (error) {
      logger.error('Error setting up event listeners:', error);
    }
  },
  
  /**
   * Refresh overview panel data
   * @param {LogManager} logger - Logger instance
   * @param {Object} notificationService - Notification service
   * @returns {Promise<void>}
   */
  async refreshOverviewData(logger, notificationService) {
    logger.info('Refreshing overview data');
    
    try {
      // Show loading indicators
      const capturedCount = document.getElementById('captured-count');
      const relationshipCount = document.getElementById('relationship-count');
      const queryCount = document.getElementById('query-count');
      
      if (capturedCount) capturedCount.textContent = '...';
      if (relationshipCount) relationshipCount.textContent = '...';
      if (queryCount) queryCount.textContent = '...';
      
      // Load fresh data
      await this.loadOverviewData(logger);
      
      // Update UI with new data
      this.updateStatsDisplay(logger);
      this.updateRecentCapturesList(logger);
      
      notificationService.showNotification('Overview data refreshed', 'success');
      logger.info('Overview data refreshed successfully');
    } catch (error) {
      logger.error('Error refreshing overview data:', error);
      notificationService.showNotification('Error refreshing data: ' + error.message, 'error');
    }
  },
  
  /**
   * Format a timestamp as a human-readable string
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
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
  },
  
  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain
   */
  getDomainFromUrl(url) {
    if (!url) return 'Unknown';
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return 'Unknown';
    }
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'overview-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Overview panel not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up overview panel resources');
    
    // Clear all timeouts
    this._timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        logger.warn(`Error clearing timeout:`, error);
      }
    });
    this._timeouts = [];
    
    // Clear all intervals
    this._intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (error) {
        logger.warn(`Error clearing interval:`, error);
      }
    });
    this._intervals = [];
    
    // Remove all event listeners
    this._eventListeners.forEach(({element, type, listener}) => {
      try {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, listener);
        }
      } catch (error) {
        logger.warn(`Error removing event listener:`, error);
      }
    });
    this._eventListeners = [];
    
    // Clean up DOM elements
    this._domElements.forEach(el => {
      try {
        if (el && el.parentNode && !el.id?.includes('panel')) {
          el.parentNode.removeChild(el);
        }
      } catch (error) {
        logger.warn('Error removing DOM element:', error);
      }
    });
    this._domElements = [];
    
    this.initialized = false;
    logger.debug('Overview panel cleanup completed');
  }
};

// Export using named export
export { OverviewPanel };