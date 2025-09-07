// extension/tests/helpers/service-resolver.js
/**
 * Custom resolver for service tests
 * Handles module resolution for service-specific imports
 */

const path = require('path');

module.exports = (request, options) => {
  // Handle service-specific module resolution
  if (request.startsWith('@services/')) {
    const servicePath = request.replace('@services/', '');
    return path.resolve(__dirname, '../../src/services', servicePath);
  }
  
  if (request.startsWith('@utils/')) {
    const utilPath = request.replace('@utils/', '');
    return path.resolve(__dirname, '../../src/utils', utilPath);
  }
  
  if (request.startsWith('@core/')) {
    const corePath = request.replace('@core/', '');
    return path.resolve(__dirname, '../../src/core', corePath);
  }
  
  // Handle Chrome API mocking
  if (request === 'chrome') {
    return path.resolve(__dirname, '../__mocks__/chrome-api.js');
  }
  
  // Default resolution
  return options.defaultResolver(request, options);
};