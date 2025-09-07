/**
 * Runtime Debug Test: ApiService Instance Analysis
 * This test runs in the browser to debug the actual service instance
 */

// Test function to debug the actual ApiService instance
function debugRuntimeApiService() {
  console.log('🔍 Runtime Debug: ApiService Instance Analysis');
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
    
    // Check instance properties
    console.log('\n🔍 Instance Properties:');
    const instanceProps = Object.getOwnPropertyNames(apiService);
    console.log('   - Own properties:', instanceProps);
    
    // Check for key methods
    const keyMethods = ['fetchAPI', 'getGraphOverview', 'initialize', 'checkConnection'];
    console.log('\n🔍 Key Methods Check:');
    keyMethods.forEach(method => {
      const hasMethod = method in apiService;
      const isFunction = typeof apiService[method] === 'function';
      console.log(`   - ${method}: ${hasMethod ? '✅' : '❌'} (${isFunction ? 'function' : typeof apiService[method]})`);
    });
    
    // Check prototype chain
    console.log('\n🔍 Prototype Chain Analysis:');
    let current = apiService;
    let level = 0;
    while (current && level < 5) {
      console.log(`   Level ${level}: ${current.constructor.name}`);
      const props = Object.getOwnPropertyNames(current);
      const methods = props.filter(prop => typeof current[prop] === 'function');
      console.log(`     - Own methods: ${methods.join(', ')}`);
      
      if (props.includes('fetchAPI') || props.includes('getGraphOverview')) {
        console.log(`     ✅ Key methods found at level ${level}`);
      }
      
      current = Object.getPrototypeOf(current);
      level++;
    }
    
    // Check if it's actually an ApiService
    console.log('\n🔍 Service Type Verification:');
    const ApiServiceClass = window.container.services.get('apiService');
    console.log('   - Is ApiService instance?', apiService instanceof ApiServiceClass);
    console.log('   - ApiService class type:', typeof ApiServiceClass);
    console.log('   - ApiService class name:', ApiServiceClass.name);
    
    // Check class prototype
    console.log('\n🔍 Class Prototype Check:');
    const classPrototype = ApiServiceClass.prototype;
    const classMethods = Object.getOwnPropertyNames(classPrototype).filter(prop => 
      typeof classPrototype[prop] === 'function'
    );
    console.log(`   - Class prototype methods: ${classMethods.join(', ')}`);
    console.log(`   - Has fetchAPI in prototype? ${'fetchAPI' in classPrototype}`);
    console.log(`   - Has getGraphOverview in prototype? ${'getGraphOverview' in classPrototype}`);
    
    // Try to access methods directly
    console.log('\n🧪 Direct Method Access Test:');
    try {
      if (typeof apiService.fetchAPI === 'function') {
        console.log('   ✅ fetchAPI is callable');
      } else {
        console.log('   ❌ fetchAPI is not callable');
        console.log('   - Value:', apiService.fetchAPI);
        console.log('   - Type:', typeof apiService.fetchAPI);
      }
    } catch (error) {
      console.error('   ❌ Error accessing fetchAPI:', error);
    }
    
    try {
      if (typeof apiService.getGraphOverview === 'function') {
        console.log('   ✅ getGraphOverview is callable');
      } else {
        console.log('   ❌ getGraphOverview is not callable');
        console.log('   - Value:', apiService.getGraphOverview);
        console.log('   - Type:', typeof apiService.getGraphOverview);
      }
    } catch (error) {
      console.error('   ❌ Error accessing getGraphOverview:', error);
    }
    
  } catch (error) {
    console.error('❌ Runtime debug failed:', error);
  }
}

// Test function to check service instantiation process
function debugServiceInstantiationProcess() {
  console.log('\n🔍 Runtime Debug: Service Instantiation Process');
  console.log('='.repeat(60));
  
  try {
    // Check container state
    console.log('📋 Container State:');
    console.log('   - Services registered:', Array.from(window.container.services.keys()));
    console.log('   - Service instances:', Array.from(window.container.serviceInstances.keys()));
    console.log('   - Has apiService in services:', window.container.services.has('apiService'));
    console.log('   - Has apiService in instances:', window.container.serviceInstances.has('apiService'));
    
    // Check ApiService class
    const ApiServiceClass = window.container.services.get('apiService');
    if (ApiServiceClass) {
      console.log('\n📋 ApiService Class:');
      console.log('   - Type:', typeof ApiServiceClass);
      console.log('   - Name:', ApiServiceClass.name);
      console.log('   - Is function:', typeof ApiServiceClass === 'function');
      
      // Try to create a new instance manually
      console.log('\n🧪 Manual Instantiation Test:');
      try {
        const manualInstance = new ApiServiceClass({ container: window.container });
        console.log('   ✅ Manual instantiation successful');
        console.log('   - Type:', typeof manualInstance);
        console.log('   - Has fetchAPI:', typeof manualInstance.fetchAPI === 'function');
        console.log('   - Has getGraphOverview:', typeof manualInstance.getGraphOverview === 'function');
        console.log('   - Initialized:', manualInstance.initialized);
      } catch (error) {
        console.error('   ❌ Manual instantiation failed:', error);
        console.error('   - Error details:', error.message);
        console.error('   - Stack trace:', error.stack);
      }
    } else {
      console.error('❌ ApiService class not found in container');
    }
    
  } catch (error) {
    console.error('❌ Service instantiation debug failed:', error);
  }
}

// Test function to check for syntax errors
function debugSyntaxErrors() {
  console.log('\n🔍 Runtime Debug: Syntax Error Check');
  console.log('='.repeat(60));
  
  try {
    const ApiServiceClass = window.container.services.get('apiService');
    
    if (!ApiServiceClass) {
      console.error('❌ ApiService class not found');
      return;
    }
    
    console.log('✅ ApiService class accessible');
    
    // Try to access the class definition
    console.log('\n🧪 Class Definition Test:');
    try {
      // Check if we can access the class
      console.log('   - Class name:', ApiServiceClass.name);
      console.log('   - Class length:', ApiServiceClass.length);
      
      // Try to access prototype methods
      const prototype = ApiServiceClass.prototype;
      console.log('   - Prototype accessible:', !!prototype);
      console.log('   - Prototype methods:', Object.getOwnPropertyNames(prototype).filter(prop => 
        typeof prototype[prop] === 'function'
      ));
      
    } catch (error) {
      console.error('   ❌ Class definition access error:', error);
    }
    
  } catch (error) {
    console.error('❌ Syntax error check failed:', error);
  }
}

// Main debug function
function debugRuntimeApiServiceIssue() {
  console.log('🚀 Starting Runtime ApiService Debug Session');
  console.log('='.repeat(70));
  
  debugRuntimeApiService();
  debugServiceInstantiationProcess();
  debugSyntaxErrors();
  
  console.log('\n📊 Runtime Debug Summary');
  console.log('='.repeat(30));
  console.log('Key findings:');
  console.log('1. Check if ApiService instance has expected methods');
  console.log('2. Check if service instantiation process is working');
  console.log('3. Check for syntax errors in class definition');
  console.log('4. Check if methods are properly bound to instance');
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.debugRuntimeApiService = debugRuntimeApiService;
  window.debugServiceInstantiationProcess = debugServiceInstantiationProcess;
  window.debugSyntaxErrors = debugSyntaxErrors;
  window.debugRuntimeApiServiceIssue = debugRuntimeApiServiceIssue;
  
  console.log('🧪 Runtime ApiService debug functions loaded:');
  console.log('  - debugRuntimeApiService() - Debug service instance');
  console.log('  - debugServiceInstantiationProcess() - Debug instantiation');
  console.log('  - debugSyntaxErrors() - Debug syntax issues');
  console.log('  - debugRuntimeApiServiceIssue() - Run all debug tests');
}

// Auto-run if in browser
if (typeof window !== 'undefined' && document.readyState === 'complete') {
  setTimeout(() => {
    console.log('🔍 Auto-running runtime ApiService debug...');
    debugRuntimeApiServiceIssue();
  }, 2000);
}
