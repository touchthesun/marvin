// src/services/graph-service.js
import { LogManager } from '../utils/log-manager.js';
import { container } from '../core/dependency-container.js';

/**
 * GraphService - Handles interaction with the Neo4j graph database via API
 */
export class GraphService {
  /**
   * Create a new GraphService instance
   */
  constructor() {
    // State initialization
    this.initialized = false;
    this.logger = null;
    this.apiService = null;
    
    // Cache for graph queries to improve performance
    this.queryCache = new Map();
    this.cacheTimeoutMs = 5 * 60 * 1000; // 5 minutes default
    this.cacheEnabled = true;
    this.cacheHits = 0;
    this.cacheMisses = 0;
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
      // Create logger directly
      this.logger = new LogManager({
        context: 'graph-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this.logger.info('Initializing graph service');
      
      // Get dependencies from container
      await this.resolveDependencies();
      
      // Load configuration
      await this.loadConfiguration();
      
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
   * Resolve service dependencies
   * @private
   */
  async resolveDependencies() {
    try {
      // Get API service from container
      this.apiService = container.getService('apiService');
      
      if (!this.apiService) {
        throw new Error('ApiService not available in container');
      }
      
      this.logger.debug('Dependencies resolved successfully');
    } catch (error) {
      this.logger.error('Failed to resolve dependencies:', error);
      throw error;
    }
  }
  
  /**
   * Load service configuration from storage
   * @private
   */
  async loadConfiguration() {
    try {
      const data = await chrome.storage.local.get('graphServiceConfig');
      
      if (data.graphServiceConfig) {
        // Apply configuration
        if (data.graphServiceConfig.cacheTimeoutMs !== undefined) {
          this.cacheTimeoutMs = data.graphServiceConfig.cacheTimeoutMs;
        }
        
        if (data.graphServiceConfig.cacheEnabled !== undefined) {
          this.cacheEnabled = data.graphServiceConfig.cacheEnabled;
        }
        
        this.logger.debug('Configuration loaded:', {
          cacheEnabled: this.cacheEnabled,
          cacheTimeoutMs: this.cacheTimeoutMs
        });
      }
    } catch (error) {
      this.logger.warn('Failed to load configuration, using defaults:', error);
    }
  }
  
  /**
   * Save service configuration to storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async saveConfiguration() {
    try {
      await chrome.storage.local.set({
        graphServiceConfig: {
          cacheEnabled: this.cacheEnabled,
          cacheTimeoutMs: this.cacheTimeoutMs
        }
      });
      
      this.logger.debug('Configuration saved');
      return true;
    } catch (error) {
      this.logger.error('Failed to save configuration:', error);
      return false;
    }
  }
  
  /**
   * Update service configuration
   * @param {object} config - New configuration values
   * @returns {Promise<boolean>} Success status
   */
  async updateConfiguration(config) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error: `Service initialization failed: ${error.message}`
        };
      }
    }
    
    try {
      // Update cache settings
      if (config.cacheEnabled !== undefined) {
        this.cacheEnabled = config.cacheEnabled;
      }
      
      if (config.cacheTimeoutMs !== undefined) {
        this.cacheTimeoutMs = config.cacheTimeoutMs;
      }
      
      // Clear cache if disabled
      if (config.cacheEnabled === false) {
        this.clearCache();
      }
      
      // Save configuration
      await this.saveConfiguration();
      
      return {
        success: true,
        message: 'Configuration updated successfully'
      };
    } catch (error) {
      this.logger.error('Error updating configuration:', error);
      return {
        success: false,
        error: `Failed to update configuration: ${error.message}`
      };
    }
  }
  
  /**
   * Get related pages for a URL
   * @param {string} url - URL to find related pages for
   * @param {object} options - Options object
   * @param {number} options.depth - Search depth (default: 1, range: 1-3)
   * @param {string[]} options.relationshipTypes - Optional list of relationship types to include
   * @param {boolean} options.bypassCache - Whether to bypass cache
   * @returns {Promise<object>} Related pages as nodes and relationships
   */
  async getRelatedPages(url, options = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error: `Service initialization failed: ${error.message}`
        };
      }
    }
    
    if (!url) {
      this.logger.warn('Attempted to get related pages with no URL provided');
      return {
        success: false,
        error: 'URL is required'
      };
    }
    
    try {
      this.logger.debug(`Getting related pages for URL: ${url}`);
      
      // Create cache key based on parameters
      const cacheKey = this.createCacheKey('related', url, options);
      
      // Check cache if enabled and not bypassed
      if (this.cacheEnabled && !options.bypassCache) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }
      
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
        const result = {
          success: true,
          nodes: response.nodes || [],
          relationships: response.relationships || [],
          timestamp: Date.now()
        };
        
        // Cache successful result
        if (this.cacheEnabled) {
          this.cacheResult(cacheKey, result);
        }
        
        return result;
      } else {
        return {
          success: false,
          error: response?.error || 'Failed to get related pages'
        };
      }
    } catch (error) {
      this.logger.error(`Error getting related pages for ${url}:`, error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred'
      };
    }
  }
  
  /**
   * Search the knowledge graph
   * @param {string} query - Search query string
   * @param {object} options - Options object
   * @param {number} options.limit - Maximum number of results (default: 100)
   * @param {boolean} options.bypassCache - Whether to bypass cache
   * @returns {Promise<object>} Search results as nodes
   */
  async searchGraph(query, options = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error: `Service initialization failed: ${error.message}`
        };
      }
    }
    
    if (!query) {
      this.logger.warn('Attempted to search graph with no query provided');
      return {
        success: false,
        error: 'Query is required'
      };
    }
    
    try {
      this.logger.debug(`Searching graph with query: ${query}`);
      
      // Create cache key based on parameters
      const cacheKey = this.createCacheKey('search', query, options);
      
      // Check cache if enabled and not bypassed
      if (this.cacheEnabled && !options.bypassCache) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }
      
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
        const result = {
          success: true,
          nodes: response.nodes || [],
          relationships: response.relationships || [],
          timestamp: Date.now()
        };
        
        // Cache successful result
        if (this.cacheEnabled) {
          this.cacheResult(cacheKey, result);
        }
        
        return result;
      } else {
        return {
          success: false,
          error: response?.error || 'Failed to search graph'
        };
      }
    } catch (error) {
      this.logger.error(`Error searching graph with query "${query}":`, error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred'
      };
    }
  }
  
  /**
   * Get a specific node by ID
   * @param {string} nodeId - ID of the node to retrieve
   * @param {object} options - Options object
   * @param {boolean} options.includeRelationships - Whether to include relationships
   * @param {boolean} options.bypassCache - Whether to bypass cache
   * @returns {Promise<object>} Node and optional relationships
   */
  async getNode(nodeId, options = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error: `Service initialization failed: ${error.message}`
        };
      }
    }
    
    if (!nodeId) {
      this.logger.warn('Attempted to get node with no ID provided');
      return {
        success: false,
        error: 'Node ID is required'
      };
    }
    
    try {
      this.logger.debug(`Getting node with ID: ${nodeId}`);
      
      // Create cache key based on parameters
      const cacheKey = this.createCacheKey('node', nodeId, options);
      
      // Check cache if enabled and not bypassed
      if (this.cacheEnabled && !options.bypassCache) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }
      
      // Prepare query parameters
      const queryParams = new URLSearchParams();
      
      if (options.includeRelationships) {
        queryParams.append('include_relationships', 'true');
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/api/v1/graph/node/${encodeURIComponent(nodeId)}${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.apiService.fetchAPI(endpoint);
      
      if (response && response.success) {
        const result = {
          success: true,
          node: response.node || null,
          relationships: response.relationships || [],
          timestamp: Date.now()
        };
        
        // Cache successful result
        if (this.cacheEnabled) {
          this.cacheResult(cacheKey, result);
        }
        
        return result;
      } else {
        return {
          success: false,
          error: response?.error || 'Failed to get node'
        };
      }
    } catch (error) {
      this.logger.error(`Error getting node with ID ${nodeId}:`, error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred'
      };
    }
  }
  
  /**
   * Create a cache key from request parameters
   * @param {string} type - Request type
   * @param {string} primaryKey - Primary key (URL, query, or node ID)
   * @param {object} options - Request options
   * @returns {string} Cache key
   * @private
   */
  createCacheKey(type, primaryKey, options) {
    return `${type}:${primaryKey}:${JSON.stringify(options)}`;
  }
  
  /**
   * Get a result from cache if valid
   * @param {string} cacheKey - Cache key
   * @returns {object|null} Cached result or null if not found/expired
   * @private
   */
  getCachedResult(cacheKey) {
    if (!this.queryCache.has(cacheKey)) {
      this.cacheMisses++;
      return null;
    }
    
    const cachedItem = this.queryCache.get(cacheKey);
    const now = Date.now();
    
    // Check if cache has expired
    if (now - cachedItem.timestamp > this.cacheTimeoutMs) {
      this.queryCache.delete(cacheKey);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    this.logger.debug(`Cache hit for key: ${cacheKey}`);
    
    return cachedItem;
  }
  
  /**
   * Cache a result
   * @param {string} cacheKey - Cache key
   * @param {object} result - Result to cache
   * @private
   */
  cacheResult(cacheKey, result) {
    this.queryCache.set(cacheKey, result);
    this.logger.debug(`Cached result for key: ${cacheKey}`);
    
    // Prune cache if it gets too large (over 100 items)
    if (this.queryCache.size > 100) {
      this.pruneCache();
    }
  }
  
  /**
   * Prune old items from cache
   * @private
   */
  pruneCache() {
    const now = Date.now();
    let pruneCount = 0;
    
    // Remove expired items
    this.queryCache.forEach((value, key) => {
      if (now - value.timestamp > this.cacheTimeoutMs) {
        this.queryCache.delete(key);
        pruneCount++;
      }
    });
    
    // If still too large, remove oldest items
    if (this.queryCache.size > 100) {
      // Convert to array and sort by timestamp
      const cacheItems = Array.from(this.queryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20% of items
      const removeCount = Math.ceil(this.queryCache.size * 0.2);
      for (let i = 0; i < removeCount; i++) {
        if (cacheItems[i]) {
          this.queryCache.delete(cacheItems[i][0]);
          pruneCount++;
        }
      }
    }
    
    if (pruneCount > 0) {
      this.logger.debug(`Pruned ${pruneCount} items from cache`);
    }
  }
  
  /**
   * Clear the entire cache
   */
  clearCache() {
    const cacheSize = this.queryCache.size;
    this.queryCache.clear();
    this.logger.debug(`Cleared ${cacheSize} items from cache`);
    
    return {
      success: true,
      message: `Cleared ${cacheSize} items from cache`
    };
  }
  
  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    return {
      enabled: this.cacheEnabled,
      size: this.queryCache.size,
      timeoutMs: this.cacheTimeoutMs,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits + this.cacheMisses > 0
        ? Math.round((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100) + '%'
        : '0%'
    };
  }
  
  /**
   * Get service status
   * @returns {object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasLogger: !!this.logger,
      hasDependencies: !!this.apiService,
      cacheEnabled: this.cacheEnabled,
      cacheSize: this.queryCache.size,
      cacheStats: this.getCacheStats()
    };
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('Cleaning up graph service');
    
    // Clear cache
    this.queryCache.clear();
    
    // Reset state
    this.initialized = false;
    
    this.logger.debug('Graph service cleanup complete');
  }
}