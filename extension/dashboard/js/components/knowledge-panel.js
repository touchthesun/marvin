// components/knowledge-panel.js
import { fetchAPI } from '../services/api-service.js';
import { truncateText } from '../components/capture-ui.js';
import { formatContext } from '../utils/formatting.js';
import { showNotification } from '../services/notification-service.js';
import { initSplitView } from '../utils/ui-utils.js';
import { LogManager } from '../../../shared/utils/log-manager.js';

/**
 * Logger for knowledge panel operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'knowledge-panel',
  storageKey: 'marvin_knowledge_logs',
  maxEntries: 1000
});

// Panel initialization flags
let knowledgeInitialized = false;
let graphInitialized = false;

// Define the KnowledgePanelComponent object
const KnowledgePanelComponent = {
  // Main initialization function
  initKnowledgePanel() {
    return initKnowledgePanel();
  },
  
  // Public methods that should be exposed
  initKnowledgeGraph,
  refreshKnowledgePanel,
  loadRelatedItem,
  getKnowledgeItemCount,
  exportKnowledgeData
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
const debouncedLoadGraphData = debounce(loadGraphData, 500);

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
    // Initialize the split view
    initSplitView();
    
    // Mark as initialized early to prevent duplicate initialization
    knowledgeInitialized = true;
    
    // Load initial knowledge data
    await debouncedLoadKnowledgeData();
    
    // Set up event listeners
    setupKnowledgePanelEventListeners();
    
    logger.info('Knowledge panel initialized successfully');
  } catch (error) {
    logger.error('Error initializing knowledge panel:', error);
    showNotification('Failed to initialize knowledge panel', 'error');
    
    // Show error in the knowledge list
    const knowledgeList = document.querySelector('.knowledge-list');
    if (knowledgeList) {
      knowledgeList.innerHTML = 
        `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
    }
  }
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
      logger.debug('Close details button listener attached');
    }
    
    logger.info('Knowledge panel event listeners set up successfully');
  } catch (error) {
    logger.error('Error setting up knowledge panel event listeners:', error);
  }
}

/**
 * Initialize knowledge graph visualization
 * @returns {Promise<void>}
 */
async function initKnowledgeGraph() {
  if (graphInitialized) {
    logger.debug('Knowledge graph already initialized, skipping');
    return;
  }

  logger.info('Initializing knowledge graph');
  
  try {
    // Mark as initialized early to prevent duplicate initialization
    graphInitialized = true;

    const graphContainer = document.querySelector('.graph-container');
    if (!graphContainer) {
      throw new Error('Graph container element not found');
    }
    
    // Load graph data
    await debouncedLoadGraphData();
    
    logger.info('Knowledge graph initialized successfully');
  } catch (error) {
    logger.error('Error initializing knowledge graph:', error);
    
    const graphContainer = document.querySelector('.graph-container');
    if (graphContainer) {
      graphContainer.innerHTML = `<div class="error-state">Error loading graph: ${error.message}</div>`;
    }
    
    showNotification('Failed to initialize knowledge graph', 'error');
  }
}

/**
 * Load knowledge data from API or local storage
 * @returns {Promise<void>}
 */
async function loadKnowledgeData() {
  logger.info('Loading knowledge data');
  
  const knowledgeList = document.querySelector('.knowledge-list');
  if (!knowledgeList) {
    logger.error('Knowledge list container not found');
    return;
  }
  
  knowledgeList.innerHTML = '<div class="loading-indicator">Loading knowledge items...</div>';
  
  try {
    // First try to get data from the API
    logger.debug('Fetching knowledge data from API');
    const response = await fetchAPI('/api/v1/pages/');
    
    if (response.success) {
      logger.info(`Successfully loaded ${response.data.pages?.length || 0} pages from API`);
      displayKnowledgeItems(response.data.pages || []);
    } else {
      // If API fails, show fallback message and use captured history instead
      logger.error('API error:', response.error);
      await loadFallbackKnowledgeData(knowledgeList);
    }
  } catch (error) {
    logger.error('Error loading knowledge data:', error);
    
    // Show fallback UI and error message
    knowledgeList.innerHTML = `
      <div class="error-state">
        Error loading knowledge data:
        <br>
        ${error.message}
        <br><br>
        <button id="retry-load-btn" class="btn-secondary">Retry</button>
      </div>
    `;
    
    // Add retry button functionality
    const retryButton = document.getElementById('retry-load-btn');
    if (retryButton) {
      retryButton.addEventListener('click', () => {
        loadKnowledgeData();
      });
    }
    
    showNotification(`Error loading knowledge data: ${error.message}`, 'error');
  }
}

/**
 * Load fallback knowledge data from local storage
 * @param {HTMLElement} knowledgeList - Knowledge list container element
 * @returns {Promise<void>}
 */
async function loadFallbackKnowledgeData(knowledgeList) {
  logger.info('Attempting to load fallback knowledge data from local storage');
  
  try {
    // Load capture history from storage as fallback
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    if (captureHistory.length > 0) {
      logger.info(`Found ${captureHistory.length} items in local capture history`);
      
      knowledgeList.innerHTML = `
        <div class="error-note">
          Could not load data from API server.
          Showing locally captured pages instead.
        </div>
      `;
      
      // Convert capture history to a format similar to API response
      const fallbackItems = captureHistory.map(item => ({
        id: item.url, // Use URL as ID
        url: item.url,
        title: item.title,
        domain: new URL(item.url).hostname,
        discovered_at: item.timestamp,
        browser_contexts: ["ACTIVE_TAB"],
        keywords: {},
        relationships: []
      }));
      
      displayKnowledgeItems(fallbackItems);
    } else {
      logger.warn('No fallback data found in local storage');
      
      knowledgeList.innerHTML = `
        <div class="error-state">
          Could not load knowledge data from API.
          <br>
          No local data available.
        </div>
      `;
    }
  } catch (fallbackError) {
    logger.error('Error loading fallback data:', fallbackError);
    
    knowledgeList.innerHTML = `
      <div class="error-state">
        Could not load knowledge data from API or local storage.
        <br>
        Error: ${fallbackError.message}
      </div>
    `;
  }
}

/**
 * Display knowledge items in the panel
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
    knowledgeList.innerHTML = '<div class="empty-state">No knowledge items found</div>';
    return;
  }
  
  knowledgeList.innerHTML = '';
  
  items.forEach(item => {
    try {
      const knowledgeItem = createKnowledgeItemElement(item);
      knowledgeList.appendChild(knowledgeItem);
    } catch (error) {
      logger.error(`Error creating knowledge item element for ${item.id}:`, error);
    }
  });
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
    // Use default if URL parsing fails
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
 * Set up knowledge filters
 */
function setupKnowledgeFilters() {
  logger.debug('Setting up knowledge filters');
  
  try {
    // Set up source filter checkboxes
    const filterCheckboxes = document.querySelectorAll('.knowledge-filters input[type="checkbox"]');
    
    if (filterCheckboxes.length > 0) {
      filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          applyKnowledgeFilters();
        });
      });
      logger.debug(`Set up ${filterCheckboxes.length} filter checkboxes`);
    } else {
      logger.warn('No filter checkboxes found');
    }
    
    // Set up date filters
    const dateFromInput = document.getElementById('date-from');
    if (dateFromInput) {
      dateFromInput.addEventListener('change', applyKnowledgeFilters);
      logger.debug('Date from filter set up');
    }
    
    const dateToInput = document.getElementById('date-to');
    if (dateToInput) {
      dateToInput.addEventListener('change', applyKnowledgeFilters);
      logger.debug('Date to filter set up');
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
    
    logger.debug(`Filters - Sources: ${sourceFilters.join(', ')}, Date range: ${dateFrom || 'any'} to ${dateTo || 'any'}`);
    
    // For now, just reload all data
    // In the future, this should filter the existing data or make a filtered API request
    loadKnowledgeData();
    
    logger.debug('Filters applied, reloading data');
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
    logger.debug('Empty search term, loading all knowledge data');
    loadKnowledgeData();
    return;
  }
  
  logger.info(`Searching knowledge for: "${searchTerm}"`);
  
  const knowledgeList = document.querySelector('.knowledge-list');
  if (!knowledgeList) {
    logger.error('Knowledge list container not found');
    return;
  }
  
  knowledgeList.innerHTML = '<div class="loading-indicator">Searching...</div>';
  
  try {
    // First try the search endpoint
    logger.debug('Attempting to use search endpoint');
    let response;
    
    try {
      response = await fetchAPI(`/api/v1/pages/?query=${encodeURIComponent(searchTerm)}`);
      logger.debug('Search endpoint response received');
    } catch (searchError) {
      // If the first attempt fails, try a fallback approach
      logger.warn('Search endpoint error, falling back to all pages:', searchError);
      
      response = await fetchAPI('/api/v1/pages/');
      
      if (response.success && response.data && response.data.pages) {
        // Filter pages by the search term
        const allPages = response.data.pages;
        logger.debug(`Filtering ${allPages.length} pages client-side`);
        
        const filteredPages = allPages.filter(page => 
          page.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          page.url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          Object.keys(page.keywords || {}).some(k => 
            k.toLowerCase().includes(searchTerm.toLowerCase())
          )
        );
        
        logger.debug(`Found ${filteredPages.length} matching pages`);
        
        // Create a modified response with filtered pages
        response = {
          success: true,
          data: {
            ...response.data,
            pages: filteredPages
          }
        };
      }
    }

    if (response.success) {
      const pages = response.data.pages || [];
      logger.info(`Search returned ${pages.length} results`);
      
      displayKnowledgeItems(pages);
      
      // Show a notification if no results were found
      if (pages.length === 0) {
        showNotification(`No results found for "${searchTerm}"`, 'info');
      }
    } else {
      throw new Error(response.error?.message || 'Search failed');
    }
  } catch (error) {
    logger.error('Search error:', error);
    knowledgeList.innerHTML = `<div class="error-state">Search error: ${error.message}</div>`;
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
        } else {
          logger.warn('Relationship link clicked with no target ID');
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
  
  if (!button) {
    logger.warn('Button element not provided for recapturePage');
    button = document.createElement('button'); // Dummy button to prevent errors
  }
  
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
    
    const response = await fetchAPI('/api/v1/pages/', {
      method: 'POST',
      body: JSON.stringify(pageData)
    });

    if (response.success) {
      button.textContent = 'Recaptured!';
      showNotification('Page recaptured successfully', 'success');
      logger.info('Page recaptured successfully');
      
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
  
  if (!button) {
    logger.warn('Button element not provided for analyzePage');
    button = document.createElement('button'); // Dummy button to prevent errors
  }
  
  button.disabled = true;
  button.textContent = 'Analyzing...';
  
  try {
    // Request analysis
    logger.debug('Sending analysis request');
    
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
      logger.info('Analysis started successfully');
      
      // Check analysis status periodically
      const taskId = response.data.task_id;
      if (taskId) {
        logger.debug(`Monitoring analysis task: ${taskId}`);
        checkAnalysisStatus(taskId, button);
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
    
    // Show alert as fallback
    try {
      alert(`Error loading related item: ${error.message}`);
    } catch (alertError) {
      logger.error('Error showing alert:', alertError);
    }
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
    
    // Reload graph data if initialized
    if (graphInitialized) {
      await loadGraphData();
    }
    
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
    self.registerComponent('knowledge-panel', KnowledgePanelComponent);
  } else {
    // If registerComponent isn't available, register directly in global registry
    logger.log('debug', 'Global registerComponent not found, using direct registry access');
    self.MarvinComponents = self.MarvinComponents || {};
    self.MarvinComponents['knowledge-panel'] = KnowledgePanelComponent;
  }
  
  logger.log('info', 'knowledge panel component registered successfully');
} catch (error) {
  logger.log('error', 'Error registering knowledge panel component:', error);
  // Try window as fallback if self fails
  try {
    window.MarvinComponents = window.MarvinComponents || {};
    window.MarvinComponents['knowledge-panel'] = KnowledgePanelComponent;
    logger.log('debug', 'knowledge panel component registered using window fallback');
  } catch (windowError) {
    logger.log('error', 'Failed to register knowledge panel component:', windowError);
  }
}

// Export functions needed by other modules
export default KnowledgePanelComponent;
export { 
  initKnowledgePanel,
  initKnowledgeGraph,
  refreshKnowledgePanel,
  loadRelatedItem,
  getKnowledgeItemCount,
  exportKnowledgeData
};
