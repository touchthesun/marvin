/**
 * TDD Frontend Test: Knowledge Panel JavaScript Issues
 * Tests the frontend Knowledge Panel code to identify specific problems
 */

// Test framework for browser extension context
class KnowledgePanelTester {
  constructor() {
    this.testResults = [];
    this.logger = {
      info: (msg) => console.log(`[TEST INFO] ${msg}`),
      error: (msg) => console.error(`[TEST ERROR] ${msg}`),
      debug: (msg) => console.debug(`[TEST DEBUG] ${msg}`)
    };
  }

  async runAllTests() {
    console.log('🧪 TDD Frontend Test: Knowledge Panel');
    console.log('='.repeat(50));
    
    try {
      await this.testContainerInitialization();
      await this.testApiServiceAvailability();
      await this.testKnowledgePanelComponent();
      await this.testDataFlow();
      await this.testErrorHandling();
      
      this.generateReport();
    } catch (error) {
      console.error('Test suite failed:', error);
    }
  }

  async testContainerInitialization() {
    console.log('\n🧪 Test 1: Container Initialization');
    console.log('-'.repeat(30));
    
    try {
      // Test if container is available
      if (typeof window !== 'undefined' && window.container) {
        this.addResult('container_available', true, 'Container found in window');
        
        // Test if container has required services
        const requiredServices = ['apiService', 'visualizationService', 'notificationService'];
        for (const serviceName of requiredServices) {
          try {
            const service = window.container.getService(serviceName);
            this.addResult(`service_${serviceName}`, !!service, 
              service ? `${serviceName} available` : `${serviceName} not found`);
          } catch (error) {
            this.addResult(`service_${serviceName}`, false, 
              `${serviceName} error: ${error.message}`);
          }
        }
        
        // Test if container has Knowledge Panel component
        try {
          const component = window.container.getComponent('knowledge-panel');
          this.addResult('knowledge_panel_component', !!component, 
            component ? 'Knowledge Panel component found' : 'Knowledge Panel component not found');
        } catch (error) {
          this.addResult('knowledge_panel_component', false, 
            `Knowledge Panel component error: ${error.message}`);
        }
        
      } else {
        this.addResult('container_available', false, 'Container not found in window');
      }
      
    } catch (error) {
      this.addResult('container_init', false, `Container test failed: ${error.message}`);
    }
  }

  async testApiServiceAvailability() {
    console.log('\n🧪 Test 2: API Service Availability');
    console.log('-'.repeat(30));
    
    try {
      if (window.container) {
        const apiService = window.container.getService('apiService');
        
        if (apiService) {
          this.addResult('api_service_available', true, 'API Service found');
          
          // Test if API service has required methods
          const requiredMethods = ['getGraphOverview', 'fetchAPI'];
          for (const methodName of requiredMethods) {
            const hasMethod = typeof apiService[methodName] === 'function';
            this.addResult(`api_method_${methodName}`, hasMethod, 
              hasMethod ? `${methodName} method available` : `${methodName} method missing`);
          }
          
          // Test API service initialization
          if (apiService.initialized !== undefined) {
            this.addResult('api_service_initialized', apiService.initialized, 
              apiService.initialized ? 'API Service initialized' : 'API Service not initialized');
          }
          
        } else {
          this.addResult('api_service_available', false, 'API Service not found');
        }
      } else {
        this.addResult('api_service_available', false, 'Container not available for API service test');
      }
      
    } catch (error) {
      this.addResult('api_service_test', false, `API Service test failed: ${error.message}`);
    }
  }

  async testKnowledgePanelComponent() {
    console.log('\n🧪 Test 3: Knowledge Panel Component');
    console.log('-'.repeat(30));
    
    try {
      if (window.container) {
        const knowledgePanel = window.container.getComponent('knowledge-panel');
        
        if (knowledgePanel) {
          this.addResult('knowledge_panel_found', true, 'Knowledge Panel component found');
          
          // Test required methods
          const requiredMethods = ['initialize', 'loadKnowledgeData', 'displayKnowledgeItems'];
          for (const methodName of requiredMethods) {
            const hasMethod = typeof knowledgePanel[methodName] === 'function';
            this.addResult(`knowledge_panel_method_${methodName}`, hasMethod, 
              hasMethod ? `${methodName} method available` : `${methodName} method missing`);
          }
          
          // Test component state
          if (knowledgePanel.initialized !== undefined) {
            this.addResult('knowledge_panel_initialized', knowledgePanel.initialized, 
              knowledgePanel.initialized ? 'Knowledge Panel initialized' : 'Knowledge Panel not initialized');
          }
          
          // Test current data structure
          if (knowledgePanel.currentData) {
            this.addResult('knowledge_panel_data_structure', true, 'Current data structure exists');
            
            const hasPages = Array.isArray(knowledgePanel.currentData.pages);
            const hasGraphData = knowledgePanel.currentData.graphData && 
              typeof knowledgePanel.currentData.graphData === 'object';
            
            this.addResult('knowledge_panel_pages_array', hasPages, 
              hasPages ? 'Pages array exists' : 'Pages array missing');
            this.addResult('knowledge_panel_graph_data', hasGraphData, 
              hasGraphData ? 'Graph data object exists' : 'Graph data object missing');
          } else {
            this.addResult('knowledge_panel_data_structure', false, 'Current data structure missing');
          }
          
        } else {
          this.addResult('knowledge_panel_found', false, 'Knowledge Panel component not found');
        }
      } else {
        this.addResult('knowledge_panel_found', false, 'Container not available for Knowledge Panel test');
      }
      
    } catch (error) {
      this.addResult('knowledge_panel_test', false, `Knowledge Panel test failed: ${error.message}`);
    }
  }

  async testDataFlow() {
    console.log('\n🧪 Test 4: Data Flow Simulation');
    console.log('-'.repeat(30));
    
    try {
      if (window.container) {
        const apiService = window.container.getService('apiService');
        const knowledgePanel = window.container.getComponent('knowledge-panel');
        
        if (apiService && knowledgePanel) {
          // Test API call simulation
          try {
            console.log('   🔄 Simulating API call...');
            const response = await apiService.getGraphOverview({ limit: 100 });
            
            this.addResult('api_call_success', !!response, 
              response ? 'API call successful' : 'API call failed');
            
            if (response) {
              this.addResult('api_response_structure', !!(response.success && response.data), 
                (response.success && response.data) ? 'Response structure correct' : 'Response structure invalid');
              
              if (response.data) {
                const hasNodes = Array.isArray(response.data.nodes);
                const hasEdges = Array.isArray(response.data.edges);
                
                this.addResult('api_response_nodes', hasNodes, 
                  hasNodes ? `Nodes array exists (${response.data.nodes.length} nodes)` : 'Nodes array missing');
                this.addResult('api_response_edges', hasEdges, 
                  hasEdges ? `Edges array exists (${response.data.edges.length} edges)` : 'Edges array missing');
              }
            }
            
          } catch (error) {
            this.addResult('api_call_success', false, `API call failed: ${error.message}`);
          }
          
          // Test data processing simulation
          if (knowledgePanel.loadKnowledgeData) {
            try {
              console.log('   🔄 Simulating data loading...');
              // Create a mock logger for the test
              const mockLogger = {
                debug: (msg) => console.log(`[MOCK DEBUG] ${msg}`),
                info: (msg) => console.log(`[MOCK INFO] ${msg}`),
                error: (msg) => console.error(`[MOCK ERROR] ${msg}`)
              };
              
              await knowledgePanel.loadKnowledgeData(mockLogger);
              
              this.addResult('data_loading_success', true, 'Data loading method executed');
              
              // Check if data was loaded
              if (knowledgePanel.currentData && knowledgePanel.currentData.pages) {
                this.addResult('data_loaded_to_panel', knowledgePanel.currentData.pages.length > 0, 
                  `Data loaded: ${knowledgePanel.currentData.pages.length} pages`);
              } else {
                this.addResult('data_loaded_to_panel', false, 'No data loaded to panel');
              }
              
            } catch (error) {
              this.addResult('data_loading_success', false, `Data loading failed: ${error.message}`);
            }
          }
          
        } else {
          this.addResult('data_flow_test', false, 'Required services/components not available');
        }
      } else {
        this.addResult('data_flow_test', false, 'Container not available for data flow test');
      }
      
    } catch (error) {
      this.addResult('data_flow_test', false, `Data flow test failed: ${error.message}`);
    }
  }

  async testErrorHandling() {
    console.log('\n🧪 Test 5: Error Handling');
    console.log('-'.repeat(30));
    
    try {
      // Test DOM element availability
      const knowledgePanelElement = document.getElementById('knowledge-panel');
      this.addResult('knowledge_panel_dom', !!knowledgePanelElement, 
        knowledgePanelElement ? 'Knowledge Panel DOM element found' : 'Knowledge Panel DOM element missing');
      
      if (knowledgePanelElement) {
        const knowledgeContent = knowledgePanelElement.querySelector('.knowledge-content');
        this.addResult('knowledge_content_dom', !!knowledgeContent, 
          knowledgeContent ? 'Knowledge content element found' : 'Knowledge content element missing');
        
        const knowledgeList = knowledgePanelElement.querySelector('.knowledge-list');
        this.addResult('knowledge_list_dom', !!knowledgeList, 
          knowledgeList ? 'Knowledge list element found' : 'Knowledge list element missing');
      }
      
      // Test for common error patterns
      const errorIndicators = [
        { selector: '.error-state', name: 'Error state display' },
        { selector: '.loading-indicator', name: 'Loading indicator' },
        { selector: '.empty-state', name: 'Empty state display' }
      ];
      
      for (const indicator of errorIndicators) {
        const element = document.querySelector(indicator.selector);
        this.addResult(`dom_${indicator.name.replace(/\s+/g, '_').toLowerCase()}`, !!element, 
          element ? `${indicator.name} found` : `${indicator.name} not found`);
      }
      
    } catch (error) {
      this.addResult('error_handling_test', false, `Error handling test failed: ${error.message}`);
    }
  }

  addResult(testName, passed, message) {
    this.testResults.push({ testName, passed, message });
    const status = passed ? '✅' : '❌';
    console.log(`   ${status} ${testName}: ${message}`);
  }

  generateReport() {
    console.log('\n📊 Frontend Test Report');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    
    console.log(`\n📋 Test Summary: ${passed}/${total} tests passed`);
    
    // Group results by category
    const categories = {
      'Container & Services': this.testResults.filter(r => 
        r.testName.includes('container') || r.testName.includes('service')),
      'Knowledge Panel': this.testResults.filter(r => 
        r.testName.includes('knowledge_panel')),
      'API Integration': this.testResults.filter(r => 
        r.testName.includes('api_')),
      'Data Flow': this.testResults.filter(r => 
        r.testName.includes('data_')),
      'DOM Elements': this.testResults.filter(r => 
        r.testName.includes('dom_'))
    };
    
    for (const [category, results] of Object.entries(categories)) {
      if (results.length > 0) {
        const categoryPassed = results.filter(r => r.passed).length;
        console.log(`\n${category}: ${categoryPassed}/${results.length} passed`);
        
        results.forEach(result => {
          const status = result.passed ? '✅' : '❌';
          console.log(`   ${status} ${result.testName}: ${result.message}`);
        });
      }
    }
    
    // Root cause analysis
    console.log('\n🔍 Root Cause Analysis:');
    
    const criticalFailures = this.testResults.filter(r => !r.passed && 
      (r.testName.includes('container_available') || 
       r.testName.includes('api_service_available') ||
       r.testName.includes('knowledge_panel_found')));
    
    if (criticalFailures.length > 0) {
      console.log('   ❌ CRITICAL ISSUES FOUND:');
      criticalFailures.forEach(failure => {
        console.log(`      - ${failure.testName}: ${failure.message}`);
      });
    } else {
      console.log('   ✅ No critical infrastructure issues found');
      
      const dataFlowIssues = this.testResults.filter(r => !r.passed && 
        (r.testName.includes('data_') || r.testName.includes('api_call')));
      
      if (dataFlowIssues.length > 0) {
        console.log('   ⚠️  DATA FLOW ISSUES:');
        dataFlowIssues.forEach(issue => {
          console.log(`      - ${issue.testName}: ${issue.message}`);
        });
      } else {
        console.log('   ✅ Data flow appears to be working');
        console.log('   🔧 Issue may be in visualization or UI rendering');
      }
    }
    
    console.log('\n🔧 Recommended Next Steps:');
    console.log('   1. Check browser console for JavaScript errors');
    console.log('   2. Verify Knowledge Panel initialization in dashboard');
    console.log('   3. Test visualization service integration');
    console.log('   4. Check if data is being displayed in UI');
  }
}

// Auto-run tests if in browser context
if (typeof window !== 'undefined') {
  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const tester = new KnowledgePanelTester();
        tester.runAllTests();
      }, 2000); // Give time for extension to initialize
    });
  } else {
    setTimeout(() => {
      const tester = new KnowledgePanelTester();
      tester.runAllTests();
    }, 2000);
  }
}

// Export for manual testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KnowledgePanelTester;
}
