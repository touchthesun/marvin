/**
 * Initialize the navigation debug panel
 */
export function initNavigationDebug() {
    // Add a keyboard shortcut (Ctrl+Shift+D) to show the navigation debug panel
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        const debugPanel = document.getElementById('nav-debug-panel');
        if (debugPanel) {
          debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
          
          if (debugPanel.style.display === 'block') {
            updateDebugInfo();
          }
        }
      }
    });
    
    // Close button for debug panel
    document.querySelector('.close-debug-btn')?.addEventListener('click', function() {
      document.getElementById('nav-debug-panel').style.display = 'none';
    });
    
    // Refresh debug info button
    document.getElementById('refresh-debug')?.addEventListener('click', updateDebugInfo);
    
    // Fix navigation button
    document.getElementById('fix-navigation')?.addEventListener('click', function() {
      // This will attempt to fix common navigation issues
      try {
        // Force re-initialization of navigation
        if (window.marvinDashboard && window.marvinDashboard.refreshAll) {
          window.marvinDashboard.refreshAll();
        }
        
        // Update debug info after fix attempt
        setTimeout(updateDebugInfo, 500);
      } catch (error) {
        console.error('Error fixing navigation:', error);
      }
    });
  }
  
  /**
   * Update the debug information displayed in the panel
   */
  function updateDebugInfo() {
    try {
      // Get navigation items
      const navItems = document.querySelectorAll('.nav-item');
      const navItemsDebug = document.getElementById('nav-items-debug');
      
      if (navItemsDebug) {
        navItemsDebug.innerHTML = '';
        navItems.forEach(item => {
          const panel = item.getAttribute('data-panel');
          const isActive = item.classList.contains('active');
          const li = document.createElement('li');
          li.innerHTML = `
            <strong>${panel}</strong> - 
            Active: ${isActive ? 'Yes' : 'No'} - 
            Text: ${item.textContent.trim()}
          `;
          navItemsDebug.appendChild(li);
        });
      }
      
      // Get content panels
      const panels = document.querySelectorAll('.content-panel');
      const panelsDebug = document.getElementById('panels-debug');
      
      if (panelsDebug) {
        panelsDebug.innerHTML = '';
        panels.forEach(panel => {
          const id = panel.id;
          const isActive = panel.classList.contains('active');
          const li = document.createElement('li');
          li.innerHTML = `
            <strong>${id}</strong> - 
            Active: ${isActive ? 'Yes' : 'No'} - 
            Visible: ${window.getComputedStyle(panel).display !== 'none' ? 'Yes' : 'No'}
          `;
          panelsDebug.appendChild(li);
        });
      }
      
      // Get active state from dashboard object if available
      const activeStateDebug = document.getElementById('active-state-debug');
      if (activeStateDebug && window.marvinDashboard && window.marvinDashboard.debug) {
        const state = window.marvinDashboard.debug.getState();
        activeStateDebug.textContent = JSON.stringify(state, null, 2);
      }
    } catch (error) {
      console.error('Error updating debug info:', error);
    }
  }