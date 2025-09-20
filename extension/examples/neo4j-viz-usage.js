/**
 * Neo4j-viz Integration Usage Examples
 * 
 * This file demonstrates how to use the new neo4j-viz integration
 * in the Marvin browser extension.
 */

import { VisualizationService } from '../src/services/visualization-service.js';

// Example 1: Basic knowledge graph visualization
async function createBasicKnowledgeGraph() {
  const visualizationService = new VisualizationService();
  await visualizationService.initialize();
  
  // Create a basic knowledge graph with default settings
  const success = await visualizationService.createKnowledgeGraph(
    'graph-container',
    null, // nodes - will be fetched from backend
    null, // links - will be fetched from backend
    {
      layout: 'force-directed',
      renderer: 'canvas',
      width: '100%',
      height: '600px'
    }
  );
  
  if (success) {
    console.log('Knowledge graph created successfully');
  } else {
    console.error('Failed to create knowledge graph');
  }
}

// Example 2: Custom visualization with specific query
async function createCustomVisualization() {
  const visualizationService = new VisualizationService();
  await visualizationService.initialize();
  
  // Create a custom visualization with a specific Cypher query
  const success = await visualizationService.createCustomVisualization(
    'custom-graph-container',
    'MATCH (p:Page)-[r]->(q:Page) WHERE p.domain = "example.com" RETURN p, r, q LIMIT 50',
    {
      layout: 'hierarchical',
      renderer: 'webgl',
      width: '100%',
      height: '800px',
      nodeCaption: 'title',
      colorProperty: 'domain',
      showTooltips: true,
      initialZoom: 0.8
    }
  );
  
  if (success) {
    console.log('Custom visualization created successfully');
  } else {
    console.error('Failed to create custom visualization');
  }
}

// Example 3: Domain-specific visualization
async function createDomainVisualization(domain) {
  const visualizationService = new VisualizationService();
  await visualizationService.initialize();
  
  const query = `
    MATCH (p:Page {domain: $domain})
    OPTIONAL MATCH (p)-[r]->(q:Page)
    RETURN p, r, q
    LIMIT 100
  `;
  
  const success = await visualizationService.createCustomVisualization(
    'domain-graph-container',
    query,
    {
      layout: 'force-directed',
      renderer: 'canvas',
      width: '100%',
      height: '600px',
      nodeCaption: 'title',
      colorProperty: 'domain',
      showTooltips: true,
      // Pass parameters to the query
      queryParams: { domain: domain }
    }
  );
  
  return success;
}

// Example 4: Relationship analysis visualization
async function createRelationshipAnalysis() {
  const visualizationService = new VisualizationService();
  await visualizationService.initialize();
  
  const query = `
    MATCH (p1:Page)-[r]->(p2:Page)
    WHERE r.score > 0.7
    RETURN p1, r, p2
    ORDER BY r.score DESC
    LIMIT 200
  `;
  
  const success = await visualizationService.createCustomVisualization(
    'relationship-analysis-container',
    query,
    {
      layout: 'force-directed',
      renderer: 'webgl',
      width: '100%',
      height: '700px',
      nodeCaption: 'title',
      colorProperty: 'domain',
      sizeProperty: 'content_length',
      showTooltips: true,
      initialZoom: 0.6,
      minZoom: 0.1,
      maxZoom: 3.0
    }
  );
  
  return success;
}

// Example 5: Time-based visualization
async function createTimeBasedVisualization(days = 7) {
  const visualizationService = new VisualizationService();
  await visualizationService.initialize();
  
  const query = `
    MATCH (p:Page)
    WHERE p.last_active > datetime() - duration({days: $days})
    OPTIONAL MATCH (p)-[r]->(q:Page)
    WHERE q.last_active > datetime() - duration({days: $days})
    RETURN p, r, q
    LIMIT 150
  `;
  
  const success = await visualizationService.createCustomVisualization(
    'time-based-container',
    query,
    {
      layout: 'hierarchical',
      renderer: 'canvas',
      width: '100%',
      height: '600px',
      nodeCaption: 'title',
      colorProperty: 'domain',
      showTooltips: true,
      queryParams: { days: days }
    }
  );
  
  return success;
}

// Example 6: Error handling and fallback
async function createVisualizationWithFallback() {
  const visualizationService = new VisualizationService();
  
  try {
    await visualizationService.initialize();
    
    const success = await visualizationService.createKnowledgeGraph(
      'fallback-container',
      null,
      null,
      {
        layout: 'force-directed',
        renderer: 'canvas',
        width: '100%',
        height: '500px'
      }
    );
    
    if (!success) {
      console.warn('Neo4j-viz visualization failed, fallback visualization should be displayed');
    }
    
    return success;
  } catch (error) {
    console.error('Error creating visualization:', error);
    return false;
  } finally {
    // Clean up resources
    try {
      await visualizationService.cleanup();
    } catch (cleanupError) {
      console.error('Error cleaning up visualization service:', cleanupError);
    }
  }
}

// Export examples for use in other modules
export {
  createBasicKnowledgeGraph,
  createCustomVisualization,
  createDomainVisualization,
  createRelationshipAnalysis,
  createTimeBasedVisualization,
  createVisualizationWithFallback
};

// Usage in a component (example)
export class GraphVisualizationComponent {
  constructor(containerId) {
    this.containerId = containerId;
    this.visualizationService = new VisualizationService();
  }
  
  async initialize() {
    await this.visualizationService.initialize();
  }
  
  async showBasicGraph() {
    return await this.visualizationService.createKnowledgeGraph(
      this.containerId,
      null,
      null,
      {
        layout: 'force-directed',
        renderer: 'canvas',
        width: '100%',
        height: '600px'
      }
    );
  }
  
  async showCustomGraph(query, options = {}) {
    return await this.visualizationService.createCustomVisualization(
      this.containerId,
      query,
      {
        layout: 'force-directed',
        renderer: 'canvas',
        width: '100%',
        height: '600px',
        ...options
      }
    );
  }
  
  async cleanup() {
    await this.visualizationService.cleanup();
  }
}
