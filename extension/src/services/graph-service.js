// src/services/graph-service.js
import { BaseService } from '../core/base-service.js';
import { LogManager } from '../utils/log-manager.js';

/**
 * GraphService - Handles interaction with the Neo4j graph database via API
 */
export class GraphService extends BaseService {
  /**
   * Default configuration values
   * @private
   */
  static _DEFAULT_CONFIG = {
    cache: {
      enabled: true,
      timeoutMs: 5 * 60 * 1000, // 5 minutes
      maxSize: 100,
      pruneThreshold: 0.2,
      operationTimeout: 5000, // 5 seconds
      maxRetries: 3
    }
  };

  /**
   * Create a new GraphService instance
   * @param {object} options - Service options
   * @param {object} options.apiService - API service instance
   * @param {object} [options.config] - Service configuration
   */
  constructor(options = {}) {
    super({
      ...options,
      maxTaskAge: 300000, // 5 minutes
      maxActiveTasks: 50,
      maxRetryAttempts: 3,
      retryBackoffBase: 1000,
      retryBackoffMax: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });

    // Validate required dependencies
    if (!options.apiService) {
      throw new Error('ApiService is required');
    }

    // State initialization
    this._apiService = options.apiService;
    
    // Initialize cache configuration with defaults
    this._cacheConfig = {
      ...GraphService._DEFAULT_CONFIG.cache,
      ...(options.config?.cache || {})
    };
    
    // Validate cache configuration
    this._validateCacheConfig();
    
    // Cache statistics
    this._cacheStats = {
      hits: 0,
      misses: 0
    };
  }

    /**
   * Validate cache configuration
   * @private
   */
    _validateCacheConfig() {
      const { timeoutMs, maxSize, pruneThreshold, operationTimeout, maxRetries } = this._cacheConfig;
      
      if (timeoutMs < 0) {
        throw new Error('Cache timeout must be positive');
      }
      
      if (maxSize < 1) {
        throw new Error('Cache max size must be at least 1');
      }
      
      if (pruneThreshold <= 0 || pruneThreshold >= 1) {
        throw new Error('Cache prune threshold must be between 0 and 1');
      }
      
      if (operationTimeout < 0) {
        throw new Error('Cache operation timeout must be positive');
      }
      
      if (maxRetries < 0) {
        throw new Error('Cache max retries must be non-negative');
      }
    }
  
  /**
   * Initialize the graph service
   * @returns {Promise<boolean>} Success state
   */
  async _performInitialization() {
    try {
      // Create logger
      this._logger = new LogManager({
        context: 'graph-service',
        isBackgroundScript: false,
        maxEntries: 1000
      });
      
      this._logger.info('Initializing graph service');
      
      // Load configuration
      await this._loadConfiguration();
      
      this._logger.info('Graph service initialized successfully');
      return true;
    } catch (error) {
      this._logger?.error('Error initializing graph service:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async _performCleanup() {
    this._logger?.info('Cleaning up graph service');
    
    // Clear cache
    await this._clearCache();
    
    // Clear service references
    this._apiService = null;
    
    // Reset cache configuration
    this._cacheConfig = {
      enabled: false,
      timeoutMs: 0,
      maxSize: 0,
      pruneThreshold: 0
    };
    
    // Reset cache statistics
    this._cacheStats = {
      hits: 0,
      misses: 0
    };
  }

  /**
   * Handle memory pressure
   */
  async _handleMemoryPressure(snapshot) {
    this._logger?.warn('Memory pressure detected, cleaning up non-essential resources');
    await super._handleMemoryPressure(snapshot);
    
    // Clear cache
    await this._clearCache();
  }

  /**
   * Load service configuration from storage
   * @private
   */
  async _loadConfiguration() {
    try {
      const data = await chrome.storage.local.get('graphServiceConfig');
      
      if (data.graphServiceConfig) {
        // Apply configuration
        if (data.graphServiceConfig.cacheTimeoutMs !== undefined) {
          this._cacheConfig.timeoutMs = data.graphServiceConfig.cacheTimeoutMs;
        }
        
        if (data.graphServiceConfig.cacheEnabled !== undefined) {
          this._cacheConfig.enabled = data.graphServiceConfig.cacheEnabled;
        }
        
        this._logger.debug('Configuration loaded:', this._cacheConfig);
      }
    } catch (error) {
      this._logger.warn('Failed to load configuration, using defaults:', error);
    }
  }

  /**
   * Save service configuration to storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _saveConfiguration() {
    try {
      await chrome.storage.local.set({
        graphServiceConfig: {
          cacheEnabled: this._cacheConfig.enabled,
          cacheTimeoutMs: this._cacheConfig.timeoutMs
        }
      });
      
      this._logger.debug('Configuration saved');
      return true;
    } catch (error) {
      this._logger.error('Failed to save configuration:', error);
      return false;
    }
  }

  /**
   * Update service configuration
   * @param {object} config - New configuration values
   * @returns {Promise<object>} Success status
   */
  async updateConfiguration(config) {
    if (!this._initialized) {
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
        this._cacheConfig.enabled = config.cacheEnabled;
      }
      
      if (config.cacheTimeoutMs !== undefined) {
        this._cacheConfig.timeoutMs = config.cacheTimeoutMs;
      }
      
      // Clear cache if disabled
      if (config.cacheEnabled === false) {
        await this._clearCache();
      }
      
      // Save configuration
      await this._saveConfiguration();
      
      return {
        success: true,
        message: 'Configuration updated successfully'
      };
    } catch (error) {
      this._logger.error('Error updating configuration:', error);
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
   * @returns {Promise<object>} Related pages as nodes and relationships
   */
  async getRelatedPages(url, options = {}) {
    if (!this._initialized) {
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
      this._logger.warn('Attempted to get related pages with no URL provided');
      return {
        success: false,
        error: 'URL is required'
      };
    }
    
    try {
      this._logger.debug(`Getting related pages for URL: ${url}`);
      
      // Create cache key based on parameters
      const cacheKey = this._createCacheKey('related', url, options);
      
      // Check cache if enabled and not bypassed
      if (this._cacheConfig.enabled && !options.bypassCache) {
        const cachedResult = await this._getCachedResult(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }
      
      // Prepare query parameters
      const queryParams = new URLSearchParams();
      
      if (options.depth !== undefined) {
        queryParams.append('depth', options.depth);
      }
      
      if (options.relationshipTypes && Array.isArray(options.relationshipTypes)) {
        queryParams.append('relationship_types', options.relationshipTypes.join(','));
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/api/v1/graph/related/${encodeURIComponent(url)}${queryString ? `?${queryString}` : ''}`;
      
      const response = await this._apiService.fetchAPI(endpoint);
      
      if (response && response.success) {
        const result = {
          success: true,
          nodes: response.nodes || [],
          relationships: response.relationships || [],
          timestamp: Date.now()
        };
        
        // Cache successful result
        if (this._cacheConfig.enabled) {
          await this._cacheResult(cacheKey, result);
        }
        
        return result;
      } else {
        return {
          success: false,
          error: response?.error || 'Failed to get related pages'
        };
      }
    } catch (error) {
      this._logger.error(`Error getting related pages for ${url}:`, error);
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
   * Create a cache key from request parameters
   * @param {string} type - Request type
   * @param {string} primaryKey - Primary key (URL, query, or node ID)
   * @param {object} options - Request options
   * @returns {string} Cache key
   * @private
   */
    _createCacheKey(type, primaryKey, options) {
      return `${type}:${primaryKey}:${JSON.stringify(options)}`;
    }
    
  /**
   * Get a result from cache if valid
   * @param {string} cacheKey - Cache key
   * @returns {Promise<object|null>} Cached result or null if not found/expired
   * @private
   */
  async _getCachedResult(cacheKey) {
    try {
      // Add timeout to cache operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Cache operation timeout')), 
          this._cacheConfig.operationTimeout);
      });

      const cachedItem = await Promise.race([
        this._resourceTracker.getCachedItem(cacheKey),
        timeoutPromise
      ]);
      
      if (!cachedItem) {
        this._cacheStats.misses++;
        return null;
      }
      
      const now = Date.now();
      
      // Check if cache has expired
      if (now - cachedItem.timestamp > this._cacheConfig.timeoutMs) {
        await this._resourceTracker.removeCachedItem(cacheKey);
        this._cacheStats.misses++;
        return null;
      }
      
      this._cacheStats.hits++;
      this._logger.debug(`Cache hit for key: ${cacheKey}`);
      
      return cachedItem;
    } catch (error) {
      this._logger.error(`Error getting cached result for key ${cacheKey}:`, error);
      return null;
    }
  }
  
  /**
   * Cache a result
   * @param {string} cacheKey - Cache key
   * @param {object} result - Result to cache
   * @private
   */
  async _cacheResult(cacheKey, result) {
    try {
      await this._resourceTracker.cacheItem(cacheKey, result);
      this._logger.debug(`Cached result for key: ${cacheKey}`);
      
      // Check if we need to prune the cache
      const cacheSize = await this._resourceTracker.getCacheSize();
      if (cacheSize > this._cacheConfig.maxSize) {
        await this._pruneCache();
      }
    } catch (error) {
      this._logger.error(`Error caching result for key ${cacheKey}:`, error);
    }
  }
  
  /**
   * Prune old items from cache
   * @private
   */
  async _pruneCache() {
    try {
      const now = Date.now();
      let pruneCount = 0;
      
      // Get all cache items
      const cacheItems = await this._resourceTracker.getAllCachedItems();
      
      // Remove expired items
      for (const [key, value] of cacheItems) {
        if (now - value.timestamp > this._cacheConfig.timeoutMs) {
          await this._resourceTracker.removeCachedItem(key);
          pruneCount++;
        }
      }
      
      // If still too large, remove oldest items
      if (cacheItems.size > this._cacheConfig.maxSize) {
        // Sort by timestamp
        const sortedItems = Array.from(cacheItems.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Remove oldest items
        const removeCount = Math.ceil(cacheItems.size * this._cacheConfig.pruneThreshold);
        for (let i = 0; i < removeCount; i++) {
          if (sortedItems[i]) {
            await this._resourceTracker.removeCachedItem(sortedItems[i][0]);
            pruneCount++;
          }
        }
      }
      
      if (pruneCount > 0) {
        this._logger.debug(`Pruned ${pruneCount} items from cache`);
      }
    } catch (error) {
      this._logger.error('Error pruning cache:', error);
    }
  }
  
  /**
   * Clear the entire cache
   * @private
   */
  async _clearCache() {
    try {
      const cacheSize = await this._resourceTracker.getCacheSize();
      await this._resourceTracker.clearCache();
      this._logger.debug(`Cleared ${cacheSize} items from cache`);
      
      return {
        success: true,
        message: `Cleared ${cacheSize} items from cache`
      };
    } catch (error) {
      this._logger.error('Error clearing cache:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
    
    /**
     * Get cache statistics
     * @returns {object} Cache statistics
     */
    getCacheStats() {
      return {
        enabled: this._cacheConfig.enabled,
        timeoutMs: this._cacheConfig.timeoutMs,
        hits: this._cacheStats.hits,
        misses: this._cacheStats.misses,
        hitRate: this._cacheStats.hits + this._cacheStats.misses > 0
          ? Math.round((this._cacheStats.hits / (this._cacheStats.hits + this._cacheStats.misses)) * 100) + '%'
          : '0%'
      };
    }
    
    /**
     * Get service status
     * @returns {object} Service status
     */
    getStatus() {
      return {
        initialized: this._initialized,
        hasLogger: !!this._logger,
        hasDependencies: !!this._apiService,
        cacheEnabled: this._cacheConfig.enabled,
        cacheStats: this.getCacheStats()
      };
    }
  }