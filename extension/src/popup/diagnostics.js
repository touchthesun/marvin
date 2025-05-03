
// Global variables
let diagnostics;
let memoryMonitoringIntervalId = null;

// Helper functions
function updateStatus(message, type = 'info') {
  const statusMessage = document.getElementById('status-message');
  const container = document.getElementById('status-container');
  
  if (!statusMessage || !container) return;
  
  statusMessage.textContent = message;
  
  // Reset classes
  container.className = 'status';
  
  // Add type-specific class
  if (type === 'error') {
    container.classList.add('error');
  } else if (type === 'success') {
    container.classList.add('success');
  } else if (type === 'warning') {
    container.classList.add('warning');
  }
}

function logResult(message) {
  const resultOutput = document.getElementById('result-output');
  if (!resultOutput) return;
  
  const timestamp = new Date().toISOString();
  resultOutput.textContent += `[${timestamp}] ${message}\n`;
  
  // Auto-scroll to bottom
  resultOutput.scrollTop = resultOutput.scrollHeight;
}

// Define a minimal diagnostic tools class as fallback
class BasicDiagnosticTools {
  constructor() {
    console.log('Using basic diagnostic tools');
  }
  
  takeMemorySnapshot() {
    if (performance && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }
  
  startMemoryMonitoring(intervalMs, callback) {
    const interval = setInterval(() => {
      const snapshot = this.takeMemorySnapshot();
      if (snapshot && callback) {
        callback(snapshot);
      }
    }, intervalMs);
    
    return interval;
  }
  
  stopAllMonitoring() {
    if (memoryMonitoringIntervalId) {
      clearInterval(memoryMonitoringIntervalId);
    }
  }
  
  async testModuleLoading(modulePath) {
    try {
      const url = chrome.runtime.getURL(modulePath);
      const response = await fetch(url);
      
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to load module: ${response.status} ${response.statusText}`
        };
      }
      
      // Instead of trying to import, just analyze the content
      const code = await response.text();
      
      // Try to extract exports by analyzing the code
      const exportMatches = code.match(/export\s+(const|let|var|function|class|default)\s+(\w+)/g) || [];
      const exportNames = exportMatches.map(match => {
        const parts = match.split(/\s+/);
        return parts[2] || 'unknown';
      });
      
      return {
        success: true,
        loadTime: 0,
        exports: exportNames.length > 0 ? exportNames : ['Basic test only checks if file exists']
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}  

// Initialize the diagnostic UI
function initializeDiagnostics() {
  // Check memory usage
  document.getElementById('check-memory').addEventListener('click', () => {
    const memoryInfo = document.getElementById('memory-info');
    const memoryChart = document.getElementById('memory-chart');
    const memoryBar = document.getElementById('memory-bar');
    
    try {
      const snapshot = diagnostics.takeMemorySnapshot();
      
      if (snapshot) {
        const usedMB = Math.round(snapshot.usedJSHeapSize / (1024 * 1024));
        const totalMB = Math.round(snapshot.totalJSHeapSize / (1024 * 1024));
        const limitMB = Math.round(snapshot.jsHeapSizeLimit / (1024 * 1024));
        
        memoryInfo.innerHTML = `
          <p><strong>Used Heap:</strong> ${usedMB} MB</p>
          <p><strong>Total Heap:</strong> ${totalMB} MB</p>
          <p><strong>Heap Limit:</strong> ${limitMB} MB</p>
        `;
        
        // Update memory chart
        memoryChart.style.display = 'block';
        const percentage = (usedMB / limitMB) * 100;
        memoryBar.style.width = `${percentage}%`;
        
        if (percentage > 80) {
          memoryBar.style.backgroundColor = '#ea4335';
        } else if (percentage > 60) {
          memoryBar.style.backgroundColor = '#fbbc05';
        } else {
          memoryBar.style.backgroundColor = '#4285f4';
        }
        
        updateStatus(`Current memory usage: ${usedMB}MB / ${limitMB}MB`, 'success');
        logResult(`Memory: ${usedMB}MB used of ${limitMB}MB limit (${percentage.toFixed(1)}%)`);
      } else {
        memoryInfo.innerHTML = `<p>Performance.memory API not available in this browser</p>`;
        updateStatus('Performance.memory API not available', 'error');
        logResult('Error: Performance.memory API not available');
      }
    } catch (error) {
      memoryInfo.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error checking memory', 'error');
      logResult(`Error checking memory: ${error.message}`);
    }
  });

  // Start memory monitoring
  document.getElementById('start-memory-monitoring').addEventListener('click', () => {
    const startBtn = document.getElementById('start-memory-monitoring');
    const stopBtn = document.getElementById('stop-memory-monitoring');
    const memoryChart = document.getElementById('memory-chart');
    
    try {
      memoryChart.style.display = 'block';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      
      memoryMonitoringIntervalId = diagnostics.startMemoryMonitoring(2000, (snapshot) => {
        const memoryInfo = document.getElementById('memory-info');
        const memoryBar = document.getElementById('memory-bar');
        
        const usedMB = Math.round(snapshot.usedJSHeapSize / (1024 * 1024));
        const totalMB = Math.round(snapshot.totalJSHeapSize / (1024 * 1024));
        const limitMB = Math.round(snapshot.jsHeapSizeLimit / (1024 * 1024));
        
        memoryInfo.innerHTML = `
          <p><strong>Used Heap:</strong> ${usedMB} MB</p>
          <p><strong>Total Heap:</strong> ${totalMB} MB</p>
          <p><strong>Heap Limit:</strong> ${limitMB} MB</p>
        `;
        
        const percentage = (usedMB / limitMB) * 100;
        memoryBar.style.width = `${percentage}%`;
        
        if (percentage > 80) {
          memoryBar.style.backgroundColor = '#ea4335';
        } else if (percentage > 60) {
          memoryBar.style.backgroundColor = '#fbbc05';
        } else {
          memoryBar.style.backgroundColor = '#4285f4';
        }
      });
      
      updateStatus('Memory monitoring started', 'success');
      logResult('Memory monitoring started - updating every 2 seconds');
    } catch (error) {
      updateStatus(`Error starting monitoring: ${error.message}`, 'error');
      logResult(`Error starting memory monitoring: ${error.message}`);
    }
  });

  // Stop memory monitoring
  document.getElementById('stop-memory-monitoring').addEventListener('click', () => {
    const startBtn = document.getElementById('start-memory-monitoring');
    const stopBtn = document.getElementById('stop-memory-monitoring');
    
    try {
      if (memoryMonitoringIntervalId) {
        clearInterval(memoryMonitoringIntervalId);
        memoryMonitoringIntervalId = null;
      }
      diagnostics.stopAllMonitoring();
      
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
      
      updateStatus('Memory monitoring stopped', 'warning');
      logResult('Memory monitoring stopped');
    } catch (error) {
      updateStatus(`Error stopping monitoring: ${error.message}`, 'error');
      logResult(`Error stopping memory monitoring: ${error.message}`);
    }
  });

  // Component test functions
  function testComponentLoading(name, path) {
    updateStatus(`Testing ${name} loading...`);
    logResult(`Testing ${name} loading from ${path}`);
    
    diagnostics.testModuleLoading(path)
      .then(result => {
        const componentStatus = document.getElementById('component-status');
        
        if (result.success) {
          componentStatus.innerHTML = `<p><strong>${name}:</strong> Loaded successfully</p>`;
          updateStatus(`${name} loaded successfully`, 'success');
          logResult(`${name} loaded successfully`);
        } else {
          componentStatus.innerHTML = `<p><strong>${name}:</strong> Failed to load - ${result.error}</p>`;
          updateStatus(`${name} failed to load: ${result.error}`, 'error');
          logResult(`ERROR: ${name} failed to load: ${result.error}`);
        }
      })
      .catch(error => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = `<p><strong>${name}:</strong> Failed with error - ${error.message}</p>`;
        updateStatus(`${name} test error: ${error.message}`, 'error');
        logResult(`ERROR: ${name} test error: ${error.message}`);
      });
  }

  // Load Overview Panel
  document.getElementById('load-overview').addEventListener('click', () => {
    testComponentLoading('Overview Panel', 'dashboard/js/components/overview-panel.js');
  });

  // Load Capture Panel
  document.getElementById('load-capture').addEventListener('click', () => {
    testComponentLoading('Capture Panel', 'dashboard/js/components/capture-panel.js');
  });

  // Load Knowledge Panel
  document.getElementById('load-knowledge').addEventListener('click', () => {
    testComponentLoading('Knowledge Panel', 'dashboard/js/components/knowledge-panel.js');
  });

  // Load Settings Panel
  document.getElementById('load-settings').addEventListener('click', () => {
    testComponentLoading('Settings Panel', 'dashboard/js/components/settings-panel.js');
  });

  // Check environment
  document.getElementById('check-environment').addEventListener('click', () => {
    const envInfo = document.getElementById('environment-info');
    
    try {
      envInfo.innerHTML = `
        <p><strong>Browser:</strong> ${navigator.userAgent}</p>
        <p><strong>Language:</strong> ${navigator.language}</p>
        <p><strong>Online:</strong> ${navigator.onLine ? 'Yes' : 'No'}</p>
        <p><strong>Date/Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Cores:</strong> ${navigator.hardwareConcurrency || 'Unknown'}</p>
        <p><strong>Window Size:</strong> ${window.innerWidth}x${window.innerHeight}</p>
      `;
      
      updateStatus('Environment info loaded', 'success');
      logResult('Environment info loaded successfully');
    } catch (error) {
      envInfo.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error checking environment', 'error');
      logResult(`ERROR checking environment: ${error.message}`);
    }
  });

  // Check storage
  document.getElementById('check-storage').addEventListener('click', () => {
    const storageInfo = document.getElementById('storage-info');
    storageInfo.textContent = 'Loading storage data...';
    
    try {
      chrome.storage.local.get(null, (data) => {
        if (chrome.runtime.lastError) {
          storageInfo.textContent = `Error: ${chrome.runtime.lastError.message}`;
          updateStatus('Error accessing storage', 'error');
          return;
        }
        
        const keys = Object.keys(data);
        
        if (keys.length === 0) {
          storageInfo.textContent = 'No data in local storage';
        } else {
          storageInfo.innerHTML = `
            <p><strong>Storage Keys (${keys.length}):</strong></p>
            <ul>
              ${keys.map(key => `<li>${key} (${typeof data[key]})</li>`).join('')}
            </ul>
          `;
        }
        
        updateStatus(`Found ${keys.length} items in storage`, 'success');
        logResult(`Storage check: found ${keys.length} items`);
      });
    } catch (error) {
      storageInfo.textContent = `Error: ${error.message}`;
      updateStatus('Error checking storage', 'error');
      logResult(`ERROR checking storage: ${error.message}`);
    }
  });

  // Check extension info
  document.getElementById('check-extension').addEventListener('click', () => {
    const infoElement = document.getElementById('extension-info');
    
    try {
      const manifest = chrome.runtime.getManifest();
      
      infoElement.innerHTML = `
        <p><strong>Extension ID:</strong> ${chrome.runtime.id}</p>
        <p><strong>Name:</strong> ${manifest.name}</p>
        <p><strong>Version:</strong> ${manifest.version}</p>
        <p><strong>Description:</strong> ${manifest.description}</p>
        <p><strong>Manifest Version:</strong> ${manifest.manifest_version}</p>
        <p><strong>Permissions:</strong> ${manifest.permissions ? manifest.permissions.join(', ') : 'None'}</p>
      `;
      
      updateStatus('Extension info loaded successfully', 'success');
      logResult('Extension info loaded');
    } catch (error) {
      infoElement.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error loading extension info', 'error');
      logResult(`ERROR loading extension info: ${error.message}`);
    }
  });
  
  // Ping background script
  document.getElementById('ping-background').addEventListener('click', () => {
    const statusElement = document.getElementById('background-status');
    statusElement.textContent = 'Pinging background script...';
    
    try {
      chrome.runtime.sendMessage({ action: 'ping', timestamp: Date.now() }, (response) => {
        if (chrome.runtime.lastError) {
          statusElement.textContent = `Error: ${chrome.runtime.lastError.message}`;
          updateStatus('Error connecting to background script', 'error');
          logResult(`ERROR: Background connection failed - ${chrome.runtime.lastError.message}`);
          return;
        }
        
        if (response && response.success) {
          statusElement.textContent = `Connected to background script. Round-trip time: ${Date.now() - response.timestamp}ms`;
          updateStatus('Background connection successful', 'success');
          logResult(`Background connection successful. RTT: ${Date.now() - response.timestamp}ms`);
        } else {
          statusElement.textContent = 'No response from background script';
          updateStatus('Background connection failed', 'error');
          logResult('ERROR: No response from background script');
        }
      });
    } catch (error) {
      statusElement.textContent = `Error: ${error.message}`;
      updateStatus('Error connecting to background script', 'error');
      logResult(`ERROR connecting to background script: ${error.message}`);
    }
  });
  
  // Clear results
  document.getElementById('clear-results').addEventListener('click', () => {
    const resultOutput = document.getElementById('result-output');
    if (resultOutput) {
      resultOutput.textContent = '';
      updateStatus('Results cleared', 'success');
    }
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  logResult('Marvin Extension Diagnostic Tool started');
  
  try {
    // Check if DiagnosticTools is available from external script
    if (window.DiagnosticTools) {
      // Use global DiagnosticTools
      diagnostics = new window.DiagnosticTools();
      logResult('DiagnosticTools initialized from global scope');
    } else {
      // Fallback to basic tools
      logResult('WARNING: DiagnosticTools not found in global scope, using basic implementation');
      diagnostics = new BasicDiagnosticTools();
    }
    
    const toolsStatus = document.getElementById('diagnostic-tools-status');
    if (toolsStatus) {
      toolsStatus.textContent = 'DiagnosticTools initialized';
      toolsStatus.className = 'diagnostic-status import-success';
    }
    
    // Initialize UI
    initializeDiagnostics();
    
  } catch (error) {
    console.error('Error initializing diagnostic tools:', error);
    logResult(`ERROR: Failed to initialize DiagnosticTools: ${error.message}`);
    
    // Use basic implementation
    diagnostics = new BasicDiagnosticTools();
    initializeDiagnostics();
    
    const toolsStatus = document.getElementById('diagnostic-tools-status');
    if (toolsStatus) {
      toolsStatus.textContent = `Error initializing DiagnosticTools: ${error.message}`;
      toolsStatus.className = 'diagnostic-status import-error';
    }
  }
  enhanceDiagnostics();
});

/**
 * Test component paths using the actual directory structure
 */
function testComponentPaths() {
  const fileList = document.getElementById('file-list');
  
  // Check if the element exists before trying to modify it
  if (!fileList) {
    console.error('Element with ID "file-list" not found. Creating it...');
    
    // Create the element if it doesn't exist
    const container = document.querySelector('.container') || document.body;
    const newPanel = document.createElement('div');
    newPanel.className = 'panel';
    newPanel.innerHTML = `
      <h2>Component Path Test Results</h2>
      <pre id="file-list" class="code-output">Testing component paths...\n</pre>
    `;
    
    container.appendChild(newPanel);
    
    // Now get the newly created element
    const fileListElement = document.getElementById('file-list');
    if (!fileListElement) {
      console.error('Failed to create and find the file-list element');
      return; // Exit if we still can't find it
    }
    
    // Continue with the existing fileList variable set to the new element
    return testComponentPaths(); // Recursively call the function now that the element exists
  }
  
  fileList.textContent = 'Testing component paths...\n';
  
  const componentsToTest = [
    'overview-panel',
    'capture-panel',
    'knowledge-panel',
    'settings-panel',
    'tasks-panel',
    'assistant-panel',
    'navigation'
  ];
  
  const basePaths = [
    'dashboard/js/components/',
    '/dashboard/js/components/',
    'js/components/',
    '/js/components/',
    './js/components/',
    '../dashboard/js/components/',
    './components/',
    '../components/',
    'components/'
  ];
  
  // Keep track of which components are found
  const foundComponents = new Set();
  
  // Test each component with each path
  componentsToTest.forEach(component => {
    fileList.textContent += `\nTesting paths for ${component}.js:\n`;
    
    basePaths.forEach(basePath => {
      const fullPath = `${basePath}${component}.js`;
      try {
        const url = chrome.runtime.getURL(fullPath);
        
        // Try to fetch the file to check if it exists
        fetch(url)
          .then(response => {
            if (response.ok) {
              fileList.textContent += `✅ ${fullPath} - Found\n`;
              foundComponents.add(component);
            } else {
              fileList.textContent += `❌ ${fullPath} - Error: ${response.status}\n`;
            }
          })
          .catch(error => {
            fileList.textContent += `❌ ${fullPath} - Error: ${error.message}\n`;
          });
      } catch (error) {
        fileList.textContent += `❌ ${fullPath} - Runtime error: ${error.message}\n`;
      }
    });
  });
  
  // Add a summary after testing
  setTimeout(() => {
    if (fileList) { // Check again in case the element was removed
      fileList.textContent += `\n=== SUMMARY ===\n`;
      fileList.textContent += `Found components: ${Array.from(foundComponents).join(', ') || 'None'}\n`;
      fileList.textContent += `Missing components: ${componentsToTest.filter(c => !foundComponents.has(c)).join(', ') || 'None'}\n`;
    }
  }, 2000);
}


/**
 * Test loading a component dynamically
 * @param {string} component - Name of the component to test
 */
function testComponentLoading(component) {
  updateStatus(`Testing dynamic loading of ${component}...`);
  
  // Get or create the result output element
  let resultOutput = document.getElementById('result-output');
  if (!resultOutput) {
    console.error('Element with ID "result-output" not found. Creating it...');
    
    // Create the element if it doesn't exist
    const container = document.querySelector('.container') || document.body;
    const newPanel = document.createElement('div');
    newPanel.className = 'panel';
    newPanel.innerHTML = `
      <h2>Component Loading Test Results</h2>
      <pre id="result-output" class="code-output"></pre>
    `;
    
    container.appendChild(newPanel);
    
    // Now get the newly created element
    resultOutput = document.getElementById('result-output');
    if (!resultOutput) {
      console.error('Failed to create and find the result-output element');
      return; // Exit if we still can't find it
    }
  }
  
  resultOutput.textContent += `Testing dynamic loading of ${component}...\n`;
  
  // Determine full component name
  const componentName = component.endsWith('.js') ? component : `${component}.js`;
  
  // Try each possible path
  const basePaths = [
    'dashboard/js/components/',
    '/dashboard/js/components/',
    'js/components/',
    '/js/components/',
    './js/components/',
    '../dashboard/js/components/',
    './components/',
    '../components/',
    'components/'
  ];
  
  // Keep track of successful imports
  let success = false;
  
  // Try each path in sequence
  tryNextPath(0);
  
  function tryNextPath(index) {
    if (index >= basePaths.length) {
      // All paths tried without success
      if (!success && resultOutput) {
        resultOutput.textContent += `❌ Failed to import ${componentName} from any path\n`;
        updateStatus(`Failed to import ${componentName}`, 'error');
      }
      return;
    }
    
    const path = basePaths[index];
    const fullPath = `${path}${componentName}`;
    
    try {
      const url = chrome.runtime.getURL(fullPath);
      if (resultOutput) {
        resultOutput.textContent += `Trying ${fullPath}...\n`;
      }
      
      // Check if file exists
      fetch(url)
        .then(response => {
          if (response.ok) {
            if (resultOutput) {
              resultOutput.textContent += `✅ Found file at ${fullPath}\n`;
            }
            
            // Instead of dynamic import, use fetch to get the content
            return response.text().then(code => {
              // Create a test container to check if the module can be loaded
              const testContainer = document.createElement('div');
              testContainer.id = `test-container-${componentName.replace('.js', '')}`;
              testContainer.style.display = 'none';
              document.body.appendChild(testContainer);
              
              // Try to extract exports by analyzing the code
              const exportMatches = code.match(/export\s+(const|let|var|function|class|default)\s+(\w+)/g) || [];
              const exportNames = exportMatches.map(match => {
                const parts = match.split(/\s+/);
                return parts[2] || 'unknown';
              });
              
              if (resultOutput) {
                resultOutput.textContent += `✅ Successfully analyzed module from ${fullPath}\n`;
                resultOutput.textContent += `Detected exports: ${exportNames.join(', ') || 'None detected'}\n`;
              }
              
              success = true;
              updateStatus(`Successfully analyzed ${componentName}`, 'success');
              
              // Clean up
              testContainer.remove();
            });
          } else {
            if (resultOutput) {
              resultOutput.textContent += `❌ File not found at ${fullPath}: ${response.status}\n`;
            }
            // Try next path
            tryNextPath(index + 1);
          }
        })
        .catch(fetchError => {
          if (resultOutput) {
            resultOutput.textContent += `❌ Fetch error for ${fullPath}: ${fetchError.message}\n`;
          }
          // Try next path
          tryNextPath(index + 1);
        });
    } catch (error) {
      if (resultOutput) {
        resultOutput.textContent += `❌ Runtime error for ${fullPath}: ${error.message}\n`;
      }
      // Try next path
      tryNextPath(index + 1);
    }
  }
}



/**
 * Add these to the document.addEventListener('DOMContentLoaded', () => {...}) 
 * handler in the existing diagnostics.js
 */
function enhanceDiagnostics() {
  // Create a container for component diagnostics buttons
  const componentDiagPanel = document.createElement('div');
  componentDiagPanel.className = 'panel';
  componentDiagPanel.innerHTML = `
    <h2>Component Path Diagnostics</h2>
    <p>Tools for diagnosing and fixing component path issues</p>
    <div>
      <button id="test-component-paths" class="btn-secondary">Test Component Paths</button>
      <button id="test-navigation-loading" class="btn-secondary">Test Navigation Loading</button>
      <button id="test-overview-loading" class="btn-secondary">Test Overview Panel Loading</button>
    </div>
  `;

  // Find where to insert the new panel
  const containers = document.querySelectorAll('.container');
  if (containers.length > 0) {
    const lastPanel = containers[0].querySelector('.panel:last-child');
    if (lastPanel) {
      lastPanel.parentNode.insertBefore(componentDiagPanel, lastPanel.nextSibling);
    } else {
      containers[0].appendChild(componentDiagPanel);
    }
  }

  // Attach event handlers
  document.getElementById('test-component-paths')?.addEventListener('click', testComponentPaths);
  document.getElementById('test-navigation-loading')?.addEventListener('click', () => {
    testComponentLoading('navigation');
  });
  document.getElementById('test-overview-loading')?.addEventListener('click', () => {
    testComponentLoading('overview-panel');
  });
}