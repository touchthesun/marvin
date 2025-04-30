// dashboard/js/services/visualization-service.js
// Service for handling visualizations and D3-related functionality

import { LogManager } from '../../../shared/utils/log-manager.js';

// Initialize logger
const logger = new LogManager({
  isBackgroundScript: false,
  context: 'visualization-service',
  storageKey: 'marvin_visualization_logs',
  maxEntries: 1000
});

/**
 * Visualization Service - Handles D3 and other visualization tasks
 */
class VisualizationService {
  constructor() {
    this.initialized = false;
    this.d3Available = false;
    
    // Try to detect if D3 is available
    try {
      this.d3Available = typeof d3 !== 'undefined';
      logger.debug(`D3 availability: ${this.d3Available}`);
    } catch (e) {
      logger.warn('D3 not available:', e.message);
      this.d3Available = false;
    }
  }
  
  /**
   * Initialize the visualization service
   */
  async initialize() {
    if (this.initialized) return;
    
    logger.debug('Initializing visualization service');
    
    try {
      // If D3 is not available, try to dynamically load it
      if (!this.d3Available) {
        try {
          // For safety, we'll check if window.d3 is already available
          if (typeof window !== 'undefined' && window.d3) {
            this.d3Available = true;
            logger.debug('D3 found in global scope');
          } else {
            logger.warn('D3 not available and could not be loaded');
          }
        } catch (loadError) {
          logger.error('Error loading D3:', loadError);
        }
      }
      
      this.initialized = true;
      logger.debug('Visualization service initialized successfully');
    } catch (error) {
      logger.error('Error initializing visualization service:', error);
      throw error;
    }
  }
  
  /**
   * Create a simple bar chart visualization
   * @param {string} containerId - ID of the container element
   * @param {Array} data - Data to visualize
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  createBarChart(containerId, data, options = {}) {
    logger.debug(`Creating bar chart in ${containerId}`);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        logger.warn(`Container element not found: ${containerId}`);
        return false;
      }
      
      // If D3 is not available, create a simple HTML-based chart
      if (!this.d3Available) {
        return this._createFallbackBarChart(container, data, options);
      }
      
      // D3 is available, create proper chart
      try {
        // D3 visualization code would go here
        // Since we're moving away from direct D3 dependency, this is left as a stub
        logger.debug('D3 visualization not implemented yet');
        return this._createFallbackBarChart(container, data, options);
      } catch (d3Error) {
        logger.error('Error creating D3 visualization:', d3Error);
        return this._createFallbackBarChart(container, data, options);
      }
    } catch (error) {
      logger.error('Error creating bar chart:', error);
      return false;
    }
  }
  
  /**
   * Create a simple knowledge graph visualization
   * @param {string} containerId - ID of the container element
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Graph links
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  createKnowledgeGraph(containerId, nodes = [], links = [], options = {}) {
    logger.debug(`Creating knowledge graph in ${containerId}`);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        logger.warn(`Container element not found: ${containerId}`);
        return false;
      }
      
      // If D3 is not available, create a simple HTML-based graph
      if (!this.d3Available) {
        return this._createFallbackGraph(container, nodes, links, options);
      }
      
      // D3 is available, create proper graph
      try {
        // D3 visualization code would go here
        // Since we're moving away from direct D3 dependency, this is left as a stub
        logger.debug('D3 graph visualization not implemented yet');
        return this._createFallbackGraph(container, nodes, links, options);
      } catch (d3Error) {
        logger.error('Error creating D3 graph visualization:', d3Error);
        return this._createFallbackGraph(container, nodes, links, options);
      }
    } catch (error) {
      logger.error('Error creating knowledge graph:', error);
      return false;
    }
  }
  
  /**
   * Create a fallback bar chart using basic HTML/CSS
   * @private
   * @param {HTMLElement} container - Container element
   * @param {Array} data - Data to visualize
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  _createFallbackBarChart(container, data, options = {}) {
    logger.debug('Creating fallback bar chart');
    
    try {
      // Clear container
      container.innerHTML = '';
      
      // Create chart container
      const chartContainer = document.createElement('div');
      chartContainer.className = 'fallback-bar-chart';
      chartContainer.style.display = 'flex';
      chartContainer.style.flexDirection = 'column';
      chartContainer.style.height = options.height || '200px';
      chartContainer.style.width = options.width || '100%';
      chartContainer.style.gap = '5px';
      
      // Find maximum value for scaling
      const maxValue = Math.max(...data.map(d => typeof d.value === 'number' ? d.value : 0));
      
      // Create bars
      data.forEach(item => {
        const barContainer = document.createElement('div');
        barContainer.className = 'bar-container';
        barContainer.style.display = 'flex';
        barContainer.style.alignItems = 'center';
        barContainer.style.gap = '10px';
        barContainer.style.height = `${100 / data.length}%`;
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = item.label || '';
        label.style.width = '100px';
        label.style.textAlign = 'right';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'bar-wrapper';
        barWrapper.style.flex = '1';
        barWrapper.style.height = '70%';
        barWrapper.style.backgroundColor = '#f0f0f0';
        barWrapper.style.borderRadius = '3px';
        
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = '100%';
        bar.style.width = `${(item.value / maxValue) * 100}%`;
        bar.style.backgroundColor = item.color || '#4285f4';
        bar.style.borderRadius = '3px';
        bar.style.transition = 'width 0.5s ease-in-out';
        
        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = item.value || '0';
        value.style.width = '50px';
        value.style.paddingLeft = '10px';
        
        barWrapper.appendChild(bar);
        barContainer.appendChild(label);
        barContainer.appendChild(barWrapper);
        barContainer.appendChild(value);
        chartContainer.appendChild(barContainer);
      });
      
      container.appendChild(chartContainer);
      return true;
    } catch (error) {
      logger.error('Error creating fallback bar chart:', error);
      return false;
    }
  }
  
  /**
   * Create a fallback graph visualization using basic HTML/CSS
   * @private
   * @param {HTMLElement} container - Container element
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Graph links
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  _createFallbackGraph(container, nodes = [], links = [], options = {}) {
    logger.debug('Creating fallback graph visualization');
    
    try {
      // Clear container
      container.innerHTML = '';
      
      // If no data, show placeholder
      if (nodes.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'graph-placeholder';
        placeholder.style.display = 'flex';
        placeholder.style.flexDirection = 'column';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.height = '100%';
        placeholder.style.padding = '20px';
        placeholder.style.backgroundColor = '#f8f9fa';
        placeholder.style.borderRadius = '5px';
        placeholder.style.border = '1px dashed #ccc';
        
        const icon = document.createElement('div');
        icon.innerHTML = '📊';
        icon.style.fontSize = '32px';
        icon.style.marginBottom = '10px';
        
        const text = document.createElement('p');
        text.textContent = 'No data available for visualization';
        text.style.color = '#666';
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        return true;
      }
      
      // Create a simple node list visualization
      const graphContainer = document.createElement('div');
      graphContainer.className = 'fallback-graph';
      graphContainer.style.display = 'flex';
      graphContainer.style.flexWrap = 'wrap';
      graphContainer.style.gap = '10px';
      graphContainer.style.padding = '10px';
      
      // Create nodes
      nodes.forEach(node => {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'graph-node';
        nodeElement.dataset.id = node.id;
        nodeElement.textContent = node.label || node.id;
        nodeElement.style.padding = '8px 15px';
        nodeElement.style.backgroundColor = node.color || '#4285f4';
        nodeElement.style.color = '#fff';
        nodeElement.style.borderRadius = '20px';
        nodeElement.style.fontSize = '14px';
        nodeElement.style.cursor = 'pointer';
        
        nodeElement.addEventListener('click', () => {
          // Handle node click - highlight connected nodes
          const connectedLinks = links.filter(link => 
            link.source === node.id || link.target === node.id);
          
          const connectedNodeIds = new Set();
          connectedLinks.forEach(link => {
            connectedNodeIds.add(link.source);
            connectedNodeIds.add(link.target);
          });
          
          // Reset all nodes
          document.querySelectorAll('.graph-node').forEach(el => {
            el.style.opacity = '0.5';
          });
          
          // Highlight connected nodes
          connectedNodeIds.forEach(id => {
            const el = document.querySelector(`.graph-node[data-id="${id}"]`);
            if (el) el.style.opacity = '1';
          });
          
          // Always highlight the clicked node
          nodeElement.style.opacity = '1';
          nodeElement.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
        });
        
        graphContainer.appendChild(nodeElement);
      });
      
      container.appendChild(graphContainer);
      
      // Add reset button
      const resetButton = document.createElement('button');
      resetButton.className = 'reset-graph-btn';
      resetButton.textContent = 'Reset View';
      resetButton.style.marginTop = '10px';
      resetButton.style.padding = '5px 10px';
      resetButton.style.backgroundColor = '#f5f5f5';
      resetButton.style.border = '1px solid #ccc';
      resetButton.style.borderRadius = '3px';
      resetButton.style.cursor = 'pointer';
      
      resetButton.addEventListener('click', () => {
        document.querySelectorAll('.graph-node').forEach(el => {
          el.style.opacity = '1';
          el.style.boxShadow = 'none';
        });
      });
      
      container.appendChild(resetButton);
      return true;
    } catch (error) {
      logger.error('Error creating fallback graph:', error);
      return false;
    }
  }
}

// Create singleton instance
const visualizationService = new VisualizationService();

// Export the service
export { visualizationService };
