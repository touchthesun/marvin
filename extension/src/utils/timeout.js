// Set a timeout to detect if page is hanging
const emergencyTimeout = setTimeout(() => {
    // If this runs, the page initialization is taking too long
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h1>Dashboard Loading Error</h1>
        <p>The dashboard is taking too long to load or has encountered an error.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px;">
          Reload Dashboard
        </button>
        <button onclick="window.close()" style="padding: 10px 20px; margin-left: 10px;">
          Close Tab
        </button>
      </div>
    `;
  }, 10000); // 10 seconds timeout
  
  // Clear the timeout if page loads successfully
  window.addEventListener('DOMContentLoaded', () => {
    clearTimeout(emergencyTimeout);
  });
  
  // Track resource usage
  const memoryWarningThreshold = 200; // MB
  if (performance && performance.memory) {
    setInterval(() => {
      const usedHeap = performance.memory.usedJSHeapSize / (1024 * 1024);
      if (usedHeap > memoryWarningThreshold) {
        console.warn(`High memory usage detected: ${Math.round(usedHeap)}MB`);
        // Optionally take action to reduce memory usage
      }
    }, 5000);
  }
  