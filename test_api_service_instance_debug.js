/**
 * Debug Test: ApiService Instance Method Availability
 * This test helps identify why getGraphOverview method is missing from the instance
 */

// Test function to debug ApiService instance
function debugApiServiceInstance() {
  console.log('🔍 Debug: ApiService Instance Method Availability');
  console.log('='.repeat(60));
  
  try {
    // Get the service from container
    const apiService = window.container.getService('apiService');
    
    if (!apiService) {
      console.error('❌ ApiService not found in container');
      return;
    }
    
    console.log('✅ ApiService instance found');
    console.log('   - Type:', typeof apiService);
    console.log('   - Constructor name:', apiService.constructor.name);
    console.log('   - Initialized:', apiService.initialized);
    console.log('   - Has _initialized:', '_initialized' in apiService);
    console.log('   - _initialized value:', apiService._initialized);
    
    // Check if it's actually an ApiService instance
    console.log('\n🔍 Instance verification:');
    console.log('   - Is ApiService?', apiService instanceof window.container.services.get('apiService'));
    console.log('   - Has _baseURL?', '_baseURL' in apiService);
    console.log('   - _baseURL value:', apiService._baseURL);
    console.log('   - Has _config?', '_config' in apiService);
    console.log('   - Has _stats?', '_stats' in apiService);
    
    // Check prototype chain
    console.log('\n🔍 Prototype chain analysis:');
    let current = apiService;
    let level = 0;
    while (current && level < 5) {
      console.log(`   Level ${level}: ${current.constructor.name}`);
      const props = Object.getOwnPropertyNames(current);
      const methods = props.filter(prop => typeof current[prop] === 'function');
      console.log(`     - Own methods: ${methods.join(', ')}`);
      
      if (props.includes('getGraphOverview')) {
        console.log(`     ✅ getGraphOverview found at level ${level}`);
        console.log(`     - Type: ${typeof current.getGraphOverview}`);
        console.log(`     - Value: ${current.getGraphOverview}`);
        break;
      }
      
      current = Object.getPrototypeOf(current);
      level++;
    }
    
    // Check class prototype directly
    console.log('\n🔍 Class prototype check:');
    const ApiServiceClass = window.container.services.get('apiService');
    const classPrototype = ApiServiceClass.prototype;
    const classMethods = Object.getOwnPropertyNames(classPrototype).filter(prop => 
      typeof classPrototype[prop] === 'function'
    );
    console.log(`   - Class prototype methods: ${classMethods.join(', ')}`);
    console.log(`   - Has getGraphOverview in prototype? ${'getGraphOverview' in classPrototype}`);
    console.log(`   - getGraphOverview type: ${typeof classPrototype.getGraphOverview}`);
    
    // Try to access the method directly
    console.log('\n🧪 Method access test:');
    try {
      if (typeof apiService.getGraphOverview === 'function') {
        console.log('   ✅ getGraphOverview is callable');
        console.log('   - Method source:', apiService.getGraphOverview.toString().substring(0, 100) + '...');
      } else {
        console.log('   ❌ getGraphOverview is not callable');
        console.log('   - Value:', apiService.getGraphOverview);
        console.log('   - Type:', typeof apiService.getGraphOverview);
      }
    } catch (error) {
      console.error('   ❌ Error accessing getGraphOverview:', error);
    }
    
    // Check if there are any property descriptors that might be interfering
    console.log('\n🔍 Property descriptor check:');
    try {
      const descriptor = Object.getOwnPropertyDescriptor(apiService, 'getGraphOverview');
      console.log('   - Own property descriptor:', descriptor);
      
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(classPrototype, 'getGraphOverview');
      console.log('   - Prototype property descriptor:', prototypeDescriptor);
    } catch (error) {
      console.error('   ❌ Error checking property descriptors:', error);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Test function to check service instantiation process
function debugServiceInstantiation() {
  console.log('\n🔍 Debug: Service Instantiation Process');
  console.log('='.repeat(60));
  
  try {
    // Check if ApiService class is properly registered
    const ApiServiceClass = window.container.services.get('apiService');
    console.log('✅ ApiService class found in container');
    console.log('   - Type:', typeof ApiServiceClass);
    console.log('   - Name:', ApiServiceClass.name);
    console.log('   - Is function:', typeof ApiServiceClass === 'function');
    
    // Check if there are any instances
    const hasInstance = window.container.serviceInstances.has('apiService');
    console.log('   - Has instance:', hasInstance);
    
    if (hasInstance) {
      const instance = window.container.serviceInstances.get('apiService');
      console.log('   - Instance type:', typeof instance);
      console.log('   - Instance constructor:', instance.constructor.name);
    }
    
    // Try to create a new instance manually
    console.log('\n🧪 Manual instantiation test:');
    try {
      const manualInstance = new ApiServiceClass({ container: window.container });
      console.log('   ✅ Manual instantiation successful');
      console.log('   - Type:', typeof manualInstance);
      console.log('   - Has getGraphOverview:', typeof manualInstance.getGraphOverview === 'function');
      console.log('   - Initialized:', manualInstance.initialized);
    } catch (error) {
      console.error('   ❌ Manual instantiation failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Service instantiation debug failed:', error);
  }
}

// Test function to check for any syntax errors in ApiService
function debugApiServiceSyntax() {
  console.log('\n🔍 Debug: ApiService Syntax Check');
  console.log('='.repeat(60));
  
  try {
    const ApiServiceClass = window.container.services.get('apiService');
    
    // Try to access the class definition
    console.log('✅ ApiService class accessible');
    console.log('   - Class name:', ApiServiceClass.name);
    console.log('   - Class length:', ApiServiceClass.length);
    
    // Check if the class can be called
    console.log('\n🧪 Class callability test:');
    try {
      // This should not throw an error
      const testInstance = new ApiServiceClass();
      console.log('   ✅ Class can be instantiated');
      console.log('   - Instance type:', typeof testInstance);
    } catch (error) {
      console.error('   ❌ Class instantiation error:', error);
      console.error('   - Error details:', error.message);
      console.error('   - Stack trace:', error.stack);
    }
    
  } catch (error) {
    console.error('❌ Syntax check failed:', error);
  }
}

// Main debug function
function debugApiServiceMethodIssue() {
  console.log('🚀 Starting ApiService Method Debug Session');
  console.log('='.repeat(70));
  
  debugApiServiceInstance();
  debugServiceInstantiation();
  debugApiServiceSyntax();
  
  console.log('\n📊 Debug Summary');
  console.log('='.repeat(30));
  console.log('If getGraphOverview is missing from instance:');
  console.log('1. Check if method exists in class prototype');
  console.log('2. Check if instance is properly created');
  console.log('3. Check for property descriptor issues');
  console.log('4. Check for syntax errors in class definition');
  console.log('5. Check if method is being overridden somewhere');
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.debugApiServiceInstance = debugApiServiceInstance;
  window.debugServiceInstantiation = debugServiceInstantiation;
  window.debugApiServiceSyntax = debugApiServiceSyntax;
  window.debugApiServiceMethodIssue = debugApiServiceMethodIssue;
  
  console.log('🧪 ApiService method debug functions loaded:');
  console.log('  - debugApiServiceInstance() - Debug service instance');
  console.log('  - debugServiceInstantiation() - Debug instantiation process');
  console.log('  - debugApiServiceSyntax() - Debug class syntax');
  console.log('  - debugApiServiceMethodIssue() - Run all debug tests');
}

// Auto-run if in browser
if (typeof window !== 'undefined' && document.readyState === 'complete') {
  setTimeout(() => {
    console.log('🔍 Auto-running ApiService method debug...');
    debugApiServiceMethodIssue();
  }, 2000);
}
