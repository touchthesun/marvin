// src/components/panels/knowledge/knowledge-panel.js
import { LogManager } from '../../../utils/log-manager.js'; 
import { container } from '../../../core/dependency-container.js';

/**
 * Knowledge Panel Component
 * Displays and manages knowledge items and visualization
 */
const KnowledgePanel = {
  // Track resources for proper cleanup
  _eventListeners: [],
  _timeouts: [],
  _intervals: [],
  _domElements: [],
  initialized: false,
  
  // Panel state
  currentView: 'list', // 'list' or 'graph'
  currentData: { 
    pages: [], 
    graphData: { nodes: [], edges: [] } 
  },
  
  /**
   * Initialize the knowledge panel
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    // Create logger directly
    const logger = new LogManager({
      context: 'knowledge-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    logger.info('Initializing knowledge panel');
    console.log('🔍 DEBUG: Knowledge Panel initialize() called');
    
    try {
      // Check if already initialized to prevent duplicate initialization
      if (this.initialized) {
        logger.debug('Knowledge panel already initialized');
        console.log('🔍 DEBUG: Knowledge Panel already initialized, returning true');
        return true;
      }
      
      console.log('🔍 DEBUG: Knowledge Panel not initialized, proceeding with initialization');
      
      // Initialize the panel UI if needed
      this.ensurePanelUI(logger);
      
      // Initialize panel state
      this.currentView = 'graph'; // 'list' or 'graph' - default to graph for knowledge visualization
      this.currentData = { 
        pages: [], 
        graphData: { nodes: [], edges: [] } 
      };
      
      // Get dependencies with error handling
      const ui = container.utils.get('ui') || {
        initSplitView: () => logger.warn('UI utility not available for split view')
      };
      
      const visualizationService = await this.getService(logger, 'visualizationService', {
        initialize: async () => logger.warn('Visualization service not available'),
        createKnowledgeGraph: () => logger.warn('Visualization service not available') && false
      });
      
      // Initialize the split view utility
      ui.initSplitView?.();
      
      // Initialize visualization service
      await visualizationService.initialize?.();
      
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
      
      // Get notification service with error handling
      try {
        const notificationService = container.getService('notificationService');
        if (notificationService && typeof notificationService.showNotification === 'function') {
          notificationService.showNotification('Failed to initialize knowledge panel', 'error');
        } else {
          console.error('[ERROR] Failed to initialize knowledge panel');
        }
      } catch (error) {
        console.error('[ERROR] Failed to initialize knowledge panel');
      }
      
      const knowledgeContent = document.querySelector('.knowledge-content');
      if (knowledgeContent) {
        knowledgeContent.innerHTML = 
          `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
      }
      
      return false;
    }
  },
  
  /**
   * Get service with error handling and fallback
   * @param {LogManager} logger - Logger instance
   * @param {string} serviceName - Name of the service to get
   * @param {Object} fallback - Fallback implementation if service not available
   * @returns {Promise<Object>} Service instance or fallback
   */
  async getService(logger, serviceName, fallback) {
    try {
      console.log(`🔍 DEBUG: Getting service '${serviceName}' from container`);
      console.log(`🔍 DEBUG: Container available:`, !!container);
      console.log(`🔍 DEBUG: Container services:`, container.services ? Array.from(container.services.keys()) : 'no services map');
      
      const service = await container.getService(serviceName);
      console.log(`🔍 DEBUG: Service '${serviceName}' retrieved:`, !!service);
      console.log(`🔍 DEBUG: Service type:`, typeof service);
      console.log(`🔍 DEBUG: Service initialized:`, service?.initialized);
      
      return service;
    } catch (error) {
      console.error(`🔍 DEBUG: Error getting service '${serviceName}':`, error);
      logger.warn(`${serviceName} not available:`, error);
      return fallback;
    }
  },
  
  /**
   * Ensure panel UI elements exist
   * @param {LogManager} logger - Logger instance 
   */
  ensurePanelUI(logger) {
    logger.debug('Ensuring panel UI elements exist');
    
    try {
      const panel = document.getElementById('knowledge-panel');
      if (!panel) {
        logger.error('Knowledge panel element not found');
        throw new Error('Knowledge panel element not found');
      }
      
      // Create UI structure if missing
      if (panel.querySelector('.loading-indicator')) {
        const loadingIndicator = panel.querySelector('.loading-indicator');
        loadingIndicator.parentNode.removeChild(loadingIndicator);
        
        // Create main structure
        const contentElement = document.createElement('div');
        contentElement.className = 'knowledge-content';
        contentElement.innerHTML = `
          <div class="panel-toolbar">
            <div class="search-container">
              <input type="text" id="knowledge-search" placeholder="Search knowledge...">
              <button id="search-btn" class="btn-secondary">Search</button>
            </div>
            <div class="view-toggle">
              <button class="toggle-btn active" data-view="list">
                <span class="icon">📑</span> List View
              </button>
              <button class="toggle-btn" data-view="graph">
                <span class="icon">🕸️</span> Graph View
              </button>
            </div>
          </div>
          
          <div class="content-container">
            <div class="main-area">
              <div class="knowledge-list-view">
                <div class="knowledge-list"></div>
              </div>
              <div class="knowledge-graph-view" style="display: none;">
                <div id="graph-container" class="graph-container"></div>
              </div>
            </div>
            
            <div class="sidebar">
              <div class="knowledge-filters">
                <h3>Filters</h3>
                <div class="filter-section">
                  <h4>Source</h4>
                  <div class="checkbox-group">
                    <label>
                      <input type="checkbox" value="ACTIVE_TAB" checked> Browser Tabs
                    </label>
                    <label>
                      <input type="checkbox" value="BOOKMARK" checked> Bookmarks
                    </label>
                    <label>
                      <input type="checkbox" value="HISTORY" checked> History
                    </label>
                    <label>
                      <input type="checkbox" value="MANUAL" checked> Manual Entry
                    </label>
                  </div>
                </div>
                
                <div class="filter-section">
                  <h4>Date Range</h4>
                  <div class="date-range">
                    <div class="date-field">
                      <label for="date-from">From</label>
                      <input type="date" id="date-from">
                    </div>
                    <div class="date-field">
                      <label for="date-to">To</label>
                      <input type="date" id="date-to">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Details Sidebar -->
          <div id="details-sidebar" class="details-sidebar">
            <div class="details-header">
              <h3>Item Details</h3>
              <button class="close-details-btn">×</button>
            </div>
            <div class="details-content"></div>
          </div>
        `;
        
        panel.appendChild(contentElement);
        this._domElements.push(contentElement);
        
        logger.debug('Knowledge panel UI structure created');
      } else {
        logger.debug('Knowledge panel UI structure already exists');
      }
    } catch (error) {
      logger.error('Error ensuring panel UI:', error);
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
      const debouncedSearchKnowledge = this.debounce(async (searchTerm) => {
        await this.searchKnowledge(logger, searchTerm);
      }, 300);
      
      // Knowledge panel search
      const searchInput = document.getElementById('knowledge-search');
      if (searchInput) {
        const searchInputHandler = (e) => {
          if (e.key === 'Enter') {
            debouncedSearchKnowledge(e.target.value);
          }
        };
        
        searchInput.addEventListener('keydown', searchInputHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: searchInput,
          type: 'keydown',
          listener: searchInputHandler
        });
        
        logger.debug('Search input keydown listener attached');
      } else {
        logger.warn('Search input element not found');
      }
      
      const searchBtn = document.getElementById('search-btn');
      if (searchBtn) {
        const searchBtnHandler = () => {
          const searchTerm = document.getElementById('knowledge-search')?.value || '';
          debouncedSearchKnowledge(searchTerm);
        };
        
        searchBtn.addEventListener('click', searchBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: searchBtn,
          type: 'click',
          listener: searchBtnHandler
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
        const closeDetailsBtnHandler = () => {
          const sidebar = document.getElementById('details-sidebar');
          if (sidebar) {
            sidebar.classList.remove('active');
          }
        };
        
        closeDetailsBtn.addEventListener('click', closeDetailsBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: closeDetailsBtn,
          type: 'click',
          listener: closeDetailsBtnHandler
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
   * Set up event handlers for the detail view actions
   * @param {LogManager} logger - Logger instance
   * @param {HTMLElement} detailsContent - Details content element
   * @param {Object} item - Knowledge item
   */
  async setupDetailActionHandlers(logger, detailsContent, item) {
    // Get notification service with error handling
    const notificationService = await this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    if (!detailsContent || !item) {
      logger.warn('Invalid parameters for setupDetailActionHandlers');
      return;
    }
    
    logger.debug('Setting up detail action handlers');
    
    try {
      // View in browser button
      const viewInBrowserBtn = detailsContent.querySelector('#view-in-browser');
      if (viewInBrowserBtn) {
        const viewInBrowserHandler = () => {
          if (!item.url) {
            notificationService.showNotification('No URL available for this item', 'warning');
            return;
          }
          
          logger.info(`Opening URL in browser: ${item.url}`);
          chrome.tabs.create({ url: item.url });
        };
        
        viewInBrowserBtn.addEventListener('click', viewInBrowserHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: viewInBrowserBtn,
          type: 'click',
          listener: viewInBrowserHandler
        });
      }
      
      // Recapture button
      const recaptureBtn = detailsContent.querySelector('#recapture-page');
      if (recaptureBtn) {
        const recaptureBtnHandler = async () => {
          await this.recapturePage(logger, item, recaptureBtn);
        };
        
        recaptureBtn.addEventListener('click', recaptureBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: recaptureBtn,
          type: 'click',
          listener: recaptureBtnHandler
        });
      }
      
      // Analyze button
      const analyzeBtn = detailsContent.querySelector('#analyze-page');
      if (analyzeBtn) {
        const analyzeBtnHandler = async () => {
          await this.analyzePage(logger, item, analyzeBtn);
        };
        
        analyzeBtn.addEventListener('click', analyzeBtnHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: analyzeBtn,
          type: 'click',
          listener: analyzeBtnHandler
        });
      }
      
      // Set up relationship item clicks to load related items
      const relationshipLinks = detailsContent.querySelectorAll('.relationship-target');
      relationshipLinks.forEach(link => {
        const relationshipLinkHandler = (e) => {
          e.preventDefault();
          const targetId = link.getAttribute('data-id');
          if (targetId) {
            this.loadRelatedItem(logger, targetId);
          } else {
            logger.warn('Relationship link clicked with no target ID');
          }
        };
        
        link.addEventListener('click', relationshipLinkHandler);
        
        // Track this listener for cleanup
        this._eventListeners.push({
          element: link,
          type: 'click',
          listener: relationshipLinkHandler
        });
      });
      
      logger.debug('Detail action handlers set up successfully');
    } catch (error) {
      logger.error('Error setting up detail action handlers:', error);
    }
  },
  
  /**
   * Apply knowledge filters
   * @param {LogManager} logger - Logger instance
   */
  async applyKnowledgeFilters(logger) {
    // Get notification service with error handling
    const notificationService = await this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    // Get visualization service with error handling
    const visualizationService = await this.getService(logger, 'visualizationService', {
      createKnowledgeGraph: () => logger.warn('Visualization service not available') && false
    });
    
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
        await this.renderKnowledgeGraph(logger, visualizationService);
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
    // Get notification service with error handling
    const notificationService = await this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
    // Get visualization service with error handling
    const visualizationService = await this.getService(logger, 'visualizationService', {
      createKnowledgeGraph: () => logger.warn('Visualization service not available') && false
    });
    
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
        await this.renderKnowledgeGraph(logger, visualizationService);
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
   * Recapture a page
   * @param {LogManager} logger - Logger instance
   * @param {Object} item - Knowledge item to recapture
   * @param {HTMLElement} button - Button element for UI updates
   * @returns {Promise<void>}
   */
  async recapturePage(logger, item, button) {
    // Get services with error handling
    const apiService = await this.getService(logger, 'apiService', {
      fetchAPI: async () => ({ success: false, error: { message: 'API service not available' }})
    });
    
    const notificationService = await this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
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
        const timeoutId = setTimeout(() => {
          this.loadKnowledgeData(logger);
          button.disabled = false;
          button.textContent = 'Recapture';
          
          // Remove from tracking once executed
          const index = this._timeouts.indexOf(timeoutId);
          if (index > -1) this._timeouts.splice(index, 1);
        }, 2000);
        
        // Track timeout for cleanup
        this._timeouts.push(timeoutId);
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      logger.error('Recapture error:', error);
      button.textContent = 'Recapture Failed';
      notificationService.showNotification('Error recapturing page: ' + error.message, 'error');
      
      const timeoutId = setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Recapture';
        
        // Remove from tracking once executed
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
      }, 2000);
      
      // Track timeout for cleanup
      this._timeouts.push(timeoutId);
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
    // Get services with error handling
    const apiService = await this.getService(logger, 'apiService', {
      fetchAPI: async () => ({ success: false, error: { message: 'API service not available' }})
    });
    
    const notificationService = await this.getService(logger, 'notificationService', {
      showNotification: (message, type) => console.error(`[${type}] ${message}`)
    });
    
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
          await this.checkAnalysisStatus(logger, taskId, button);
        } else {
          logger.warn('No task ID returned from analysis request');
          const timeoutId = setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
            
            // Remove from tracking once executed
            const index = this._timeouts.indexOf(timeoutId);
            if (index > -1) this._timeouts.splice(index, 1);
          }, 2000);
          
          // Track timeout for cleanup
          this._timeouts.push(timeoutId);
        }
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      logger.error('Analysis error:', error);
      button.textContent = 'Analysis Failed';
      notificationService.showNotification('Error starting analysis: ' + error.message, 'error');
      
      const timeoutId = setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Analyze';
        
        // Remove from tracking once executed
        const index = this._timeouts.indexOf(timeoutId);
        if (index > -1) this._timeouts.splice(index, 1);
      }, 2000);
      
      // Track timeout for cleanup
      this._timeouts.push(timeoutId);
    }
  },
  
  /**
   * Load knowledge data from storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadKnowledgeData(logger) {
    logger.debug('Loading knowledge data from API');
    console.log('🔍 DEBUG: loadKnowledgeData called');
    
    try {
      // Get API service with enhanced error handling
      console.log('🔍 DEBUG: Getting API service...');
      const apiService = await this.getService(logger, 'apiService', null);
      console.log('🔍 DEBUG: API service:', apiService ? 'found' : 'not found');
      
      if (apiService) {
        console.log('🔍 DEBUG: API service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(apiService)));
        console.log('🔍 DEBUG: Has getGraphOverview?', typeof apiService.getGraphOverview === 'function');
        console.log('🔍 DEBUG: API service initialized?', apiService.initialized);
        
        let response;
        if (typeof apiService.getGraphOverview !== 'function') {
          console.warn('🔍 DEBUG: getGraphOverview method not found, trying fetchAPI directly');
          // Fallback: use fetchAPI directly
          response = await apiService.fetchAPI('/api/v1/graph/overview', {
            method: 'GET',
            limit: 100
          });
          console.log('🔍 DEBUG: Direct fetchAPI response:', response);
        } else {
          console.log('🔍 DEBUG: Calling apiService.getGraphOverview...');
          // Call graph overview API endpoint
          response = await apiService.getGraphOverview({ limit: 100 });
        }
        console.log('🔍 DEBUG: API response:', response);
        
        if (response && response.success && response.data) {
          // Map API response to expected format
          // Note: API returns nested data structure: response.data.data.nodes
          const apiData = response.data.data || response.data;
          this.currentData.pages = apiData.pages || [];
          this.currentData.graphData = {
            nodes: apiData.nodes || [],
            edges: apiData.edges || []
          };
          
          console.log('🔍 DEBUG: Data loaded successfully:', {
            pages: this.currentData.pages.length,
            nodes: this.currentData.graphData.nodes.length,
            edges: this.currentData.graphData.edges.length
          });
          
          // Debug: Check what the nodes look like
          if (this.currentData.graphData.nodes.length > 0) {
            console.log('🔍 DEBUG: First node example:', this.currentData.graphData.nodes[0]);
            console.log('🔍 DEBUG: Node structure:', Object.keys(this.currentData.graphData.nodes[0]));
          }
          
          logger.debug('Knowledge data loaded from API successfully', { 
            pagesCount: this.currentData.pages.length,
            nodesCount: this.currentData.graphData.nodes.length,
            edgesCount: this.currentData.graphData.edges.length
          });
        } else {
          console.error('🔍 DEBUG: Invalid API response format:', response);
          throw new Error(`Invalid API response format: ${JSON.stringify(response)}`);
        }
      } else {
        console.error('🔍 DEBUG: API service not available');
        throw new Error('API service not available - check container initialization');
      }
      
      // Update display
      console.log('🔍 DEBUG: Updating display, currentView:', this.currentView);
      
      // Show/hide appropriate containers
      const listContainer = document.querySelector('.knowledge-list');
      const graphContainer = document.querySelector('.knowledge-graph');
      
      if (this.currentView === 'list') {
        if (listContainer) listContainer.style.display = 'block';
        if (graphContainer) graphContainer.style.display = 'none';
        
        // Use nodes if pages are empty
        const itemsToDisplay = this.currentData.pages.length > 0 ? this.currentData.pages : this.currentData.graphData.nodes;
        console.log('🔍 DEBUG: Displaying items:', itemsToDisplay.length, 'items');
        this.displayKnowledgeItems(logger, itemsToDisplay);
      } else {
        if (listContainer) listContainer.style.display = 'none';
        if (graphContainer) graphContainer.style.display = 'block';
        
        const visualizationService = await this.getService(logger, 'visualizationService', {
          createKnowledgeGraph: () => logger.warn('Visualization service not available')
        });
        await this.renderKnowledgeGraph(logger, visualizationService);
      }
      
      logger.info(`Loaded ${this.currentData.pages.length} knowledge items`);
    } catch (error) {
      console.error('🔍 DEBUG: loadKnowledgeData error:', error);
      logger.error('Failed to load knowledge data:', error);
      logger.error('Error loading knowledge data:', error);
      
      // Use fallback data if API fails
      this.currentData.pages = [];
      this.currentData.graphData = { 
        nodes: [
          { id: 'node1', label: 'Sample Page', color: '#4285f4' },
          { id: 'node2', label: 'Related Content', color: '#34a853' }
        ], 
        edges: [
          { source: 'node1', target: 'node2' }
        ]
      };
      
      // Still update display with fallback data
      if (this.currentView === 'list') {
        this.displayKnowledgeItems(logger, this.currentData.pages);
      } else {
        const visualizationService = await this.getService(logger, 'visualizationService', {
          createKnowledgeGraph: () => logger.warn('Visualization service not available')
        });
        await this.renderKnowledgeGraph(logger, visualizationService);
      }
    }
  },
  
  /**
   * Set up view toggle functionality
   * @param {LogManager} logger - Logger instance
   */
  setupViewToggle(logger) {
    logger.debug('Setting up view toggle');
    
    const viewToggle = document.querySelector('.view-toggle');
    if (!viewToggle) {
      logger.warn('View toggle not found');
      return;
    }
    
    const toggleButtons = viewToggle.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(button => {
      const clickHandler = async () => {
        const view = button.dataset.view;
        await this.switchView(logger, view);
      };
      
      button.addEventListener('click', clickHandler);
      this._eventListeners.push({
        element: button,
        type: 'click',
        listener: clickHandler
      });
    });
  },
  
  /**
   * Switch between list and graph views
   * @param {LogManager} logger - Logger instance
   * @param {string} view - View to switch to ('list' or 'graph')
   */
  async switchView(logger, view) {
    logger.debug(`Switching to ${view} view`);
    
    this.currentView = view;
    
    // Update toggle buttons
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Show/hide appropriate containers
    const listContainer = document.querySelector('.knowledge-list');
    const graphContainer = document.querySelector('.knowledge-graph');
    
    if (view === 'list') {
      if (listContainer) listContainer.style.display = 'block';
      if (graphContainer) graphContainer.style.display = 'none';
      
      // Use nodes if pages are empty
      const itemsToDisplay = this.currentData.pages.length > 0 ? this.currentData.pages : this.currentData.graphData.nodes;
      this.displayKnowledgeItems(logger, itemsToDisplay);
    } else {
      if (listContainer) listContainer.style.display = 'none';
      if (graphContainer) graphContainer.style.display = 'block';
      
      const visualizationService = await this.getService(logger, 'visualizationService', {
        createKnowledgeGraph: () => logger.warn('Visualization service not available')
      });
      await this.renderKnowledgeGraph(logger, visualizationService);
    }
  },
  
  /**
   * Set up knowledge filters
   * @param {LogManager} logger - Logger instance
   */
  setupKnowledgeFilters(logger) {
    logger.debug('Setting up knowledge filters');
    // Filter functionality can be added here
  },
  
  /**
   * Display knowledge items in list view
   * @param {LogManager} logger - Logger instance
   * @param {Array} items - Items to display
   */
  displayKnowledgeItems(logger, items) {
    logger.debug(`Displaying ${items.length} knowledge items`);
    
    const knowledgeList = document.querySelector('.knowledge-list');
    if (!knowledgeList) {
      logger.warn('Knowledge list container not found');
      return;
    }
    
    knowledgeList.innerHTML = '';
    
    if (items.length === 0) {
      knowledgeList.innerHTML = '<div class="empty-state">No knowledge items found</div>';
      return;
    }
    
    items.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'knowledge-item';
      itemElement.dataset.id = item.id;
      itemElement.innerHTML = `
        <div class="item-header">
          <h3 class="item-title">${item.title || 'Untitled'}</h3>
          <div class="item-actions">
            <button class="btn-icon recapture-btn" title="Recapture">🔄</button>
            <button class="btn-icon analyze-btn" title="Analyze">🔍</button>
          </div>
        </div>
        <div class="item-url">${item.url || ''}</div>
        <div class="item-meta">
          <span class="item-date">${item.captured_at ? new Date(item.captured_at).toLocaleDateString() : 'Unknown date'}</span>
          <span class="item-keywords">${Object.keys(item.keywords || {}).join(', ')}</span>
        </div>
      `;
      
      knowledgeList.appendChild(itemElement);
      this._domElements.push(itemElement);
      
      // Set up item action handlers
      const recaptureBtn = itemElement.querySelector('.recapture-btn');
      const analyzeBtn = itemElement.querySelector('.analyze-btn');
      
      if (recaptureBtn) {
        const recaptureHandler = async () => await this.recapturePage(logger, item, recaptureBtn);
        recaptureBtn.addEventListener('click', recaptureHandler);
        this._eventListeners.push({
          element: recaptureBtn,
          type: 'click',
          listener: recaptureHandler
        });
      }
      
      if (analyzeBtn) {
        const analyzeHandler = async () => await this.analyzePage(logger, item, analyzeBtn);
        analyzeBtn.addEventListener('click', analyzeHandler);
        this._eventListeners.push({
          element: analyzeBtn,
          type: 'click',
          listener: analyzeHandler
        });
      }
    });
  },
  
  /**
   * Create graph data from pages
   * @param {LogManager} logger - Logger instance
   * @param {Array} pages - Pages to create graph from
   * @returns {Object} Graph data with nodes and edges
   */
  createGraphFromPages(logger, pages) {
    logger.debug(`Creating graph from ${pages.length} pages`);
    
    const nodes = [];
    const edges = [];
    
    pages.forEach((page, index) => {
      // Add page as node
      nodes.push({
        id: page.id || `page_${index}`,
        label: page.title || 'Untitled',
        type: 'page',
        url: page.url,
        data: page
      });
      
      // Add keyword nodes and edges
      if (page.keywords) {
        Object.keys(page.keywords).forEach(keyword => {
          const keywordId = `keyword_${keyword}`;
          
          // Add keyword node if not already present
          if (!nodes.find(n => n.id === keywordId)) {
            nodes.push({
              id: keywordId,
              label: keyword,
              type: 'keyword'
            });
          }
          
          // Add edge from page to keyword
          edges.push({
            source: page.id || `page_${index}`,
            target: keywordId,
            type: 'has_keyword'
          });
        });
      }
    });
    
    return { nodes, edges };
  },
  
  /**
   * Render knowledge graph
   * @param {LogManager} logger - Logger instance
   * @param {Object} visualizationService - Visualization service
   */
  async renderKnowledgeGraph(logger, visualizationService) {
    logger.debug('Rendering knowledge graph');
    
    const graphContainer = document.querySelector('.knowledge-graph');
    if (!graphContainer) {
      logger.warn('Knowledge graph container not found');
      return;
    }
    
    try {
      if (visualizationService && typeof visualizationService.createKnowledgeGraph === 'function') {
        logger.debug('Using visualization service to create graph');
        console.log('🔍 DEBUG: Creating knowledge graph with:', {
          nodes: this.currentData.graphData.nodes.length,
          edges: this.currentData.graphData.edges.length
        });
        
        const success = await visualizationService.createKnowledgeGraph('knowledge-graph-container', this.currentData.graphData.nodes, this.currentData.graphData.edges);
        console.log('🔍 DEBUG: Graph creation result:', success);
        
        if (!success) {
          logger.warn('Visualization service failed to create graph, using fallback');
          this._renderFallbackGraph(graphContainer, logger);
        }
      } else {
        logger.debug('Visualization service not available, using fallback');
        this._renderFallbackGraph(graphContainer, logger);
      }
    } catch (error) {
      logger.error('Error rendering knowledge graph:', error);
      graphContainer.innerHTML = '<div class="error-state">Error rendering graph</div>';
    }
  },
  
  /**
   * Render fallback graph when visualization service is not available
   * @param {HTMLElement} graphContainer - Graph container element
   * @param {LogManager} logger - Logger instance
   */
  _renderFallbackGraph(graphContainer, logger) {
    logger.debug('Rendering fallback graph');
    graphContainer.innerHTML = `
      <div class="graph-fallback">
        <h3>Knowledge Graph</h3>
        <p>${this.currentData.graphData.nodes.length} nodes, ${this.currentData.graphData.edges.length} edges</p>
        <div class="simple-graph">
          ${this.currentData.graphData.nodes.map(node => `<div class="node">${node.label || node.id}</div>`).join('')}
        </div>
      </div>
    `;
  },
  
  /**
   * Load related item details
   * @param {LogManager} logger - Logger instance
   * @param {string} targetId - ID of target item
   */
  loadRelatedItem(logger, targetId) {
    logger.debug(`Loading related item: ${targetId}`);
    
    const item = this.currentData.pages.find(p => p.id === targetId);
    if (!item) {
      logger.warn(`Item not found: ${targetId}`);
      return;
    }
    
    // Show item details (implementation can be expanded)
    logger.info(`Loaded details for: ${item.title}`);
  },
  
  /**
   * Check analysis status
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - Task ID to check
   * @param {HTMLElement} button - Button element for UI updates
   */
  async checkAnalysisStatus(logger, taskId, button) {
    logger.debug(`Checking analysis status for task: ${taskId}`);
    
    const apiService = await this.getService(logger, 'apiService', {
      fetchAPI: async () => ({ success: false, error: { message: 'API service not available' }})
    });
    
    const checkStatus = async () => {
      try {
        const response = await apiService.fetchAPI(`/analysis/status/${taskId}`);
        
        if (response.success) {
          const status = response.data.status;
          
          if (status === 'completed') {
            button.disabled = false;
            button.textContent = 'Analysis Complete';
            logger.info(`Analysis completed for task: ${taskId}`);
            return;
          } else if (status === 'failed') {
            button.disabled = false;
            button.textContent = 'Analysis Failed';
            logger.error(`Analysis failed for task: ${taskId}`);
            return;
          }
          
          // Still processing, check again in 2 seconds
          const timeoutId = setTimeout(() => checkStatus(), 2000);
          this._timeouts.push(timeoutId);
        } else {
          button.disabled = false;
          button.textContent = 'Check Status Failed';
          logger.error(`Failed to check status for task: ${taskId}`);
        }
      } catch (error) {
        logger.error(`Error checking analysis status: ${error.message}`);
        button.disabled = false;
        button.textContent = 'Status Check Error';
      }
    };
    
    checkStatus();
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
      const later = () => {
        clearTimeout(timeout);
        timeout = null;
        func.apply(this, args);
      };
      
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      
      // Track timeout for cleanup
      if (this._timeouts && Array.isArray(this._timeouts)) {
        this._timeouts.push(timeout);
      }
    };
  },
  
  /**
   * Clean up resources when component is unmounted
   * This helps prevent memory leaks and browser crashes
   */
  cleanup() {
    // Create logger directly
    const logger = new LogManager({
      context: 'knowledge-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    if (!this.initialized) {
      logger.debug('Knowledge panel not initialized, skipping cleanup');
      return;
    }
    
    logger.info('Cleaning up knowledge panel resources');
    
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
    
    // Clean up DOM elements (optional, depending on use case)
    // Note: We typically don't remove the main panel elements as they are part of the DOM
    // But we can clean up dynamic elements that were added
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
    logger.debug('Knowledge panel cleanup completed');
  }
};

// Export using named export
export { KnowledgePanel };