import { container } from '@core/dependency-container.js';
import { ServiceRegistry } from '@core/service-registry.js';

async function initialize() {
  try {
    // Register all services using ServiceRegistry
    ServiceRegistry.registerAll();
    
    // Initialize all services
    await ServiceRegistry.initializeAll();
    
    // Import and start background service logic
    const { BackgroundService } = await import('./background-service.js');
    const backgroundService = new BackgroundService(container);
    
    await backgroundService.initialize();
    
    console.log('Background script initialization complete');
  } catch (error) {
    console.error('Background script initialization failed:', error);
  }
}

initialize();