import { ServiceRegistry } from '../../../services/service-registry.js';
import { truncateText } from '../capture/capture-ui.js';
import { formatContext } from '../../../utils/formatting.js';

// Get services from the dependency injection container
const apiService = ServiceRegistry.getService('apiService');
const visualizationService = ServiceRegistry.getService('visualizationService');
const notificationService = ServiceRegistry.getService('notificationService');
const storageService = ServiceRegistry.getService('storageService');

// Get utilities from container
import { container } from '../../../core/dependency-container.js';
const LogManager = container.getUtil('LogManager');
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'knowledge-panel',
  storageKey: 'marvin_knowledge_logs',
  maxEntries: 1000
});

// Panel state
let knowledgeInitialized = false;
let currentView = 'list'; // 'list' or 'graph'
let currentData = { pages: [], graphData: { nodes: [], edges: [] } };


// Define the KnowledgePanel component
const KnowledgePanel = {
  /**
   * Main initialization function
   */
  initKnowledgePanel() {
    return initKnowledgePanel();
  },
  
  // Public API methods
  refreshKnowledgePanel,
  getKnowledgeItemCount,
  exportKnowledgeData,
  switchView,
  loadKnowledgeData
};

/**
 * Debounce function to limit function call frequency
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create debounced versions of functions
const debouncedSearchKnowledge = debounce(searchKnowledge, 300);
const debouncedLoadKnowledgeData = debounce(loadKnowledgeData, 500);

/**
 * Initialize knowledge panel
 * @returns {Promise<void>}
 */
async function initKnowledgePanel() {
  if (knowledgeInitialized) {
    logger.debug('Knowledge panel already initialized, skipping');
    return;
  }
  
  logger.info('Initializing knowledge panel');
  
  try {
    // Initialize the split view utility
    const setupSplitView = container.getUtil('ui').setupSplitView;
    setupSplitView();
    
    // Initialize visualization service
    await visualizationService.initialize();
    
    // Set up view toggle
    setupViewToggle();
    
    // Load initial knowledge data  
    await debouncedLoadKnowledgeData();
    
    // Set up event listeners
    setupKnowledgePanelEventListeners();
    
    knowledgeInitialized = true;
    logger.info('Knowledge panel initialized successfully');
  } catch (error) {
    logger.error('Error initializing knowledge panel:', error);
    notificationService.show('Failed to initialize knowledge panel', 'error');
    
    const knowledgeContent = document.querySelector('.knowledge-content');
    if (knowledgeContent) {
      knowledgeContent.innerHTML = 
        `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
    }
  }
}

/**
 * Set up view toggle between list and graph
 */
function setupViewToggle() {
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
      if (view !== currentView) {
        switchView(view);
      }
    });
  });
}

/**
 * Switch between list and graph views
 * @param {string} view - 'list' or 'graph'
 */
async function switchView(view) {
  if (view !== 'list' && view !== 'graph') {
    logger.warn(`Invalid view type: ${view}`);
    return;
  }
  
  currentView = view;
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
      await renderKnowledgeGraph();
    }
  }
}

/**
 * Load knowledge data from API or local storage
 * @returns {Promise<void>}
 */
async function loadKnowledgeData() {
  logger.info('Loading knowledge data');
  
  try {
    // Load pages data
    const pagesResponse = await fetchAPI('/api/v1/pages/');
    
    if (pagesResponse.success) {
      currentData.pages = pagesResponse.data.pages || [];
      logger.info(`Successfully loaded ${currentData.pages.length} pages`);
      
      // Try to load graph data
      const graphResponse = await fetchAPI('/api/v1/graph/overview');
      
      if (graphResponse.success) {
        currentData.graphData = {
          nodes: graphResponse.data.nodes || [],
          edges: graphResponse.data.edges || []
        };
        logger.info(`Successfully loaded graph with ${currentData.graphData.nodes.length} nodes`);
      } else if (graphResponse.error?.error_code === 'NOT_FOUND') {
        // Create graph from pages data
        currentData.graphData = createGraphFromPages(currentData.pages);
        logger.info('Created graph from pages data');
      } else {
        throw new Error(graphResponse.error?.message || 'Failed to load graph data');
      }
      
      // Update current view
      if (currentView === 'list') {
        displayKnowledgeItems(currentData.pages);
      } else {
        await renderKnowledgeGraph();
      }
      
    } else {
      throw new Error(pagesResponse.error?.message || 'Failed to load pages');
    }
  } catch (error) {
    logger.error('Error loading knowledge data:', error);
    
    // Show error and try fallback
    await handleLoadError(error);
  }
}

/**
 * Handle loading errors with fallback mechanisms
 * @param {Error} error - Error that occurred
 */
async function handleLoadError(error) {
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
      currentData.pages = captureHistory.map(item => ({
        id: item.url,
        url: item.url,
        title: item.title,
        domain: getDomainFromUrl(item.url),
        discovered_at: item.timestamp,
        browser_contexts: ["ACTIVE_TAB"],
        keywords: {},
        relationships: []
      }));
      
      // Try to use cached graph data or create from pages
      if (graphCache && graphCache.nodes && graphCache.edges) {
        currentData.graphData = {
          nodes: graphCache.nodes,
          edges: graphCache.edges
        };
      } else {
        currentData.graphData = createGraphFromPages(currentData.pages);
      }
      
      if (knowledgeList) {
        knowledgeList.innerHTML = `
          <div class="error-note">
            Could not load data from API server. Showing locally cached data.
          </div>
        `;
        displayKnowledgeItems(currentData.pages);
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
        retryButton.addEventListener('click', () => loadKnowledgeData());
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
    
    showNotification(`Error loading knowledge data: ${error.message}`, 'error');
  }
}

/**
 * Render knowledge graph using visualization service
 * @returns {Promise<void>}
 */
async function renderKnowledgeGraph() {
  logger.info('Rendering knowledge graph');
  
  const graphContainer = document.querySelector('.graph-container');
  if (!graphContainer) {
    logger.error('Graph container not found');
    return;
  }
  
  try {
    // Show loading state
    graphContainer.innerHTML = '<div class="loading-indicator">Loading graph visualization...</div>';
    
    // Use visualization service to create graph
    const success = visualizationService.createKnowledgeGraph(
      graphContainer.id || 'graph-container',
      currentData.graphData.nodes,
      currentData.graphData.edges,
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
      addGraphControls(graphContainer);
    }
    
    logger.info('Graph visualization rendered successfully');
  } catch (error) {
    logger.error('Error rendering graph:', error);
    
    graphContainer.innerHTML = `
      <div class="error-state">
        Error rendering graph: ${error.message}
        <br><br>
        <button class="btn-secondary retry-graph-btn">Retry</button>
      </div>
    `;
    
    const retryButton = graphContainer.querySelector('.retry-graph-btn');
    if (retryButton) {
      retryButton.addEventListener('click', () => renderKnowledgeGraph());
    }
    
    showNotification('Failed to render knowledge graph', 'error');
  }
}

/**
 * Add graph control buttons
 * @param {HTMLElement} graphContainer - Graph container element
 */
function addGraphControls(graphContainer) {
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
  refreshBtn.addEventListener('click', () => renderKnowledgeGraph());
  
  // Fit to view button
  const fitBtn = document.createElement('button');
  fitBtn.className = 'btn-icon';
  fitBtn.innerHTML = '⬚';
  fitBtn.title = 'Fit to View';
  
  controls.appendChild(refreshBtn);
  controls.appendChild(fitBtn);
  graphContainer.appendChild(controls);
}

/**
 * Create graph data from pages data
 * @param {Array} pages - Page data
 * @returns {Object} Graph data with nodes and edges
 */
function createGraphFromPages(pages) {
  const nodes = pages.map(page => ({
    id: page.id,
    label: page.title || 'Untitled',
    url: page.url,
    type: 'page',
    domain: page.domain || getDomainFromUrl(page.url)
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
  
  return { nodes, edges };
}

/**
 * Safely extracts domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name or 'unknown'
 */
function getDomainFromUrl(url) {
  if (!url) return 'unknown';
  
  try {
    return new URL(url).hostname;
  } catch (e) {
    logger.warn(`Invalid URL: ${url}`, e);
    return 'unknown';
  }
}

/**
 * Display knowledge items in the list view
 * @param {Array} items - Knowledge items to display
 */
function displayKnowledgeItems(items) {
  logger.debug(`Displaying ${items?.length || 0} knowledge items`);
  
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
      const knowledgeItem = createKnowledgeItemElement(item);
      listContainer.appendChild(knowledgeItem);
    } catch (error) {
      logger.error(`Error creating knowledge item element for ${item.id}:`, error);
    }
  });
  
  knowledgeList.appendChild(listContainer);
}

/**
 * Create a knowledge item element
 * @param {Object} item - Knowledge item data
 * @returns {HTMLElement} Knowledge item element
 */
function createKnowledgeItemElement(item) {
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
    logger.warn(`Error parsing URL for favicon: ${item.url}`, e);
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
    logger.warn(`Error formatting date: ${item.discovered_at}`, e);
  }
  
  // Create HTML content
  knowledgeItem.innerHTML = `
    <div class="item-icon">
      <img src="${favicon}" alt="" class="favicon" onerror="this.src='../icons/icon16.png';">
    </div>
    <div class="item-content">
      <div class="item-title">${item.title || 'Untitled'}</div>
      <div class="item-url">${truncateText(item.url || '', 50)}</div>
      <div class="item-meta">
        <span class="item-date">Captured: ${dateStr}</span>
        <span class="item-source">${formatContext(item.browser_contexts || [])}</span>
      </div>
      ${item.keywords && Object.keys(item.keywords).length > 0 
        ? `<div class="item-keywords">
            ${Object.entries(item.keywords).slice(0, 5).map(([keyword, score]) => 
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
      showKnowledgeDetails(item);
    });
  }
  
  return knowledgeItem;
}

/**
 * Set up event listeners for knowledge panel
 */
function setupKnowledgePanelEventListeners() {
  logger.debug('Setting up knowledge panel event listeners');
  
  try {
    // Knowledge panel search
    const searchInput = document.getElementById('knowledge-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          debouncedSearchKnowledge(e.target.value);
        }
      });
    }
    
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const searchTerm = document.getElementById('knowledge-search')?.value || '';
        debouncedSearchKnowledge(searchTerm);
      });
    }
    
    // Set up filter handlers
    setupKnowledgeFilters();
    
    // Set up sidebar close button
    const closeDetailsBtn = document.querySelector('.close-details-btn');
    if (closeDetailsBtn) {
      closeDetailsBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('details-sidebar');
        if (sidebar) {
          sidebar.classList.remove('active');
        }
      });
    }
    
    logger.info('Knowledge panel event listeners set up successfully');
  } catch (error) {
    logger.error('Error setting up knowledge panel event listeners:', error);
  }
}

/**
 * Set up knowledge filters
 */
function setupKnowledgeFilters() {
  logger.debug('Setting up knowledge filters');
  
  try {
    // Set up source filter checkboxes
    const filterCheckboxes = document.querySelectorAll('.knowledge-filters input[type="checkbox"]');
    filterCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        applyKnowledgeFilters();
      });
    });
    
    // Set up date filters
    const dateFromInput = document.getElementById('date-from');
    if (dateFromInput) {
      dateFromInput.addEventListener('change', applyKnowledgeFilters);
    }
    
    const dateToInput = document.getElementById('date-to');
    if (dateToInput) {
      dateToInput.addEventListener('change', applyKnowledgeFilters);
    }
    
    logger.info('Knowledge filters set up successfully');
  } catch (error) {
    logger.error('Error setting up knowledge filters:', error);
  }
}

/**
 * Apply knowledge filters
 */
function applyKnowledgeFilters() {
  logger.info('Applying knowledge filters');
  
  try {
    // Get filter values
    const sourceFilters = [];
    document.querySelectorAll('.knowledge-filters input[type="checkbox"]:checked').forEach(checkbox => {
      sourceFilters.push(checkbox.value);
    });
    
    const dateFrom = document.getElementById('date-from')?.value;
    const dateTo = document.getElementById('date-to')?.value;
    
    // Apply filters to current data
    let filteredPages = [...currentData.pages];
    
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
    if (currentView === 'list') {
      const knowledgeList = document.querySelector('.knowledge-list');
      if (knowledgeList) {
        knowledgeList.innerHTML = ''; // Clear existing content
        displayKnowledgeItems(filteredPages);
      }
    } else {
      // Update graph with filtered data
      currentData.graphData = createGraphFromPages(filteredPages);
      renderKnowledgeGraph();
    }
    
    logger.debug(`Filters applied - showing ${filteredPages.length} of ${currentData.pages.length} items`);
  } catch (error) {
    logger.error('Error applying knowledge filters:', error);
    showNotification('Error applying filters', 'error');
  }
}

/**
 * Search knowledge graph
 * @param {string} searchTerm - Term to search for
 * @returns {Promise<void>}
 */
async function searchKnowledge(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) {
    logger.debug('Empty search term, reloading all data');
    loadKnowledgeData();
    return;
  }
  
  logger.info(`Searching knowledge for: "${searchTerm}"`);
  
  try {
    // Search through current data
    const searchResults = currentData.pages.filter(page => 
      page.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      page.url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.keys(page.keywords || {}).some(k => 
        k.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    
    logger.info(`Search returned ${searchResults.length} results`);
    
    // Update display
    if (currentView === 'list') {
      const knowledgeList = document.querySelector('.knowledge-list');
      if (knowledgeList) {
        knowledgeList.innerHTML = ''; // Clear existing content
        displayKnowledgeItems(searchResults);
      }
    } else {
      // Update graph with search results
      currentData.graphData = createGraphFromPages(searchResults);
      renderKnowledgeGraph();
    }
    
    // Show notification if no results were found
    if (searchResults.length === 0) {
      showNotification(`No results found for "${searchTerm}"`, 'info');
    }
  } catch (error) {
    logger.error('Search error:', error);
    showNotification(`Search error: ${error.message}`, 'error');
  }
}

/**
 * Show details for a knowledge item
 * @param {Object} item - Knowledge item to show details for
 */
function showKnowledgeDetails(item) {
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
      logger.warn(`Error formatting date: ${item.discovered_at}`, e);
    }
    
    // Create HTML content for details
    detailsContent.innerHTML = createDetailsHTML(item, dateStr);
    
    // Add event listeners
    setupDetailActionHandlers(detailsContent, item);
    
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
    showNotification('Error showing item details', 'error');
  }
}

/**
 * Create HTML for the details view
 * @param {Object} item - Knowledge item
 * @param {string} dateStr - Formatted date string
 * @returns {string} HTML content
 */
function createDetailsHTML(item, dateStr) {
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
          <dd>${formatContext(item.browser_contexts || [])}</dd>
          
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
}

/**
 * Set up event handlers for the detail view actions
 * @param {HTMLElement} detailsContent - Details content element
 * @param {Object} item - Knowledge item
 */
function setupDetailActionHandlers(detailsContent, item) {
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
          showNotification('No URL available for this item', 'warning');
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
        recapturePage(item, recaptureBtn);
      });
    }
    
    // Analyze button
    const analyzeBtn = detailsContent.querySelector('#analyze-page');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        analyzePage(item, analyzeBtn);
      });
    }
    
    // Set up relationship item clicks to load related items
    const relationshipLinks = detailsContent.querySelectorAll('.relationship-target');
    relationshipLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-id');
        if (targetId) {
          loadRelatedItem(targetId);
        }
      });
    });
    
    logger.debug('Detail action handlers set up successfully');
  } catch (error) {
    logger.error('Error setting up detail action handlers:', error);
  }
}

/**
 * Recapture a page
 * @param {Object} item - Knowledge item to recapture
 * @param {HTMLElement} button - Button element for UI updates
 * @returns {Promise<void>}
 */
async function recapturePage(item, button) {
  if (!item || !item.url) {
    logger.warn('Attempted to recapture item with no URL');
    showNotification('Cannot recapture: No URL available', 'warning');
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
    
    const response = await fetchAPI('/api/v1/pages/', {
      method: 'POST',
      body: JSON.stringify(pageData)
    });

    if (response.success) {
      button.textContent = 'Recaptured!';
      showNotification('Page recaptured successfully', 'success');
      
      // Reload knowledge data to show updated information
      setTimeout(() => {
        loadKnowledgeData();
        button.disabled = false;
        button.textContent = 'Recapture';
      }, 2000);
    } else {
      throw new Error(response.error?.message || 'Unknown error');
    }
  } catch (error) {
    logger.error('Recapture error:', error);
    button.textContent = 'Recapture Failed';
    showNotification('Error recapturing page: ' + error.message, 'error');
    
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Recapture';
    }, 2000);
  }
}

/**
 * Analyze a page
 * @param {Object} item - Knowledge item to analyze
 * @param {HTMLElement} button - Button element for UI updates
 * @returns {Promise<void>}
 */
async function analyzePage(item, button) {
  if (!item || !item.url) {
    logger.warn('Attempted to analyze item with no URL');
    showNotification('Cannot analyze: No URL available', 'warning');
    return;
  }
  
  logger.info(`Analyzing page: ${item.url}`);
  
  button.disabled = true;
  button.textContent = 'Analyzing...';
  
  try {
    // Request analysis
    const response = await fetchAPI('/api/v1/analysis/analyze', {
      method: 'POST',
      body: JSON.stringify({
        url: item.url,
        force: true
      })
    });

    if (response.success) {
      button.textContent = 'Analysis Started!';
      showNotification('Analysis started successfully', 'success');
      
      // Check analysis status periodically
      const taskId = response.data.task_id;
      if (taskId) {
        checkAnalysisStatus(taskId, button);
      } else {
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
    showNotification('Error starting analysis: ' + error.message, 'error');
    
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Analyze';
    }, 2000);
  }
}

/**
 * Load related item details
 * @param {string} itemId - ID of related item to load
 * @returns {Promise<void>}
 */
async function loadRelatedItem(itemId) {
  if (!itemId) {
    logger.warn('Attempted to load related item with no ID');
    return;
  }
  
  logger.info(`Loading related item: ${itemId}`);
  showNotification('Loading related item...', 'info');
  
  try {
    // Request item details
    const response = await fetchAPI(`/api/v1/pages/${itemId}`);
    
    if (response.success) {
      logger.debug('Related item loaded successfully');
      showKnowledgeDetails(response.data);
    } else {
      throw new Error(response.error?.message || 'Failed to load related item');
    }
  } catch (error) {
    logger.error('Error loading related item:', error);
    showNotification(`Error loading related item: ${error.message}`, 'error');
  }
}

/**
 * Check the status of an analysis task
 * @param {string} taskId - ID of task to check
 * @param {HTMLElement} button - Button element for UI updates
 * @returns {Promise<void>}
 */
async function checkAnalysisStatus(taskId, button) {
  if (!taskId) {
    logger.warn('Attempted to check status with no task ID');
    return;
  }
  
  logger.debug(`Checking analysis status for task: ${taskId}`);
  
  try {
    const response = await fetchAPI(`/api/v1/analysis/status/${taskId}`);
    
    if (response.success) {
      const status = response.data.status;
      logger.debug(`Task ${taskId} status: ${status}`);
      
      if (status === 'completed') {
        button.textContent = 'Analysis Complete!';
        showNotification('Analysis completed successfully', 'success');
        
        // Reload knowledge data to show updated information
        setTimeout(() => {
          loadKnowledgeData();
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      } else if (status === 'error') {
        button.textContent = 'Analysis Failed';
        showNotification('Analysis failed', 'error');
        
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      } else if (status === 'processing' || status === 'pending') {
        // Still processing, check again after a delay
        button.textContent = `Analyzing (${status})...`;
        setTimeout(() => checkAnalysisStatus(taskId, button), 2000);
      } else {
        logger.warn(`Unknown task status: ${status}`);
        button.textContent = 'Unknown Status';
        
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      }
    } else {
      throw new Error(response.error?.message || 'Failed to check status');
    }
  } catch (error) {
    logger.error('Error checking analysis status:', error);
    button.textContent = 'Status Check Failed';
    
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Analyze';
    }, 2000);
  }
}

/**
 * Refresh knowledge data and graph
 * @returns {Promise<void>}
 */
async function refreshKnowledgePanel() {
  logger.info('Refreshing knowledge panel');
  
  try {
    showNotification('Refreshing knowledge data...', 'info');
    
    // Reload knowledge data
    await loadKnowledgeData();
    
    showNotification('Knowledge data refreshed', 'success');
  } catch (error) {
    logger.error('Error refreshing knowledge panel:', error);
    showNotification(`Error refreshing knowledge data: ${error.message}`, 'error');
  }
}

/**
 * Get the count of knowledge items
 * @returns {Promise<number>} Count of knowledge items
 */
async function getKnowledgeItemCount() {
  try {
    const response = await fetchAPI('/api/v1/pages/count');
    
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
}

/**
 * Export knowledge data
 * @returns {Promise<Object>} Exported knowledge data
 */
async function exportKnowledgeData() {
  logger.info('Exporting knowledge data');
  
  try {
    showNotification('Preparing knowledge export...', 'info');
    
    const response = await fetchAPI('/api/v1/export/knowledge');
    
    if (response.success) {
      logger.info('Knowledge data exported successfully');
      showNotification('Knowledge data exported successfully', 'success');
      return response.data;
    } else {
      throw new Error(response.error?.message || 'Export failed');
    }
  } catch (error) {
    logger.error('Error exporting knowledge data:', error);
    showNotification(`Error exporting knowledge data: ${error.message}`, 'error');
    return null;
  }
}

// Register the component with fallback mechanism
try {
  // First, try to use the global registerComponent function
  if (typeof self.registerComponent === 'function') {
    logger.log('debug', 'Registering knowledge panel component using global registerComponent');
    self.registerComponent('knowledge-panel', KnowledgePanel);
  } else {
    // If registerComponent isn't available, register directly in global registry
    logger.log('debug', 'Global registerComponent not found, using direct registry access');
    self.MarvinComponents = self.MarvinComponents || {};
    self.MarvinComponents['knowledge-panel'] = KnowledgePanel;
  }
  
  logger.log('info', 'knowledge panel component registered successfully');
} catch (error) {
  logger.log('error', 'Error registering knowledge panel component:', error);
  // Try window as fallback if self fails
  try {
    window.MarvinComponents = window.MarvinComponents || {};
    window.MarvinComponents['knowledge-panel'] = KnowledgePanel;
    logger.log('debug', 'knowledge panel component registered using window fallback');
  } catch (windowError) {
    logger.log('error', 'Failed to register knowledge panel component:', windowError);
  }
}

export { KnowledgePanel };