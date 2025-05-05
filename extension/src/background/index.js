import { container } from '@core/dependency-container.js';
import { registerAllServices, initializeAllServices } from '@services/service-registry.js';

async function initialize() {
  try {
    // Register all services
    registerAllServices();
    
    // Initialize all services
    await initializeAllServices();
    
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