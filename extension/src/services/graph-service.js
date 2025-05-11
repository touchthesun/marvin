// src/services/graph-service.js
import { container } from '../core/dependency-container.js';

/**
 * GraphService - Handles interaction with the Neo4j graph database via API
 */
export class GraphService {
  constructor() {
    this.initialized = false;
  }
  
  /**
   * Initialize the graph service
   * @returns {Promise<boolean>} Success state
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Get logger instance
      this.logger = new (container.getUtil('LogManager'))({
        context: 'graph-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing graph service');
      
      // Get API service
      this.apiService = container.getService('apiService');
      
      this.initialized = true;
      this.logger.info('Graph service initialized successfully');
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error initializing graph service:', error);
      } else {
        console.error('Error initializing graph service:', error);
      }
      return false;
    }
  }
  
  /**
   * Get related pages for a URL
   * @param {string} url - URL to find related pages for
   * @param {object} options - Options object
   * @param {number} options.depth - Search depth (default: 1, range: 1-3)
   * @param {string[]} options.relationshipTypes - Optional list of relationship types to include
   * @returns {Promise<object>} Related pages as nodes and relationships
   */
  async getRelatedPages(url, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!url) {
      throw new Error('URL is required');
    }
    
    try {
      this.logger.debug(`Getting related pages for URL: ${url}`);
      
      // Prepare query parameters according to the documentation
      const queryParams = new URLSearchParams();
      
      if (options.depth !== undefined) {
        queryParams.append('depth', options.depth);
      }
      
      if (options.relationshipTypes && Array.isArray(options.relationshipTypes)) {
        queryParams.append('relationship_types', options.relationshipTypes.join(','));
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/api/v1/graph/related/${encodeURIComponent(url)}${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.apiService.fetchAPI(endpoint);
      
      if (response && response.success) {
        return {
          success: true,
          nodes: response.nodes || [],
          relationships: response.relationships || []
        };
      } else {
        throw new Error(response?.error || 'Failed to get related pages');
      }
    } catch (error) {
      this.logger.error(`Error getting related pages for ${url}:`, error);
      throw error;
    }
  }
  
  /**
   * Search the knowledge graph
   * @param {string} query - Search query string
   * @param {object} options - Options object
   * @param {number} options.limit - Maximum number of results (default: 100)
   * @returns {Promise<object>} Search results as nodes
   */
  async searchGraph(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!query) {
      throw new Error('Query is required');
    }
    
    try {
      this.logger.debug(`Searching graph with query: ${query}`);
      
      // Prepare query parameters according to the documentation
      const queryParams = new URLSearchParams({
        query: query
      });
      
      if (options.limit !== undefined) {
        queryParams.append('limit', options.limit);
      }
      
      const endpoint = `/api/v1/graph/search?${queryParams.toString()}`;
      
      const response = await this.apiService.fetchAPI(endpoint);
      
      if (response && response.success) {
        return {
          success: true,
          nodes: response.nodes || [],
          relationships: response.relationships || []
        };
      } else {
        throw new Error(response?.error || 'Failed to search graph');
      }
    } catch (error) {
      this.logger.error(`Error searching graph with query "${query}":`, error);
      throw error;
    }
  }
}