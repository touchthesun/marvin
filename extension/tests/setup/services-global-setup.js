// extension/tests/setup/services-global-setup.js
/**
 * Global setup for service tests
 * Runs once before all service tests
 * Compatible with Manifest V3 and modern extension patterns
 */

export default async function globalSetup() {
    // Set up global test environment for services
    global.SERVICE_TEST_ENV = {
      startTime: Date.now(),
      testCount: 0,
      serviceInstances: new Set()
    };
    
    // Configure global service test settings
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_TEST_MODE = 'true';
    process.env.ENABLE_SERVICE_LOGGING = 'false';
    
    console.log(' Setting up service test environment...');
  }
  
// extension/tests/setup/services-global-teardown.js
/**
 * Global teardown for service tests
 * Runs once after all service tests
 * Compatible with Manifest V3 and modern extension patterns
 */

export default async function globalTeardown() {
    console.log('🧹 Cleaning up service test environment...');
    
    // Clean up any remaining service instances
    if (global.SERVICE_TEST_ENV && global.SERVICE_TEST_ENV.serviceInstances) {
      for (const service of global.SERVICE_TEST_ENV.serviceInstances) {
        if (service && typeof service.cleanup === 'function') {
          try {
            await service.cleanup();
          } catch (error) {
            console.warn('Failed to cleanup service during global teardown:', error);
          }
        }
      }
    }
    
    // Clear global test environment
    delete global.SERVICE_TEST_ENV;
  }