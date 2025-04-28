// debug-console.js - Debug console functionality for the dashboard

// Add debug panel controls
document.addEventListener('DOMContentLoaded', function() {
  // Show/hide debug panel
  document.getElementById('show-debug-panel').addEventListener('click', function() {
    document.getElementById('debug-panel').style.display = 'block';
    this.style.display = 'none';
  });
  
  document.getElementById('toggle-debug-panel').addEventListener('click', function() {
    document.getElementById('debug-panel').style.display = 'none';
    document.getElementById('show-debug-panel').style.display = 'block';
  });
  
  document.getElementById('clear-debug').addEventListener('click', function() {
    document.getElementById('debug-output').innerHTML = '';
  });
  
  document.getElementById('test-components').addEventListener('click', function() {
    const debugOutput = document.getElementById('debug-output');
    debugOutput.innerHTML += '<h4>Component Test Results:</h4>';
    
    // Test if components are registered
    const components = window.MarvinComponents || {};
    for (const name in components) {
      debugOutput.innerHTML += `<div>✅ Component ${name} is registered</div>`;
    }
    
    // Check for components we expect but don't find
    const expectedComponents = [
      'navigation', 'overview-panel', 'capture-panel', 
      'knowledge-panel', 'settings-panel', 'tasks-panel', 
      'assistant-panel'
    ];
    
    for (const name of expectedComponents) {
      if (!components[name]) {
        debugOutput.innerHTML += `<div>❌ Component ${name} not found</div>`;
      }
    }
  });
  
  document.getElementById('open-diagnostics').addEventListener('click', function() {
    chrome.tabs.create({ url: '/popup/diagnostics.html' });
  });
  
  // Override console methods to capture debug output
  (function() {
    const debugOutput = document.getElementById('debug-output');
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    
    // Helper to create timestamped message
    function formatMessage(level, ...args) {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      return `<div class="log-${level}">[${timestamp}] [${level.toUpperCase()}] ${message}</div>`;
    }
    
    // Override console methods
    console.log = function(...args) {
      originalConsole.log.apply(console, args);
      if (debugOutput) {
        debugOutput.innerHTML += formatMessage('log', ...args);
        debugOutput.scrollTop = debugOutput.scrollHeight;
      }
    };
    
    console.info = function(...args) {
      originalConsole.info.apply(console, args);
      if (debugOutput) {
        debugOutput.innerHTML += formatMessage('info', ...args);
        debugOutput.scrollTop = debugOutput.scrollHeight;
      }
    };
    
    console.warn = function(...args) {
      originalConsole.warn.apply(console, args);
      if (debugOutput) {
        debugOutput.innerHTML += formatMessage('warn', ...args);
        debugOutput.scrollTop = debugOutput.scrollHeight;
      }
    };
    
    console.error = function(...args) {
      originalConsole.error.apply(console, args);
      if (debugOutput) {
        debugOutput.innerHTML += formatMessage('error', ...args);
        debugOutput.scrollTop = debugOutput.scrollHeight;
      }
    };
  })();
});
