// Diagnostic utilities for the diagnostic panel
// All the JavaScript that was previously inline

// Global variables
let DiagnosticTools;
let diagnostics;
let memoryMonitoringIntervalId = null;

// Helper functions
function updateStatus(message, type = 'info') {
  const statusMessage = document.getElementById('status-message');
  const container = document.getElementById('status-container');
  
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
  const timestamp = new Date().toISOString();
  resultOutput.textContent += `[${timestamp}] ${message}\n`;
  
  // Auto-scroll to bottom
  resultOutput.scrollTop = resultOutput.scrollHeight;
}

// Try to load DiagnosticTools from various possible paths
async function loadDiagnosticTools() {
  const toolsStatus = document.getElementById('diagnostic-tools-status');
  toolsStatus.textContent = 'Attempting to load diagnostic tools...';
  
  const possiblePaths = [
    '../popup/diagnostics.js',
  ];
  
  let loaded = false;
  let lastError = null;
  
  for (const path of possiblePaths) {
    try {
      console.log(`Attempting to import DiagnosticTools from ${path}`);
      const module = await import(path);
      
      if (module && module.DiagnosticTools) {
        DiagnosticTools = module.DiagnosticTools;
        diagnostics = new DiagnosticTools();
        console.log(`Successfully loaded DiagnosticTools from ${path}`);
        logResult(`Successfully loaded DiagnosticTools from ${path}`);
        
        toolsStatus.textContent = `DiagnosticTools loaded successfully from ${path}`;
        toolsStatus.className = 'diagnostic-status import-success';
        
        loaded = true;
        break;
      } else {
        console.warn(`Module loaded from ${path} but DiagnosticTools not found`);
      }
    } catch (error) {
      console.warn(`Failed to load from ${path}:`, error);
      lastError = error;
    }
  }
  
  if (!loaded) {
    toolsStatus.textContent = `Failed to load DiagnosticTools: ${lastError?.message || 'Unknown error'}`;
    toolsStatus.className = 'diagnostic-status import-error';
    
    logResult(`ERROR: Failed to load DiagnosticTools from any known path. Last error: ${lastError?.message || 'Unknown error'}`);
    console.error('Failed to load DiagnosticTools', lastError);
    
    // Fall back to basic functionality
    initializeBasicDiagnostics();
    return false;
  }
  
  initializeDiagnosticTools();
  return true;
}

// Initialize with DiagnosticTools
function initializeDiagnosticTools() {
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

  // Test component loading
  async function testComponentLoading(componentName, componentPath) {
    updateStatus(`Testing ${componentName} loading...`);
    logResult(`Testing ${componentName} loading from ${componentPath}`);
    
    try {
      const result = await diagnostics.testModuleLoading(componentPath);
      
      if (result.success) {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = `<p><strong>${componentName}:</strong> Loaded successfully in ${result.loadTime.toFixed(2)}ms</p>`;
        
        updateStatus(`${componentName} loaded successfully`, 'success');
        logResult(`${componentName} loaded successfully in ${result.loadTime.toFixed(2)}ms. Exports: ${result.exports.join(', ')}`);
        
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const componentStatus = document.getElementById('component-status');
      componentStatus.innerHTML = `<p><strong>${componentName}:</strong> Failed to load - ${error.message}</p>`;
      
      updateStatus(`${componentName} failed to load: ${error.message}`, 'error');
      logResult(`ERROR: ${componentName} failed to load: ${error.message}`);
      
      return false;
    }
  }

  // Load Overview Panel
  document.getElementById('load-overview').addEventListener('click', () => {
    testComponentLoading('Overview Panel', './js/components/overview-panel.js');
  });

  // Load Capture Panel
  document.getElementById('load-capture').addEventListener('click', () => {
    testComponentLoading('Capture Panel', './js/components/capture-panel.js');
  });

  // Load Knowledge Panel
  document.getElementById('load-knowledge').addEventListener('click', () => {
    testComponentLoading('Knowledge Panel', './js/components/knowledge-panel.js');
  });

  // Load Settings Panel
  document.getElementById('load-settings').addEventListener('click', () => {
    testComponentLoading('Settings Panel', './js/components/settings-panel.js');
  });

  // Check all modules
  document.getElementById('check-all-modules').addEventListener('click', async () => {
    updateStatus('Checking all modules...', 'warning');
    logResult('Starting to check all modules...');
    
    const componentStatus = document.getElementById('component-status');
    componentStatus.innerHTML = '<p>Testing all modules, please wait...</p>';
    
    try {
      const modules = await diagnostics.getLoadedModules();
      
      componentStatus.innerHTML = '<h3>Module Test Results</h3>';
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const [path, result] of Object.entries(modules)) {
        const name = path.split('/').pop().replace('.js', '');
        
        if (result.success) {
          componentStatus.innerHTML += `<p>✅ <strong>${name}</strong>: Loaded in ${result.loadTime.toFixed(2)}ms</p>`;
          successCount++;
        } else {
          componentStatus.innerHTML += `<p>❌ <strong>${name}</strong>: Failed - ${result.error}</p>`;
          errorCount++;
        }
      }
      
      updateStatus(`Module check complete: ${successCount} succeeded, ${errorCount} failed`, errorCount > 0 ? 'warning' : 'success');
      logResult(`Module check complete: ${successCount} succeeded, ${errorCount} failed`);
    } catch (error) {
      componentStatus.innerHTML = `<p>Error checking modules: ${error.message}</p>`;
      updateStatus(`Error checking modules: ${error.message}`, 'error');
      logResult(`ERROR checking modules: ${error.message}`);
    }
  });

  // List extension files
  document.getElementById('list-files').addEventListener('click', () => {
    const fileList = document.getElementById('file-list');
    fileList.textContent = 'Loading file list...';
    
    try {
      chrome.runtime.getPackageDirectoryEntry((root) => {
        fileList.textContent = ''; // Clear previous content
        listDirectory(root, '', fileList);
        updateStatus('File listing started', 'success');
        logResult('File listing started');
      });
    } catch (error) {
      fileList.textContent = `Error: ${error.message}`;
      updateStatus('Error listing files', 'error');
      logResult(`ERROR listing files: ${error.message}`);
    }
  });

  function listDirectory(dir, path, output) {
    const reader = dir.createReader();
    reader.readEntries((entries) => {
      if (entries.length === 0) {
        if (path === '') {
          output.textContent += 'No files found in the root directory\n';
        }
        return;
      }
      
      entries.forEach((entry) => {
        output.textContent += path + entry.name + (entry.isDirectory ? '/' : '') + '\n';
        
        if (entry.isDirectory) {
          try {
            entry.createReader();
            listDirectory(entry, path + entry.name + '/', output);
          } catch (e) {
            output.textContent += `Error reading ${path}${entry.name}/: ${e.message}\n`;
          }
        }
      });
    });
  }

  // Check resources
  document.getElementById('check-resources').addEventListener('click', () => {
    const fileList = document.getElementById('file-list');
    fileList.textContent = 'Checking resources...\n';
    
    // List of critical files to check
    const filesToCheck = [
      'dashboard/dashboard.html',
      'dashboard/dashboard-minimal.html',
      'dashboard/js/utils/diagnostics.js',
      'popup/popup.html',
      'popup/popup.js',
      'background/background.js'
    ];
    
    filesToCheck.forEach(file => {
      try {
        const url = chrome.runtime.getURL(file);
        
        // Attempt to fetch the file to verify it exists
        fetch(url)
          .then(response => {
            if (response.ok) {
              fileList.textContent += `✅ ${file} - Found\n`;
            } else {
              fileList.textContent += `❌ ${file} - Error: ${response.status} ${response.statusText}\n`;
            }
          })
          .catch(error => {
            fileList.textContent += `❌ ${file} - Error: ${error.message}\n`;
          });
      } catch (error) {
        fileList.textContent += `❌ ${file} - Error: ${error.message}\n`;
      }
    });
    
    updateStatus('Resource check started', 'success');
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

  // Check environment
  document.getElementById('check-environment').addEventListener('click', () => {
    const envInfo = document.getElementById('environment-info');
    
    try {
      envInfo.innerHTML = `
        <p><strong>Browser:</strong> ${navigator.userAgent}</p>
        <p><strong>Platform:</strong> ${navigator.platform}</p>
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

  // Clear results
  document.getElementById('clear-results').addEventListener('click', () => {
    document.getElementById('result-output').textContent = '';
    updateStatus('Results cleared', 'success');
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
}

// Fallback to basic functionality if DiagnosticTools can't be loaded
function initializeBasicDiagnostics() {
  logResult('WARNING: Using basic diagnostic functionality (DiagnosticTools not available)');
  updateStatus('Using basic diagnostic functionality (DiagnosticTools not available)', 'warning');
  
  // Basic check extension info
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
      `;
      
      updateStatus('Extension info loaded successfully', 'success');
      logResult('Extension info loaded');
    } catch (error) {
      infoElement.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error loading extension info', 'error');
      logResult(`ERROR loading extension info: ${error.message}`);
    }
  });
  
  // Basic memory check
  document.getElementById('check-memory').addEventListener('click', () => {
    const memoryInfo = document.getElementById('memory-info');
    const memoryChart = document.getElementById('memory-chart');
    const memoryBar = document.getElementById('memory-bar');
    
    try {
      if (performance && performance.memory) {
        const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        const totalMB = Math.round(performance.memory.totalJSHeapSize / (1024 * 1024));
        const limitMB = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
        
        memoryInfo.innerHTML = `
          <p><strong>Used Heap:</strong> ${usedMB} MB</p>
          <p><strong>Total Heap:</strong> ${totalMB} MB</p>
          <p><strong>Heap Limit:</strong> ${limitMB} MB</p>
        `;
        
        // Update memory chart
        memoryChart.style.display = 'block';
        const percentage = (usedMB / limitMB) * 100;
        memoryBar.style.width = `${percentage}%`;
        
        updateStatus(`Current memory usage: ${usedMB}MB / ${limitMB}MB`, 'success');
        logResult(`Memory: ${usedMB}MB used of ${limitMB}MB limit (${percentage.toFixed(1)}%)`);
      } else {
        memoryInfo.innerHTML = `<p>Performance.memory API not available in this browser</p>`;
        updateStatus('Performance.memory API not available', 'error');
        logResult('ERROR: Performance.memory API not available');
      }
    } catch (error) {
      memoryInfo.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error checking memory', 'error');
      logResult(`ERROR checking memory: ${error.message}`);
    }
  });
  
  // Basic memory monitoring
  document.getElementById('start-memory-monitoring').addEventListener('click', () => {
    const startBtn = document.getElementById('start-memory-monitoring');
    const stopBtn = document.getElementById('stop-memory-monitoring');
    const memoryChart = document.getElementById('memory-chart');
    
    memoryChart.style.display = 'block';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    if (memoryMonitoringIntervalId) {
      clearInterval(memoryMonitoringIntervalId);
    }
    
    memoryMonitoringIntervalId = setInterval(() => {
      if (performance && performance.memory) {
        const memoryInfo = document.getElementById('memory-info');
        const memoryBar = document.getElementById('memory-bar');
        
        const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        const totalMB = Math.round(performance.memory.totalJSHeapSize / (1024 * 1024));
        const limitMB = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
        
        memoryInfo.innerHTML = `
          <p><strong>Used Heap:</strong> ${usedMB} MB</p>
          <p><strong>Total Heap:</strong> ${totalMB} MB</p>
          <p><strong>Heap Limit:</strong> ${limitMB} MB</p>
        `;
        
        // Update memory chart
        const percentage = (usedMB / limitMB) * 100;
        memoryBar.style.width = `${percentage}%`;
        
        if (percentage > 80) {
          memoryBar.style.backgroundColor = '#ea4335';
        } else if (percentage > 60) {
          memoryBar.style.backgroundColor = '#fbbc05';
        } else {
          memoryBar.style.backgroundColor = '#4285f4';
        }
      }
    }, 2000);
    
    updateStatus('Memory monitoring started', 'success');
    logResult('Memory monitoring started with basic functionality');
  });
  
  // Stop memory monitoring
  document.getElementById('stop-memory-monitoring').addEventListener('click', () => {
    const startBtn = document.getElementById('start-memory-monitoring');
    const stopBtn = document.getElementById('stop-memory-monitoring');
    
    if (memoryMonitoringIntervalId) {
      clearInterval(memoryMonitoringIntervalId);
      memoryMonitoringIntervalId = null;
      
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
      
      updateStatus('Memory monitoring stopped', 'warning');
      logResult('Memory monitoring stopped');
    }
  });
  
  // Basic environment check
  document.getElementById('check-environment').addEventListener('click', () => {
    const envInfo = document.getElementById('environment-info');
    
    try {
      envInfo.innerHTML = `
        <p><strong>Browser:</strong> ${navigator.userAgent}</p>
        <p><strong>Platform:</strong> ${navigator.platform}</p>
        <p><strong>Language:</strong> ${navigator.language}</p>
        <p><strong>Online:</strong> ${navigator.onLine ? 'Yes' : 'No'}</p>
        <p><strong>Date/Time:</strong> ${new Date().toLocaleString()}</p>
      `;
      
      updateStatus('Environment info loaded', 'success');
      logResult('Environment info loaded');
    } catch (error) {
      envInfo.innerHTML = `<p>Error: ${error.message}</p>`;
      updateStatus('Error checking environment', 'error');
      logResult(`ERROR checking environment: ${error.message}`);
    }
  });
  
  // Basic storage check
  document.getElementById('check-storage').addEventListener('click', () => {
    const storageInfo = document.getElementById('storage-info');
    storageInfo.textContent = 'Loading storage data...';
    
    try {
      chrome.storage.local.get(null, (data) => {
        if (chrome.runtime.lastError) {
          storageInfo.textContent = `Error: ${chrome.runtime.lastError.message}`;
          updateStatus('Error accessing storage', 'error');
          logResult(`ERROR accessing storage: ${chrome.runtime.lastError.message}`);
          return;
        }
        
        const keys = Object.keys(data);
        
        if (keys.length === 0) {
          storageInfo.textContent = 'No data in local storage';
          logResult('Storage is empty');
        } else {
          storageInfo.innerHTML = `
            <p><strong>Storage Keys (${keys.length}):</strong></p>
            <ul>
              ${keys.map(key => `<li>${key}</li>`).join('')}
            </ul>
          `;
          logResult(`Found ${keys.length} items in storage`);
        }
        
        updateStatus(`Found ${keys.length} items in storage`, 'success');
      });
    } catch (error) {
      storageInfo.textContent = `Error: ${error.message}`;
      updateStatus('Error checking storage', 'error');
      logResult(`ERROR checking storage: ${error.message}`);
    }
  });
  
  // List extension files
  document.getElementById('list-files').addEventListener('click', () => {
    const fileList = document.getElementById('file-list');
    fileList.textContent = 'Loading file list...';
    
    try {
      chrome.runtime.getPackageDirectoryEntry((root) => {
        fileList.textContent = ''; // Clear previous content
        listDirectory(root, '', fileList);
        updateStatus('File listing started', 'success');
        logResult('File listing started');
      });
    } catch (error) {
      fileList.textContent = `Error: ${error.message}`;
      updateStatus('Error listing files', 'error');
      logResult(`ERROR listing files: ${error.message}`);
    }
  });
  
  function listDirectory(dir, path, output) {
    const reader = dir.createReader();
    reader.readEntries((entries) => {
      if (entries.length === 0) {
        if (path === '') {
          output.textContent += 'No files found in the root directory\n';
        }
        return;
      }
      
      entries.forEach((entry) => {
        output.textContent += path + entry.name + (entry.isDirectory ? '/' : '') + '\n';
        
        if (entry.isDirectory) {
          try {
            entry.createReader();
            listDirectory(entry, path + entry.name + '/', output);
          } catch (e) {
            output.textContent += `Error reading ${path}${entry.name}/: ${e.message}\n`;
          }
        }
      });
    });
  }
  
  // Basic ping background
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
        document.getElementById('result-output').textContent = '';
        updateStatus('Results cleared', 'success');
      });
      
      // Handle component tests with basic functionality
      document.getElementById('load-overview').addEventListener('click', () => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = '<p>Component testing requires DiagnosticTools</p>';
        updateStatus('Component testing requires DiagnosticTools', 'warning');
        logResult('Component testing not available in basic mode');
      });
      
      document.getElementById('load-capture').addEventListener('click', () => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = '<p>Component testing requires DiagnosticTools</p>';
        updateStatus('Component testing requires DiagnosticTools', 'warning');
        logResult('Component testing not available in basic mode');
      });
      
      document.getElementById('load-knowledge').addEventListener('click', () => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = '<p>Component testing requires DiagnosticTools</p>';
        updateStatus('Component testing requires DiagnosticTools', 'warning');
        logResult('Component testing not available in basic mode');
      });
      
      document.getElementById('load-settings').addEventListener('click', () => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = '<p>Component testing requires DiagnosticTools</p>';
        updateStatus('Component testing requires DiagnosticTools', 'warning');
        logResult('Component testing not available in basic mode');
      });
      
      document.getElementById('check-all-modules').addEventListener('click', () => {
        const componentStatus = document.getElementById('component-status');
        componentStatus.innerHTML = '<p>Module checking requires DiagnosticTools</p>';
        updateStatus('Module checking requires DiagnosticTools', 'warning');
        logResult('Module checking not available in basic mode');
      });
      
      // Basic resource check
      document.getElementById('check-resources').addEventListener('click', () => {
        const fileList = document.getElementById('file-list');
        fileList.textContent = 'Checking resources...\n';
        
        // List of critical files to check
        const filesToCheck = [
          'dashboard/dashboard.html',
          'dashboard/dashboard-minimal.html',
          'dashboard/js/utils/diagnostics.js',
          'popup/popup.html',
          'popup/popup.js',
          'background/background.js'
        ];
        
        filesToCheck.forEach(file => {
          try {
            const url = chrome.runtime.getURL(file);
            
            // Attempt to fetch the file to verify it exists
            fetch(url)
              .then(response => {
                if (response.ok) {
                  fileList.textContent += `✅ ${file} - Found\n`;
                } else {
                  fileList.textContent += `❌ ${file} - Error: ${response.status} ${response.statusText}\n`;
                }
              })
              .catch(error => {
                fileList.textContent += `❌ ${file} - Error: ${error.message}\n`;
              });
          } catch (error) {
            fileList.textContent += `❌ ${file} - Error: ${error.message}\n`;
          }
        });
        
        updateStatus('Resource check started', 'success');
      });
    }
    
    // Start the diagnostics by attempting to load DiagnosticTools
    document.addEventListener('DOMContentLoaded', async () => {
      // First log a welcome message
      logResult('Marvin Extension Diagnostic Tool started');
      
      // Load initial environment info
      document.getElementById('environment-info').innerHTML = `
        <p><strong>Browser:</strong> ${navigator.userAgent}</p>
        <p><strong>Platform:</strong> ${navigator.platform}</p>
        <p><strong>Online:</strong> ${navigator.onLine ? 'Yes' : 'No'}</p>
      `;
      
      // Load initial extension info
      try {
        const manifest = chrome.runtime.getManifest();
        document.getElementById('extension-info').innerHTML = `
          <p><strong>Name:</strong> ${manifest.name}</p>
          <p><strong>Version:</strong> ${manifest.version}</p>
        `;
      } catch (error) {
        document.getElementById('extension-info').innerHTML = `<p>Error loading extension info</p>`;
      }
      
      // Try to load DiagnosticTools
      await loadDiagnosticTools();
    });