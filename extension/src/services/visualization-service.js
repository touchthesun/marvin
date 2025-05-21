// src/services/visualization-service.js
import { LogManager } from '../utils/log-manager.js';

/**
 * Visualization Service - Handles D3 and other visualization tasks
 */
export class VisualizationService {
  /**
   * Create a new VisualizationService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    this.d3Available = false;
    this.logger = null;
    
    // Bind methods that may be used as callbacks
    this._handleNodeClick = this._handleNodeClick.bind(this);
    this._handleResetView = this._handleResetView.bind(this);
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Create logger directly
      this.logger = new LogManager({
        context: 'visualization-service',
        isBackgroundScript: false,
        storageKey: 'marvin_visualization_logs',
        maxEntries: 1000
      });
      
      this.logger.info('Initializing visualization service');
      
      // Try to detect if D3 is available
      try {
        this.d3Available = typeof d3 !== 'undefined';
        this.logger.debug(`D3 availability: ${this.d3Available}`);
      } catch (e) {
        this.logger.warn('D3 not available:', e.message);
        this.d3Available = false;
      }
      
      // If D3 is not available, try to detect it in window
      if (!this.d3Available) {
        try {
          // For safety, we'll check if window.d3 is already available
          if (typeof window !== 'undefined' && window.d3) {
            this.d3Available = true;
            this.logger.debug('D3 found in global scope');
          } else {
            this.logger.warn('D3 not available and could not be loaded');
          }
        } catch (loadError) {
          this.logger.error('Error loading D3:', loadError);
        }
      }
      
      this.initialized = true;
      this.logger.info('Visualization service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing visualization service:', error);
      } else {
        console.error('Error initializing visualization service:', error);
      }
      return false;
    }
  }
  
  /**
   * Create a simple bar chart visualization
   * @param {string} containerId - ID of the container element
   * @param {Array} data - Data to visualize
   * @param {object} options - Visualization options
   * @returns {Promise<boolean>} - Whether visualization was successful
   */
  async createBarChart(containerId, data, options = {}) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize visualization service');
        }
      } catch (error) {
        this.logger?.error('Error initializing visualization service:', error);
        return false;
      }
    }
    
    if (!containerId) {
      this.logger.warn('No container ID provided for bar chart');
      return false;
    }
    
    if (!data || !Array.isArray(data)) {
      this.logger.warn('Invalid data provided for bar chart');
      return false;
    }
    
    this.logger.debug(`Creating bar chart in ${containerId}`);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        this.logger.warn(`Container element not found: ${containerId}`);
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
        this.logger.debug('D3 visualization not implemented yet');
        return this._createFallbackBarChart(container, data, options);
      } catch (d3Error) {
        this.logger.error('Error creating D3 visualization:', d3Error);
        return this._createFallbackBarChart(container, data, options);
      }
    } catch (error) {
      this.logger.error('Error creating bar chart:', error);
      return false;
    }
  }
  
  /**
   * Create a simple knowledge graph visualization
   * @param {string} containerId - ID of the container element
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Graph links
   * @param {object} options - Visualization options
   * @returns {Promise<boolean>} - Whether visualization was successful
   */
  async createKnowledgeGraph(containerId, nodes = [], links = [], options = {}) {
    if (!this.initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize visualization service');
        }
      } catch (error) {
        this.logger?.error('Error initializing visualization service:', error);
        return false;
      }
    }
    
    if (!containerId) {
      this.logger.warn('No container ID provided for knowledge graph');
      return false;
    }
    
    this.logger.debug(`Creating knowledge graph in ${containerId}`);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        this.logger.warn(`Container element not found: ${containerId}`);
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
        this.logger.debug('D3 graph visualization not implemented yet');
        return this._createFallbackGraph(container, nodes, links, options);
      } catch (d3Error) {
        this.logger.error('Error creating D3 graph visualization:', d3Error);
        return this._createFallbackGraph(container, nodes, links, options);
      }
    } catch (error) {
      this.logger.error('Error creating knowledge graph:', error);
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
    if (!container) {
      this.logger.error('Container is null in _createFallbackBarChart');
      return false;
    }
    
    this.logger.debug('Creating fallback bar chart');
    
    try {
      // Track elements we create for possible cleanup later
      const elements = [];
      
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
      elements.push(chartContainer);
      
      // Safety check for empty data
      if (!data || data.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-chart-placeholder';
        placeholder.textContent = 'No data available';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.height = '100%';
        placeholder.style.color = '#999';
        elements.push(placeholder);
        
        chartContainer.appendChild(placeholder);
        container.appendChild(chartContainer);
        return true;
      }
      
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
        elements.push(barContainer);
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = item.label || '';
        label.style.width = '100px';
        label.style.textAlign = 'right';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        elements.push(label);
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'bar-wrapper';
        barWrapper.style.flex = '1';
        barWrapper.style.height = '70%';
        barWrapper.style.backgroundColor = '#f0f0f0';
        barWrapper.style.borderRadius = '3px';
        elements.push(barWrapper);
        
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = '100%';
        bar.style.width = `${(item.value / maxValue) * 100}%`;
        bar.style.backgroundColor = item.color || '#4285f4';
        bar.style.borderRadius = '3px';
        bar.style.transition = 'width 0.5s ease-in-out';
        elements.push(bar);
        
        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = item.value || '0';
        value.style.width = '50px';
        value.style.paddingLeft = '10px';
        elements.push(value);
        
        barWrapper.appendChild(bar);
        barContainer.appendChild(label);
        barContainer.appendChild(barWrapper);
        barContainer.appendChild(value);
        chartContainer.appendChild(barContainer);
      });
      
      container.appendChild(chartContainer);
      
      // Store elements reference for potential cleanup
      container._chartElements = elements;
      
      return true;
    } catch (error) {
      this.logger.error('Error creating fallback bar chart:', error);
      return false;
    }
  }
  
  /**
   * Handle node click event for graph visualization
   * @private
   * @param {Event} event - Click event
   * @param {Object} node - Node data
   * @param {Array} links - Graph links
   */
  _handleNodeClick(event, node, links) {
    try {
      if (!node || !links) return;
      
      const nodeElement = event.currentTarget;
      
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
    } catch (error) {
      this.logger?.error('Error handling node click:', error);
    }
  }
  
  /**
   * Handle reset view button click
   * @private
   */
  _handleResetView() {
    try {
      document.querySelectorAll('.graph-node').forEach(el => {
        el.style.opacity = '1';
        el.style.boxShadow = 'none';
      });
    } catch (error) {
      this.logger?.error('Error handling reset view:', error);
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
    if (!container) {
      this.logger.error('Container is null in _createFallbackGraph');
      return false;
    }
    
    this.logger.debug('Creating fallback graph visualization');
    
    // Track elements and event listeners we create for possible cleanup
    const elements = [];
    const eventListeners = [];
    
    try {
      // Clear container
      container.innerHTML = '';
      
      // If no data, show placeholder
      if (!nodes || nodes.length === 0) {
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
        elements.push(placeholder);
        
        const icon = document.createElement('div');
        icon.innerHTML = '📊';
        icon.style.fontSize = '32px';
        icon.style.marginBottom = '10px';
        elements.push(icon);
        
        const text = document.createElement('p');
        text.textContent = 'No data available for visualization';
        text.style.color = '#666';
        elements.push(text);
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        
        // Store elements reference for potential cleanup
        container._graphElements = elements;
        container._graphEventListeners = eventListeners;
        
        return true;
      }
      
      // Create a simple node list visualization
      const graphContainer = document.createElement('div');
      graphContainer.className = 'fallback-graph';
      graphContainer.style.display = 'flex';
      graphContainer.style.flexWrap = 'wrap';
      graphContainer.style.gap = '10px';
      graphContainer.style.padding = '10px';
      elements.push(graphContainer);
      
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
        elements.push(nodeElement);
        
        // Use bound method that properly accesses this.logger
        const clickHandler = (e) => this._handleNodeClick(e, node, links);
        nodeElement.addEventListener('click', clickHandler);
        eventListeners.push({ element: nodeElement, type: 'click', handler: clickHandler });
        
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
      elements.push(resetButton);
      
      resetButton.addEventListener('click', this._handleResetView);
      eventListeners.push({ element: resetButton, type: 'click', handler: this._handleResetView });
      
      container.appendChild(resetButton);
      
      // Store elements and listeners reference for potential cleanup
      container._graphElements = elements;
      container._graphEventListeners = eventListeners;
      
      return true;
    } catch (error) {
      this.logger.error('Error creating fallback graph:', error);
      
      // Clean up any event listeners that were added before the error
      eventListeners.forEach(({ element, type, handler }) => {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(type, handler);
        }
      });
      
      return false;
    }
  }
  
  /**
   * Cleanup chart elements and event listeners in a container
   * @private
   * @param {HTMLElement} container - Container element
   */
  _cleanupContainer(container) {
    if (!container) return;
    
    try {
      // Clean up event listeners
      if (container._graphEventListeners) {
        container._graphEventListeners.forEach(({ element, type, handler }) => {
          if (element && typeof element.removeEventListener === 'function') {
            element.removeEventListener(type, handler);
          }
        });
        container._graphEventListeners = null;
      }
      
      // Clean DOM reference (elements will be garbage collected)
      container._graphElements = null;
      container._chartElements = null;
      
      // Clear container
      container.innerHTML = '';
    } catch (error) {
      this.logger?.error('Error cleaning up container:', error);
    }
  }
  
  /**
   * Cleanup service resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up visualization service');
    
    try {
      // Clean up any charts that might still be in the DOM
      document.querySelectorAll('.fallback-bar-chart, .fallback-graph').forEach(container => {
        this._cleanupContainer(container.parentElement);
      });
    } catch (error) {
      this.logger.warn('Error cleaning up visualizations:', error);
    }
    
    this.initialized = false;
    this.logger.debug('Visualization service cleanup completed');
  }
}