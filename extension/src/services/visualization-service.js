// src/services/visualization-service.js
import { BaseService } from '../core/base-service.js';
import { LogManager } from '../utils/log-manager.js';
import * as d3 from 'd3';

/**
 * Visualization Service - Handles D3 and other visualization tasks
 */
export class VisualizationService extends BaseService {
  static _DEFAULT_CONFIG = {
    maxChartElements: 1000,
    maxGraphNodes: 500,
    maxGraphLinks: 1000,
    cleanupInterval: 30000, // 30 seconds
    memoryPressureThreshold: 0.8, // 80% memory usage
    d3CheckInterval: 5000, // 5 seconds
  };

  /**
   * Create a new VisualizationService instance
   */
  constructor() {
    super();

    // Initialize logger
    this._logger = new LogManager({
      context: 'visualization-service',
      isBackgroundScript: false,
      storageKey: 'marvin_visualization_logs',
      maxEntries: 1000
    });
    
    // State initialization
    this._d3Available = false;
    this._activeCharts = new WeakMap();
    this._activeGraphs = new WeakMap();
    this._d3CheckInterval = null;
    
    // Bind methods that may be used as callbacks
    this._handleNodeClick = this._handleNodeClick.bind(this);
    this._handleResetView = this._handleResetView.bind(this);
  }
  
  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success state
   */
  async _performInitialization() {
    try {
      this._logger.info('Initializing visualization service');
      
      // Start D3 availability check
      this._startD3Check();
      
      // Start cleanup interval
      this._startCleanupInterval();
      
      this._logger.info('Visualization service initialized successfully');
      return true;
    } catch (error) {
      this._logger.error('Error initializing visualization service:', error);
      throw error;
    }
  }

    /**
   * Handle memory pressure
   * @param {Object} snapshot - Memory snapshot
   */
    async _handleMemoryPressure(snapshot) {
      this._logger.warn('Memory pressure detected in visualization service');
      
      // Let base implementation handle pressure level calculation and cleanup orchestration
      await super._handleMemoryPressure(snapshot);
  }
    
    // Add new method for service-specific cleanup
    async _performServiceSpecificCleanup() {
      // Clean up old visualizations
      await this._cleanupOldVisualizations();
      
      // Clear any cached data
      this._activeCharts = new WeakMap();
      this._activeGraphs = new WeakMap();
    }
  
    /**
     * Start D3 availability check interval
     * @private
     */
    _startD3Check() {
      if (this._d3CheckInterval) return;
      
      this._d3CheckInterval = this._resourceTracker.trackInterval(
        () => this._checkD3Availability(),
        this.constructor._DEFAULT_CONFIG.d3CheckInterval
      );
    }
  
    /**
     * Stop D3 availability check interval
     * @private
     */
    _stopD3Check() {
      if (this._d3CheckInterval) {
        clearInterval(this._d3CheckInterval);
        this._d3CheckInterval = null;
      }
    }
  
    /**
     * Check if D3 is available
     * @private
     */
    _checkD3Availability() {
      try {
        this._d3Available = typeof d3 !== 'undefined';
        if (!this._d3Available && typeof window !== 'undefined' && window.d3) {
          this._d3Available = true;
        }
        this._logger.debug(`D3 availability: ${this._d3Available}`);
      } catch (error) {
        this._logger.warn('Error checking D3 availability:', error);
        this._d3Available = false;
      }
    }
  
    /**
     * Start cleanup interval
     * @private
     */
    _startCleanupInterval() {
      this._resourceTracker.trackInterval(
        () => this._cleanupOldVisualizations(),
        this.constructor._DEFAULT_CONFIG.cleanupInterval
      );
    }
  
    /**
     * Stop cleanup interval
     * @private
     */
    _stopCleanupInterval() {
      // Intervals are automatically cleaned up by resource tracker
    }
  
    /**
     * Cleanup old visualizations
     * @private
     */
    async _cleanupOldVisualizations() {
      try {
        // Clean up old charts
        for (const [container, chart] of this._activeCharts) {
          if (!document.contains(container)) {
            this._cleanupContainer(container);
            this._activeCharts.delete(container);
          }
        }
        
        // Clean up old graphs
        for (const [container, graph] of this._activeGraphs) {
          if (!document.contains(container)) {
            this._cleanupContainer(container);
            this._activeGraphs.delete(container);
          }
        }
      } catch (error) {
        this._logger.error('Error cleaning up old visualizations:', error);
      }
    }
  
    /**
     * Cleanup all visualizations
     * @private
     */
    async _cleanupAllVisualizations() {
      try {
        // Clean up all charts
        for (const [container] of this._activeCharts) {
          this._cleanupContainer(container);
        }
        this._activeCharts = new WeakMap();
        
        // Clean up all graphs
        for (const [container] of this._activeGraphs) {
          this._cleanupContainer(container);
        }
        this._activeGraphs = new WeakMap();
      } catch (error) {
        this._logger.error('Error cleaning up all visualizations:', error);
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
    if (!this._initialized) {
      try {
        await this.initialize();
      } catch (error) {
        this._logger.error('Error initializing visualization service:', error);
        return false;
      }
    }
    
    if (!containerId) {
      this._logger.warn('No container ID provided for bar chart');
      return false;
    }
    
    if (!data || !Array.isArray(data)) {
      this._logger.warn('Invalid data provided for bar chart');
      return false;
    }
    
    this._logger.debug(`Creating bar chart in ${containerId}`);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        this._logger.warn(`Container element not found: ${containerId}`);
        return false;
      }
      
      // Track the container element
      this._resourceTracker.trackDOMElement(container);
      
      // If D3 is not available, create a simple HTML-based chart
      if (!this._d3Available) {
        return this._createFallbackBarChart(container, data, options);
      }
      
      // D3 is available, create proper chart
      try {
        // D3 visualization code would go here
        // Since we're moving away from direct D3 dependency, this is left as a stub
        this._logger.debug('D3 visualization not implemented yet');
        return this._createFallbackBarChart(container, data, options);
      } catch (d3Error) {
        this._logger.error('Error creating D3 visualization:', d3Error);
        return this._createFallbackBarChart(container, data, options);
      }
    } catch (error) {
      this._logger.error('Error creating bar chart:', error);
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
      this._logger.error('Container is null in _createFallbackBarChart');
      return false;
    }
    
    this._logger.debug('Creating fallback bar chart');
    
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
      
      // Track the chart container
      this._resourceTracker.trackDOMElement(chartContainer);
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
        
        // Track the placeholder
        this._resourceTracker.trackDOMElement(placeholder);
        elements.push(placeholder);
        
        chartContainer.appendChild(placeholder);
        container.appendChild(chartContainer);
        
        // Store in active charts
        this._activeCharts.set(container, { elements, type: 'bar' });
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
        
        // Track the bar container
        this._resourceTracker.trackDOMElement(barContainer);
        elements.push(barContainer);
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = item.label || '';
        label.style.width = '100px';
        label.style.textAlign = 'right';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        
        // Track the label
        this._resourceTracker.trackDOMElement(label);
        elements.push(label);
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'bar-wrapper';
        barWrapper.style.flex = '1';
        barWrapper.style.height = '70%';
        barWrapper.style.backgroundColor = '#f0f0f0';
        barWrapper.style.borderRadius = '3px';
        
        // Track the bar wrapper
        this._resourceTracker.trackDOMElement(barWrapper);
        elements.push(barWrapper);
        
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = '100%';
        bar.style.width = `${(item.value / maxValue) * 100}%`;
        bar.style.backgroundColor = item.color || '#4285f4';
        bar.style.borderRadius = '3px';
        bar.style.transition = 'width 0.5s ease-in-out';
        
        // Track the bar
        this._resourceTracker.trackDOMElement(bar);
        elements.push(bar);
        
        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = item.value || '0';
        value.style.width = '50px';
        value.style.paddingLeft = '10px';
        
        // Track the value
        this._resourceTracker.trackDOMElement(value);
        elements.push(value);
        
        barWrapper.appendChild(bar);
        barContainer.appendChild(label);
        barContainer.appendChild(barWrapper);
        barContainer.appendChild(value);
        chartContainer.appendChild(barContainer);
      });
      
      container.appendChild(chartContainer);
      
      // Store in active charts
      this._activeCharts.set(container, { elements, type: 'bar' });
      
      return true;
    } catch (error) {
      this._logger.error('Error creating fallback bar chart:', error);
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
      throw error;
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
  async _performCleanup() {
    this._logger.info('Cleaning up visualization service');
    
    try {
      // Stop intervals
      this._stopD3Check();
      this._stopCleanupInterval();
      
      // Clean up all active visualizations
      await this._cleanupAllVisualizations();

      // Clean up D3 resources
      if (this._d3Available) {
        try {
          // Clean up any D3 selections
          d3.selectAll('.d3-visualization').remove();
        } catch (error) {
          this._logger.error('Error cleaning up D3 resources:', error);
        }
      }
      
      // Clear bound methods
      this._handleNodeClick = null;
      this._handleResetView = null;
      
      // Clear D3 reference
      this._d3Available = false;
      
      // Clear maps
      this._activeCharts = new WeakMap();
      this._activeGraphs = new WeakMap();
    } catch (error) {
      this._logger.error('Error cleaning up visualization service:', error);
      throw error;
    }
  }
}