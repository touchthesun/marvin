/**
 * Debug Test: ApiService Method Availability
 * This test helps identify why getGraphOverview method is missing
 */

// Test function to debug ApiService
function debugApiService() {
  console.log('🔍 Debug: ApiService Method Availability');
  console.log('='.repeat(50));
  
  try {
    // Get the service from container
    const apiService = window.container.getService('apiService');
    
    if (!apiService) {
      console.error('❌ ApiService not found in container');
      return;
    }
    
    console.log('✅ ApiService found');
    console.log('   - Type:', typeof apiService);
    console.log('   - Constructor name:', apiService.constructor.name);
    console.log('   - Initialized:', apiService.initialized);
    
    // Check prototype methods
    console.log('\n📋 Prototype methods:');
    const prototype = Object.getPrototypeOf(apiService);
    const methods = Object.getOwnPropertyNames(prototype);
    methods.forEach(method => {
      if (typeof apiService[method] === 'function') {
        console.log(`   ✅ ${method}()`);
      } else {
        console.log(`   ❌ ${method} (not a function)`);
      }
    });
    
    // Check for getGraphOverview specifically
    console.log('\n🔍 getGraphOverview method check:');
    console.log('   - Has getGraphOverview:', typeof apiService.getGraphOverview === 'function');
    console.log('   - getGraphOverview value:', apiService.getGraphOverview);
    
    // Check if it's in the prototype chain
    console.log('\n🔍 Prototype chain check:');
    let current = apiService;
    let level = 0;
    while (current && level < 5) {
      console.log(`   Level ${level}:`, current.constructor.name);
      const props = Object.getOwnPropertyNames(current);
      if (props.includes('getGraphOverview')) {
        console.log(`   ✅ getGraphOverview found at level ${level}`);
        break;
      }
      current = Object.getPrototypeOf(current);
      level++;
    }
    
    // Try to call the method
    console.log('\n🧪 Testing method call:');
    try {
      if (typeof apiService.getGraphOverview === 'function') {
        console.log('   ✅ Method is callable');
      } else {
        console.log('   ❌ Method is not callable');
      }
    } catch (error) {
      console.error('   ❌ Error testing method:', error);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Test function to check service registration
function debugServiceRegistration() {
  console.log('\n🔍 Debug: Service Registration');
  console.log('='.repeat(50));
  
  try {
    console.log('📋 Services in container:');
    const services = Array.from(window.container.services.keys());
    services.forEach(serviceName => {
      console.log(`   - ${serviceName}`);
    });
    
    console.log('\n📋 Service instances:');
    const instances = Array.from(window.container.serviceInstances.keys());
    instances.forEach(instanceName => {
      console.log(`   - ${instanceName}`);
    });
    
    console.log('\n📋 Service metadata:');
    const metadata = Array.from(window.container.serviceMetadata.keys());
    metadata.forEach(metaName => {
      console.log(`   - ${metaName}`);
    });
    
  } catch (error) {
    console.error('❌ Service registration debug failed:', error);
  }
}

// Test function to check ApiService class definition
function debugApiServiceClass() {
  console.log('\n🔍 Debug: ApiService Class Definition');
  console.log('='.repeat(50));
  
  try {
    // Get the service class from container
    const ApiServiceClass = window.container.services.get('apiService');
    
    if (!ApiServiceClass) {
      console.error('❌ ApiService class not found in container');
      return;
    }
    
    console.log('✅ ApiService class found');
    console.log('   - Type:', typeof ApiServiceClass);
    console.log('   - Name:', ApiServiceClass.name);
    
    // Check class prototype
    console.log('\n📋 Class prototype methods:');
    const prototype = ApiServiceClass.prototype;
    const methods = Object.getOwnPropertyNames(prototype);
    methods.forEach(method => {
      if (typeof prototype[method] === 'function') {
        console.log(`   ✅ ${method}()`);
      } else {
        console.log(`   ❌ ${method} (not a function)`);
      }
    });
    
    // Check for getGraphOverview in class
    console.log('\n🔍 getGraphOverview in class:');
    console.log('   - Has getGraphOverview:', typeof prototype.getGraphOverview === 'function');
    console.log('   - getGraphOverview value:', prototype.getGraphOverview);
    
  } catch (error) {
    console.error('❌ ApiService class debug failed:', error);
  }
}

// Main debug function
function debugApiServiceIssue() {
  console.log('🚀 Starting ApiService Debug Session');
  console.log('='.repeat(60));
  
  debugApiService();
  debugServiceRegistration();
  debugApiServiceClass();
  
  console.log('\n📊 Debug Summary');
  console.log('='.repeat(30));
  console.log('If getGraphOverview is missing:');
  console.log('1. Check if ApiService class has the method');
  console.log('2. Check if service is properly instantiated');
  console.log('3. Check if method is being overridden');
  console.log('4. Check if there are syntax errors in ApiService');
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.debugApiService = debugApiService;
  window.debugServiceRegistration = debugServiceRegistration;
  window.debugApiServiceClass = debugApiServiceClass;
  window.debugApiServiceIssue = debugApiServiceIssue;
  
  console.log('🧪 ApiService debug functions loaded:');
  console.log('  - debugApiService() - Debug service instance');
  console.log('  - debugServiceRegistration() - Debug registration');
  console.log('  - debugApiServiceClass() - Debug class definition');
  console.log('  - debugApiServiceIssue() - Run all debug tests');
}

// Auto-run if in browser
if (typeof window !== 'undefined' && document.readyState === 'complete') {
  setTimeout(() => {
    console.log('🔍 Auto-running ApiService debug...');
    debugApiServiceIssue();
  }, 2000);
}
