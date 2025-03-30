import * as d3 from 'd3';
import { fetchAPI } from '../../shared/utils/api.js';

export async function loadGraphData() {
    const graphContainer = document.querySelector('.graph-container');
    graphContainer.innerHTML = '<div class="loading-indicator">Loading graph data...</div>';
    
    try {
      // Try to get graph data from API
      const response = await fetchAPI('/api/v1/graph/overview');
      
      if (response.success) {
        renderGraph(response.data.nodes, response.data.edges);
      } else if (response.error?.error_code === 'NOT_FOUND') {
        // Fall back to creating visualization from pages
        const pagesResponse = await fetchAPI('/api/v1/pages/');
        
        if (pagesResponse.success) {
          const pages = pagesResponse.data.pages || [];
          
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
          
          renderGraph(nodes, edges);
        } else {
          throw new Error('Failed to load pages for graph');
        }
      } else {
        throw new Error(response.error?.message || 'Failed to load graph data');
      }
    } catch (error) {
      console.error('Error loading graph data:', error);
      graphContainer.innerHTML = `<div class="error-state">
        <p>Error loading graph: ${error.message}</p>
        <button class="btn-secondary retry-graph-btn">Retry</button>
      </div>`;
      
      // Add retry button functionality
      document.querySelector('.retry-graph-btn')?.addEventListener('click', () => {
        loadGraphData();
      });
    }
}

// Helper to safely extract domain from URL
function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.warn(`Invalid URL: ${url}`, e);
    return 'unknown';
  }
}

function renderGraph(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    document.querySelector('.graph-container').innerHTML = '<div class="placeholder">No graph data available</div>';
    return;
  }

  const graphContainer = document.querySelector('.graph-container');
  graphContainer.innerHTML = '';
  
  try {
    const width = graphContainer.clientWidth || 500;
    const height = graphContainer.clientHeight || 300;
    
    // Create SVG with zoom support
    const svg = d3.select(graphContainer)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'graph-svg');
    
    // Add zoom behavior - wrapped in try/catch
    try {
      const zoom = d3.zoom()
        .scaleExtent([0.3, 5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      
      svg.call(zoom);
    } catch (zoomError) {
      console.error("Error setting up zoom:", zoomError);
      // Continue without zoom functionality
    }
    
    // Create a container for the graph elements
    const g = svg.append('g');
    
    // Create simulation with stronger forces for better spread
    let simulation;
    try {
      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width/2, height/2))
        .force('collide', d3.forceCollide().radius(30));
    } catch (simError) {
      console.error("Error creating simulation:", simError);
      // Create simplified simulation
      simulation = d3.forceSimulation(nodes)
        .force('center', d3.forceCenter(width/2, height/2));
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
    const domainGroups = {};
    nodes.forEach(node => {
      const domain = node.domain || 'unknown';
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      domainGroups[domain].push(node);
    });
    
    // Create domain hulls - wrapped in try/catch
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
            console.error("Error with domain hull color:", colorError);
            // Skip this hull
          }
        }
      });
    } catch (hullError) {
      console.error("Error creating domain hulls:", hullError);
      // Continue without hulls
    }
    
    // Generate color scale for domains
    let colorScale;
    try {
      const domains = Object.keys(domainGroups);
      colorScale = d3.scaleOrdinal()
        .domain(domains)
        .range(d3.schemeCategory10);
    } catch (colorScaleError) {
      console.error("Error creating color scale:", colorScaleError);
      // Create simple function that returns fixed colors
      colorScale = () => '#1f77b4';
    }
    
    // Create nodes with interactive features
    const node = g.append('g')
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node');
    
    // Add drag behavior - wrapped in try/catch
    try {
      node.call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    } catch (dragError) {
      console.error("Error setting up drag behavior:", dragError);
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
    
    // Add controls panel
    const controls = d3.select(graphContainer)
      .append('div')
      .attr('class', 'graph-controls')
      .style('position', 'absolute')
      .style('bottom', '10px')
      .style('right', '10px')
      .style('display', 'flex')
      .style('gap', '5px');
    
    // Add zoom control functions with error handling
    try {
      // Zoom controls
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('+')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.scaleBy, 1.3);
          } catch (e) {
            console.warn('Zoom operation failed:', e);
          }
        });
      
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('−')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.scaleBy, 0.7);
          } catch (e) {
            console.warn('Zoom operation failed:', e);
          }
        });
      
      controls.append('button')
        .attr('class', 'btn-icon')
        .html('⟲')
        .on('click', () => { 
          try {
            svg.transition().call(zoom.transform, d3.zoomIdentity);
          } catch (e) {
            console.warn('Zoom reset failed:', e);
          }
        });
    } catch (controlError) {
      console.error("Error setting up controls:", controlError);
      // Continue without controls
    }
    
    // Add legend for domains
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
      console.error("Error creating legend:", legendError);
      // Continue without legend
    }
    
    // Update on tick with error handling
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
      
        // Update domain hulls with safer implementation
        try {
          Object.entries(domainGroups).forEach(([domainName, groupNodes]) => {
            if (groupNodes.length >= 3) {
              const hullPoints = groupNodes.map(d => [d.x, d.y]);
              try {
                const hullPath = safeConvexHull(hullPoints);
                g.select('.domain-hull')
                  .attr('d', hullPath);
              } catch (hullError) {
                console.warn("Error calculating convex hull:", hullError);
                // Skip hull update
              }
            }
          });
        } catch (domainError) {
          console.warn("Error updating domain hulls:", domainError);
          // Skip domain hull updates
        }
      } catch (tickError) {
        console.error("Error in simulation tick:", tickError);
        // Simulation will continue but updates may be incomplete
      }
    });
    
    // Helper functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    function truncateLabel(text, maxLength) {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    function truncateDomain(domain, maxLength) {
      if (!domain) return 'unknown';
      return domain.length > maxLength ? domain.substring(0, maxLength) + '...' : domain;
    }
    
    // Safer implementation of convex hull with fallback
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
        console.warn('Hull calculation error:', e);
        return ''; // Empty path on error
      }
    }
  } catch (error) {
    console.error('Error rendering graph:', error);
    graphContainer.innerHTML = 
      `<div class="error-state">Error rendering graph: ${error.message}</div>`;
  }
}