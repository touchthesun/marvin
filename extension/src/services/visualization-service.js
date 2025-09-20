// src/services/visualization-service.js
import { BaseService } from '../services/base-service.js';
import { LogManager } from '../utils/log-manager.js';

/**
 * Visualization Service - Handles graph visualization using neo4j-viz
 * This service now includes integrated neo4j-viz functionality for graph visualizations
 */
export class VisualizationService extends BaseService {
  static _DEFAULT_CONFIG = {
    maxChartElements: 1000,
    maxGraphNodes: 500,
    maxGraphLinks: 1000,
    cleanupInterval: 30000, // 30 seconds
    memoryPressureThreshold: 0.8, // 80% memory usage
  };

  /**
   * Create a new VisualizationService instance
   * @param {Object} options - Service options including container
   */
  constructor(options = {}) {
    super(options);

    // Initialize logger
    this._logger = new LogManager({
      context: 'visualization-service',
      isBackgroundScript: false,
      storageKey: 'marvin_visualization_logs',
      maxEntries: 1000
    });
    
    // State initialization
    this._activeCharts = new WeakMap();
    this._activeGraphs = new WeakMap();
    
    // Neo4j-viz specific properties
    this._apiService = null;
    this._graphService = null;
    this._activeVisualizations = new WeakMap();
  }
  
  /**
   * Initialize the service with graceful error handling
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this._initialized) {
      return true;
    }
    
    try {
      const result = await super.initialize();
      return result;
    } catch (error) {
      this._logger?.error('Visualization service initialization failed:', error);
      this._initialized = false;
      return false;
    }
  }

  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success state
   */
  async _performInitialization() {
    try {
      this._logger.info('Initializing visualization service with neo4j-viz integration');
      console.log('🔍 DEBUG: VisualizationService._performInitialization starting...');
      
      // Initialize neo4j-viz dependencies
      console.log('🔍 DEBUG: Initializing neo4j-viz dependencies...');
      await this._initializeNeo4jVizDependencies();
      console.log('🔍 DEBUG: Neo4j-viz dependencies initialized successfully');
      
      // Start cleanup interval
      console.log('🔍 DEBUG: Starting cleanup interval...');
      this._startCleanupInterval();
      console.log('🔍 DEBUG: Cleanup interval started');
      
      this._logger.info('Visualization service initialized successfully');
      console.log('🔍 DEBUG: VisualizationService._performInitialization completed successfully');
      return true;
    } catch (error) {
      this._logger.error('Error initializing visualization service:', error);
      console.error('🔍 DEBUG: Error in VisualizationService._performInitialization:', error);
      throw error;
    }
  }

  /**
   * Initialize neo4j-viz dependencies
   * @private
   */
  async _initializeNeo4jVizDependencies() {
    try {
      console.log('🔍 DEBUG: _initializeNeo4jVizDependencies starting...');
      
      // Get API service for backend communication
      console.log('🔍 DEBUG: Getting API service...');
      this._apiService = await this._getService('apiService');
      console.log('🔍 DEBUG: API service result:', !!this._apiService);
      if (!this._apiService) {
        throw new Error('API service not available');
      }

      // Get graph service for data access
      console.log('🔍 DEBUG: Getting graph service...');
      this._graphService = await this._getService('graphService');
      console.log('🔍 DEBUG: Graph service result:', !!this._graphService);
      if (!this._graphService) {
        this._logger.warn('Graph service not available, using API fallback');
      }

      this._logger.debug('Neo4j-viz dependencies initialized');
      console.log('🔍 DEBUG: _initializeNeo4jVizDependencies completed successfully');
    } catch (error) {
      this._logger.error('Error initializing neo4j-viz dependencies:', error);
      console.error('🔍 DEBUG: Error in _initializeNeo4jVizDependencies:', error);
      throw error;
    }
  }

  /**
   * Get a service from the container
   * @private
   * @param {string} serviceName - Name of the service
   * @returns {Promise<Object>} Service instance
   */
  async _getService(serviceName) {
    try {
      console.log(`🔍 DEBUG: _getService called for: ${serviceName}`);
      console.log(`🔍 DEBUG: Container available:`, !!this._container);
      
      if (!this._container) {
        this._logger.warn(`Container not available for service: ${serviceName}`);
        console.log(`🔍 DEBUG: Container not available for service: ${serviceName}`);
        return null;
      }
      
      console.log(`🔍 DEBUG: Getting service: ${serviceName}`);
      const service = await this._container.getService(serviceName);
      console.log(`🔍 DEBUG: Service retrieved:`, !!service);
      
      if (!service) {
        this._logger.warn(`Service not found in container: ${serviceName}`);
        console.log(`🔍 DEBUG: Service not found in container: ${serviceName}`);
        return null;
      }
      
      this._logger.debug(`Successfully resolved service: ${serviceName}`);
      console.log(`🔍 DEBUG: Successfully resolved service: ${serviceName}`);
      return service;
    } catch (error) {
      // Handle service not found gracefully - this is expected for optional services
      if (error.message && error.message.includes('Service not found')) {
        this._logger.warn(`Service not available: ${serviceName} - ${error.message}`);
        console.log(`🔍 DEBUG: Service not available (expected): ${serviceName} - ${error.message}`);
        return null;
      }
      
      // For other errors, log and return null
      this._logger.error(`Error getting service ${serviceName}:`, error);
      console.error(`🔍 DEBUG: Error getting service ${serviceName}:`, error);
      return null;
    }
  }

  /**
   * Handle memory pressure
   * @param {Object} snapshot - Memory snapshot
   */
  async _handleMemoryPressure(snapshot) {
    this._logger.warn('Memory pressure detected in visualization service');
    
    // Let base implementation handle pressure level calculation and cleanup orchestration
    if (typeof super._handleMemoryPressure === 'function') {
      await super._handleMemoryPressure(snapshot);
    }
  }
    
  /**
   * Perform service-specific cleanup
   * @private
   */
  async _performServiceSpecificCleanup() {
    // Clean up old visualizations
    await this._cleanupOldVisualizations();
    
    // Clear any cached data
    this._activeCharts = new WeakMap();
    this._activeGraphs = new WeakMap();
    
    // Clean up active visualizations
    this._activeVisualizations = new WeakMap();
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
   * Cleanup old visualizations
   * @private
   */
  async _cleanupOldVisualizations() {
    try {
      this._logger.debug('Cleaning up old visualizations');
      
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
      
      this._logger.debug(`Active visualizations after cleanup: charts=${Array.from(this._activeCharts.entries()).length}, graphs=${Array.from(this._activeGraphs.entries()).length}`);
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
      // Use integrated neo4j-viz functionality for bar charts
      return this._createFallbackBarChart(containerId, data, options);
    } catch (error) {
      this._logger.error('Error creating bar chart:', error);
      return false;
    }
  }
  
  /**
   * Create a simple knowledge graph visualization using neo4j-viz
   * @param {string} containerId - ID of the container element
   * @param {Array} nodes - Graph nodes (optional, will fetch if not provided)
   * @param {Array} links - Graph links (optional, will fetch if not provided)
   * @param {object} options - Visualization options
   * @returns {Promise<boolean>} - Whether visualization was successful
   */
  async createKnowledgeGraph(containerId, nodes = null, links = null, options = {}) {
    if (!this._initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize visualization service');
        }
      } catch (error) {
        this._logger?.error('Error initializing visualization service:', error);
        return false;
      }
    }
    
    if (!containerId) {
      this._logger.warn('No container ID provided for knowledge graph');
      return false;
    }
    
    this._logger.debug(`Creating knowledge graph in ${containerId}`);
    
    try {
      // Use integrated neo4j-viz functionality
      console.log('🔍 DEBUG: VisualizationService.createKnowledgeGraph - using integrated neo4j-viz functionality');
      return await this._createNeo4jVizKnowledgeGraph(containerId, nodes, links, options);
    } catch (error) {
      console.error('🔍 DEBUG: Error in VisualizationService.createKnowledgeGraph:', error);
      this._logger.error('Error creating knowledge graph:', error);
      return false;
    }
  }

  /**
   * Create a custom neo4j-viz visualization with specific query
   * @param {string} containerId - ID of the container element
   * @param {string} query - Cypher query to execute
   * @param {object} options - Visualization options
   * @returns {Promise<boolean>} - Whether visualization was successful
   */
  async createCustomVisualization(containerId, query, options = {}) {
    if (!this._initialized) {
      try {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Failed to initialize visualization service');
        }
      } catch (error) {
        this._logger?.error('Error initializing visualization service:', error);
        return false;
      }
    }
    
    if (!containerId) {
      this._logger.warn('No container ID provided for custom visualization');
      return false;
    }
    
    if (!query) {
      this._logger.warn('No query provided for custom visualization');
      return false;
    }
    
    this._logger.debug(`Creating custom visualization in ${containerId}`);
    
    try {
      // Use integrated neo4j-viz functionality for custom visualizations
      return this._createFallbackGraph(containerId, [], [], options);
    } catch (error) {
      this._logger.error('Error creating custom visualization:', error);
      return false;
    }
  }
  
  /**
   * Create a fallback bar chart using basic HTML/CSS
   * @private
   * @param {string} containerId - ID of the container element
   * @param {Array} data - Data to visualize
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  _createFallbackBarChart(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
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
      this._logger?.error('Error handling node click:', error);
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
      this._logger?.error('Error handling reset view:', error);
    }
  }
  
  /**
   * Create a fallback graph visualization using basic HTML/CSS
   * @private
   * @param {string} containerId - ID of the container element
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Graph links
   * @param {object} options - Visualization options
   * @returns {boolean} - Whether visualization was successful
   */
  _createFallbackGraph(containerId, nodes = [], links = [], options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      this._logger.error('Container is null in _createFallbackGraph');
      return false;
    }
    
    this._logger.debug('Creating fallback graph visualization');
    
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
        
        // Use arrow function to preserve 'this' context
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
      
      // Use arrow function to preserve 'this' context
      const resetHandler = () => this._handleResetView();
      resetButton.addEventListener('click', resetHandler);
      eventListeners.push({ element: resetButton, type: 'click', handler: resetHandler });
      
      container.appendChild(resetButton);
      
      // Store elements and listeners reference for potential cleanup
      container._graphElements = elements;
      container._graphEventListeners = eventListeners;
      
      return true;
    } catch (error) {
      this._logger.error('Error creating fallback graph:', error);
      
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
      this._logger?.error('Error cleaning up container:', error);
    }
  }
  
  /**
   * Cleanup service resources
   * @returns {Promise<void>}
   */
  async _performCleanup() {
    this._logger.info('Cleaning up visualization service');
    
    try {
      // Clean up all active visualizations
      await this._cleanupAllVisualizations();

      // Clean up active visualizations
      this._activeVisualizations = new WeakMap();
      
      // Clear maps
      this._activeCharts = new WeakMap();
      this._activeGraphs = new WeakMap();
    } catch (error) {
      this._logger.error('Error cleaning up visualization service:', error);
      throw error;
    }
  }

  // ============================================================================
  // Neo4j-viz Integration Methods (merged from Neo4jVizService)
  // ============================================================================

  /**
   * Create a neo4j-viz knowledge graph visualization
   * @private
   * @param {string} containerId - ID of the container element
   * @param {Array} nodes - Graph nodes (optional, will fetch if not provided)
   * @param {Array} links - Graph links (optional, will fetch if not provided)
   * @param {object} options - Visualization options
   * @returns {Promise<boolean>} - Whether visualization was successful
   */
  async _createNeo4jVizKnowledgeGraph(containerId, nodes = null, links = null, options = {}) {
    console.log('🔍 DEBUG: _createNeo4jVizKnowledgeGraph called with:', { containerId, nodes, links, options });
    
    if (!containerId) {
      this._logger.warn('No container ID provided for knowledge graph');
      return false;
    }
    
    this._logger.debug(`Creating Neo4j-viz knowledge graph in ${containerId}`);
    console.log('🔍 DEBUG: Creating Neo4j-viz knowledge graph in', containerId);
    
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        this._logger.warn(`Container element not found: ${containerId}`);
        return false;
      }
      
      // Track this visualization
      this._activeVisualizations.set(container, {
        type: 'neo4j-viz-graph',
        created: Date.now(),
        options: options
      });
      
      // Create the visualization
      const success = await this._createNeo4jVizVisualization(container, { nodes, links }, options);
      
      if (success) {
        this._logger.debug('Neo4j-viz knowledge graph created successfully');
        return true;
      } else {
        this._logger.warn('Failed to create neo4j-viz knowledge graph, using fallback');
        return this._createFallbackGraph(containerId, nodes, links, options);
      }
    } catch (error) {
      this._logger.error('Error creating neo4j-viz knowledge graph:', error);
      return this._createFallbackGraph(containerId, nodes, links, options);
    }
  }

  /**
   * Get neo4j-viz data from the backend
   * @private
   * @param {Object} options - Visualization options
   * @returns {Promise<Object>} Graph data in neo4j-viz format
   */
  async _getNeo4jVizData(options = {}) {
    try {
      this._logger.debug('Getting neo4j-viz data from backend');
      console.log('🔍 DEBUG: _getNeo4jVizData called with options:', options);
      
      if (!this._apiService) {
        throw new Error('API service not available');
      }
      
      console.log('🔍 DEBUG: API service available:', !!this._apiService);
      
      // Use the GET endpoint to get graph data
      const params = {
        limit: options.limit || 100,
        include_empty: options.includeEmpty || false,
        layout: options.layout || 'force-directed',
        renderer: options.renderer || 'canvas'
      };
      
      console.log('🔍 DEBUG: Calling backend with params:', params);
      const response = await this._apiService.fetchAPI('/api/v1/graph/overview', {
        method: 'GET',
        params: params
      });
      
      console.log('🔍 DEBUG: Backend response:', response);
      
      if (response && response.success && response.data) {
        this._logger.debug('Successfully retrieved neo4j-viz data from backend');
        // Return the nested data structure that contains nodes and edges
        const data = response.data.data || response.data;
        
        // Transform edges to use 'source' and 'target' instead of 'source_id' and 'target_id'
        if (data.edges) {
          data.edges = data.edges.map(edge => ({
            ...edge,
            source: edge.source_id,
            target: edge.target_id
          }));
        }
        
        return data;
      } else {
        console.error('🔍 DEBUG: Invalid response from backend:', response);
        throw new Error('Invalid response from backend');
      }
    } catch (error) {
      this._logger.error('Error getting neo4j-viz data:', error);
      throw error;
    }
  }

  /**
   * Create neo4j-viz visualization
   * @private
   * @param {HTMLElement} container - Container element
   * @param {Object} data - Neo4j-viz formatted data (currently unused, data is fetched internally)
   * @param {Object} options - Visualization options
   * @returns {Promise<boolean>} Success state
   */
  async _createNeo4jVizVisualization(container, data, options = {}) {
    try {
      this._logger.debug('Creating Neo4j-viz visualization');
      console.log('🔍 DEBUG: _createNeo4jVizVisualization called with:', { container, data, options });
      
      // Clear container
      container.innerHTML = '';
      
      // Try to get neo4j-viz data from the backend and create visualization
      try {
        console.log('🔍 DEBUG: Attempting to get neo4j-viz data...');
        const neo4jVizData = await this._getNeo4jVizData(options);
        console.log('🔍 DEBUG: Got neo4j-viz data:', neo4jVizData);
        
        if (neo4jVizData && neo4jVizData.nodes && neo4jVizData.nodes.length > 0) {
          console.log('🔍 DEBUG: Creating neo4j-viz visualization with', neo4jVizData.nodes.length, 'nodes');
          
          // Create a proper graph visualization using SVG
          const vizWrapper = document.createElement('div');
          vizWrapper.className = 'neo4j-viz-wrapper';
          vizWrapper.style.cssText = `
            width: 100%;
            height: 100%;
            border: 1px solid #ddd;
            border-radius: 5px;
            overflow: hidden;
            background-color: #f9f9f9;
            position: relative;
          `;
          
          // Create SVG for the graph
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.background = 'white';
          
          // Create a simple force-directed layout simulation
          const width = 800;
          const height = 600;
          svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
          
          // Add title and controls
          const header = document.createElement('div');
          header.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            right: 10px;
            background: rgba(255,255,255,0.95);
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
            color: #333;
            z-index: 10;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          `;
          
          const title = document.createElement('div');
          title.textContent = `Knowledge Graph (${neo4jVizData.nodes.length} nodes, ${neo4jVizData.edges?.length || 0} relationships)`;
          title.style.fontWeight = 'bold';
          
          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.gap = '10px';
          controls.style.alignItems = 'center';
          
          // Detail level selector
          const detailLabel = document.createElement('label');
          detailLabel.textContent = 'Detail:';
          detailLabel.style.fontSize = '11px';
          
          const detailSelect = document.createElement('select');
          detailSelect.innerHTML = `
            <option value="minimal">Minimal</option>
            <option value="standard" selected>Standard</option>
            <option value="detailed">Detailed</option>
          `;
          detailSelect.style.fontSize = '11px';
          detailSelect.style.padding = '2px 5px';
          
          // Add event listener for detail level changes
          detailSelect.addEventListener('change', (e) => {
            this._updateDetailLevel(nodes, e.target.value);
          });
          
          controls.appendChild(detailLabel);
          controls.appendChild(detailSelect);
          
          header.appendChild(title);
          header.appendChild(controls);
          vizWrapper.appendChild(header);
          
          // Create nodes with initial random positions
          const nodes = neo4jVizData.nodes.map((node, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            // Start with random positions within the viewport
            const x = Math.random() * (width - 100) + 50;
            const y = Math.random() * (height - 100) + 50;
            
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', 8);
            circle.setAttribute('fill', '#4285f4');
            circle.setAttribute('stroke', '#1a73e8');
            circle.setAttribute('stroke-width', 2);
            
            // Add hover effect
            circle.style.cursor = 'pointer';
            const originalRadius = 8;
            const hoverRadius = 12;
            
            circle.addEventListener('mouseenter', () => {
              circle.setAttribute('r', hoverRadius);
              // Darken the color on hover
              const hoverColor = this._getNodeColor(node);
              circle.setAttribute('fill', hoverColor.stroke);
            });
            circle.addEventListener('mouseleave', () => {
              circle.setAttribute('r', originalRadius);
              const normalColor = this._getNodeColor(node);
              circle.setAttribute('fill', normalColor.fill);
            });
            
            // Add click handler for detailed information
            circle.addEventListener('click', (e) => {
              e.stopPropagation();
              this._showNodeDetails(node, e);
            });
            
            // Style node based on type
            const nodeColor = this._getNodeColor(node);
            circle.setAttribute('fill', nodeColor.fill);
            circle.setAttribute('stroke', nodeColor.stroke);
            
            // Add tooltip with better title extraction
            const title = this._extractNodeTitle(node);
            circle.setAttribute('title', title);
            
            svg.appendChild(circle);
            
            // Add text label for the node
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const label = this._getNodeLabel(node, 'standard');
            text.textContent = label;
            text.setAttribute('x', x);
            text.setAttribute('y', y + 4);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '10px');
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('fill', '#333');
            text.setAttribute('pointer-events', 'none');
            text.setAttribute('class', 'node-label');
            
            svg.appendChild(text);
            
            return { element: circle, textElement: text, x, y, data: node };
          });
          
          // Create relationships (edges) - render them behind nodes
          if (neo4jVizData.edges && neo4jVizData.edges.length > 0) {
            neo4jVizData.edges.forEach(edge => {
              // Find source and target nodes by ID
              const sourceNode = nodes.find(n => n.data.id === edge.source_id);
              const targetNode = nodes.find(n => n.data.id === edge.target_id);
              
              if (sourceNode && targetNode) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', sourceNode.x);
                line.setAttribute('y1', sourceNode.y);
                line.setAttribute('x2', targetNode.x);
                line.setAttribute('y2', targetNode.y);
                
                // Style based on relationship type
                const strokeColor = this._getRelationshipColor(edge.type);
                const strokeWidth = Math.max(1, edge.strength * 3);
                
                line.setAttribute('stroke', strokeColor);
                line.setAttribute('stroke-width', strokeWidth);
                line.setAttribute('opacity', 0.7);
                
                // Add relationship type as title
                line.setAttribute('title', `${edge.type} (strength: ${edge.strength})`);
                
                // Add relationship type label
                const edgeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                const midX = (sourceNode.x + targetNode.x) / 2;
                const midY = (sourceNode.y + targetNode.y) / 2;
                
                edgeLabel.textContent = edge.type.replace('_', ' ');
                edgeLabel.setAttribute('x', midX);
                edgeLabel.setAttribute('y', midY - 5);
                edgeLabel.setAttribute('text-anchor', 'middle');
                edgeLabel.setAttribute('font-size', '8px');
                edgeLabel.setAttribute('font-family', 'Arial, sans-serif');
                edgeLabel.setAttribute('fill', strokeColor);
                edgeLabel.setAttribute('pointer-events', 'none');
                edgeLabel.setAttribute('class', 'edge-label');
                
                // Store references for animation
                edge.lineElement = line;
                edge.labelElement = edgeLabel;
                
                // Insert before nodes so edges appear behind
                svg.insertBefore(line, svg.firstChild);
                svg.insertBefore(edgeLabel, svg.firstChild);
              }
            });
          }
          
          // Apply force-directed layout
          this._applyForceDirectedLayout(nodes, neo4jVizData.edges, width, height);
          
          vizWrapper.appendChild(svg);
          container.appendChild(vizWrapper);
          
          // Track the wrapper
          this._resourceTracker.trackDOMElement(vizWrapper);
          
          this._logger.debug('Neo4j-viz graph visualization created successfully');
          return true;
        } else {
          console.log('🔍 DEBUG: No valid neo4j-viz data received:', neo4jVizData);
        }
      } catch (dataError) {
        console.error('🔍 DEBUG: Failed to get neo4j-viz data:', dataError);
        this._logger.warn('Failed to get neo4j-viz data, using fallback:', dataError);
      }
      
      // Fallback to placeholder if HTML generation fails
      console.log('🔍 DEBUG: Falling back to fallback visualization');
      return this._createFallbackVisualization(container, data, options);
    } catch (error) {
      this._logger.error('Error creating Neo4j-viz visualization:', error);
      return false;
    }
  }

  /**
   * Get node label based on detail level
   * @private
   * @param {Object} node - Node data
   * @param {string} detailLevel - Detail level: 'minimal', 'standard', 'detailed'
   * @returns {string} Node label
   */
  _getNodeLabel(node, detailLevel = 'standard') {
    const labels = node.metadata?.labels || [];
    const nodeType = labels.length > 0 ? labels[0] : 'Unknown';
    
    switch (detailLevel) {
      case 'minimal':
        return nodeType.charAt(0); // Just first letter of type
      case 'standard':
        // Show domain for pages/URLs, truncated title for others
        if (nodeType === 'Page' || nodeType === 'URL') {
          const domain = node.domain || this._extractDomain(node.url);
          return domain ? domain.replace('www.', '') : nodeType;
        } else {
          const title = node.title || node.name || 'Untitled';
          return title.length > 15 ? title.substring(0, 15) + '...' : title;
        }
      case 'detailed':
        // Show full title with type
        const title = node.title || node.name || 'Untitled';
        return `${nodeType}: ${title.length > 20 ? title.substring(0, 20) + '...' : title}`;
      default:
        return nodeType;
    }
  }

  /**
   * Extract domain from URL
   * @private
   * @param {string} url - URL string
   * @returns {string} Domain or empty string
   */
  _extractDomain(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (e) {
      return '';
    }
  }

  /**
   * Extract a meaningful title from a node
   * @private
   * @param {Object} node - Node data
   * @returns {string} Extracted title
   */
  _extractNodeTitle(node) {
    // Get node type from labels
    const labels = node.metadata?.labels || [];
    const nodeType = labels.length > 0 ? labels[0] : 'Unknown';
    
    // Try multiple possible title fields
    let title = node.properties?.title || 
                node.properties?.name || 
                node.title || 
                node.name;
    
    // If no title found, try to extract from URL
    if (!title || title.trim() === '') {
      const url = node.properties?.url || node.url;
      if (url) {
        try {
          const urlObj = new URL(url);
          // Extract domain and path for a meaningful title
          const domain = urlObj.hostname;
          const path = urlObj.pathname;
          
          // Create a title from domain and path
          if (path && path !== '/' && path.length > 1) {
            // Remove leading slash and replace slashes with spaces
            const pathTitle = path.substring(1).replace(/\//g, ' ').replace(/-/g, ' ');
            title = `${domain} - ${pathTitle}`;
          } else {
            title = domain;
          }
        } catch (e) {
          // If URL parsing fails, use the raw URL
          title = url;
        }
      }
    }
    
    // Final fallback and format with node type
    const finalTitle = title || 'Untitled';
    return `${nodeType}: ${finalTitle}`;
  }

  /**
   * Create fallback visualization when neo4j-viz fails
   * @private
   * @param {HTMLElement} container - Container element
   * @param {Object} data - Data to visualize
   * @param {Object} options - Visualization options
   * @returns {boolean} Success state
   */
  _createFallbackVisualization(container, data, options = {}) {
    try {
      this._logger.debug('Creating fallback visualization');
      
      const fallbackDiv = document.createElement('div');
      fallbackDiv.className = 'fallback-visualization';
      fallbackDiv.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f5f5f5;
        border: 2px dashed #ccc;
        border-radius: 8px;
        color: #666;
        font-family: Arial, sans-serif;
      `;
      
      const fallbackContent = document.createElement('div');
      fallbackContent.style.textAlign = 'center';
      fallbackContent.innerHTML = `
        <h3>Graph Visualization</h3>
        <p>Neo4j-viz visualization is not available.</p>
        <p>Using fallback display.</p>
        <small>Layout: ${options.layout || 'default'}</small>
      `;
      
      fallbackDiv.appendChild(fallbackContent);
      container.appendChild(fallbackDiv);
      
      this._resourceTracker.trackDOMElement(fallbackDiv);
      
      return true;
    } catch (error) {
      this._logger.error('Error creating fallback visualization:', error);
      return false;
    }
  }

  /**
   * Get node color based on node type
   * @private
   * @param {Object} node - Node data
   * @returns {Object} Color object with fill and stroke
   */
  _getNodeColor(node) {
    const labels = node.metadata?.labels || [];
    
    if (labels.includes('Page')) {
      return { fill: '#4285f4', stroke: '#1a73e8' }; // Blue for pages
    } else if (labels.includes('URL')) {
      return { fill: '#34a853', stroke: '#137333' }; // Green for URLs
    } else if (labels.includes('Keyword')) {
      return { fill: '#fbbc04', stroke: '#f9ab00' }; // Yellow for keywords
    } else if (labels.includes('Concept')) {
      return { fill: '#ea4335', stroke: '#d33b2c' }; // Red for concepts
    } else {
      return { fill: '#9aa0a6', stroke: '#5f6368' }; // Gray for unknown
    }
  }

  /**
   * Get relationship color based on relationship type
   * @private
   * @param {string} type - Relationship type
   * @returns {string} Color hex code
   */
  _getRelationshipColor(type) {
    switch (type) {
      case 'HAS_KEYWORD':
        return '#fbbc04'; // Yellow
      case 'RELATED_TO':
        return '#34a853'; // Green
      case 'SIMILAR_TO':
        return '#4285f4'; // Blue
      case 'CONTAINS':
        return '#ea4335'; // Red
      case 'PART_OF':
        return '#9c27b0'; // Purple
      default:
        return '#9aa0a6'; // Gray
    }
  }

  /**
   * Apply force-directed layout to nodes
   * @private
   * @param {Array} nodes - Array of node objects with x, y, data, and element properties
   * @param {Array} edges - Array of edge objects with source_id, target_id, and strength
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  _applyForceDirectedLayout(nodes, edges, width, height) {
    const iterations = 100;
    const coolingFactor = 0.95;
    let temperature = 100;
    
    // Force constants
    const repulsionStrength = 1000;
    const attractionStrength = 0.1;
    const centerForce = 0.01;
    
    // Create a map for quick node lookup
    const nodeMap = new Map();
    nodes.forEach(node => {
      nodeMap.set(node.data.id, node);
      // Initialize velocity
      node.vx = 0;
      node.vy = 0;
    });
    
    // Animation loop
    const animate = () => {
      // Apply repulsion forces between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];
          
          const dx = node1.x - node2.x;
          const dy = node1.y - node2.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Repulsion force (inversely proportional to distance)
          const force = repulsionStrength / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          node1.vx += fx;
          node1.vy += fy;
          node2.vx -= fx;
          node2.vy -= fy;
        }
      }
      
      // Apply attraction forces between connected nodes
      edges.forEach(edge => {
        const sourceNode = nodeMap.get(edge.source_id);
        const targetNode = nodeMap.get(edge.target_id);
        
        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Attraction force (proportional to distance and relationship strength)
          const force = attractionStrength * distance * edge.strength;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          sourceNode.vx += fx;
          sourceNode.vy += fy;
          targetNode.vx -= fx;
          targetNode.vy -= fy;
        }
      });
      
      // Apply center force to keep nodes in viewport
      const centerX = width / 2;
      const centerY = height / 2;
      
      nodes.forEach(node => {
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        
        node.vx += dx * centerForce;
        node.vy += dy * centerForce;
      });
      
      // Update positions with cooling
      nodes.forEach(node => {
        // Apply velocity with temperature cooling
        node.vx *= temperature / 100;
        node.vy *= temperature / 100;
        
        node.x += node.vx;
        node.y += node.vy;
        
        // Keep nodes within bounds
        node.x = Math.max(20, Math.min(width - 20, node.x));
        node.y = Math.max(20, Math.min(height - 20, node.y));
        
        // Update SVG element position
        node.element.setAttribute('cx', node.x);
        node.element.setAttribute('cy', node.y);
        
        // Update text label position
        if (node.textElement) {
          node.textElement.setAttribute('x', node.x);
          node.textElement.setAttribute('y', node.y + 4);
        }
        
        // Reset velocity for next iteration
        node.vx *= 0.8;
        node.vy *= 0.8;
      });
      
      // Update edge positions
      edges.forEach(edge => {
        const sourceNode = nodeMap.get(edge.source_id);
        const targetNode = nodeMap.get(edge.target_id);
        
        if (sourceNode && targetNode && edge.lineElement) {
          edge.lineElement.setAttribute('x1', sourceNode.x);
          edge.lineElement.setAttribute('y1', sourceNode.y);
          edge.lineElement.setAttribute('x2', targetNode.x);
          edge.lineElement.setAttribute('y2', targetNode.y);
          
          // Update edge label position
          if (edge.labelElement) {
            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            edge.labelElement.setAttribute('x', midX);
            edge.labelElement.setAttribute('y', midY - 5);
          }
        }
      });
      
      // Cool down and continue
      temperature *= coolingFactor;
      
      if (temperature > 1) {
        requestAnimationFrame(animate);
      }
    };
    
    // Start animation
    requestAnimationFrame(animate);
  }

  /**
   * Update detail level for all nodes
   * @private
   * @param {Array} nodes - Array of node objects
   * @param {string} detailLevel - New detail level
   */
  _updateDetailLevel(nodes, detailLevel) {
    nodes.forEach(node => {
      if (node.textElement) {
        const newLabel = this._getNodeLabel(node.data, detailLevel);
        node.textElement.textContent = newLabel;
        
        // Adjust font size based on detail level
        switch (detailLevel) {
          case 'minimal':
            node.textElement.setAttribute('font-size', '12px');
            break;
          case 'standard':
            node.textElement.setAttribute('font-size', '10px');
            break;
          case 'detailed':
            node.textElement.setAttribute('font-size', '9px');
            break;
        }
      }
    });
  }

  /**
   * Show detailed information for a node
   * @private
   * @param {Object} node - Node data
   * @param {Event} event - Click event
   */
  _showNodeDetails(node, event) {
    // Remove any existing detail panel
    const existingPanel = document.querySelector('.node-detail-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // Create detail panel
    const panel = document.createElement('div');
    panel.className = 'node-detail-panel';
    panel.style.cssText = `
      position: absolute;
      top: ${event.clientY - 10}px;
      left: ${event.clientX + 10}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 5px;
      padding: 15px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 300px;
      font-size: 12px;
      line-height: 1.4;
    `;
    
    const labels = node.metadata?.labels || [];
    const nodeType = labels.length > 0 ? labels[0] : 'Unknown';
    
    panel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #333;">
        ${nodeType} Node Details
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Title:</strong> ${node.title || 'N/A'}
      </div>
      <div style="margin-bottom: 5px;">
        <strong>URL:</strong> ${node.url ? `<a href="${node.url}" target="_blank" style="color: #4285f4;">${node.url}</a>` : 'N/A'}
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Domain:</strong> ${node.domain || 'N/A'}
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Last Active:</strong> ${node.last_active || 'N/A'}
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Labels:</strong> ${labels.join(', ')}
      </div>
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #f5f5f5;
          border: 1px solid #ccc;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        ">Close</button>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(panel);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (panel.parentElement) {
        panel.remove();
      }
    }, 10000);
  }
}