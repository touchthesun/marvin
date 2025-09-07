/**
 * Manual Test: Knowledge Panel Initialization and Data Loading
 * This test can be run in the browser console to manually test the Knowledge Panel
 */

// Test function that can be run in browser console
async function testKnowledgePanelManually() {
  console.log('🧪 Manual Test: Knowledge Panel');
  console.log('='.repeat(50));
  
  try {
    // Step 1: Check container availability
    console.log('\n1. Testing container availability...');
    if (typeof window.container === 'undefined') {
      console.error('❌ Container not available in window');
      return false;
    }
    console.log('✅ Container available');
    
    // Step 2: Check Knowledge Panel component
    console.log('\n2. Testing Knowledge Panel component...');
    const knowledgePanel = window.container.getComponent('knowledge-panel');
    if (!knowledgePanel) {
      console.error('❌ Knowledge Panel component not found');
      return false;
    }
    console.log('✅ Knowledge Panel component found');
    console.log('   - Has initialize method:', typeof knowledgePanel.initialize === 'function');
    console.log('   - Has loadKnowledgeData method:', typeof knowledgePanel.loadKnowledgeData === 'function');
    console.log('   - Currently initialized:', knowledgePanel.initialized);
    
    // Step 3: Test API service availability
    console.log('\n3. Testing API service...');
    const apiService = window.container.getService('apiService');
    if (!apiService) {
      console.error('❌ API service not found');
      return false;
    }
    console.log('✅ API service found');
    console.log('   - Has getGraphOverview method:', typeof apiService.getGraphOverview === 'function');
    console.log('   - Service initialized:', apiService.initialized);
    
    // Step 4: Test API call directly
    console.log('\n4. Testing API call...');
    try {
      const response = await apiService.getGraphOverview({ limit: 10 });
      console.log('✅ API call successful');
      console.log('   - Response success:', response.success);
      console.log('   - Data available:', !!response.data);
      console.log('   - Nodes count:', response.data?.nodes?.length || 0);
      console.log('   - Edges count:', response.data?.edges?.length || 0);
    } catch (error) {
      console.error('❌ API call failed:', error);
      return false;
    }
    
    // Step 5: Test Knowledge Panel initialization
    console.log('\n5. Testing Knowledge Panel initialization...');
    try {
      const initResult = await knowledgePanel.initialize();
      console.log('✅ Knowledge Panel initialization result:', initResult);
      console.log('   - Panel initialized:', knowledgePanel.initialized);
    } catch (error) {
      console.error('❌ Knowledge Panel initialization failed:', error);
      return false;
    }
    
    // Step 6: Test data loading
    console.log('\n6. Testing data loading...');
    try {
      const mockLogger = {
        debug: (msg) => console.log(`[DEBUG] ${msg}`),
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`)
      };
      
      await knowledgePanel.loadKnowledgeData(mockLogger);
      
      console.log('✅ Data loading completed');
      console.log('   - Pages loaded:', knowledgePanel.currentData.pages.length);
      console.log('   - Graph nodes:', knowledgePanel.currentData.graphData.nodes.length);
      console.log('   - Graph edges:', knowledgePanel.currentData.graphData.edges.length);
      
      if (knowledgePanel.currentData.pages.length > 0) {
        console.log('   - Sample page:', knowledgePanel.currentData.pages[0]);
      }
      
    } catch (error) {
      console.error('❌ Data loading failed:', error);
      return false;
    }
    
    // Step 7: Test UI rendering
    console.log('\n7. Testing UI rendering...');
    const knowledgePanelElement = document.getElementById('knowledge-panel');
    if (knowledgePanelElement) {
      console.log('✅ Knowledge Panel DOM element found');
      
      const knowledgeList = knowledgePanelElement.querySelector('.knowledge-list');
      if (knowledgeList) {
        console.log('✅ Knowledge list element found');
        console.log('   - List content:', knowledgeList.innerHTML.substring(0, 100) + '...');
      } else {
        console.log('❌ Knowledge list element not found');
      }
    } else {
      console.log('❌ Knowledge Panel DOM element not found');
    }
    
    console.log('\n🎉 Manual test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Manual test failed:', error);
    return false;
  }
}

// Test function for debugging specific issues
async function debugKnowledgePanelIssue() {
  console.log('🔍 Debug: Knowledge Panel Issue');
  console.log('='.repeat(40));
  
  // Check container state
  console.log('Container state:');
  console.log('  - Available:', !!window.container);
  console.log('  - Services:', window.container?.services ? Array.from(window.container.services.keys()) : 'no services');
  console.log('  - Components:', window.container?.components ? Array.from(window.container.components.keys()) : 'no components');
  
  // Check Knowledge Panel state
  const knowledgePanel = window.container?.getComponent('knowledge-panel');
  console.log('\nKnowledge Panel state:');
  console.log('  - Available:', !!knowledgePanel);
  console.log('  - Initialized:', knowledgePanel?.initialized);
  console.log('  - Current data:', knowledgePanel?.currentData);
  
  // Check API service state
  const apiService = window.container?.getService('apiService');
  console.log('\nAPI Service state:');
  console.log('  - Available:', !!apiService);
  console.log('  - Initialized:', apiService?.initialized);
  console.log('  - Methods:', apiService ? Object.getOwnPropertyNames(Object.getPrototypeOf(apiService)) : 'none');
  
  // Check DOM elements
  console.log('\nDOM Elements:');
  console.log('  - Knowledge Panel element:', !!document.getElementById('knowledge-panel'));
  console.log('  - Knowledge list element:', !!document.querySelector('.knowledge-list'));
  console.log('  - Knowledge content element:', !!document.querySelector('.knowledge-content'));
}

// Test function to force Knowledge Panel initialization
async function forceKnowledgePanelInit() {
  console.log('🔄 Force: Knowledge Panel Initialization');
  console.log('='.repeat(40));
  
  try {
    const knowledgePanel = window.container.getComponent('knowledge-panel');
    if (!knowledgePanel) {
      console.error('❌ Knowledge Panel not found');
      return false;
    }
    
    console.log('🔄 Forcing Knowledge Panel initialization...');
    const result = await knowledgePanel.initialize();
    console.log('✅ Initialization result:', result);
    
    console.log('🔄 Forcing data loading...');
    const mockLogger = {
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
      info: (msg) => console.log(`[INFO] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`)
    };
    
    await knowledgePanel.loadKnowledgeData(mockLogger);
    console.log('✅ Data loading completed');
    
    return true;
  } catch (error) {
    console.error('❌ Force initialization failed:', error);
    return false;
  }
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.testKnowledgePanelManually = testKnowledgePanelManually;
  window.debugKnowledgePanelIssue = debugKnowledgePanelIssue;
  window.forceKnowledgePanelInit = forceKnowledgePanelInit;
  
  console.log('🧪 Knowledge Panel test functions loaded:');
  console.log('  - testKnowledgePanelManually() - Run complete test');
  console.log('  - debugKnowledgePanelIssue() - Debug current state');
  console.log('  - forceKnowledgePanelInit() - Force initialization');
}

// Auto-run debug if in browser
if (typeof window !== 'undefined' && document.readyState === 'complete') {
  setTimeout(() => {
    console.log('🔍 Auto-running Knowledge Panel debug...');
    debugKnowledgePanelIssue();
  }, 2000);
}
