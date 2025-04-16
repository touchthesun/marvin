// components/overview-panel.js
import { fetchAPI, sendMessageToBackground } from '../services/api-service.js';
import { LogManager } from '../../shared/utils/log-manager.js';
import { truncateText } from '../utils/ui-utils.js';
import { showNotification } from '../services/notification-service.js';
import * as d3 from 'd3';

/**
 * Logger for overview panel operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'overview-panel',
  storageKey: 'marvin_overview_logs',
  maxEntries: 1000
});

// Panel initialization flag
let overviewInitialized = false;

/**
 * Initialize the overview panel
 * @returns {Promise<void>}
 */
export async function initOverviewPanel() {
  if (overviewInitialized) {
    logger.debug('Overview panel already initialized, skipping');
    return;
  }
  
  logger.info('Initializing overview panel');
  
  try {
    // Mark as initialized early to prevent duplicate initialization
    overviewInitialized = true;
    
    // Load stats data
    await loadOverviewStats();
    
    // Set up refresh button
    setupRefreshButton();
    
    // Load recent captures list
    await loadRecentCaptures();
    
    // Load active tasks summary
    await loadActiveTasks();
    
    // Load mini graph visualization
    await loadMiniGraph();
    
    logger.info('Overview panel initialized successfully');
  } catch (error) {
    logger.error('Error initializing overview panel:', error);
    showNotification('Failed to initialize overview panel', 'error');
    
    // Show error in the overview container
    const overviewContainer = document.querySelector('#overview-panel');
    if (overviewContainer) {
      overviewContainer.innerHTML += `
        <div class="error-state">
          Error initializing overview panel: ${error.message}
          <br><br>
          <button id="retry-overview-btn" class="btn-secondary">Retry</button>
        </div>
      `;
      
      // Add retry button functionality
      document.getElementById('retry-overview-btn')?.addEventListener('click', () => {
        // Reset initialization flag to allow retry
        overviewInitialized = false;
        initOverviewPanel();
      });
    }
  }
}

/**
 * Set up refresh button event listener
 */
function setupRefreshButton() {
  logger.debug('Setting up refresh button');
  
  try {
    const refreshBtn = document.querySelector('#overview-panel .refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        logger.debug('Refresh button clicked');
        refreshOverviewPanel();
      });
      logger.debug('Refresh button listener attached');
    } else {
      logger.warn('Refresh button not found');
    }
  } catch (error) {
    logger.error('Error setting up refresh button:', error);
  }
}

/**
 * Refresh all overview panel data
 * @returns {Promise<void>}
 */
export async function refreshOverviewPanel() {
  logger.info('Refreshing overview panel');
  
  try {
    showNotification('Refreshing overview data...', 'info');
    
    // Reload all data components
    await Promise.all([
      loadOverviewStats(),
      loadRecentCaptures(),
      loadActiveTasks(),
      loadMiniGraph()
    ]);
    
    showNotification('Overview data refreshed', 'success');
    logger.info('Overview panel refreshed successfully');
  } catch (error) {
    logger.error('Error refreshing overview panel:', error);
    showNotification(`Error refreshing overview data: ${error.message}`, 'error');
  }
}

/**
 * Load overview statistics
 * @returns {Promise<void>}
 */
async function loadOverviewStats() {
  logger.debug('Loading overview stats');
  
  try {
    // Get stats elements
    const capturedCountEl = document.getElementById('captured-count');
    const relationshipCountEl = document.getElementById('relationship-count');
    const queryCountEl = document.getElementById('query-count');
    
    if (!capturedCountEl || !relationshipCountEl || !queryCountEl) {
      logger.error('Stats elements not found');
      return;
    }
    
    // Show loading state
    capturedCountEl.textContent = '...';
    relationshipCountEl.textContent = '...';
    queryCountEl.textContent = '...';
    
    // Try to get stats from API
    try {
      logger.debug('Fetching stats from API');
      const response = await fetchAPI('/api/v1/stats');
      
      if (response.success) {
        const stats = response.data || response.result || {};
        capturedCountEl.textContent = stats.captures || 0;
        relationshipCountEl.textContent = stats.relationship_count || 0;
        queryCountEl.textContent = stats.query_count || 0;
        
        logger.debug('Stats loaded from API:', stats);
        
        // Save to storage for offline use
        await chrome.storage.local.set({ 
          stats: {
            captures: stats.captures || 0,
            relationships: stats.relationship_count || 0,
            queries: stats.query_count || 0
          }
        });
      } else {
        throw new Error(response.error || 'Failed to load stats');
      }
    } catch (apiError) {
      logger.warn('Error loading stats from API:', apiError);
      
      // Fallback to local storage
      await loadStatsFromLocalStorage(capturedCountEl, relationshipCountEl, queryCountEl);
    }
  } catch (error) {
    logger.error('Error in loadOverviewStats:', error);
    
    // Try to show something rather than failing completely
    try {
      document.getElementById('captured-count').textContent = '?';
      document.getElementById('relationship-count').textContent = '?';
      document.getElementById('query-count').textContent = '?';
    } catch (e) {
      // Ignore if elements not found
    }
  }
}

/**
 * Load stats from local storage as fallback
 * @param {HTMLElement} capturedCountEl - Captured count element
 * @param {HTMLElement} relationshipCountEl - Relationship count element
 * @param {HTMLElement} queryCountEl - Query count element
 * @returns {Promise<void>}
 */
async function loadStatsFromLocalStorage(capturedCountEl, relationshipCountEl, queryCountEl) {
  logger.debug('Loading stats from local storage');
  
  try {
    const data = await chrome.storage.local.get(['captureHistory', 'stats']);
    const captureHistory = data.captureHistory || [];
    const stats = data.stats || {};
    
    capturedCountEl.textContent = captureHistory.length;
    relationshipCountEl.textContent = stats.relationships || 0;
    queryCountEl.textContent = stats.queries || 0;
    
    logger.debug('Stats loaded from local storage');
  } catch (error) {
    logger.error('Error loading stats from local storage:', error);
    throw error;
  }
}

/**
 * Load recent captures
 * @returns {Promise<void>}
 */
async function loadRecentCaptures() {
  logger.debug('Loading recent captures');
  
  try {
    const recentCapturesList = document.getElementById('recent-captures-list');
    if (!recentCapturesList) {
      logger.error('Recent captures list element not found');
      return;
    }
    
    // Show loading state
    recentCapturesList.innerHTML = '<li class="loading">Loading recent captures...</li>';
    
    // Get capture history from storage
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    if (captureHistory.length === 0) {
      recentCapturesList.innerHTML = '<li class="empty-state">No recent captures</li>';
      logger.debug('No recent captures found');
      return;
    }
    
    // Display recent captures (up to 5)
    recentCapturesList.innerHTML = '';
    
    // Sort by timestamp (most recent first)
    const sortedCaptures = [...captureHistory].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    const recentCaptures = sortedCaptures.slice(0, 5);
    
    recentCaptures.forEach(item => {
      try {
        const li = createCaptureListItem(item);
        recentCapturesList.appendChild(li);
      } catch (itemError) {
        logger.warn(`Error creating capture list item for ${item.url}:`, itemError);
      }
    });
    
    logger.debug(`Recent captures loaded: ${recentCaptures.length}`);
    
    // Set up "View All" button
    setupViewAllCapturesButton();
  } catch (error) {
    logger.error('Error in loadRecentCaptures:', error);
    
    // Show error state
    const recentCapturesList = document.getElementById('recent-captures-list');
    if (recentCapturesList) {
      recentCapturesList.innerHTML = `<li class="error-state">Error loading captures: ${error.message}</li>`;
    }
  }
}

/**
 * Create a capture list item element
 * @param {Object} item - Capture item data
 * @returns {HTMLElement} List item element
 */
function createCaptureListItem(item) {
  const li = document.createElement('li');
  li.className = 'capture-item';
  
  // Format date safely
  let formattedDate = 'Unknown date';
  try {
    const date = new Date(item.timestamp);
    formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  } catch (dateError) {
    logger.warn(`Error formatting date for ${item.url}:`, dateError);
  }
  
  li.innerHTML = `
    <div class="capture-title">${item.title || 'Untitled'}</div>
    <div class="capture-meta">
      <span class="capture-url">${truncateText(item.url || '', 40)}</span>
      <span class="capture-time">${formattedDate}</span>
    </div>
  `;
  
  // Add click handler to open the URL
  li.addEventListener('click', () => {
    if (item.url) {
      chrome.tabs.create({ url: item.url });
    }
  });
  
  return li;
}

/**
 * Set up "View All" captures button
 */
function setupViewAllCapturesButton() {
  logger.debug('Setting up View All captures button');
  
  try {
    const viewAllBtn = document.getElementById('view-all-captures');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        // Switch to capture panel
        const captureTab = document.querySelector('[data-panel="capture"]');
        if (captureTab) {
          captureTab.click();
          logger.debug('Navigated to capture panel');
        } else {
          logger.warn('Capture panel tab not found');
        }
      });
      logger.debug('View All captures button listener attached');
    } else {
      logger.warn('View All captures button not found');
    }
  } catch (error) {
    logger.error('Error setting up View All captures button:', error);
  }
}

/**
 * Load active tasks summary
 * @returns {Promise<void>}
 */
async function loadActiveTasks() {
  logger.debug('Loading active tasks summary');
  
  try {
    const tasksSummary = document.getElementById('tasks-summary');
    if (!tasksSummary) {
      logger.warn('Tasks summary element not found');
      return;
    }
    
    tasksSummary.innerHTML = '<div class="loading">Loading tasks...</div>';
    
    // Get tasks from background page
    try {
      const backgroundPage = chrome.extension.getBackgroundPage();
      if (!backgroundPage || !backgroundPage.marvin) {
        throw new Error('Background page or marvin object not available');
      }
      
      const tasks = await backgroundPage.marvin.getActiveTasks();
      logger.debug(`Retrieved ${tasks.length} tasks from background page`);
      
      // Filter active tasks
      const active = tasks.filter(task => 
        task.status === 'pending' || 
        task.status === 'processing' || 
        task.status === 'analyzing'
      );
      
      if (active.length === 0) {
        tasksSummary.innerHTML = '<div class="empty-state">No active tasks</div>';
        logger.debug('No active tasks found');
        return;
      }
      
      tasksSummary.innerHTML = '';
      
      // Show up to 3 active tasks
      active.slice(0, 3).forEach(task => {
        try {
          const taskItem = createTaskSummaryItem(task);
          tasksSummary.appendChild(taskItem);
        } catch (itemError) {
          logger.warn(`Error creating task summary item for ${task.id}:`, itemError);
        }
      });
      
      // Add "View All" link if there are more tasks
      if (active.length > 3) {
        addViewAllTasksLink(tasksSummary, active.length);
      }
      
      logger.debug(`Displayed ${Math.min(active.length, 3)} of ${active.length} active tasks`);
    } catch (backgroundError) {
      logger.error('Error getting tasks from background page:', backgroundError);
      tasksSummary.innerHTML = `<div class="error-state">Error loading tasks: ${backgroundError.message}</div>`;
    }
  } catch (error) {
    logger.error('Error loading active tasks:', error);
    
    // Try to show error in the tasks summary element
    try {
      document.getElementById('tasks-summary').innerHTML = 
        `<div class="error">Error loading tasks: ${error.message}</div>`;
    } catch (e) {
      // Ignore if element not found
    }
  }
}

/**
 * Create a task summary item element
 * @param {Object} task - Task data
 * @returns {HTMLElement} Task summary item element
 */
function createTaskSummaryItem(task) {
  const taskItem = document.createElement('div');
  taskItem.className = 'task-summary-item';
  
  // Format progress safely
  let progressPercent = 0;
  try {
    const progress = task.progress || 0;
    progressPercent = Math.round(progress * 100);
  } catch (progressError) {
    logger.warn(`Error calculating progress for task ${task.id}:`, progressError);
  }
  
  taskItem.innerHTML = `
    <div class="task-summary-title">${truncateText(task.url || 'Unknown URL', 40)}</div>
    <div class="task-summary-status">${formatTaskStatus(task.status || 'unknown')}</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progressPercent}%"></div>
    </div>
  `;
  
  return taskItem;
}

/**
 * Format task status for display
 * @param {string} status - Task status
 * @returns {string} Formatted status text
 */
function formatTaskStatus(status) {
  if (!status) return 'Unknown';
  
  switch (status.toLowerCase()) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'analyzing':
      return 'Analyzing';
    case 'complete':
    case 'completed':
      return 'Completed';
    case 'error':
      return 'Failed';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Add "View All" tasks link
 * @param {HTMLElement} container - Container element
 * @param {number} taskCount - Total number of tasks
 */
function addViewAllTasksLink(container, taskCount) {
  logger.debug(`Adding View All link for ${taskCount} tasks`);
  
  try {
    const viewAllLink = document.createElement('a');
    viewAllLink.href = '#';
    viewAllLink.className = 'view-all-link';
    viewAllLink.textContent = `View all ${taskCount} active tasks`;
    
    viewAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Switch to tasks panel
      const tasksTab = document.querySelector('[data-panel="tasks"]');
      if (tasksTab) {
        tasksTab.click();
        logger.debug('Navigated to tasks panel');
      } else {
        logger.warn('Tasks panel tab not found');
      }
    });
    
    container.appendChild(viewAllLink);
  } catch (error) {
    logger.error('Error adding View All tasks link:', error);
  }
}

/**
 * Load mini graph visualization
 * @returns {Promise<void>}
 */
async function loadMiniGraph() {
  logger.debug('Loading mini graph visualization');
  
  try {
    const graphContainer = document.querySelector('.graph-placeholder');
    if (!graphContainer) {
      logger.warn('Graph container not found');
      return;
    }
    
    // Show loading state
    graphContainer.innerHTML = '<div class="loading">Loading graph...</div>';
    
    // Try to get data from API
    try {
      logger.debug('Fetching graph data from API');
      const response = await fetchAPI('/api/v1/graph/overview?limit=10');
      
      if (response.success && response.data?.nodes?.length > 0) {
        logger.debug(`Received graph data: ${response.data.nodes.length} nodes, ${response.data.edges?.length || 0} edges`);
        renderMiniGraph(response.data.nodes, response.data.edges, graphContainer);
        return;
      } else {
        logger.debug('No graph data from overview endpoint, trying pages endpoint');
        
        // Try to use pages data to create a simple graph
        const pagesResponse = await fetchAPI('/api/v1/pages/');
        if (pagesResponse.success && pagesResponse.data?.pages?.length > 0) {
          const pages = pagesResponse.data.pages || [];
          logger.debug(`Creating graph from ${pages.length} pages`);
          
          // Create simple nodes
          const nodes = pages.slice(0, 10).map(page => ({
            id: page.id,
            label: page.title || 'Untitled',
            url: page.url,
            domain: page.domain
          }));
          
          // Create edges (if available)
          const edges = [];
          
          // Try to extract edges from relationships
          pages.slice(0, 10).forEach(page => {
            if (page.relationships && page.relationships.length > 0) {
              page.relationships.forEach(rel => {
                if (rel.target_id) {
                  edges.push({
                    source: page.id,
                    target: rel.target_id,
                    type: rel.type || 'related'
                  });
                }
              });
            }
          });
          
          renderMiniGraph(nodes, edges, graphContainer);
          return;
        }
      }
      
      // If we get here, we couldn't get any graph data
      throw new Error('No graph data available');
    } catch (apiError) {
      logger.warn('Error getting graph data from API:', apiError);
      
      // Fallback to local storage
      await loadGraphFromLocalStorage(graphContainer);
    }
  } catch (error) {
    logger.error('Error loading mini graph:', error);
    
    // Show error state
    try {
      const graphContainer = document.querySelector('.graph-placeholder');
      if (graphContainer) {
        graphContainer.innerHTML = `<div class="error-state">Error loading graph: ${error.message}</div>`;
      }
    } catch (e) {
      // Ignore if element not found
    }
  }
}

/**
 * Load graph data from local storage as fallback
 * @param {HTMLElement} container - Graph container element
 * @returns {Promise<void>}
 */
async function loadGraphFromLocalStorage(container) {
  logger.debug('Loading graph from local storage');
  
  try {
    const data = await chrome.storage.local.get(['captureHistory', 'graphCache']);
    
    // Try to use cached graph data first
    if (data.graphCache && data.graphCache.nodes && data.graphCache.nodes.length > 0) {
      logger.debug(`Using cached graph data: ${data.graphCache.nodes.length} nodes`);
      renderMiniGraph(data.graphCache.nodes, data.graphCache.edges || [], container);
      return;
    }
    
    // Fall back to creating a simple graph from capture history
    const captureHistory = data.captureHistory || [];
    if (captureHistory.length === 0) {
      container.innerHTML = '<div class="placeholder">No graph data available</div>';
      return;
    }
    
    logger.debug(`Creating simple graph from ${captureHistory.length} captures`);
    
    // Create simple nodes from capture history
    const nodes = captureHistory.slice(0, 10).map((capture, index) => ({
      id: `local-${index}`,
      label: capture.title || 'Untitled',
      url: capture.url,
      domain: extractDomain(capture.url)
    }));
    
    // No edges for this simple graph
    const edges = [];
    
    renderMiniGraph(nodes, edges, container);
  } catch (error) {
    logger.error('Error loading graph from local storage:', error);
    container.innerHTML = '<div class="placeholder">Could not load graph data</div>';
  }
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
function extractDomain(url) {
  try {
    if (!url) return 'unknown';
    const domain = new URL(url).hostname;
    return domain;
  } catch (error) {
    logger.warn(`Error extracting domain from ${url}:`, error);
    return 'unknown';
  }
}

/**
 * Render mini graph visualization
 * @param {Array} nodes - Graph nodes
 * @param {Array} edges - Graph edges
 * @param {HTMLElement} container - Container element
 */
function renderMiniGraph(nodes, edges, container) {
  logger.debug(`Rendering mini graph with ${nodes.length} nodes and ${edges?.length || 0} edges`);
  
  // Clear container
  container.innerHTML = '';
  
  // Handle empty data
  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<div class="placeholder">No graph data available</div>';
    return;
  }

  try {
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 200;
    
    // Create SVG element
    const svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'mini-graph-svg');
    
    // Create simple simulation
    const simulation = d3.forceSimulation(nodes.slice(0, 10))
      .force('center', d3.forceCenter(width/2, height/2))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('collide', d3.forceCollide().radius(15));
    
    // Add links if available
    if (edges && edges.length > 0) {
      // Filter edges to only include nodes that are in our visualization
      const nodeIds = nodes.slice(0, 10).map(n => n.id);
      const validEdges = edges.filter(e => 
        nodeIds.includes(e.source) && nodeIds.includes(e.target)
      );
      
      if (validEdges.length > 0) {
        logger.debug(`Adding ${validEdges.length} edges to graph`);
        
        // Create links
        const link = svg.append('g')
          .selectAll('line')
          .data(validEdges)
          .enter()
          .append('line')
          .attr('stroke', '#999')
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1);
        
        // Add link force
        simulation.force('link', d3.forceLink(validEdges)
          .id(d => d.id)
          .distance(30));
        
        // Update link positions on tick
        simulation.on('tick', () => {
          link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
          
          node
            .attr('cx', d => Math.max(5, Math.min(width - 5, d.x)))
            .attr('cy', d => Math.max(5, Math.min(height - 5, d.y)));
        });
      } else {
        // No valid edges, just update node positions
        simulation.on('tick', () => {
          node
            .attr('cx', d => Math.max(5, Math.min(width - 5, d.x)))
            .attr('cy', d => Math.max(5, Math.min(height - 5, d.y)));
        });
      }
    } else {
      // No edges, just update node positions
      simulation.on('tick', () => {
        node
          .attr('cx', d => Math.max(5, Math.min(width - 5, d.x)))
          .attr('cy', d => Math.max(5, Math.min(height - 5, d.y)));
      });
    }
    
    // Create color scale for domains
    const domains = [...new Set(nodes.map(n => n.domain || 'unknown'))];
    const colorScale = d3.scaleOrdinal()
      .domain(domains)
      .range(d3.schemeCategory10);
    
    // Create nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes.slice(0, 10)) // Show max 10 nodes
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', d => colorScale(d.domain || 'unknown'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);
    
    // Add tooltips
    node.append('title')
      .text(d => d.label || d.url || 'Unknown');
    
    // Make the entire graph clickable, navigating to Knowledge tab
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', () => {
        const knowledgeTab = document.querySelector('[data-panel="knowledge"]');
        if (knowledgeTab) {
          knowledgeTab.click();
          logger.debug('Navigated to knowledge panel');
        } else {
          logger.warn('Knowledge panel tab not found');
        }
      });
    
    logger.debug('Mini graph rendered successfully');
    
    // Cache the graph data for future use
    try {
      chrome.storage.local.set({
        graphCache: {
          nodes,
          edges,
          timestamp: Date.now()
        }
      });
    } catch (cacheError) {
      logger.warn('Error caching graph data:', cacheError);
    }
  } catch (renderError) {
    logger.error('Error rendering mini graph:', renderError);
    container.innerHTML = `<div class="error-state">Error rendering graph: ${renderError.message}</div>`;
  }
}

/**
 * Update recent captures list
 * @param {Array} captures - Capture items to display
 */
function updateRecentCaptures(captures) {
  logger.debug(`Updating recent captures list with ${captures.length} items`);
  
  try {
    const capturesList = document.getElementById('recent-captures-list');
    if (!capturesList) {
      logger.warn('Captures list element not found');
      return;
    }
    
    if (!captures || captures.length === 0) {
      capturesList.innerHTML = '<li class="empty-state">No recent captures</li>';
      return;
    }
    
    capturesList.innerHTML = '';
    
    // Sort by timestamp (most recent first)
    const sortedCaptures = [...captures].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Show most recent 5 captures
    sortedCaptures.slice(0, 5).forEach(capture => {
      try {
        const captureItem = document.createElement('li');
        captureItem.className = 'capture-item';
        
        // Format date safely
        let formattedDate = '';
        try {
          const date = new Date(capture.timestamp);
          formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (dateError) {
          logger.warn(`Error formatting date for ${capture.url}:`, dateError);
          formattedDate = 'Unknown date';
        }
        
        captureItem.innerHTML = `
          <div class="capture-title">${truncateText(capture.title || 'Untitled', 50)}</div>
          <div class="capture-meta">
            <span class="capture-url">${truncateText(capture.url || '', 30)}</span>
            <span class="capture-time">${formattedDate}</span>
          </div>
        `;
        
        // Add click handler to open the URL
        captureItem.addEventListener('click', () => {
          if (capture.url) {
            chrome.tabs.create({ url: capture.url });
          }
        });
        
        capturesList.appendChild(captureItem);
      } catch (itemError) {
        logger.warn(`Error creating capture item for ${capture.url}:`, itemError);
      }
    });
    
    logger.debug(`Updated captures list with ${Math.min(sortedCaptures.length, 5)} items`);
  } catch (error) {
    logger.error('Error updating recent captures:', error);
  }
}

/**
 * Load all dashboard data
 * @returns {Promise<void>}
 */
async function loadDashboardData() {
  logger.info('Loading all dashboard data');
  
  try {
    // Show loading states
    document.getElementById('recent-captures-list')?.innerHTML = '<div class="loading-indicator">Loading data...</div>';
    document.getElementById('tasks-summary')?.innerHTML = '<div class="loading-indicator">Loading tasks...</div>';
    document.querySelector('.graph-placeholder')?.innerHTML = '<div class="loading-indicator">Loading graph...</div>';
    
    // Update stats elements with loading indicators
    document.getElementById('captured-count')?.textContent = '...';
    document.getElementById('relationship-count')?.textContent = '...';
    document.getElementById('query-count')?.textContent = '...';
    
    showNotification('Loading dashboard data...', 'info');
    
    // Load all data in parallel
    await Promise.all([
      loadOverviewStats(),
      loadRecentCaptures(),
      loadActiveTasks(),
      loadMiniGraph()
    ]);
    
    logger.info('Dashboard data loaded successfully');
    showNotification('Dashboard data loaded', 'success');
  } catch (error) {
    logger.error('Error loading dashboard data:', error);
    showNotification(`Error loading dashboard data: ${error.message}`, 'error');
    
    // Show error states in each section
    document.getElementById('recent-captures-list')?.innerHTML = 
      `<div class="error-state">Error loading captures: ${error.message}</div>`;
    
    document.getElementById('tasks-summary')?.innerHTML = 
      `<div class="error-state">Error loading tasks: ${error.message}</div>`;
    
    document.querySelector('.graph-placeholder')?.innerHTML = 
      `<div class="error-state">Error loading graph: ${error.message}</div>`;
  }
}

/**
 * Get overview statistics
 * @returns {Promise<Object>} Overview statistics
 */
export async function getOverviewStats() {
  logger.debug('Getting overview statistics');
  
  try {
    // Try to get stats from API
    const response = await fetchAPI('/api/v1/stats');
    
    if (response.success) {
      const stats = response.data || response.result || {};
      logger.debug('Retrieved stats from API:', stats);
      
      return {
        captures: stats.captures || 0,
        relationships: stats.relationship_count || 0,
        queries: stats.query_count || 0
      };
    } else {
      throw new Error(response.error || 'Failed to load stats');
    }
  } catch (apiError) {
    logger.warn('Error getting stats from API:', apiError);
    
    // Fallback to local storage
    try {
      const data = await chrome.storage.local.get(['captureHistory', 'stats']);
      const captureHistory = data.captureHistory || [];
      const stats = data.stats || {};
      
      logger.debug('Retrieved stats from local storage');
      
      return {
        captures: captureHistory.length,
        relationships: stats.relationships || 0,
        queries: stats.queries || 0
      };
    } catch (storageError) {
      logger.error('Error getting stats from local storage:', storageError);
      throw storageError;
    }
  }
}

/**
 * Get recent captures
 * @param {number} limit - Maximum number of captures to return
 * @returns {Promise<Array>} Recent captures
 */
export async function getRecentCaptures(limit = 5) {
  logger.debug(`Getting recent captures (limit: ${limit})`);
  
  try {
    // Get capture history from storage
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    // Sort by timestamp (most recent first)
    const sortedCaptures = [...captureHistory].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    logger.debug(`Retrieved ${sortedCaptures.length} captures, returning ${Math.min(sortedCaptures.length, limit)}`);
    
    return sortedCaptures.slice(0, limit);
  } catch (error) {
    logger.error('Error getting recent captures:', error);
    throw error;
  }
}

/**
 * Get active tasks count
 * @returns {Promise<number>} Number of active tasks
 */
export async function getActiveTasksCount() {
  logger.debug('Getting active tasks count');
  
  try {
    // Get tasks from background page
    const backgroundPage = chrome.extension.getBackgroundPage();
    if (!backgroundPage || !backgroundPage.marvin) {
      throw new Error('Background page or marvin object not available');
    }
    
    const tasks = await backgroundPage.marvin.getActiveTasks();
    
    // Filter active tasks
    const active = tasks.filter(task => 
      task.status === 'pending' || 
      task.status === 'processing' || 
      task.status === 'analyzing'
    );
    
    logger.debug(`Active tasks count: ${active.length}`);
    
    return active.length;
  } catch (error) {
    logger.error('Error getting active tasks count:', error);
    return 0;
  }
}

/**
 * Update overview panel with new data
 * @param {Object} data - Data to update with
 * @returns {Promise<void>}
 */
export async function updateOverviewPanel(data) {
  logger.debug('Updating overview panel with new data');
  
  try {
    // Update stats if provided
    if (data.stats) {
      document.getElementById('captured-count')?.textContent = data.stats.captures || 0;
      document.getElementById('relationship-count')?.textContent = data.stats.relationships || 0;
      document.getElementById('query-count')?.textContent = data.stats.queries || 0;
    }
    
    // Update captures if provided
    if (data.captures) {
      updateRecentCaptures(data.captures);
    }
    
    // Update tasks if provided
    if (data.tasks) {
      const tasksSummary = document.getElementById('tasks-summary');
      if (tasksSummary) {
        tasksSummary.innerHTML = '';
        
        if (data.tasks.length === 0) {
          tasksSummary.innerHTML = '<div class="empty-state">No active tasks</div>';
        } else {
          // Show up to 3 tasks
          data.tasks.slice(0, 3).forEach(task => {
            try {
              const taskItem = createTaskSummaryItem(task);
              tasksSummary.appendChild(taskItem);
            } catch (itemError) {
              logger.warn(`Error creating task summary item:`, itemError);
            }
          });
          
          // Add "View All" link if there are more tasks
          if (data.tasks.length > 3) {
            addViewAllTasksLink(tasksSummary, data.tasks.length);
          }
        }
      }
    }
    
    logger.debug('Overview panel updated successfully');
  } catch (error) {
    logger.error('Error updating overview panel:', error);
    throw error;
  }
}

// Export functions needed by other modules
export { 
  initOverviewPanel,
  refreshOverviewPanel,
  loadOverviewStats,
  loadRecentCaptures,
  loadActiveTasks,
  renderMiniGraph,
  getOverviewStats,
  getRecentCaptures,
  getActiveTasksCount,
  updateOverviewPanel
};
