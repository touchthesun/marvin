// components/panels/graph-panel.js
import * as d3 from 'd3';
import { LogManager } from '../../../utils/log-manager.js';
import { fetchAPI } from '../../../services/api-service.js';
import { showNotification } from '../../../services/notification-service.js';
import { getSettings, incrementStatsCounter } from '../../../services/storage-service.js';

/**
 * Logger for graph panel operations
 * @type {LogManager}
 */
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'graph-panel',
  storageKey: 'marvin_graph_logs',
  maxEntries: 1000
});

// Graph state
let graphInitialized = false;
let graphData = {
  nodes: [],
  edges: []
};

const GraphPanelComponent = {
  // Main initialization function
  initGraphPanel() {
    return initGraphPanel();
  },
  
  // Public methods that should be exposed
  initGraphPanel,
  loadGraphData,
  renderGraph,
  cleanupGraphPanel
};

/**
 * Initialize graph panel
 * @returns {Promise<void>}
 */
async function initGraphPanel() {
  if (graphInitialized) {
    logger.debug('Graph panel already initialized, skipping');
    return;
  }
  
  logger.info('Initializing graph panel');
  
  try {
    // Load initial graph data
    await loadGraphData();
    
    // Set up window resize handler for responsive behavior
    setupResizeHandler();
    
    graphInitialized = true;
    logger.info('Graph panel initialized successfully');
  } catch (error) {
    logger.error('Error initializing graph panel:', error);
    showNotification('Failed to initialize graph panel', 'error');
  }
}

/**
 * Set up resize handler for responsive behavior
 */
function setupResizeHandler() {
  let resizeTimeout;
  
  window.addEventListener('resize', () => {
    // Debounce resize event
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const graphContainer = document.querySelector('.graph-container');
      if (graphContainer && graphData.nodes.length > 0) {
        logger.debug('Window resized, re-rendering graph');
        renderGraph(graphData.nodes, graphData.edges);
      }
    }, 250);
  });
  
  logger.debug('Resize handler set up successfully');
}

/**
 * Loads and displays graph data from the API or falls back to generating from pages
 * @returns {Promise<void>}
 */
async function loadGraphData() {
  logger.info('Loading graph data');
  
  const graphContainer = document.querySelector('.graph-container');
  if (!graphContainer) {
    logger.error('Graph container element not found');
    showNotification('Error', 'Graph container element not found', 'error');
    return;
  }
  
  graphContainer.innerHTML = '<div class="loading-indicator">Loading graph data...</div>';
  
  try {
    // Get settings to check API configuration
    const settings = await getSettings();
    
    // Try to get graph data from API
    logger.debug('Fetching graph data from API');
    const response = await fetchAPI('/api/v1/graph/overview');
    
    if (response.success) {
      logger.info('Successfully loaded graph data from API');
      graphData = {
        nodes: response.data.nodes || [],
        edges: response.data.edges || []
      };
      
      // Update stats
      incrementStatsCounter('graph_views');
      
      // Render the graph
      renderGraph(graphData.nodes, graphData.edges);
      return;
    } 
    
    if (response.error?.error_code === 'NOT_FOUND') {
      // Fall back to creating visualization from pages
      logger.info('Graph data not found, falling back to pages data');
      await loadGraphFromPages();
      return;
    }
    
    // Handle other API errors
    throw new Error(response.error?.message || 'Failed to load graph data');
    
  } catch (error) {
    logger.error('Error loading graph data:', error);
    
    if (graphContainer) {
      graphContainer.innerHTML = `<div class="error-state">
        <p>Error loading graph: ${error.message}</p>
        <button class="btn-secondary retry-graph-btn">Retry</button>
      </div>`;
      
      // Add retry button functionality
      const retryButton = document.querySelector('.retry-graph-btn');
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          loadGraphData();
        });
      }
    }
    
    showNotification('Graph Error', `Failed to load graph: ${error.message}`, 'error');
  }
}

/**
 * Loads graph data from pages API as a fallback
 * @returns {Promise<void>}
 */
async function loadGraphFromPages() {
  try {
    logger.debug('Fetching pages data for graph generation');
    const pagesResponse = await fetchAPI('/api/v1/pages/');
    
    if (!pagesResponse.success) {
      throw new Error(pagesResponse.error?.message || 'Failed to load pages for graph');
    }
    
    const pages = pagesResponse.data.pages || [];
    logger.info(`Creating graph from ${pages.length} pages`);
    
    if (pages.length === 0) {
      const graphContainer = document.querySelector('.graph-container');
      if (graphContainer) {
        graphContainer.innerHTML = '<div class="placeholder">No pages available to create graph</div>';
      }
      return;
    }
    
    // Create simple graph data
    const nodes = pages.map(page => ({
      id: page.id,
      label: page.title || 'Untitled',
      url: page.url,
      type: 'page',
      domain: page.domain || getDomainFromUrl(page.url)
    }));
    
    // Create edges from relationships
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
    
    // Save graph data for future reference
    graphData = { nodes, edges };
    
    // Cache graph data to local storage
    try {
      chrome.storage.local.set({
        graphCache: {
          nodes,
          edges,
          timestamp: Date.now()
        }
      });
      logger.debug('Graph data cached to local storage');
    } catch (cacheError) {
      logger.warn('Error caching graph data:', cacheError);
    }
    
    renderGraph(nodes, edges);
    
  } catch (error) {
    logger.error('Error creating graph from pages:', error);
    throw error; // Propagate to main error handler
  }
}

/**
 * Safely extracts domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name or 'unknown'
 */
function getDomainFromUrl(url) {
  if (!url) {
    return 'unknown';
  }
  
  try {
    return new URL(url).hostname;
  } catch (e) {
    logger.warn(`Invalid URL: ${url}`, e);
    return 'unknown';
  }
}

/**
 * Renders the graph visualization using D3
 * @param {Array} nodes - Graph nodes
 * @param {Array} edges - Graph edges
 */
function renderGraph(nodes, edges) {
  logger.debug(`Rendering graph with ${nodes?.length || 0} nodes and ${edges?.length || 0} edges`);
  
  if (!nodes || nodes.length === 0) {
    const graphContainer = document.querySelector('.graph-container');
    if (graphContainer) {
      graphContainer.innerHTML = '<div class="placeholder">No graph data available</div>';
    }
    return;
  }

  const graphContainer = document.querySelector('.graph-container');
  if (!graphContainer) {
    logger.error('Graph container not found for rendering');
    return;
  }
  
  // Clear existing graph
  graphContainer.innerHTML = '';
  
  try {
    // Get container dimensions
    const width = graphContainer.clientWidth || 500;
    const height = graphContainer.clientHeight || 300;
    
    // Create SVG with zoom support
    const svg = d3.select(graphContainer)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'graph-svg');
    
    // Add zoom behavior
    let zoom;
    try {
      zoom = d3.zoom()
        .scaleExtent([0.3, 5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      
      svg.call(zoom);
      logger.debug('Zoom behavior initialized successfully');
    } catch (zoomError) {
      logger.error("Error setting up zoom:", zoomError);
      showNotification('Warning', 'Graph zoom functionality is limited', 'warning');
      // Continue without zoom functionality
    }
    
    // Create a container for the graph elements
    const g = svg.append('g');
    
    // Create simulation
    const simulation = createForceSimulation(nodes, edges, width, height);
    if (!simulation) {
      throw new Error('Failed to create graph simulation');
    }
    
    // Create edges
    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5);
    
    // Domain grouping - group nodes by domain
    const domainGroups = groupNodesByDomain(nodes);
    
    // Create domain hulls
    createDomainHulls(g, domainGroups);
    
    // Generate color scale for domains
    const colorScale = createColorScale(domainGroups);
    
    // Create nodes with interactive features
    const node = createGraphNodes(g, nodes, simulation, colorScale);
    
    // Add controls panel
    addGraphControls(graphContainer, svg, zoom);
    
    // Add legend for domains
    addDomainLegend(graphContainer, domainGroups, colorScale);
    
    // Update on tick with error handling
    setupSimulationTick(simulation, link, node, g, domainGroups);
    
    logger.info('Graph rendered successfully');
    
  } catch (error) {
    logger.error('Error rendering graph:', error);
    graphContainer.innerHTML = 
      `<div class="error-state">Error rendering graph: ${error.message}</div>`;
    showNotification('Graph Error', `Failed to render graph: ${error.message}`, 'error');
  }
}

/**
 * Creates force simulation for graph
 * @param {Array} nodes - Graph nodes
 * @param {Array} edges - Graph edges
 * @param {number} width - Container width
 * @param {number} height - Container height
 * @returns {Object|null} D3 force simulation or null on error
 */
function createForceSimulation(nodes, edges, width, height) {
  try {
    return d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width/2, height/2))
      .force('collide', d3.forceCollide().radius(30));
  } catch (simError) {
    logger.error("Error creating simulation:", simError);
    
    // Create simplified simulation as fallback
    try {
      return d3.forceSimulation(nodes)
        .force('center', d3.forceCenter(width/2, height/2));
    } catch (fallbackError) {
      logger.error("Failed to create fallback simulation:", fallbackError);
      return null;
    }
  }
}

/**
 * Groups nodes by domain
 * @param {Array} nodes - Graph nodes
 * @returns {Object} Map of domain to nodes
 */
function groupNodesByDomain(nodes) {
  const domainGroups = {};
  nodes.forEach(node => {
    const domain = node.domain || 'unknown';
    if (!domainGroups[domain]) {
      domainGroups[domain] = [];
    }
    domainGroups[domain].push(node);
  });
  return domainGroups;
}

/**
 * Creates visual hulls around domain groups
 * @param {Object} g - D3 selection for graph container
 * @param {Object} domainGroups - Map of domain to nodes
 */
function createDomainHulls(g, domainGroups) {
  try {
    Object.entries(domainGroups).forEach(([domainName, groupNodes]) => {
      if (groupNodes.length >= 3) {
        // Only create hulls for domains with at least 3 nodes
        try {
          const hullColor = d3.color('#6b8cae');
          if (hullColor && typeof hullColor.copy === 'function') {
            g.append('path')
              .attr('class', 'domain-hull')
              .attr('fill', hullColor.copy({opacity: 0.1}))
              .attr('stroke', '#6b8cae')
              .attr('stroke-width', 1)
              .attr('stroke-opacity', 0.3);
          } else {
            // Fallback if color manipulation fails
            g.append('path')
              .attr('class', 'domain-hull')
              .attr('fill', 'rgba(107, 140, 174, 0.1)')
              .attr('stroke', '#6b8cae')
              .attr('stroke-width', 1)
              .attr('stroke-opacity', 0.3);
          }
        } catch (colorError) {
          logger.error("Error with domain hull color:", colorError);
          // Skip this hull
        }
      }
    });
  } catch (hullError) {
    logger.error("Error creating domain hulls:", hullError);
    // Continue without hulls
  }
}

/**
 * Creates color scale for domains
 * @param {Object} domainGroups - Map of domain to nodes
 * @returns {Function} Color scale function
 */
function createColorScale(domainGroups) {
  try {
    const domains = Object.keys(domainGroups);
    return d3.scaleOrdinal()
      .domain(domains)
      .range(d3.schemeCategory10);
  } catch (colorScaleError) {
    logger.error("Error creating color scale:", colorScaleError);
    // Create simple function that returns fixed colors
    return () => '#1f77b4';
  }
}

/**
 * Creates graph nodes with interactive features
 * @param {Object} g - D3 selection for graph container
 * @param {Array} nodes - Graph nodes
 * @param {Object} simulation - D3 force simulation
 * @param {Function} colorScale - Color scale function
 * @returns {Object} D3 selection of nodes
 */
function createGraphNodes(g, nodes, simulation, colorScale) {
  // Create nodes with interactive features
  const node = g.append('g')
    .selectAll('.node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node');
  
  // Add drag behavior
  try {
    node.call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));
  } catch (dragError) {
    logger.error("Error setting up drag behavior:", dragError);
    // Continue without drag functionality
  }
  
  // Add circles
  node.append('circle')
    .attr('r', 8)
    .attr('fill', d => {
      try {
        return colorScale(d.domain || 'unknown');
      } catch (e) {
        return '#1f77b4'; // Default color on error
      }
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .on('mouseover', function(event, d) {
      d3.select(this)
        .attr('stroke', '#333')
        .attr('stroke-width', 2);
    })
    .on('mouseout', function(event, d) {
      d3.select(this)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    });
  
  // Add labels for limited number of nodes
  if (nodes.length <= 30) {
    node.append('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text(d => truncateLabel(d.label || d.url, 15))
      .attr('font-size', '10px')
      .attr('fill', '#333');
  }
  
  // Add tooltips
  node.append('title')
    .text(d => d.label || d.url);
  
  // Add click handler
  node.on('click', (event, d) => {
    if (d.id) {
      loadRelatedItem(d.id);
    }
  });
  
  return node;
}

/**
 * Adds control buttons to the graph container
 * @param {HTMLElement} graphContainer - Graph container element
 * @param {Object} svg - D3 SVG selection
 * @param {Object} zoom - D3 zoom behavior
 */
function addGraphControls(graphContainer, svg, zoom) {
  try {
    const controls = d3.select(graphContainer)
      .append('div')
      .attr('class', 'graph-controls')
      .style('position', 'absolute')
      .style('bottom', '10px')
      .style('right', '10px')
      .style('display', 'flex')
      .style('gap', '5px');
    
    // Add zoom control functions
    if (zoom) {
      // Zoom in button
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('+')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.scaleBy, 1.3);
          } catch (e) {
            logger.warn('Zoom in operation failed:', e);
          }
        });
      
      // Zoom out button
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('−')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.scaleBy, 0.7);
          } catch (e) {
            logger.warn('Zoom out operation failed:', e);
          }
        });
      
      // Reset zoom button
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('⟲')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.transform, d3.zoomIdentity);
          } catch (e) {
            logger.warn('Zoom reset failed:', e);
          }
        });
    }
    
    // Add refresh button
    controls.append('button')
      .attr('class', 'btn-icon')
      .html('↻')
      .attr('title', 'Refresh Graph')
      .on('click', () => { 
        try {
          loadGraphData();
        } catch (e) {
          logger.warn('Graph refresh failed:', e);
        }
      });
      
  } catch (controlError) {
    logger.error("Error setting up graph controls:", controlError);
    // Continue without controls
  }
}

/**
 * Adds a legend for domain colors
 * @param {HTMLElement} graphContainer - Graph container element
 * @param {Object} domainGroups - Map of domain to nodes
 * @param {Function} colorScale - Color scale function
 */
function addDomainLegend(graphContainer, domainGroups, colorScale) {
  try {
    const legend = d3.select(graphContainer)
      .append('div')
      .attr('class', 'graph-legend')
      .style('position', 'absolute')
      .style('top', '10px')
      .style('left', '10px');
    
    const domains = Object.keys(domainGroups);
    if (domains.length <= 10) {
      domains.forEach((domain, i) => {
        const item = legend.append('div')
          .style('display', 'flex')
          .style('align-items', 'center')
          .style('margin-bottom', '5px');
        
        item.append('div')
          .style('width', '12px')
          .style('height', '12px')
          .style('border-radius', '50%')
          .style('background-color', colorScale(domain))
          .style('margin-right', '5px');
        
        item.append('span')
          .style('font-size', '10px')
          .text(truncateDomain(domain, 20));
      });
    }
  } catch (legendError) {
    logger.error("Error creating domain legend:", legendError);
    // Continue without legend
  }
}

/**
 * Sets up the simulation tick function
 * @param {Object} simulation - D3 force simulation
 * @param {Object} link - D3 selection of links
 * @param {Object} node - D3 selection of nodes
 * @param {Object} g - D3 selection of graph container
 * @param {Object} domainGroups - Map of domain to nodes
 */
function setupSimulationTick(simulation, link, node, g, domainGroups) {
  simulation.on('tick', () => {
    try {
      // Update link positions
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    
      // Update node positions
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    
      // Update domain hulls
      updateDomainHulls(g, domainGroups);
    } catch (tickError) {
      logger.error("Error in simulation tick:", tickError);
      // Simulation will continue but updates may be incomplete
    }
  });
}

/**
 * Updates domain hull paths based on current node positions
 * @param {Object} g - D3 selection of graph container
 * @param {Object} domainGroups - Map of domain to nodes
 */
function updateDomainHulls(g, domainGroups) {
  try {
    Object.entries(domainGroups).forEach(([domainName, groupNodes]) => {
      if (groupNodes.length >= 3) {
        const hullPoints = groupNodes.map(d => [d.x, d.y]);
        try {
          const hullPath = safeConvexHull(hullPoints);
          g.select('.domain-hull')
            .attr('d', hullPath);
        } catch (hullError) {
          logger.warn("Error calculating convex hull:", hullError);
          // Skip hull update
        }
      }
    });
  } catch (domainError) {
    logger.warn("Error updating domain hulls:", domainError);
    // Skip domain hull updates
  }
}

/**
 * Truncates a label to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateLabel(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Truncates a domain name to a maximum length
 * @param {string} domain - Domain to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated domain
 */
function truncateDomain(domain, maxLength) {
  if (!domain) return 'unknown';
  return domain.length > maxLength ? domain.substring(0, maxLength) + '...' : domain;
}

/**
 * Safely calculates a convex hull path with fallback
 * @param {Array} points - Array of [x,y] coordinates
 * @returns {string} SVG path string
 */
function safeConvexHull(points) {
  if (!points || points.length < 3) return '';
  
  try {
    // Try to use d3.polygonHull
    if (d3.polygonHull) {
      const hull = d3.polygonHull(points);
      if (hull) {
        return 'M' + hull.map(p => `${p[0]},${p[1]}`).join('L') + 'Z';
      }
    }
    
    // Fallback: Use simple rectangular boundary
    const minX = Math.min(...points.map(p => p[0])) - 15;
    const maxX = Math.max(...points.map(p => p[0])) + 15;
    const minY = Math.min(...points.map(p => p[1])) - 15;
    const maxY = Math.max(...points.map(p => p[1])) + 15;
    
    return `M${minX},${minY}L${maxX},${minY}L${maxX},${maxY}L${minX},${maxY}Z`;
  } catch (e) {
    logger.warn('Hull calculation error:', e);
    return ''; // Empty path on error
  }
}

/**
 * Loads related item details when a node is clicked
 * @param {string} itemId - ID of the item to load
 */
async function loadRelatedItem(itemId) {
  if (!itemId) {
    logger.warn('Attempted to load related item with no ID');
    return;
  }
  
  logger.info(`Loading related item: ${itemId}`);
  
  try {
    const response = await fetchAPI(`/api/v1/pages/${itemId}`);
    
    if (response.success) {
      // Dispatch custom event with the item data
      const event = new CustomEvent('marvin:item-selected', { 
        detail: { 
          item: response.data,
          source: 'graph'
        }
      });
      document.dispatchEvent(event);
      
      // Increment stats counter
      incrementStatsCounter('item_views');
      
      logger.debug(`Item ${itemId} details loaded and event dispatched`);
    } else {
      throw new Error(response.error?.message || 'Failed to load item details');
    }
  } catch (error) {
    logger.error(`Error loading item ${itemId}:`, error);
    showNotification('Error', `Could not load item details: ${error.message}`, 'error');
  }
}

/**
 * Clean up resources when the graph panel is unloaded
 */
function cleanupGraphPanel() {
  // Stop any running simulations
  const simulation = d3.select('.graph-container svg').datum();
  if (simulation) {
    simulation.stop();
  }
  
  // Remove event listeners
  window.removeEventListener('resize', () => {});
  
  logger.debug('Graph panel resources cleaned up');
}

// Register the component with fallback mechanism
try {
  // First, try to use the global registerComponent function
  if (typeof self.registerComponent === 'function') {
    logger.log('debug', 'Registering graph panel component using global registerComponent');
    self.registerComponent('graph-panel', GraphPanelComponent);
  } else {
    // If registerComponent isn't available, register directly in global registry
    logger.log('debug', 'Global registerComponent not found, using direct registry access');
    self.MarvinComponents = self.MarvinComponents || {};
    self.MarvinComponents['graph-panel'] = GraphPanelComponent;
  }
  
  logger.log('info', 'graph panel component registered successfully');
} catch (error) {
  logger.log('error', 'Error registering graph panel component:', error);
  // Try window as fallback if self fails
  try {
    window.MarvinComponents = window.MarvinComponents || {};
    window.MarvinComponents['graph-panel'] = GraphPanelComponent;
    logger.log('debug', 'graph panel component registered using window fallback');
  } catch (windowError) {
    logger.log('error', 'Failed to register graph panel component:', windowError);
  }
}

export default GraphPanelComponent;
// Export public methods
export {
  initGraphPanel,
  loadGraphData,
  renderGraph,
  cleanupGraphPanel
};