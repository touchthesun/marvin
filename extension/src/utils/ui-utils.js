import { LogManager } from './log-manager.js';

const logger = new LogManager({
  isBackgroundScript: false,
  storageKey: 'marvin_ui_logs',
  maxEntries: 1000
});


/**
 * Set up tab switching within panels
 */
export function setupTabSwitching() {
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Show corresponding tab pane
      const tabId = tab.dataset.tab;
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });
}



  // Helper function to show save confirmation
export function showSaveConfirmation(form) {
  const confirmation = document.createElement('div');
  confirmation.className = 'save-confirmation';
  confirmation.textContent = 'Settings saved!';

  form.appendChild(confirmation);

  setTimeout(() => {
    confirmation.style.opacity = '0';
    setTimeout(() => {
      confirmation.remove();
    }, 300);
  }, 2000);
  }



/**
 * Initialize split view for knowledge panel
 */
export function initSplitView() {
  const splitter = document.getElementById('knowledge-splitter');
  const listPanel = document.querySelector('.knowledge-list-panel');
  
  if (splitter && listPanel) {
    let startX, startWidth;
    
    splitter.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = parseInt(getComputedStyle(listPanel).width, 10);
      document.documentElement.style.cursor = 'col-resize';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    });
    
    function onMouseMove(e) {
      const newWidth = startWidth + (e.clientX - startX);
      // Constrain within min/max values
      if (newWidth >= 200 && newWidth <= window.innerWidth * 0.6) {
        listPanel.style.width = `${newWidth}px`;
      }
    }
    
    function onMouseUp() {
      document.documentElement.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Trigger graph resize
      window.dispatchEvent(new Event('resize'));
    }
    
    // Initialize with fixed height to give graph sufficient space
    document.querySelector('.knowledge-graph-panel').style.height = 'calc(100vh - 200px)';
  }
}