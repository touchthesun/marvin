// src/components/panels/knowledge/knowledge-panel.js
import { container } from '@core/dependency-container.js';

/**
 * Knowledge Panel Component
 * Displays and manages knowledge items and visualization
 */
const KnowledgePanel = {
  /**
   * Initialize the knowledge panel
   * @returns {Promise<boolean>} Success state
   */
  async initKnowledgePanel() {
    // Get dependencies from container
    const logger = new (container.getUtil('LogManager'))({
      context: 'knowledge-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    const notificationService = container.getService('notificationService');
    const visualizationService = container.getService('visualizationService');
    
    logger.info('Initializing knowledge panel');
    
    try {
      // Initialize state
      this.initialized = false;
      this.currentView = 'list'; // 'list' or 'graph'
      this.currentData = { 
        pages: [], 
        graphData: { nodes: [], edges: [] } 
      };
      
      // Initialize the split view utility
      const ui = container.getUtil('ui');
      ui.setupSplitView();
      
      // Initialize visualization service
      await visualizationService.initialize();
      
      // Set up view toggle
      this.setupViewToggle(logger);
      
      // Load initial knowledge data  
      await this.loadKnowledgeData(logger);
      
      // Set up event listeners
      this.setupKnowledgePanelEventListeners(logger);
      
      this.initialized = true;
      logger.info('Knowledge panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing knowledge panel:', error);
      notificationService.showNotification('Failed to initialize knowledge panel', 'error');
      
      const knowledgeContent = document.querySelector('.knowledge-content');
      if (knowledgeContent) {
        knowledgeContent.innerHTML = 
          `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
      }
      
      return false;
    }
  },
  
  /**
   * Set up view toggle between list and graph
   * @param {LogManager} logger - Logger instance
   */
  setupViewToggle(logger) {
    logger.debug('Setting up view toggle');
    
    try {
      const viewToggle = document.querySelector('.view-toggle');
      if (!viewToggle) {
        logger.warn('View toggle element not found');
        return;
      }
      
      // Create toggle buttons if they don't exist
      if (!viewToggle.querySelector('.toggle-btn')) {
        viewToggle.innerHTML = `
          <button class="toggle-btn active" data-view="list">
            <span class="icon">📑</span> List View
          </button>
          <button class="toggle-btn" data-view="graph">
            <span class="icon">🕸️</span> Graph View
          </button>
        `;
      }
      
      // Add click handlers
      viewToggle.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const view = btn.dataset.view;
          if (view !== this.currentView) {
            this.switchView(logger, view);
          }
        });
      });
      
      logger.debug('View toggle set up successfully');
    } catch (error) {
      logger.error('Error setting up view toggle:', error);
      throw error;
    }
  },
  
  /**
   * Switch between list and graph views
   * @param {LogManager} logger - Logger instance
   * @param {string} view - 'list' or 'graph'
   * @returns {Promise<void>}
   */
  async switchView(logger, view) {
    const visualizationService = container.getService('visualizationService');
    
    logger.debug(`Switching to ${view} view`);
    
    try {
      if (view !== 'list' && view !== 'graph') {
        logger.warn(`Invalid view type: ${view}`);
        return;
      }
      
      this.currentView = view;
      logger.info(`Switching to ${view} view`);
      
      // Update toggle buttons
      document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
      
      // Update content display
      const listView = document.querySelector('.knowledge-list-view');
      const graphView = document.querySelector('.knowledge-graph-view');
      
      if (listView && graphView) {
        listView.style.display = view === 'list' ? 'block' : 'none';
        graphView.style.display = view === 'graph' ? 'block' : 'none';
        
        // If switching to graph view, render the graph
        if (view === 'graph') {
          await this.renderKnowledgeGraph(logger, visualizationService);
        }
      }
    } catch (error) {
      logger.error('Error switching view:', error);
      throw error;
    }
  },
  
  /**
   * Load knowledge data from API or local storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadKnowledgeData(logger) {
    const apiService = container.getService('apiService');
    
    logger.info('Loading knowledge data');
    
    try {
      // Load pages data
      const pagesResponse = await apiService.fetchAPI('/api/v1/pages/');
      
      if (pagesResponse.success) {
        this.currentData.pages = pagesResponse.data.pages || [];
        logger.info(`Successfully loaded ${this.currentData.pages.length} pages`);
        
        // Try to load graph data
        const graphResponse = await apiService.fetchAPI('/api/v1/graph/overview');
        
        if (graphResponse.success) {
          this.currentData.graphData = {
            nodes: graphResponse.data.nodes || [],
            edges: graphResponse.data.edges || []
          };
          logger.info(`Successfully loaded graph with ${this.currentData.graphData.nodes.length} nodes`);
        } else if (graphResponse.error?.error_code === 'NOT_FOUND') {
          // Create graph from pages data
          this.currentData.graphData = this.createGraphFromPages(logger, this.currentData.pages);
          logger.info('Created graph from pages data');
        } else {
          throw new Error(graphResponse.error?.message || 'Failed to load graph data');
        }
        
        // Update current view
        if (this.currentView === 'list') {
          this.displayKnowledgeItems(logger, this.currentData.pages);
        } else {
          const visualizationService = container.getService('visualizationService');
          await this.renderKnowledgeGraph(logger, visualizationService);
        }
        
      } else {
        throw new Error(pagesResponse.error?.message || 'Failed to load pages');
      }
    } catch (error) {
      logger.error('Error loading knowledge data:', error);
      
      // Show error and try fallback
      await this.handleLoadError(logger, error);
    }
  },
  
  /**
   * Handle loading errors with fallback mechanisms
   * @param {LogManager} logger - Logger instance
   * @param {Error} error - Error that occurred
   * @returns {Promise<void>}
   */
  async handleLoadError(logger, error) {
    const notificationService = container.getService('notificationService');
    const visualizationService = container.getService('visualizationService');
    
    logger.debug('Handling load error with fallbacks');
    
    const knowledgeList = document.querySelector('.knowledge-list');
    const graphContainer = document.querySelector('.graph-container');
    
    // Try to load from local storage as fallback
    try {
      const data = await chrome.storage.local.get(['captureHistory', 'graphCache']);
      const captureHistory = data.captureHistory || [];
      const graphCache = data.graphCache;
      
      if (captureHistory.length > 0) {
        logger.info(`Found ${captureHistory.length} items in local capture history`);
        
        // Convert capture history to pages format
        this.currentData.pages = captureHistory.map(item => ({
          id: item.url,
          url: item.url,
          title: item.title,
          domain: this.getDomainFromUrl(item.url),
          discovered_at: item.timestamp,
          browser_contexts: ["ACTIVE_TAB"],
          keywords: {},
          relationships: []
        }));
        
        // Try to use cached graph data or create from pages
        if (graphCache && graphCache.nodes && graphCache.edges) {
          this.currentData.graphData = {
            nodes: graphCache.nodes,
            edges: graphCache.edges
          };
        } else {
          this.currentData.graphData = this.createGraphFromPages(logger, this.currentData.pages);
        }
        
        if (knowledgeList) {
          knowledgeList.innerHTML = `
            <div class="error-note">
              Could not load data from API server. Showing locally cached data.
            </div>
          `;
          this.displayKnowledgeItems(logger, this.currentData.pages);
        }
        
        if (this.currentView === 'graph' && graphContainer) {
          await this.renderKnowledgeGraph(logger, visualizationService);
        }
      } else {
        throw new Error('No fallback data available');
      }
    } catch (fallbackError) {
      logger.error('Error loading fallback data:', fallbackError);
      
      if (knowledgeList) {
        knowledgeList.innerHTML = `
          <div class="error-state">
            Could not load knowledge data from API or local storage.
            <br>
            Error: ${error.message}
            <br><br>
            <button id="retry-load-btn" class="btn-secondary">Retry</button>
          </div>
        `;
        
        // Add retry button functionality
        const retryButton = document.getElementById('retry-load-btn');
        if (retryButton) {
          retryButton.addEventListener('click', () => this.loadKnowledgeData(logger));
        }
      }
      
      if (graphContainer) {
        graphContainer.innerHTML = `
          <div class="error-state">
            Could not load graph data.
            <br>
            Error: ${error.message}
          </div>
        `;
      }
      
      notificationService.showNotification(`Error loading knowledge data: ${error.message}`, 'error');
    }
  },
  
  /**
   * Render knowledge graph using visualization service
   * @param {LogManager} logger - Logger instance
   * @param {Object} visualizationService - Visualization service
   * @returns {Promise<void>}
   */
  async renderKnowledgeGraph(logger, visualizationService) {
    logger.info('Rendering knowledge graph');
    
    try {
      const graphContainer = document.querySelector('.graph-container');
      if (!graphContainer) {
        logger.error('Graph container not found');
        return;
      }
      
      // Show loading state
      graphContainer.innerHTML = '<div class="loading-indicator">Loading graph visualization...</div>';
      
      // Use visualization service to create graph
      const success = visualizationService.createKnowledgeGraph(
        graphContainer.id || 'graph-container',
        this.currentData.graphData.nodes,
        this.currentData.graphData.edges,
        {
          width: graphContainer.clientWidth,
          height: graphContainer.clientHeight || 500
        }
      );
      
      if (!success) {
        throw new Error('Failed to create graph visualization');
      }
      
      // Add graph controls if they don't exist
      if (!graphContainer.querySelector('.graph-controls')) {
        this.addGraphControls(logger, graphContainer);
      }
      
      logger.info('Graph visualization rendered successfully');
    } catch (error) {
      logger.error('Error rendering graph:', error);
      const notificationService = container.getService('notificationService');
      
      const graphContainer = document.querySelector('.graph-container');
      if (graphContainer) {
        graphContainer.innerHTML = `
          <div class="error-state">
            Error rendering graph: ${error.message}
            <br><br>
            <button class="btn-secondary retry-graph-btn">Retry</button>
          </div>
        `;
        
        const retryButton = graphContainer.querySelector('.retry-graph-btn');
        if (retryButton) {
          retryButton.addEventListener('click', () => this.renderKnowledgeGraph(logger, visualizationService));
        }
      }
      
      notificationService.showNotification('Failed to render knowledge graph', 'error');
    }
  },
  
  /**
   * Add graph control buttons
   * @param {LogManager} logger - Logger instance
   * @param {HTMLElement} graphContainer - Graph container element
   */
  addGraphControls(logger, graphContainer) {
    const visualizationService = container.getService('visualizationService');
    
    logger.debug('Adding graph controls');
    
    try {
      const controls = document.createElement('div');
      controls.className = 'graph-controls';
      controls.style.cssText = `
        position: absolute;
        bottom: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
      `;
      
      // Refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn-icon';
      refreshBtn.innerHTML = '↻';
      refreshBtn.title = 'Refresh Graph';
      refreshBtn.addEventListener('click', () => this.renderKnowledgeGraph(logger, visualizationService));
      
      // Fit to view button
      const fitBtn = document.createElement('button');
      fitBtn.className = 'btn-icon';
      fitBtn.innerHTML = '⬚';
      fitBtn.title = 'Fit to View';
      
      controls.appendChild(refreshBtn);
      controls.appendChild(fitBtn);
      graphContainer.appendChild(controls);
      
      logger.debug('Graph controls added');
    } catch (error) {
      logger.error('Error adding graph controls:', error);
    }
  },
  
  /**
   * Create graph data from pages data
   * @param {LogManager} logger - Logger instance
   * @param {Array} pages - Page data
   * @returns {Object} Graph data with nodes and edges
   */
  createGraphFromPages(logger, pages) {
    logger.debug(`Creating graph from ${pages.length} pages`);
    
    try {
      const nodes = pages.map(page => ({
        id: page.id,
        label: page.title || 'Untitled',
        url: page.url,
        type: 'page',
        domain: page.domain || this.getDomainFromUrl(page.url)
      }));
      
      const edges = [];
      pages.forEach(page => {
        if (page.relationships && page.relationships.length > 0) {
          page.relationships.forEach(rel => {
            edges.push({
              source: page.id,
              target: rel.target_id,
              type: rel.type
            });
          });
        }
      });
      
      logger.debug(`Created graph with ${nodes.length} nodes and ${edges.length} edges`);
      return { nodes, edges };
    } catch (error) {
      logger.error('Error creating graph from pages:', error);
      return { nodes: [], edges: [] };
    }
  },
  
  /**
   * Safely extracts domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain name or 'unknown'
   */
  getDomainFromUrl(url) {
    if (!url) return 'unknown';
    
    try {
      return new URL(url).hostname;
    } catch (e) {
      return 'unknown';
    }
  },
  
  /**
   * Display knowledge items in the list view
   * @param {LogManager} logger - Logger instance
   * @param {Array} items - Knowledge items to display
   */
  displayKnowledgeItems(logger, items) {
    logger.debug(`Displaying ${items?.length || 0} knowledge items`);
    
    try {
      const knowledgeList = document.querySelector('.knowledge-list');
      if (!knowledgeList) {
        logger.error('Knowledge list container not found');
        return;
      }
      
      if (!items || items.length === 0) {
        knowledgeList.innerHTML += '<div class="empty-state">No knowledge items found</div>';
        return;
      }
      
      const listContainer = document.createElement('div');
      listContainer.className = 'knowledge-items-container';
      
      items.forEach(item => {
        try {
          const knowledgeItem = this.createKnowledgeItemElement(logger, item);
          listContainer.appendChild(knowledgeItem);
        } catch (error) {
          logger.error(`Error creating knowledge item element for ${item.id}:`, error);
        }
      });
      
      knowledgeList.appendChild(listContainer);
      
      logger.debug('Knowledge items displayed successfully');
    } catch (error) {
      logger.error('Error displaying knowledge items:', error);
    }
  },
  
  /**
   * Create a knowledge item element
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item data
   * @returns {HTMLElement} Knowledge item element
   */
  createKnowledgeItemElement(logger, item) {
    const formatting = container.getUtil('formatting');
    
    logger.debug(`Creating knowledge item element for ${item.id || item.url}`);
    
    try {
      const knowledgeItem = document.createElement('div');
      knowledgeItem.className = 'knowledge-item';
      knowledgeItem.setAttribute('data-id', item.id || '');
      knowledgeItem.setAttribute('data-url', item.url || '');
      
      // Try to determine favicon
      let favicon = '';
      try {
        if (item.url) {
          const urlObj = new URL(item.url);
          favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}`;
        }
      } catch (e) {
        logger.warn(`Error parsing URL for favicon: ${item.url}`);
        favicon = '../icons/icon16.png';
      }
      
      // Format date
      let dateStr = 'Unknown date';
      try {
        if (item.discovered_at) {
          const discoveredDate = new Date(item.discovered_at);
          dateStr = discoveredDate.toLocaleDateString();
        }
      } catch (e) {
        logger.warn(`Error formatting date: ${item.discovered_at}`);
      }
      
      // Get truncate utility
      const truncateText = item => {
        if (!item) return '';
        return item.length > 50 ? item.substring(0, 50) + '...' : item;
      };
      
      // Create HTML content
      knowledgeItem.innerHTML = `
        <div class="item-icon">
          <img src="${favicon}" alt="" class="favicon" onerror="this.src='../icons/icon16.png';">
        </div>
        <div class="item-content">
          <div class="item-title">${item.title || 'Untitled'}</div>
          <div class="item-url">${truncateText(item.url || '')}</div>
          <div class="item-meta">
            <span class="item-date">Captured: ${dateStr}</span>
            <span class="item-source">${formatting.formatContext(item.browser_contexts || [])}</span>
          </div>
          ${item.keywords && Object.keys(item.keywords).length > 0 
            ? `<div class="item-keywords">
                ${Object.entries(item.keywords).slice(0, 5).map(([keyword]) => 
                  `<span class="keyword">${keyword}</span>`
                ).join('')}
               </div>` 
            : ''}
        </div>
        <div class="item-actions">
          <button class="btn-action view-details">View Details</button>
        </div>
      `;
      
      // Add click handler to show details
      const viewDetailsBtn = knowledgeItem.querySelector('.view-details');
      if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', () => {
          this.showKnowledgeDetails(logger, item);
        });
      }
      
      return knowledgeItem;
    } catch (error) {
      logger.error('Error creating knowledge item element:', error);
      throw error;
    }
  },
  
  /**
   * Set up event listeners for knowledge panel
   * @param {LogManager} logger - Logger instance
   */
  setupKnowledgePanelEventListeners(logger) {
    logger.debug('Setting up knowledge panel event listeners');
    
    try {
      // Create debounced search function
      const debouncedSearchKnowledge = this.debounce((searchTerm) => {
        this.searchKnowledge(logger, searchTerm);
      }, 300);
      
      // Knowledge panel search
      const searchInput = document.getElementById('knowledge-search');
      if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            debouncedSearchKnowledge(e.target.value);
          }
        });
        logger.debug('Search input keydown listener attached');
      } else {
        logger.warn('Search input element not found');
      }
      
      const searchBtn = document.getElementById('search-btn');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => {
          const searchTerm = document.getElementById('knowledge-search')?.value || '';
          debouncedSearchKnowledge(searchTerm);
        });
        logger.debug('Search button click listener attached');
      } else {
        logger.warn('Search button element not found');
      }
      
      // Set up filter handlers
      this.setupKnowledgeFilters(logger);
      
      // Set up sidebar close button
      const closeDetailsBtn = document.querySelector('.close-details-btn');
      if (closeDetailsBtn) {
        closeDetailsBtn.addEventListener('click', () => {
          const sidebar = document.getElementById('details-sidebar');
          if (sidebar) {
            sidebar.classList.remove('active');
          }
        });
        logger.debug('Close details button listener attached');
      } else {
        logger.warn('Close details button not found');
      }
      
      logger.info('Knowledge panel event listeners set up successfully');
    } catch (error) {
      logger.error('Error setting up knowledge panel event listeners:', error);
      throw error;
    }
  },
  
  /**
   * Set up knowledge filters
   * @param {LogManager} logger - Logger instance
   */
  setupKnowledgeFilters(logger) {
    logger.debug('Setting up knowledge filters');
    
    try {
      // Set up source filter checkboxes
      const filterCheckboxes = document.querySelectorAll('.knowledge-filters input[type="checkbox"]');
      
      if (filterCheckboxes.length > 0) {
        filterCheckboxes.forEach(checkbox => {
          checkbox.addEventListener('change', () => {
            this.applyKnowledgeFilters(logger);
          });
        });
        logger.debug(`Set up ${filterCheckboxes.length} filter checkboxes`);
      } else {
        logger.warn('No filter checkboxes found');
      }
      
      // Set up date filters
      const dateFromInput = document.getElementById('date-from');
      if (dateFromInput) {
        dateFromInput.addEventListener('change', () => this.applyKnowledgeFilters(logger));
        logger.debug('Date from filter set up');
      } else {
        logger.warn('Date from input element not found');
      }
      
      const dateToInput = document.getElementById('date-to');
      if (dateToInput) {
        dateToInput.addEventListener('change', () => this.applyKnowledgeFilters(logger));
        logger.debug('Date to filter set up');
      } else {
        logger.warn('Date to input element not found');
      }
      
      logger.info('Knowledge filters set up successfully');
    } catch (error) {
      logger.error('Error setting up knowledge filters:', error);
      throw error;
    }
  },
  
  /**
   * Apply knowledge filters
   * @param {LogManager} logger - Logger instance
   */
  applyKnowledgeFilters(logger) {
    const notificationService = container.getService('notificationService');
    const visualizationService = container.getService('visualizationService');
    
    logger.info('Applying knowledge filters');
    
    try {
      // Get filter values
      const sourceFilters = [];
      document.querySelectorAll('.knowledge-filters input[type="checkbox"]:checked').forEach(checkbox => {
        sourceFilters.push(checkbox.value);
      });
      
      const dateFrom = document.getElementById('date-from')?.value;
      const dateTo = document.getElementById('date-to')?.value;
      
      logger.debug(`Filters - Sources: ${sourceFilters.join(', ')}, Date range: ${dateFrom || 'any'} to ${dateTo || 'any'}`);
      
      // Apply filters to current data
      let filteredPages = [...this.currentData.pages];
      
      // Apply source filters
      if (sourceFilters.length > 0) {
        filteredPages = filteredPages.filter(page => {
          const pageContexts = page.browser_contexts || [];
          return pageContexts.some(context => sourceFilters.includes(context));
        });
      }
      
      // Apply date filters
      if (dateFrom || dateTo) {
        filteredPages = filteredPages.filter(page => {
          const pageDate = new Date(page.discovered_at);
          const fromDate = dateFrom ? new Date(dateFrom) : null;
          const toDate = dateTo ? new Date(dateTo) : null;
          
          if (fromDate && pageDate < fromDate) return false;
          if (toDate && pageDate > toDate) return false;
          return true;
        });
      }
      
      // Update display
      if (this.currentView === 'list') {
        const knowledgeList = document.querySelector('.knowledge-list');
        if (knowledgeList) {
          knowledgeList.innerHTML = ''; // Clear existing content
          this.displayKnowledgeItems(logger, filteredPages);
        }
      } else {
        // Update graph with filtered data
        this.currentData.graphData = this.createGraphFromPages(logger, filteredPages);
        this.renderKnowledgeGraph(logger, visualizationService);
      }
      
      logger.debug(`Filters applied - showing ${filteredPages.length} of ${this.currentData.pages.length} items`);
    } catch (error) {
      logger.error('Error applying knowledge filters:', error);
      notificationService.showNotification('Error applying filters', 'error');
    }
  },
  
  /**
   * Search knowledge graph
   * @param {LogManager} logger - Logger instance
   * @param {string} searchTerm - Term to search for
   * @returns {Promise<void>}
   */
  async searchKnowledge(logger, searchTerm) {
    const notificationService = container.getService('notificationService');
    const visualizationService = container.getService('visualizationService');
    
    if (!searchTerm || !searchTerm.trim()) {
      logger.debug('Empty search term, reloading all data');
      this.loadKnowledgeData(logger);
      return;
    }
    
    logger.info(`Searching knowledge for: "${searchTerm}"`);
    
    try {
      // Search through current data
      const searchResults = this.currentData.pages.filter(page => 
        page.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        page.url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        Object.keys(page.keywords || {}).some(k => 
          k.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      
      logger.info(`Search returned ${searchResults.length} results`);
      
      // Update display
      if (this.currentView === 'list') {
        const knowledgeList = document.querySelector('.knowledge-list');
        if (knowledgeList) {
          knowledgeList.innerHTML = ''; // Clear existing content
          this.displayKnowledgeItems(logger, searchResults);
        }
      } else {
        // Update graph with search results
        this.currentData.graphData = this.createGraphFromPages(logger, searchResults);
        this.renderKnowledgeGraph(logger, visualizationService);
      }
      
      // Show notification if no results were found
      if (searchResults.length === 0) {
        notificationService.showNotification(`No results found for "${searchTerm}"`, 'info');
      }
    } catch (error) {
      logger.error('Search error:', error);
      notificationService.showNotification(`Search error: ${error.message}`, 'error');
    }
  },
  
  /**
   * Show details for a knowledge item
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item to show details for
   */
  showKnowledgeDetails(logger, item) {
    const formatting = container.getUtil('formatting');
    
    if (!item) {
      logger.warn('Attempted to show details for undefined item');
      return;
    }
    
    logger.info(`Showing details for item: ${item.id || item.url}`);
    
    try {
      // Get the details sidebar
      const sidebar = document.getElementById('details-sidebar');
      if (!sidebar) {
        logger.error('Details sidebar element not found');
        return;
      }
      
      // Update sidebar content
      const detailsContent = sidebar.querySelector('.details-content');
      if (!detailsContent) {
        logger.error('Details content element not found');
        return;
      }
      
      // Format date
      let dateStr = 'Unknown date';
      try {
        if (item.discovered_at) {
          const discoveredDate = new Date(item.discovered_at);
          dateStr = discoveredDate.toLocaleDateString();
        }
      } catch (e) {
        logger.warn(`Error formatting date: ${item.discovered_at}`);
      }
      
      // Create HTML content for details
      detailsContent.innerHTML = this.createDetailsHTML(logger, item, dateStr, formatting);
      
      // Add event listeners
      this.setupDetailActionHandlers(logger, detailsContent, item);
      
      // Display the sidebar
      sidebar.classList.add('active');
      
      // Set up close button
      const closeButton = sidebar.querySelector('.close-details-btn');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          sidebar.classList.remove('active');
        });
      }
      
      logger.debug('Knowledge item details displayed');
    } catch (error) {
      logger.error('Error showing knowledge details:', error);
      const notificationService = container.getService('notificationService');
      notificationService.showNotification('Error showing item details', 'error');
    }
  },
  
  /**
   * Create HTML for the details view
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item
   * @param {string} dateStr - Formatted date string
   * @param {Object} formatting - Formatting utilities
   * @returns {string} HTML content
   */
  createDetailsHTML(logger, item, dateStr, formatting) {
    logger.debug(`Creating details HTML for item: ${item.id || item.url}`);
    
    try {
      return `
        <div class="details-item">
          <h3>${item.title || 'Untitled'}</h3>
          <div class="details-url">
            <a href="${item.url}" target="_blank">${item.url}</a>
          </div>
          
          <div class="details-section">
            <h4>Metadata</h4>
            <dl class="details-data">
              <dt>Captured</dt>
              <dd>${dateStr}</dd>
              
              <dt>Source</dt>
              <dd>${formatting.formatContext(item.browser_contexts || [])}</dd>
              
              <dt>Status</dt>
              <dd>${item.status || 'Unknown'}</dd>
              
              <dt>Domain</dt>
              <dd>${item.domain || 'Unknown'}</dd>
            </dl>
          </div>
          
          ${item.keywords && Object.keys(item.keywords).length > 0 
            ? `<div class="details-section">
                <h4>Keywords</h4>
                <div class="keyword-cloud">
                  ${Object.entries(item.keywords).map(([keyword, score]) => 
                    `<div class="keyword-tag" style="font-size: ${Math.min(100, score * 100) + 80}%">
                      ${keyword} <span class="keyword-score">${(score * 100).toFixed(0)}%</span>
                    </div>`
                  ).join('')}
                </div>
              </div>` 
            : ''}
          
          ${item.relationships && item.relationships.length > 0 
            ? `<div class="details-section">
                <h4>Relationships</h4>
                <ul class="relationship-list">
                  ${item.relationships.map(rel => 
                    `<li>
                      <span class="relationship-type">${rel.type || 'related'}</span>
                      <a href="#" class="relationship-target" data-id="${rel.target_id}">
                        ${rel.target_title || rel.target_id}
                      </a>
                    </li>`
                  ).join('')}
                </ul>
              </div>` 
            : ''}
          
          <div class="details-actions">
            <button class="btn-secondary" id="view-in-browser">Open in Browser</button>
            <button class="btn-secondary" id="recapture-page">Recapture</button>
            <button class="btn-secondary" id="analyze-page">Analyze</button>
          </div>
        </div>
      `;
    } catch (error) {
      logger.error('Error creating details HTML:', error);
      return `<div class="error-state">Error creating details: ${error.message}</div>`;
    }
  },
  
  /**
   * Set up event handlers for the detail view actions
   * @param {LogManager} logger - Logger instance
   * @param {HTMLElement} detailsContent - Details content element
   * @param {Object} item - Knowledge item
   */
  setupDetailActionHandlers(logger, detailsContent, item) {
    const notificationService = container.getService('notificationService');
    
    if (!detailsContent || !item) {
      logger.warn('Invalid parameters for setupDetailActionHandlers');
      return;
    }
    
    logger.debug('Setting up detail action handlers');
    
    try {
      // View in browser button
      const viewInBrowserBtn = detailsContent.querySelector('#view-in-browser');
      if (viewInBrowserBtn) {
        viewInBrowserBtn.addEventListener('click', () => {
          if (!item.url) {
            notificationService.showNotification('No URL available for this item', 'warning');
            return;
          }
          
          logger.info(`Opening URL in browser: ${item.url}`);
          chrome.tabs.create({ url: item.url });
        });
      }
      
      // Recapture button
      const recaptureBtn = detailsContent.querySelector('#recapture-page');
      if (recaptureBtn) {
        recaptureBtn.addEventListener('click', () => {
          this.recapturePage(logger, item, recaptureBtn);
        });
      }
      
      // Analyze button
      const analyzeBtn = detailsContent.querySelector('#analyze-page');
      if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
          this.analyzePage(logger, item, analyzeBtn);
        });
      }
      
      // Set up relationship item clicks to load related items
      const relationshipLinks = detailsContent.querySelectorAll('.relationship-target');
      relationshipLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = link.getAttribute('data-id');
          if (targetId) {
            this.loadRelatedItem(logger, targetId);
          } else {
            logger.warn('Relationship link clicked with no target ID');
          }
        });
      });
      
      logger.debug('Detail action handlers set up successfully');
    } catch (error) {
      logger.error('Error setting up detail action handlers:', error);
    }
  },
  
  /**
   * Recapture a page
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item to recapture
   * @param {HTMLElement} button - Button element for UI updates
   * @returns {Promise<void>}
   */
  async recapturePage(logger, item, button) {
    const apiService = container.getService('apiService');
    const notificationService = container.getService('notificationService');
    
    if (!item || !item.url) {
      logger.warn('Attempted to recapture item with no URL');
      notificationService.showNotification('Cannot recapture: No URL available', 'warning');
      return;
    }
    
    logger.info(`Recapturing page: ${item.url}`);
    
    button.disabled = true;
    button.textContent = 'Recapturing...';
    
    try {
      // Request recapture
      const pageData = {
        url: item.url,
        title: item.title,
        context: item.browser_contexts?.[0] || 'active_tab',
        browser_contexts: item.browser_contexts || ['active_tab']
      };
      
      logger.debug('Sending recapture request', pageData);
      
      const response = await apiService.fetchAPI('/api/v1/pages/', {
        method: 'POST',
        body: JSON.stringify(pageData)
      });

      if (response.success) {
        button.textContent = 'Recaptured!';
        notificationService.showNotification('Page recaptured successfully', 'success');
        logger.info('Page recaptured successfully');
        
        // Reload knowledge data to show updated information
        setTimeout(() => {
          this.loadKnowledgeData(logger);
          button.disabled = false;
          button.textContent = 'Recapture';
        }, 2000);
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      logger.error('Recapture error:', error);
      button.textContent = 'Recapture Failed';
      notificationService.showNotification('Error recapturing page: ' + error.message, 'error');
      
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Recapture';
      }, 2000);
    }
  },
  
  /**
   * Analyze a page
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item to analyze
   * @param {HTMLElement} button - Button element for UI updates
   * @returns {Promise<void>}
   */
  async analyzePage(logger, item, button) {
    const apiService = container.getService('apiService');
    const notificationService = container.getService('notificationService');
    
    if (!item || !item.url) {
      logger.warn('Attempted to analyze item with no URL');
      notificationService.showNotification('Cannot analyze: No URL available', 'warning');
      return;
    }
    
    logger.info(`Analyzing page: ${item.url}`);
    
    button.disabled = true;
    button.textContent = 'Analyzing...';
    
    try {
      // Request analysis
      logger.debug('Sending analysis request');
      
      const response = await apiService.fetchAPI('/api/v1/analysis/analyze', {
        method: 'POST',
        body: JSON.stringify({
          url: item.url,
          force: true
        })
      });

      if (response.success) {
        button.textContent = 'Analysis Started!';
        notificationService.showNotification('Analysis started successfully', 'success');
        logger.info('Analysis started successfully');
        
        // Check analysis status periodically
        const taskId = response.data.task_id;
        if (taskId) {
          logger.debug(`Monitoring analysis task: ${taskId}`);
          this.checkAnalysisStatus(logger, taskId, button);
        } else {
          logger.warn('No task ID returned from analysis request');
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
          }, 2000);
        }
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      logger.error('Analysis error:', error);
      button.textContent = 'Analysis Failed';
      notificationService.showNotification('Error starting analysis: ' + error.message, 'error');
      
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Analyze';
      }, 2000);
    }
  },
  
  /**
   * Load related item details
   * @param {LogManager} logger - Logger instance
   * @param {string} itemId - ID of related item to load
   * @returns {Promise<void>}
   */
  async loadRelatedItem(logger, itemId) {
    const apiService = container.getService('apiService');
    const notificationService = container.getService('notificationService');
    
    if (!itemId) {
      logger.warn('Attempted to load related item with no ID');
      return;
    }
    
    logger.info(`Loading related item: ${itemId}`);
    notificationService.showNotification('Loading related item...', 'info');
    
    try {
      // Request item details
      const response = await apiService.fetchAPI(`/api/v1/pages/${itemId}`);
      
      if (response.success) {
        logger.debug('Related item loaded successfully');
        this.showKnowledgeDetails(logger, response.data);
      } else {
        throw new Error(response.error?.message || 'Failed to load related item');
      }
    } catch (error) {
      logger.error('Error loading related item:', error);
      notificationService.showNotification(`Error loading related item: ${error.message}`, 'error');
    }
  },
  
  /**
   * Check the status of an analysis task
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - ID of task to check
   * @param {HTMLElement} button - Button element for UI updates
   * @returns {Promise<void>}
   */
  async checkAnalysisStatus(logger, taskId, button) {
    const apiService = container.getService('apiService');
    const notificationService = container.getService('notificationService');
    
    if (!taskId) {
      logger.warn('Attempted to check status with no task ID');
      return;
    }
    
    logger.debug(`Checking analysis status for task: ${taskId}`);
    
    try {
      const response = await apiService.fetchAPI(`/api/v1/analysis/status/${taskId}`);
      
      if (response.success) {
        const status = response.data.status;
        logger.debug(`Task ${taskId} status: ${status}`);
        
        if (status === 'completed') {
          // Task is complete, show response
          button.textContent = 'Analysis Complete!';
          notificationService.showNotification('Analysis completed successfully', 'success');
          
          // Reload knowledge data to show updated information
          setTimeout(() => {
            this.loadKnowledgeData(logger);
            button.disabled = false;
            button.textContent = 'Analyze';
          }, 2000);
        } else if (status === 'error') {
          // Show error message
          const errorMessage = response.data.error || 'Assistant encountered an error';
          logger.error(`Task error: ${errorMessage}`);
          button.textContent = 'Analysis Failed';
          notificationService.showNotification('Analysis failed', 'error');
          
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
          }, 2000);
        } else if (status === 'processing' || status === 'pending') {
          // Still processing, check again after a delay
          button.textContent = `Analyzing (${status})...`;
          setTimeout(() => this.checkAnalysisStatus(logger, taskId, button), 2000);
        } else {
          // Unknown status
          logger.warn(`Unknown task status: ${status}`);
          button.textContent = 'Unknown Status';
          
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
          }, 2000);
        }
      } else {
        // Error checking status
        throw new Error(response.error?.message || 'Failed to check task status');
      }
    } catch (error) {
      logger.error('Error checking analysis status:', error);
      button.textContent = 'Status Check Failed';
      
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Analyze';
      }, 2000);
    }
  },
  
  /**
   * Refresh knowledge data and graph
   * @returns {Promise<boolean>} Success state
   */
  async refreshKnowledgePanel() {
    const logger = new (container.getUtil('LogManager'))({
      context: 'knowledge-panel',
      isBackgroundScript: false
    });
    
    const notificationService = container.getService('notificationService');
    
    logger.info('Refreshing knowledge panel');
    
    try {
      notificationService.showNotification('Refreshing knowledge data...', 'info');
      
      // Reload knowledge data
      await this.loadKnowledgeData(logger);
      
      notificationService.showNotification('Knowledge data refreshed', 'success');
      return true;
    } catch (error) {
      logger.error('Error refreshing knowledge panel:', error);
      notificationService.showNotification(`Error refreshing knowledge data: ${error.message}`, 'error');
      return false;
    }
  },
  
  /**
   * Get the count of knowledge items
   * @returns {Promise<number>} Count of knowledge items
   */
  async getKnowledgeItemCount() {
    const logger = new (container.getUtil('LogManager'))({
      context: 'knowledge-panel',
      isBackgroundScript: false
    });
    
    const apiService = container.getService('apiService');
    
    try {
      const response = await apiService.fetchAPI('/api/v1/pages/count');
      
      if (response.success) {
        return response.data.count || 0;
      } else {
        logger.warn('Failed to get knowledge item count:', response.error);
        return 0;
      }
    } catch (error) {
      logger.error('Error getting knowledge item count:', error);
      return 0;
    }
  },
  
  /**
   * Export knowledge data
   * @returns {Promise<Object|null>} Exported knowledge data or null on error
   */
  async exportKnowledgeData() {
    const logger = new (container.getUtil('LogManager'))({
      context: 'knowledge-panel',
      isBackgroundScript: false
    });
    
    const apiService = container.getService('apiService');
    const notificationService = container.getService('notificationService');
    
    logger.info('Exporting knowledge data');
    
    try {
      notificationService.showNotification('Preparing knowledge export...', 'info');
      
      const response = await apiService.fetchAPI('/api/v1/export/knowledge');
      
      if (response.success) {
        logger.info('Knowledge data exported successfully');
        notificationService.showNotification('Knowledge data exported successfully', 'success');
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Export failed');
      }
    } catch (error) {
      logger.error('Error exporting knowledge data:', error);
      notificationService.showNotification(`Error exporting knowledge data: ${error.message}`, 'error');
      return null;
    }
  },
  
  /**
   * Debounce function to limit function call frequency
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
};

// Export using named export
export { KnowledgePanel };