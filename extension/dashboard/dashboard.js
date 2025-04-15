// Import dependencies
import * as d3 from 'd3';
import { fetchAPI } from '../shared/utils/api.js';
import { captureUrl } from '../shared/utils/capture.js';
import { loadGraphData } from './components/graph-data.js';
import { BrowserContext, TabTypeToContext, BrowserContextLabels } from '../shared/constants.js';
import { ProgressTracker } from '../shared/utils/progress-tracker.js';

// Background script connection
const backgroundPage = chrome.extension.getBackgroundPage();

// Panel initialization flags
let overviewInitialized = false;
let captureInitialized = false;
let knowledgeInitialized = false;
let assistantInitialized = false;
let settingsInitialized = false;
let navigationInitialized = false;
let tabsFilterInitialized = false;
let statusMonitoringInitialized = false;
let tasksInitialized = false;

// Task lists
let activeTasks = [];
let completedTasks = [];

// Page data
let capturedPages = [];

// Filters
let pageSearchQuery = '';

function logWithStack(message) {
  console.log(`${message} | Stack: ${new Error().stack.split('\n')[2]}`);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create debounced versions of functions
const debouncedSearchKnowledge = debounce(searchKnowledge, 300);
const debouncedFilterTabs = debounce(filterTabs, 200);
const debouncedFilterBookmarks = debounce(filterBookmarks, 200);
const debouncedFilterHistory = debounce(filterHistory, 200);
const debouncedHandlePageSearch = debounce(handlePageSearch, 300);

function debugCaptureButton() {
  const captureBtn = document.getElementById('capture-selected');
  console.log('Debug capture button:', {
    exists: !!captureBtn,
    disabled: captureBtn?.disabled,
    hasClickListeners: captureBtn?._events?.click?.length > 0,
    innerHTML: captureBtn?.innerHTML,
    isVisible: captureBtn ? window.getComputedStyle(captureBtn).display !== 'none' : false
  });
  // Test direct click simulation
  if (captureBtn) {
    console.log('Adding test click handler');
    captureBtn.onclick = function() {
      console.log('Direct onclick property triggered');
    };
  }
}

document.addEventListener('click', function(event) {
  // Check if the clicked element or any of its parents is the capture button
  const captureButton = event.target.closest('#capture-selected');
  if (captureButton || event.target.id === 'capture-selected') {
    console.log('Global capture button click handler triggered!', event.target);
    
    // Try to get the active tab pane first to check if we're in the right context
    const activeTabPane = document.querySelector('.capture-tab-content .tab-pane.active');
    if (!activeTabPane) {
      console.warn('No active tab pane found, but capture button was clicked');
    }
    
    // Call the capture function directly
    try {
      captureSelectedItems();
    } catch (error) {
      console.error('Error in captureSelectedItems:', error);
      alert('Error capturing items: ' + error.message);
    }
    
    // Prevent default and stop propagation to ensure no other handlers interfere
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard loaded');
  
  // Setup the capture button once, with clear logging
  const captureSelectedBtn = document.getElementById('capture-selected');
  if (captureSelectedBtn) {
    console.log('Found capture-selected button, setting up click handler');
    
    // Remove any existing event listeners by cloning the button
    const newCaptureBtn = captureSelectedBtn.cloneNode(true);
    captureSelectedBtn.parentNode.replaceChild(newCaptureBtn, captureSelectedBtn);
    
    // Add the event listener
    newCaptureBtn.addEventListener('click', function(event) {
      console.log('Capture button clicked!');
      captureSelectedItems();
      event.preventDefault();
      event.stopPropagation();
    });
  } else {
    console.error('capture-selected button not found!');
  }
  
  // Initialize navigation
  initNavigation();
  initTabs();
  
  // Load dashboard data
  await loadDashboardData();
  
  // Setup status monitoring
  setupStatusMonitoring();

  // Debug capture button at the end of initialization
  debugCaptureButton();

  // Check which panel is active and initialize it
  const overviewPanel = document.getElementById('overview-panel');
  if (overviewPanel && overviewPanel.classList.contains('active')) {
    console.log('Initializing overview panel from DOMContentLoaded');
    initOverviewPanel();
  }

  const capturePanel = document.getElementById('capture-panel');
  console.log(`Capture panel found: ${!!capturePanel}, active: ${capturePanel?.classList.contains('active')}`);
  if (capturePanel && capturePanel.classList.contains('active')) {
    console.log('Initializing capture panel from DOMContentLoaded');
    await initCapturePanel();
  }

  const knowledgePanel = document.getElementById('knowledge-panel');
  if (knowledgePanel && knowledgePanel.classList.contains('active')) {
    console.log('Initializing knowledge panel from DOMContentLoaded');
    initKnowledgePanel();
    initKnowledgeGraph();
  }

  const assistantPanel = document.getElementById('assistant-panel');
  if (assistantPanel && assistantPanel.classList.contains('active')) {
    console.log('Initializing assistant panel from DOMContentLoaded');
    initAssistantPanel();
  }

  const settingsPanel = document.getElementById('settings-panel');
  if (settingsPanel && settingsPanel.classList.contains('active')) {
    console.log('Initializing settings panel from DOMContentLoaded');
    initSettingsPanel();
  }

  const tasksPanel = document.getElementById('tasks-panel');
  if (tasksPanel && tasksPanel.classList.contains('active')) {
    console.log('Initializing tasks panel from DOMContentLoaded');
    initTasksPanel();
  }

  // Force initialization button handlers for all panels
  setupForceInitButtons();
  
  // Set up tab switching
  setupTabSwitching();
  
  // Set up event listeners for task management
  setupTaskEventListeners();
  
  // Set up event listeners for page management
  setupPageEventListeners();
});

/**
 * Set up tab switching
 */
function setupTabSwitching() {
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
      
      // Initialize panel if needed
      if (tabId === 'active-tasks' || tabId === 'completed-tasks') {
        refreshAllTasks();
      } else if (tabId === 'pages') {
        refreshPages();
      }
    });
  });
}

/**
 * Set up event listeners for task management
 */
function setupTaskEventListeners() {
  // Set up refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', refreshData);
  
  // Set up cancel all button
  document.getElementById('cancelAllBtn')?.addEventListener('click', cancelAllTasks);
  
  // Set up clear completed button
  document.getElementById('clearCompletedBtn')?.addEventListener('click', clearCompletedTasks);
}

/**
 * Set up event listeners for page management
 */
function setupPageEventListeners() {
  // Set up page search
  document.getElementById('pageSearch')?.addEventListener('input', (e) => {
    debouncedHandlePageSearch(e);
  });
  
  // Set up capture button
  document.getElementById('captureBtn')?.addEventListener('click', captureCurrentTab);
}

async function setupForceInitButtons() {
  logWithStack('setupForceInitButtons called');

  // Capture panel force init
  const forceInitCaptureButton = document.getElementById('force-init-capture');
  console.log(`Force init capture button found: ${!!forceInitCaptureButton}`);

  if (forceInitCaptureButton) {
    console.log('Adding click handler to force-init-capture button');
    forceInitCaptureButton.addEventListener('click', async () => { 
      console.log('Force initializing capture panel');
      captureInitialized = false; 
      await initCapturePanel(); 

      // Check capture button after forced initialization
      const captureBtn = document.getElementById('capture-selected');
      console.log(`Capture button after force init: ${!!captureBtn}, disabled=${captureBtn?.disabled}, text=${captureBtn?.textContent}`);
    });
  }
  
  // Knowledge panel force init
  const forceInitKnowledgeButton = document.getElementById('force-init-knowledge');
  console.log('Force init knowledge button found:', !!forceInitKnowledgeButton);
  if (forceInitKnowledgeButton) {
    forceInitKnowledgeButton.addEventListener('click', async () => {
      console.log('Force initializing knowledge panel');
      knowledgeInitialized = false; 
      await initKnowledgePanel(); 
      await initKnowledgeGraph(); 
    });

    // Check Knowledge Button after forced initializing
    const knowledgeBtn = document.getElementById('knowledge-selected');
    console.log(`Knowledge button after force init: ${!!knowledgeBtn}, disabled=${knowledgeBtn?.disabled}, text=${knowledgeBtn?.textContent}`);
  }
  
  // Assistant panel force init
  const forceInitAssistantButton = document.getElementById('force-init-assistant');
  console.log('Force init assistant button found:', !!forceInitAssistantButton);
  if (forceInitAssistantButton) {
    forceInitAssistantButton.addEventListener('click', async () => {
      console.log('Force initializing assistant panel');
      assistantInitialized = false; 
      await initAssistantPanel(); 
    });

    const assistantBtn = document.getElementById('assistant-selected');
    console.log(`Assistant button after force init: ${!!assistantBtn}, disabled=${assistantBtn?.disabled}, text=${assistantBtn?.textContent}`);
  }
  
  // Settings panel force init
  const forceInitSettingsButton = document.getElementById('force-init-settings');
  console.log('Force init settings button found:', !!forceInitSettingsButton);
  if (forceInitSettingsButton) {
    forceInitSettingsButton.addEventListener('click', async () => {
      console.log('Force initializing settings panel');
      settingsInitialized = false; 
      await initSettingsPanel(); 
    });

    const settingsBtn = document.getElementById('settings-selected');
    console.log(`Settings button after force init: ${!!settingsBtn}, disabled=${settingsBtn?.disabled}, text=${settingsBtn?.textContent}`);
  }
  
  // Overview panel force init
  const forceInitOverviewButton = document.getElementById('force-init-overview');
  console.log('Force init overview button found:', !!forceInitOverviewButton);
  if (forceInitOverviewButton) {
    forceInitOverviewButton.addEventListener('click', async () => {
      console.log('Force initializing overview panel');
      overviewInitialized = false; 
      await initOverviewPanel(); 
    });

    const overviewBtn = document.getElementById('overview-selected');
    console.log(`Overview button after force init: ${!!overviewBtn}, disabled=${overviewBtn?.disabled}, text=${overviewBtn?.textContent}`);
  }
  
  // Tasks panel force init
  const forceInitTasksButton = document.getElementById('force-init-tasks');
  console.log('Force init tasks button found:', !!forceInitTasksButton);
  if (forceInitTasksButton) {
    forceInitTasksButton.addEventListener('click', async () => {
      console.log('Force initializing tasks panel');
      tasksInitialized = false; 
      await initTasksPanel(); 
    });

    const tasksBtn = document.getElementById('tasks-selected');
    console.log(`Tasks button after force init: ${!!tasksBtn}, disabled=${tasksBtn?.disabled}, text=${tasksBtn?.textContent}`);
  }
}

function initNavigation() {
  logWithStack('initNavigation called');
  if (navigationInitialized) {
    console.log('Navigation already initialized, skipping');
    return;
  }
  
  console.log('Initializing navigation');
  navigationInitialized = true;

  console.log('Initializing navigation');
  const navItems = document.querySelectorAll('.nav-item');
  const contentPanels = document.querySelectorAll('.content-panel');
  
  console.log(`Found nav items: ${navItems.length}, content panels: ${contentPanels.length}`);
  
  navItems.forEach(item => {
    const panelName = item.getAttribute('data-panel');
    console.log(`Setting up click handler for nav item: ${panelName}`);
    
    item.addEventListener('click', async () => {
      console.log(`Nav item clicked: ${panelName}`);
      const targetPanel = panelName;
      
      // Update navigation highlighting
      navItems.forEach(navItem => navItem.classList.remove('active'));
      item.classList.add('active');
      
      // Show corresponding panel
      contentPanels.forEach(panel => {
        if (panel.id === `${targetPanel}-panel`) {
          console.log(`Activating panel: ${panel.id}`);
          panel.classList.add('active');
          // Debug capture button when capture panel is activated
          if (targetPanel === 'capture') {
            setTimeout(debugCaptureButton, 500);}
        } else {
          panel.classList.remove('active');
        }
      });
      
      // Initialize panel if needed
      if (targetPanel === 'overview') {
        console.log('Initializing overview panel from navigation');
        initOverviewPanel();
      } else if (targetPanel === 'capture') {
        console.log('Initializing capture panel from navigation');
        initCapturePanel();
      } else if (targetPanel === 'knowledge') {
        console.log('Initializing knowledge panel from navigation');
        initKnowledgePanel();
        initKnowledgeGraph();
      } else if (targetPanel === 'assistant') {
        console.log('Initializing assistant panel from navigation');
        initAssistantPanel();
      } else if (targetPanel === 'settings') {
        console.log('Initializing settings panel from navigation');
        initSettingsPanel();
      } else if (targetPanel === 'tasks') {
        console.log('Initializing tasks panel from navigation');
        initTasksPanel();
      }
    });
  });
}


// Initialization function for capture panel
async function initCapturePanel() {
  logWithStack('initCapturePanel called');
  if (captureInitialized) {
    console.log('Capture panel already initialized, skipping');
    return;
  }
  console.log('Initializing capture panel');
  captureInitialized = true;

  // Set up tab loading
  const tabsTabBtn = document.querySelector('[data-tab="tabs"]');
  const bookmarksTabBtn = document.querySelector('[data-tab="bookmarks"]');
  const historyTabBtn = document.querySelector('[data-tab="history"]');
  
  console.log(`Tab buttons found: tabs=${!!tabsTabBtn}, bookmarks=${!!bookmarksTabBtn}, history=${!!historyTabBtn}`);
  
  if (tabsTabBtn) {
    console.log('Adding click handler to tabs tab button');
    tabsTabBtn.addEventListener('click', () => {
      console.log('Tabs tab button clicked');
      loadOpenTabs();
    });
  }
  
  if (bookmarksTabBtn) {
    console.log('Adding click handler to bookmarks tab button');
    bookmarksTabBtn.addEventListener('click', () => {
      console.log('Bookmarks tab button clicked');
      loadBookmarks();
    });
  }
  
  if (historyTabBtn) {
    console.log('Adding click handler to history tab button');
    historyTabBtn.addEventListener('click', () => {
      console.log('History tab button clicked');
      loadHistory();
    });
  }
  const captureBtn = document.getElementById('capture-selected');
  if (captureBtn) {
    console.log('Adding click handler to capture button');
    
    // Remove any existing event handlers
    const newCaptureBtn = captureBtn.cloneNode(true);
    captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);
    
    // Add event listener with multiple approaches
    newCaptureBtn.addEventListener('click', function(event) {
      console.log('Capture button clicked!');
      captureSelectedItems();
    });
    
    // Also use onclick property as fallback
    newCaptureBtn.onclick = function() {
      console.log('Capture button onclick triggered!');
      captureSelectedItems();
    };
  } else {
    console.error('Capture button not found');
  }
  // Debug capture button after panel initialization
  debugCaptureButton();
  
  try {
    chrome.windows.getAll({ populate: true }, (windows) => {
      updateWindowFilter(windows);
      setupTabsFilter(windows.reduce((tabs, window) => [...tabs, ...window.tabs], []));
    });
  } catch (error) {
    console.error('Error setting up tabs filter:', error);
  }
  
  const activeTab = document.querySelector('.tab-pane.active');
  if (activeTab) {
    const tabType = activeTab.id.split('-')[0];
    if (tabType === 'tabs') {
      loadOpenTabs();
    } else if (tabType === 'bookmarks') {
      loadBookmarks();
    } else if (tabType === 'history') {
      loadHistory();
    }
  } else {
    if (tabsTabBtn) {
      tabsTabBtn.click();
    }
  }
}

// Initialize tasks panel
async function initTasksPanel() {
  if (tasksInitialized) {
    console.log('Tasks panel already initialized, skipping');
    return;
  }
  
  console.log('Initializing tasks panel');
  tasksInitialized = true;
  
  // Set up refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAllTasks);
  }
  
  // Set up cancel all button
  const cancelAllBtn = document.getElementById('cancelAllBtn');
  if (cancelAllBtn) {
    cancelAllBtn.addEventListener('click', cancelAllTasks);
  }
  
  // Set up clear completed button
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', clearCompletedTasks);
  }
  
  // Initial load of tasks
  await refreshAllTasks();
}

/**
 * Refresh all tasks (active and completed)
 */
async function refreshAllTasks() {
  try {
    // Show loading state
    document.getElementById('active-tasks-list').innerHTML = '<div class="loading">Loading active tasks...</div>';
    document.getElementById('completed-tasks-list').innerHTML = '<div class="loading">Loading completed tasks...</div>';
    
    // Get tasks from background page
    const tasks = await backgroundPage.marvin.getActiveTasks();
    
    // Split into active and completed
    activeTasks = tasks.filter(task => 
      task.status === 'pending' || 
      task.status === 'processing' || 
      task.status === 'analyzing'
    );
    
    completedTasks = tasks.filter(task => 
      task.status === 'complete' || 
      task.status === 'error'
    );
    
    // Update UI
    renderActiveTasks();
    renderCompletedTasks();
    
    // Update counts
    document.getElementById('active-count').textContent = activeTasks.length;
    document.getElementById('completed-count').textContent = completedTasks.length;
  } catch (error) {
    console.error('Error refreshing tasks:', error);
    document.getElementById('active-tasks-list').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    document.getElementById('completed-tasks-list').innerHTML = `<div class="error">Error: ${error.message}</div>`;
  }
}

/**
 * Render active tasks
 */
function renderActiveTasks() {
  const container = document.getElementById('active-tasks-list');
  
  if (activeTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No active tasks</div>';
    return;
  }
  
  container.innerHTML = '';
  
  activeTasks.forEach(task => {
    const taskElement = document.createElement('div');
    taskElement.className = 'task-item';
    taskElement.dataset.taskId = task.id;
    
    // Format progress
    const progress = task.progress || 0;
    const progressPercent = Math.round(progress * 100);
    
    // Format time
    const startTime = new Date(task.created_at || task.timestamp);
    const timeAgo = formatTimeAgo(startTime);
    
    taskElement.innerHTML = `
      <div class="task-header">
        <div class="task-title">${task.url || 'Unknown URL'}</div>
        <div class="task-actions">
          <button class="btn-icon cancel-task" title="Cancel Task">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="task-details">
        <div class="task-status">${formatTaskStatus(task.status)}</div>
        <div class="task-time">${timeAgo}</div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    `;
    
    // Add event listeners
    taskElement.querySelector('.cancel-task').addEventListener('click', () => {
      cancelTask(task.id);
    });
    
    container.appendChild(taskElement);
  });
}

/**
 * Render completed tasks
 */
function renderCompletedTasks() {
  const container = document.getElementById('completed-tasks-list');
  
  if (completedTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No completed tasks</div>';
    return;
  }
  
  container.innerHTML = '';
  
  // Sort by completion time (most recent first)
  completedTasks.sort((a, b) => {
    const timeA = new Date(a.completed_at || a.timestamp);
    const timeB = new Date(b.completed_at || b.timestamp);
    return timeB - timeA;
  });
  
  completedTasks.forEach(task => {
    const taskElement = document.createElement('div');
    taskElement.className = 'task-item';
    taskElement.dataset.taskId = task.id;
    
    // Add status-specific class
    if (task.status === 'error') {
      taskElement.classList.add('task-error');
    } else {
      taskElement.classList.add('task-complete');
    }
    
    // Format time
    const completionTime = new Date(task.completed_at || task.timestamp);
    const timeAgo = formatTimeAgo(completionTime);
    
    taskElement.innerHTML = `
      <div class="task-header">
        <div class="task-title">${task.url || 'Unknown URL'}</div>
        <div class="task-actions">
          ${task.status === 'error' ? 
            `<button class="btn-icon retry-task" title="Retry Task">
              <i class="fas fa-redo"></i>
            </button>` : ''}
          <button class="btn-icon remove-task" title="Remove Task">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="task-details">
        <div class="task-status">${formatTaskStatus(task.status)}</div>
        <div class="task-time">${timeAgo}</div>
      </div>
      ${task.status === 'error' ? 
        `<div class="task-error-message">${task.error || 'Unknown error'}</div>` : ''}
    `;
    
    // Add event listeners
    if (task.status === 'error') {
      taskElement.querySelector('.retry-task').addEventListener('click', () => {
        retryTask(task.id);
      });
    }
    
    taskElement.querySelector('.remove-task').addEventListener('click', () => {
      removeTask(task.id);
    });
    
    container.appendChild(taskElement);
  });
}

/**
 * Format task status for display
 */
function formatTaskStatus(status) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'analyzing':
      return 'Analyzing';
    case 'complete':
      return 'Completed';
    case 'error':
      return 'Failed';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) {
    return `${diffSec} seconds ago`;
  }
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  }
  
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  }
  
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

/**
 * Cancel a task
 */
async function cancelTask(taskId) {
  try {
    const result = await backgroundPage.marvin.cancelTask(taskId);
    
    if (result) {
      // Remove from active tasks
      activeTasks = activeTasks.filter(task => task.id !== taskId);
      renderActiveTasks();
      
      // Update count
      document.getElementById('active-count').textContent = activeTasks.length;
      
      // Show notification
      showNotification('Task cancelled successfully');
    } else {
      throw new Error('Failed to cancel task');
    }
  } catch (error) {
    console.error('Error cancelling task:', error);
    showNotification('Error cancelling task: ' + error.message, 'error');
  }
}

/**
 * Retry a failed task
 */
async function retryTask(taskId) {
  try {
    const result = await backgroundPage.marvin.retryTask(taskId);
    
    if (result) {
      // Remove from completed tasks
      completedTasks = completedTasks.filter(task => task.id !== taskId);
      renderCompletedTasks();
      
      // Update count
      document.getElementById('completed-count').textContent = completedTasks.length;
      
      // Refresh active tasks
      await refreshAllTasks();
      
      // Show notification
      showNotification('Task retried successfully');
    } else {
      throw new Error('Failed to retry task');
    }
  } catch (error) {
    console.error('Error retrying task:', error);
    showNotification('Error retrying task: ' + error.message, 'error');
  }
}

/**
 * Remove a task from the list
 */
function removeTask(taskId) {
  // Remove from completed tasks
  completedTasks = completedTasks.filter(task => task.id !== taskId);
  renderCompletedTasks();
  
  // Update count
  document.getElementById('completed-count').textContent = completedTasks.length;
}

/**
 * Cancel all active tasks
 */
async function cancelAllTasks() {
  if (activeTasks.length === 0) {
    showNotification('No active tasks to cancel');
    return;
  }
  
  if (!confirm(`Cancel all ${activeTasks.length} active tasks?`)) {
    return;
  }
  
  try {
    let successCount = 0;
    
    for (const task of activeTasks) {
      try {
        const result = await backgroundPage.marvin.cancelTask(task.id);
        if (result) {
          successCount++;
        }
      } catch (error) {
        console.error(`Error cancelling task ${task.id}:`, error);
      }
    }
    
    // Refresh tasks
    await refreshAllTasks();
    
    // Show notification
    showNotification(`Cancelled ${successCount} of ${activeTasks.length} tasks`);
  } catch (error) {
    console.error('Error cancelling all tasks:', error);
    showNotification('Error cancelling tasks: ' + error.message, 'error');
  }
}

/**
 * Clear all completed tasks
 */
function clearCompletedTasks() {
  if (completedTasks.length === 0) {
    showNotification('No completed tasks to clear');
    return;
  }
  
  if (!confirm(`Clear all ${completedTasks.length} completed tasks?`)) {
    return;
  }
  
  // Clear completed tasks
  completedTasks = [];
  renderCompletedTasks();
  
  // Update count
  document.getElementById('completed-count').textContent = '0';

   // Show notification
   showNotification('Completed tasks cleared');
  }
  
// Improved notification handling with progress bar
function showNotification(message, type = 'success', progress = null) {
  // Remove any existing notification with the same ID
  const existingNotification = document.querySelector('.notification.progress-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  if (progress !== null) {
    notification.classList.add('progress-notification');
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <div class="notification-progress-container">
        <div class="notification-progress-bar" style="width: ${progress}%"></div>
      </div>
    `;
  } else {
    notification.textContent = message;
    
    // Auto-hide non-progress notifications
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
  
  document.body.appendChild(notification);
  
  // Fade in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  return notification;
}

  
  /**
   * Capture the current tab
   */
  async function captureCurrentTab() {
    try {
      const captureBtn = document.getElementById('captureBtn');
      if (captureBtn) {
        captureBtn.disabled = true;
        captureBtn.textContent = 'Capturing...';
      }
      
      const response = await backgroundPage.marvin.captureCurrentTab();
      
      if (response.success) {
        showNotification('Page captured successfully');
        
        // Refresh pages list
        await refreshPages();
      } else {
        throw new Error(response.error || 'Failed to capture page');
      }
    } catch (error) {
      console.error('Error capturing current tab:', error);
      showNotification('Error capturing page: ' + error.message, 'error');
    } finally {
      const captureBtn = document.getElementById('captureBtn');
      if (captureBtn) {
        captureBtn.disabled = false;
        captureBtn.textContent = 'Capture Current Tab';
      }
    }
  }
  
  /**
   * Refresh the pages list
   */
  async function refreshPages() {
    try {
      // Show loading state
      document.getElementById('pages-list').innerHTML = '<div class="loading">Loading pages...</div>';
      
      // Get pages from API
      const response = await fetchAPI('/api/v1/pages/');
      
      if (response.success) {
        capturedPages = response.data.pages || [];
        
        // Apply search filter if active
        if (pageSearchQuery) {
          capturedPages = filterPages(capturedPages, pageSearchQuery);
        }
        
        // Render pages
        renderPages(capturedPages);
        
        // Update count
        document.getElementById('page-count').textContent = capturedPages.length;
      } else {
        throw new Error(response.error?.message || 'Failed to load pages');
      }
    } catch (error) {
      console.error('Error refreshing pages:', error);
      document.getElementById('pages-list').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
  }
  
  /**
   * Render pages list
   */
  function renderPages(pages) {
    const container = document.getElementById('pages-list');
    
    if (pages.length === 0) {
      container.innerHTML = '<div class="empty-state">No pages found</div>';
      return;
    }
    
    container.innerHTML = '';
    
    // Sort by capture time (most recent first)
    pages.sort((a, b) => {
      const timeA = new Date(a.discovered_at || a.timestamp);
      const timeB = new Date(b.discovered_at || b.timestamp);
      return timeB - timeA;
    });
    
    pages.forEach(page => {
      const pageElement = document.createElement('div');
      pageElement.className = 'page-item';
      pageElement.dataset.pageId = page.id;
      
      // Try to get favicon
      let favicon = '';
      try {
        const urlObj = new URL(page.url);
        favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}`;
      } catch (e) {
        // Use default if URL parsing fails
        favicon = '../icons/icon16.png';
      }
      
      // Format date
      const captureDate = new Date(page.discovered_at || page.timestamp);
      const dateStr = captureDate.toLocaleDateString();
      
      pageElement.innerHTML = `
        <div class="page-icon">
          <img src="${favicon}" alt="" class="favicon">
        </div>
        <div class="page-content">
          <div class="page-title">${page.title || 'Untitled'}</div>
          <div class="page-url">${truncateText(page.url, 50)}</div>
          <div class="page-meta">
            <span class="page-date">Captured: ${dateStr}</span>
            <span class="page-source">${formatContext(page.browser_contexts)}</span>
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-action view-page">View</button>
          <button class="btn-icon delete-page" title="Delete Page">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      
      // Add event listeners
      pageElement.querySelector('.view-page').addEventListener('click', () => {
        viewPage(page);
      });
      
      pageElement.querySelector('.delete-page').addEventListener('click', () => {
        deletePage(page.id);
      });
      
      container.appendChild(pageElement);
    });
  }
  
  /**
   * Filter pages based on search query
   */
  function filterPages(pages, query) {
    if (!query) return pages;
    
    const lowerQuery = query.toLowerCase();
    
    return pages.filter(page => 
      page.title?.toLowerCase().includes(lowerQuery) || 
      page.url.toLowerCase().includes(lowerQuery) ||
      Object.keys(page.keywords || {}).some(k => 
        k.toLowerCase().includes(lowerQuery)
      )
    );
  }
  
  /**
   * Handle page search
   */
  function handlePageSearch(event) {
    pageSearchQuery = event.target.value;
    
    if (capturedPages.length > 0) {
      const filtered = filterPages(capturedPages, pageSearchQuery);
      renderPages(filtered);
    }
  }
  
  /**
   * View page details
   */
  function viewPage(page) {
    // Get the details sidebar
    const sidebar = document.getElementById('details-sidebar');
    
    // Update sidebar content
    const detailsContent = sidebar.querySelector('.details-content');
    
    // Format date
    const discoveredDate = new Date(page.discovered_at || page.timestamp);
    const dateStr = discoveredDate.toLocaleDateString();
    
    // Create HTML content for details
    detailsContent.innerHTML = `
      <div class="details-item">
        <h3>${page.title || 'Untitled'}</h3>
        <div class="details-url">
          <a href="${page.url}" target="_blank">${page.url}</a>
        </div>
        
        <div class="details-section">
          <h4>Metadata</h4>
          <dl class="details-data">
            <dt>Captured</dt>
            <dd>${dateStr}</dd>
            
            <dt>Source</dt>
            <dd>${formatContext(page.browser_contexts)}</dd>
            
            <dt>Status</dt>
            <dd>${page.status || 'Unknown'}</dd>
            
            <dt>Domain</dt>
            <dd>${page.domain || 'Unknown'}</dd>
          </dl>
        </div>
        
        ${page.keywords && Object.keys(page.keywords).length > 0 
          ? `<div class="details-section">
              <h4>Keywords</h4>
              <div class="keyword-cloud">
                ${Object.entries(page.keywords).map(([keyword, score]) => 
                  `<div class="keyword-tag" style="font-size: ${Math.min(100, score * 100) + 80}%">
                    ${keyword} <span class="keyword-score">${(score * 100).toFixed(0)}%</span>
                  </div>`
                ).join('')}
              </div>
            </div>` 
          : ''}
        
        <div class="details-actions">
          <button class="btn-secondary" id="view-in-browser">Open in Browser</button>
          <button class="btn-secondary" id="recapture-page">Recapture</button>
          <button class="btn-secondary" id="analyze-page">Analyze</button>
        </div>
      </div>
    `;
    
    // Add event listeners
    detailsContent.querySelector('#view-in-browser').addEventListener('click', () => {
      chrome.tabs.create({ url: page.url });
    });
    
    detailsContent.querySelector('#recapture-page').addEventListener('click', async () => {
      const button = detailsContent.querySelector('#recapture-page');
      button.disabled = true;
      button.textContent = 'Recapturing...';
      
      try {
        // Request recapture
        const response = await backgroundPage.marvin.captureUrl(page.url, {
          context: page.browser_contexts?.[0] || 'active_tab'
        });
        
        if (response.success) {
          button.textContent = 'Recaptured!';
          showNotification('Page recaptured successfully');
          
          // Refresh pages list
          setTimeout(() => {
            refreshPages();
            button.disabled = false;
            button.textContent = 'Recapture';
          }, 2000);
        } else {
          throw new Error(response.error || 'Failed to recapture page');
        }
      } catch (error) {
        console.error('Recapture error:', error);
        button.textContent = 'Recapture Failed';
        showNotification('Error recapturing page: ' + error.message, 'error');
        
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Recapture';
        }, 2000);
      }
    });
    
    detailsContent.querySelector('#analyze-page').addEventListener('click', async () => {
      const button = detailsContent.querySelector('#analyze-page');
      button.disabled = true;
      button.textContent = 'Analyzing...';
      
      try {
        // Request analysis
        const response = await backgroundPage.marvin.analyzeUrl(page.url);
        
        if (response.success) {
          button.textContent = 'Analysis Started!';
          showNotification('Analysis started successfully');
          
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
            
            // Switch to tasks panel to show progress
            document.querySelector('[data-panel="tasks"]').click();
          }, 2000);
        } else {
          throw new Error(response.error || 'Failed to start analysis');
        }
      } catch (error) {
        console.error('Analysis error:', error);
        button.textContent = 'Analysis Failed';
        showNotification('Error starting analysis: ' + error.message, 'error');
        
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      }
    });
    
    // Display the sidebar
    sidebar.classList.add('active');
    
    // Set up close button
    sidebar.querySelector('.close-details-btn').addEventListener('click', () => {
      sidebar.classList.remove('active');
    });
  }
  
  /**
   * Delete a page
   */
  async function deletePage(pageId) {
    if (!confirm('Are you sure you want to delete this page?')) {
      return;
    }
    
    try {
      // Request deletion
      const response = await fetchAPI(`/api/v1/pages/${pageId}`, {
        method: 'DELETE'
      });
      
      if (response.success) {
        showNotification('Page deleted successfully');
        
        // Remove from list
        capturedPages = capturedPages.filter(page => page.id !== pageId);
        
        // Update UI
        renderPages(capturedPages);
        
        // Update count
        document.getElementById('page-count').textContent = capturedPages.length;
      } else {
        throw new Error(response.error?.message || 'Failed to delete page');
      }
    } catch (error) {
      console.error('Error deleting page:', error);
      showNotification('Error deleting page: ' + error.message, 'error');
    }
  }
  
  function updateWindowFilter(windows) {
    console.log('Updating window filter with', windows.length, 'windows');
    const windowFilter = document.getElementById('tabs-window-filter');
    if (!windowFilter) {
      console.error('tabs-window-filter element not found');
      return;
    }
    
    // Clear existing options
    windowFilter.innerHTML = '<option value="all">All Windows</option>';
    
    // Add options for each window
    windows.forEach(window => {
      const option = document.createElement('option');
      option.value = window.id.toString();
      option.textContent = `Window ${window.id} (${window.tabs.length} tabs)`;
      windowFilter.appendChild(option);
    });
  }
  
  // Tabs within panels (e.g., Capture panel)
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        
        // Update tab highlighting
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Show corresponding tab content
        tabPanes.forEach(pane => {
          if (pane.id === `${targetTab}-content`) {
            pane.classList.add('active');
          } else {
            pane.classList.remove('active');
          }
        });
      });
    });
  }
  
  async function loadDashboardData() {
    try {
      // Show loading state
      document.getElementById('recent-captures-list').innerHTML = '<div class="loading-indicator">Loading data...</div>';
      
      // Fetch data from storage
      const storage = await chrome.storage.local.get(['captureHistory', 'stats']);
      const captureHistory = storage.captureHistory || [];
      
      // Default stats from storage or use zeros
      let stats = storage.stats || { captures: captureHistory.length, relationships: 0, queries: 0 };
      
      // Update stats
      document.getElementById('captured-count').textContent = stats.captures;
      document.getElementById('relationship-count').textContent = stats.relationships;
      document.getElementById('query-count').textContent = stats.queries;
      
      // Update recent captures
      updateRecentCaptures(captureHistory);
      
      // Load mini graph visualization
      const graphPlaceholder = document.querySelector('.graph-placeholder');
      if (graphPlaceholder) {
        try {
          // Try to get data from API
          const response = await fetchAPI('/api/v1/graph/overview?limit=10');
          
          if (response.success && response.data?.nodes?.length > 0) {
            renderMiniGraph(response.data.nodes, response.data.edges, graphPlaceholder);
          } else {
            // Try to use capture data to create a simple graph
            const pagesResponse = await fetchAPI('/api/v1/pages/');
            if (pagesResponse.success && pagesResponse.data?.pages?.length > 0) {
              const pages = pagesResponse.data.pages || [];
              
            // Create simple nodes
            const nodes = pages.slice(0, 10).map(page => ({
              id: page.id,
              label: page.title || 'Untitled',
              url: page.url,
              domain: page.domain
            }));
            
            // Create edges (if available)
            const edges = [];
            
            renderMiniGraph(nodes, edges, graphPlaceholder);
          }
        }
      } catch (error) {
        console.error('Error loading mini graph:', error);
      }
    }
    
    // Try to fetch updated stats from API
    try {
      const apiStats = await fetchAPI('/api/v1/stats');
      if (apiStats.success) {
        // Update with latest data from server
        document.getElementById('captured-count').textContent = apiStats.data.captures;
        document.getElementById('relationship-count').textContent = apiStats.data.relationships;
        document.getElementById('query-count').textContent = apiStats.data.queries;
        
        // Save to storage
        chrome.storage.local.set({ 
          stats: {
            captures: apiStats.data.captures,
            relationships: apiStats.data.relationships,
            queries: apiStats.data.queries
          }
        });
      }
    } catch (error) {
      console.log('Stats endpoint not available, using local data');
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Update recent captures list
function updateRecentCaptures(captures) {
  const capturesList = document.getElementById('recent-captures-list');
  
  if (captures.length === 0) {
    capturesList.innerHTML = '<div class="empty-state">No recent captures</div>';
    return;
  }
  
  capturesList.innerHTML = '';
  
  // Show most recent 5 captures
  captures.slice(0, 5).forEach(capture => {
    const captureItem = document.createElement('li');
    captureItem.className = 'capture-item';
    
    const date = new Date(capture.timestamp);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    captureItem.innerHTML = `
      <div class="capture-title">${truncateText(capture.title, 50)}</div>
      <div class="capture-meta">
        <span class="capture-url">${truncateText(capture.url, 30)}</span>
        <span class="capture-time">${formattedDate}</span>
      </div>
    `;
    
    capturesList.appendChild(captureItem);
  });
}

async function initOverviewPanel() {
  if (overviewInitialized) {
    console.log('Overview panel already initialized, skipping');
    return;
  }
  console.log('Initializing overview panel');
  overviewInitialized = true;
  
  // Load stats data
  await loadOverviewStats();
  
  // Set up refresh button
  const refreshBtn = document.querySelector('#overview-panel .refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('Refreshing overview data');
      loadOverviewStats();
    });
  }
  
  // Load recent captures list
  await loadRecentCaptures();
  
  // Load active tasks summary
  await loadActiveTasks();
}

async function loadActiveTasks() {
  try {
    const tasksSummary = document.getElementById('tasks-summary');
    if (!tasksSummary) return;
    
    tasksSummary.innerHTML = '<div class="loading">Loading tasks...</div>';
    
    // Get tasks from background page
    const tasks = await backgroundPage.marvin.getActiveTasks();
    
    // Filter active tasks
    const active = tasks.filter(task => 
      task.status === 'pending' || 
      task.status === 'processing' || 
      task.status === 'analyzing'
    );
    
    if (active.length === 0) {
      tasksSummary.innerHTML = '<div class="empty-state">No active tasks</div>';
      return;
    }
    
    tasksSummary.innerHTML = '';
    
    // Show up to 3 active tasks
    active.slice(0, 3).forEach(task => {
      const taskItem = document.createElement('div');
      taskItem.className = 'task-summary-item';
      
      // Format progress
      const progress = task.progress || 0;
      const progressPercent = Math.round(progress * 100);
      
      taskItem.innerHTML = `
        <div class="task-summary-title">${truncateText(task.url || 'Unknown URL', 40)}</div>
        <div class="task-summary-status">${formatTaskStatus(task.status)}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      `;
      
      tasksSummary.appendChild(taskItem);
    });
    
    // Add "View All" link if there are more tasks
    if (active.length > 3) {
      const viewAllLink = document.createElement('a');
      viewAllLink.href = '#';
      viewAllLink.className = 'view-all-link';
      viewAllLink.textContent = `View all ${active.length} active tasks`;
      
      viewAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('[data-panel="tasks"]').click();
      });
      
      tasksSummary.appendChild(viewAllLink);
    }
  } catch (error) {
    console.error('Error loading active tasks:', error);
    document.getElementById('tasks-summary').innerHTML = 
      `<div class="error">Error loading tasks: ${error.message}</div>`;
  }
}

async function loadOverviewStats() {
  try {
    console.log('Loading overview stats');
    
    // Get stats elements
    const capturedCountEl = document.getElementById('captured-count');
    const relationshipCountEl = document.getElementById('relationship-count');
    const queryCountEl = document.getElementById('query-count');
    
    if (!capturedCountEl || !relationshipCountEl || !queryCountEl) {
      console.error('Stats elements not found');
      return;
    }
    
    // Show loading state
    capturedCountEl.textContent = '...';
    relationshipCountEl.textContent = '...';
    queryCountEl.textContent = '...';
    
    // Try to get stats from API
    try {
      const response = await fetchAPI('/api/v1/stats');
      
      if (response.success) {
        const stats = response.data || response.result || {};
        capturedCountEl.textContent = stats.captures || 0;
        relationshipCountEl.textContent = stats.relationship_count || 0;
        queryCountEl.textContent = stats.query_count || 0;
        
        console.log('Stats loaded from API:', stats);
      } else {
        throw new Error(response.error || 'Failed to load stats');
      }
    } catch (error) {
      console.error('Error loading stats from API:', error);
      
      // Fallback to local storage
      const data = await chrome.storage.local.get(['captureHistory', 'stats']);
      const captureHistory = data.captureHistory || [];
      const stats = data.stats || {};
      
      capturedCountEl.textContent = captureHistory.length;
      relationshipCountEl.textContent = stats.relationshipCount || 0;
      queryCountEl.textContent = stats.queryCount || 0;
      
      console.log('Stats loaded from local storage');
    }
  } catch (error) {
    console.error('Error in loadOverviewStats:', error);
  }
}

async function loadRecentCaptures() {
  try {
    console.log('Loading recent captures');
    
    const recentCapturesList = document.getElementById('recent-captures-list');
    if (!recentCapturesList) {
      console.error('Recent captures list element not found');
      return;
    }
    
    // Show loading state
    recentCapturesList.innerHTML = '<li class="loading">Loading recent captures...</li>';
    
    // Get capture history from storage
    const data = await chrome.storage.local.get('captureHistory');
    const captureHistory = data.captureHistory || [];
    
    if (captureHistory.length === 0) {
      recentCapturesList.innerHTML = '<li class="empty-state">No recent captures</li>';
      return;
    }
    
    // Display recent captures (up to 5)
    recentCapturesList.innerHTML = '';
    captureHistory.slice(0, 5).forEach(item => {
      const li = document.createElement('li');
      li.className = 'capture-item';
      
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      li.innerHTML = `
        <div class="capture-title">${item.title || 'Untitled'}</div>
        <div class="capture-meta">
          <span class="capture-url">${item.url}</span>
          <span class="capture-time">${formattedDate}</span>
        </div>
      `;
      
      recentCapturesList.appendChild(li);
    });
    
    console.log('Recent captures loaded:', captureHistory.slice(0, 5).length);
    
    // Set up "View All" button
    const viewAllBtn = document.getElementById('view-all-captures');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        // Switch to capture panel
        document.querySelector('[data-panel="capture"]').click();
      });
    }
  } catch (error) {
    console.error('Error in loadRecentCaptures:', error);
  }
}

function renderMiniGraph(nodes, edges, container) {
  // Clear container
  container.innerHTML = '';
  
  // Handle empty data
  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<div class="placeholder">No graph data available</div>';
    return;
  }

  const width = container.clientWidth || 300;
  const height = container.clientHeight || 200;
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'mini-graph-svg');
  
  // Create simple simulation
  const simulation = d3.forceSimulation(nodes.slice(0, 10))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('charge', d3.forceManyBody().strength(-100))
    .force('collide', d3.forceCollide().radius(15));
  
  // Create nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes.slice(0, 10)) // Show max 10 nodes
    .enter()
    .append('circle')
    .attr('r', 5)
    .attr('fill', '#4a6fa5');
  
  // Update positions
  simulation.on('tick', () => {
    node
      .attr('cx', d => Math.max(5, Math.min(width - 5, d.x)))
      .attr('cy', d => Math.max(5, Math.min(height - 5, d.y)));
  });
  
  // Make the entire graph clickable, navigating to Knowledge tab
  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('click', () => {
      document.querySelector('[data-panel="knowledge"]').click();
    });
}

// Load open tabs
async function loadOpenTabs() {
  logWithStack('loadOpenTabs called');
  const tabsList = document.getElementById('tabs-list');
  if (!tabsList) {
    console.error('tabs-list element not found');
    return;
  }

  tabsList.innerHTML = '<div class="loading-indicator">Loading tabs...</div>';
  
  try {
    // Get all windows with tabs
    console.log('Calling chrome.windows.getAll');
    chrome.windows.getAll({ populate: true }, (windows) => {
      console.log(`Got ${windows.length} windows`);

      if (windows.length === 0) {
        tabsList.innerHTML = '<div class="empty-state">No open tabs found</div>';
        return;
      }
      
      // Create hierarchical structure
      tabsList.innerHTML = '<div class="tabs-hierarchy"></div>';
      const tabsHierarchy = tabsList.querySelector('.tabs-hierarchy');
      
      // Create window filter dropdown
      updateWindowFilter(windows);
      
      // Group tabs by windows
      windows.forEach(window => {
        const filteredTabs = window.tabs.filter(shouldShowTab);
        if (filteredTabs.length === 0) return;
        
        const windowGroup = document.createElement('div');
        windowGroup.className = 'window-group';
        windowGroup.setAttribute('data-window-id', window.id);
        
        // Create window header
        const windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        
        const windowCheckbox = document.createElement('input');
        windowCheckbox.type = 'checkbox';
        windowCheckbox.className = 'window-checkbox';
        windowCheckbox.id = `window-${window.id}`;
        
        const windowTitle = document.createElement('div');
        windowTitle.className = 'window-title';
        windowTitle.textContent = `Window ${window.id} (${filteredTabs.length} tabs)`;
        
        windowHeader.appendChild(windowCheckbox);
        windowHeader.appendChild(windowTitle);
        
        // Add collapse/expand toggle
        const toggleButton = document.createElement('button');
        toggleButton.className = 'btn-icon toggle-window';
        toggleButton.innerHTML = '▼';
        windowHeader.appendChild(toggleButton);
        
        windowGroup.appendChild(windowHeader);
        
        // Create container for tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'window-tabs';
        
        // Add tabs to container
        filteredTabs.forEach(tab => {
          const tabItem = createTabListItem(tab, window.id);
          tabsContainer.appendChild(tabItem);
        });
        
        windowGroup.appendChild(tabsContainer);
        tabsHierarchy.appendChild(windowGroup);
        
        // Window checkbox selects all tabs
        windowCheckbox.addEventListener('change', () => {
          const checked = windowCheckbox.checked;
          tabsContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
          });
        });
        
        debugCaptureButton();
        // Toggle expand/collapse
        toggleButton.addEventListener('click', () => {
          tabsContainer.style.display = tabsContainer.style.display === 'none' ? 'block' : 'none';
          toggleButton.innerHTML = tabsContainer.style.display === 'none' ? '▶' : '▼';
        });
      });
      
      // Add search functionality
      setupSearchAndFilter();

      const captureButton = document.getElementById('capture-selected');
      if (captureButton) {
        console.log('Capture button after loading tabs:', true, 'disabled=' + captureButton.disabled, 'text=' + captureButton.textContent);
        
        // Ensure event handler is attached after tabs are loaded
        captureButton.onclick = function() {
          console.log('Capture button clicked from tabs load handler!');
          captureSelectedItems();
        };
    }});
  } catch (error) {
    console.error('Error loading tabs:', error);
    tabsList.innerHTML = `<div class="error-state">Error loading tabs: ${error.message}</div>`;
  }
}

function setupSearchAndFilter() {
  const searchInput = document.getElementById('tabs-search');
  const windowFilter = document.getElementById('tabs-window-filter');
  
  // Add advanced filters button and panel
  const listControls = document.querySelector('.list-controls');
  
  const advancedButton = document.createElement('button');
  advancedButton.className = 'btn-text';
  advancedButton.textContent = 'Advanced Filters';
  advancedButton.addEventListener('click', toggleAdvancedFilters);
  listControls.appendChild(advancedButton);
  
  // Create advanced filters panel
  const advancedFilters = document.createElement('div');
  advancedFilters.className = 'advanced-filters';
  advancedFilters.style.display = 'none';
  
  advancedFilters.innerHTML = `
    <div class="filter-row">
      <span class="filter-label">Domain:</span>
      <input type="text" id="domain-filter" placeholder="e.g., example.com">
    </div>
    <div class="filter-row">
      <span class="filter-label">Exclude:</span>
      <input type="text" id="exclude-filter" placeholder="e.g., social">
    </div>
    <div class="filter-row">
      <span class="filter-label">Type:</span>
      <select id="type-filter">
        <option value="all">All types</option>
        <option value="http">HTTP</option>
        <option value="https">HTTPS</option>
        <option value="file">Files</option>
      </select>
    </div>
    <button class="btn-secondary" id="apply-filters">Apply Filters</button>
    <button class="btn-text" id="reset-filters">Reset</button>
  `;
  
  document.getElementById('tabs-content').insertBefore(advancedFilters, document.getElementById('tabs-list'));
  
  // Set up filter application
  document.getElementById('apply-filters').addEventListener('click', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
  
  // Apply filters when search changes
  searchInput.addEventListener('input', applyFilters);
  windowFilter.addEventListener('change', applyFilters);
}

function toggleAdvancedFilters() {
  const advancedFilters = document.querySelector('.advanced-filters');
  advancedFilters.style.display = advancedFilters.style.display === 'none' ? 'block' : 'none';
}

function applyFilters() {
  const searchTerm = document.getElementById('tabs-search').value.toLowerCase();
  const windowId = document.getElementById('tabs-window-filter').value;
  const domainFilter = document.getElementById('domain-filter')?.value.toLowerCase() || '';
  const excludeFilter = document.getElementById('exclude-filter')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('type-filter')?.value || 'all';
  
  // Process all tab items
  const tabItems = document.querySelectorAll('.tab-item');
  let visibleCount = 0;
  
  tabItems.forEach(item => {
    const url = item.getAttribute('data-url').toLowerCase();
    const title = item.querySelector('.tab-title').textContent.toLowerCase();
    const itemWindowId = item.getAttribute('data-window-id');
    
    let visible = true;
    
    // Apply window filter
    if (windowId !== 'all' && itemWindowId !== windowId) {
      visible = false;
    }
    
    // Apply search filter
    if (searchTerm && !url.includes(searchTerm) && !title.includes(searchTerm)) {
      visible = false;
    }
    
    // Apply domain filter
    if (domainFilter && !url.includes(domainFilter)) {
      visible = false;
    }
    
    // Apply exclude filter
    if (excludeFilter && (url.includes(excludeFilter) || title.includes(excludeFilter))) {
      visible = false;
    }
    
    // Apply type filter
    if (typeFilter === 'http' && !url.startsWith('http:')) {
      visible = false;
    } else if (typeFilter === 'https' && !url.startsWith('https:')) {
      visible = false;
    } else if (typeFilter === 'file' && !url.startsWith('file:')) {
      visible = false;
    }
    
    // Update visibility
    item.style.display = visible ? 'flex' : 'none';
    if (visible) visibleCount++;
  });
  
  // Update window visibility based on visible tabs
  const windowGroups = document.querySelectorAll('.window-group');
  windowGroups.forEach(group => {
    const visibleTabsInWindow = Array.from(group.querySelectorAll('.tab-item'))
      .filter(item => item.style.display !== 'none').length;
      
    group.style.display = visibleTabsInWindow > 0 ? 'block' : 'none';
  });
  
  // Show message if no results
  const tabsList = document.getElementById('tabs-list');
  const noResults = tabsList.querySelector('.no-results');
  
  if (visibleCount === 0) {
    if (!noResults) {
      const message = document.createElement('div');
      message.className = 'no-results empty-state';
      message.textContent = 'No tabs match your filters';
      tabsList.appendChild(message);
    }
  } else if (noResults) {
    noResults.remove();
  }
}

function resetFilters() {
  document.getElementById('tabs-search').value = '';
  document.getElementById('tabs-window-filter').value = 'all';
  document.getElementById('domain-filter').value = '';
  document.getElementById('exclude-filter').value = '';
  document.getElementById('type-filter').value = 'all';
  
  applyFilters();
}

// Add a function to extract content from a tab
async function extractTabContent(tabId) {
  try {
    // We'll use the executeScript method to extract content from the tab
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        return {
          content: document.documentElement.outerHTML,
          title: document.title,
          metadata: {
            description: document.querySelector('meta[name="description"]')?.content || '',
            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
            author: document.querySelector('meta[name="author"]')?.content || '',
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
            ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
            ogImage: document.querySelector('meta[property="og:image"]')?.content || ''
          }
        };
      }
    });
    
    if (!results || !results[0] || chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError?.message || 'Failed to extract content');
    }
    
    return results[0].result;
  } catch (error) {
    console.error(`Error extracting content from tab ${tabId}:`, error);
    // Return minimal data if extraction fails
    return {
      content: "",
      title: "",
      metadata: {}
    };
  }
}

// Filter tabs that should be shown (e.g., skip chrome:// URLs)
function shouldShowTab(tab) {
  // Skip chrome internal pages
  if (tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')) {
    return false;
  }
  
  return true;
}

// Create a list item for a tab
function createTabListItem(tab, windowId) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.setAttribute('data-id', tab.id);
  item.setAttribute('data-url', tab.url);
  item.setAttribute('data-window-id', windowId);
  
  const favicon = tab.favIconUrl || '../icons/icon16.png';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `tab-${tab.id}`;
  checkbox.className = 'item-checkbox';
  
  const icon = document.createElement('img');
  icon.src = favicon;
  icon.alt = '';
  icon.className = 'tab-icon';
  
  const content = document.createElement('div');
  content.className = 'tab-content';
  
  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || 'Untitled';
  
  const url = document.createElement('div');
  url.className = 'tab-url';
  url.textContent = tab.url;
  
  content.appendChild(title);
  content.appendChild(url);
  
  item.appendChild(checkbox);
  item.appendChild(icon);
  item.appendChild(content);
  
  return item;
}

// Set up filtering for tabs
function setupTabsFilter(allTabs) {
  if (tabsFilterInitialized) {
    console.log('Tabs filter already initialized, updating tabs only');
    // Just update the tabs data without adding new event listeners
    const searchInput = document.getElementById('tabs-search');
    const windowFilter = document.getElementById('tabs-window-filter');
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    filterTabs(allTabs, searchTerm, windowId);
    return;
  }
  
  console.log('Initializing tabs filter');
  tabsFilterInitialized = true;
  
  const searchInput = document.getElementById('tabs-search');
  const windowFilter = document.getElementById('tabs-window-filter');
  
  // Search functionality
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    debouncedFilterTabs(allTabs, searchTerm, windowId);
  });
  
  windowFilter.addEventListener('change', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const windowId = windowFilter.value === 'all' ? null : parseInt(windowFilter.value);
    
    debouncedFilterTabs(allTabs, searchTerm, windowId);
  });
}

// Filter tabs based on search term and window
function filterTabs(allTabs, searchTerm, windowId) {
  const tabsList = document.getElementById('tabs-list');
  tabsList.innerHTML = '';
  
  const filteredTabs = allTabs.filter(tab => {
    // Apply window filter
    if (windowId !== null && tab.windowId !== windowId) {
      return false;
    }
    
    // Apply search filter
    if (searchTerm && !tab.title.toLowerCase().includes(searchTerm) && 
        !tab.url.toLowerCase().includes(searchTerm)) {
      return false;
    }
    
    return shouldShowTab(tab);
  });
  
  if (filteredTabs.length === 0) {
    tabsList.innerHTML = '<div class="empty-state">No matching tabs found</div>';
    return;
  }
  
  filteredTabs.forEach(tab => {
    const tabItem = createTabListItem(tab);
    tabsList.appendChild(tabItem);
  });
}

// Setup selection controls (Select All/Deselect All)
function setupSelectionControls(type) {
  const selectAllBtn = document.getElementById(`select-all-${type}`);
  const deselectAllBtn = document.getElementById(`deselect-all-${type}`);
  
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  });
  
  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(`#${type}-list .item-checkbox`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  });
}

async function loadBookmarks() {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '<div class="loading-indicator">Loading bookmarks...</div>';
  
  try {
    // Get bookmark tree
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // Process and flatten bookmark tree
    const bookmarks = flattenBookmarks(bookmarkTree);
    
    if (bookmarks.length === 0) {
      bookmarksList.innerHTML = '<div class="empty-state">No bookmarks found</div>';
      return;
    }
    
    // Populate folder filter
    populateBookmarkFolders(bookmarks);
    
    // Display bookmarks
    displayBookmarks(bookmarks);
    
    // Set up selection controls
    setupSelectionControls('bookmarks');
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    bookmarksList.innerHTML = `<div class="error-state">Error loading bookmarks: ${error.message}</div>`;
  }
}

// Helper function to flatten bookmark tree into array
function flattenBookmarks(bookmarkNodes, path = "") {
  let bookmarks = [];
  
  for (const node of bookmarkNodes) {
    // Skip the root nodes
    if (node.id === "0" || node.id === "1" || node.id === "2") {
      if (node.children) {
        bookmarks = bookmarks.concat(flattenBookmarks(node.children));
      }
      continue;
    }
    
    const currentPath = path ? `${path} > ${node.title}` : node.title;
    
    if (node.url) {
      // This is a bookmark
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        path: path,
        dateAdded: node.dateAdded
      });
    } else if (node.children) {
      // This is a folder
      bookmarks = bookmarks.concat(flattenBookmarks(node.children, currentPath));
    }
  }
  
  return bookmarks;
}

// Populate folder dropdown for filtering
function populateBookmarkFolders(bookmarks) {
  const folderFilter = document.getElementById('bookmarks-folder-filter');
  folderFilter.innerHTML = '<option value="all">All Folders</option>';
  
  // Get unique folders
  const folders = [...new Set(bookmarks.map(b => b.path))].filter(path => path);

  // Add options for each folder
  folders.sort().forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    folderFilter.appendChild(option);
  });

  // Set up event listener for filtering
  document.getElementById('bookmarks-search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const selectedFolder = folderFilter.value;
    
    debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
  });
  
  folderFilter.addEventListener('change', () => {
    const selectedFolder = folderFilter.value;
    const searchTerm = document.getElementById('bookmarks-search').value.toLowerCase();
    
    debouncedFilterBookmarks(bookmarks, searchTerm, selectedFolder);
  });
}

// Display bookmarks in the list
function displayBookmarks(bookmarks) {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '';
  
  bookmarks.forEach(bookmark => {
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'list-item bookmark-item';
    bookmarkItem.setAttribute('data-id', bookmark.id);
    bookmarkItem.setAttribute('data-url', bookmark.url);
    
    // Try to get favicon
    const faviconUrl = new URL(bookmark.url);
    const favicon = `https://www.google.com/s2/favicons?domain=${faviconUrl.hostname}`;
    
    bookmarkItem.innerHTML = `
      <div class="item-selector">
        <input type="checkbox" id="bookmark-${bookmark.id}" class="item-checkbox">
      </div>
      <div class="item-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="item-content">
        <div class="item-title">${bookmark.title || 'Untitled'}</div>
        <div class="item-url">${truncateText(bookmark.url, 50)}</div>
      </div>
      <div class="item-meta">
        <span class="item-folder">${bookmark.path || 'Root'}</span>
        <span class="item-date">${formatDate(bookmark.dateAdded)}</span>
      </div>
    `;
    
    bookmarksList.appendChild(bookmarkItem);
  });
}

// Filter bookmarks based on search term and folder
function filterBookmarks(allBookmarks, searchTerm, folder) {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '';
  
  const filteredBookmarks = allBookmarks.filter(bookmark => {
    // Apply folder filter
    if (folder !== 'all' && bookmark.path !== folder) {
      return false;
    }
    
    // Apply search filter
    if (searchTerm && !bookmark.title.toLowerCase().includes(searchTerm) && 
        !bookmark.url.toLowerCase().includes(searchTerm)) {
      return false;
    }
    
    return true;
  });
  
  if (filteredBookmarks.length === 0) {
    bookmarksList.innerHTML = '<div class="empty-state">No matching bookmarks found</div>';
    return;
  }
  
  filteredBookmarks.forEach(bookmark => {
    // Create bookmark item (same as in displayBookmarks)
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'list-item bookmark-item';
    // ... rest of the item creation code
    bookmarksList.appendChild(bookmarkItem);
  });
}

// Helper function to format date
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

async function loadHistory() {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '<div class="loading-indicator">Loading history...</div>';
  
  try {
    // Get time filter value
    const timeFilter = document.getElementById('history-time-filter').value;
    const startTime = getStartTimeFromFilter(timeFilter);
    
    // Query browser history
    const historyItems = await chrome.history.search({
      text: '',  // Empty string to get all history
      startTime: startTime,
      maxResults: 1000
    });
    
    if (historyItems.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No history items found</div>';
      return;
    }
    
    // Display history items
    displayHistoryItems(historyItems);
    
    // Set up time filter change handler
    document.getElementById('history-time-filter').addEventListener('change', () => {
      loadHistory();
    });
    
    // Set up search handler
    document.getElementById('history-search').addEventListener('input', (e) => {
      debouncedFilterHistory(historyItems, e.target.value.toLowerCase());
    });
    
    // Set up selection controls
    setupSelectionControls('history');
  } catch (error) {
    console.error('Error loading history:', error);
    historyList.innerHTML = `<div class="error-state">Error loading history: ${error.message}</div>`;
  }
}

// Get start time based on filter
function getStartTimeFromFilter(filter) {
  const now = new Date();
  
  switch (filter) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime();
      
    case 'yesterday':
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      return yesterday.getTime();
      
    case 'week':
      const week = new Date();
      week.setDate(week.getDate() - 7);
      return week.getTime();
      
    case 'month':
      const month = new Date();
      month.setDate(month.getDate() - 30);
      return month.getTime();
      
    default:
      return 0; // All history
  }
}

// Display history items
function displayHistoryItems(items) {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';
  
  // Group by domain
  const groupedItems = groupHistoryByDomain(items);
  
  // Create UI for grouped items
  Object.entries(groupedItems).forEach(([domain, domainItems]) => {
    // Create domain group header
    const domainHeader = document.createElement('div');
    domainHeader.className = 'domain-header';
    
    // Try to get favicon
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}`;
    
    domainHeader.innerHTML = `
      <div class="domain-selector">
        <input type="checkbox" id="domain-${domain}" class="domain-checkbox">
      </div>
      <div class="domain-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="domain-name">${domain}</div>
      <div class="domain-count">${domainItems.length} items</div>
      <div class="domain-toggle">▼</div>
    `;
    
    historyList.appendChild(domainHeader);
    
    // Create container for domain items
    const domainContainer = document.createElement('div');
    domainContainer.className = 'domain-items';
    
    // Add domain items
    domainItems.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'list-item history-item';
      historyItem.setAttribute('data-id', item.id);
      historyItem.setAttribute('data-url', item.url);
      
      historyItem.innerHTML = `
        <div class="item-selector">
          <input type="checkbox" id="history-${item.id}" class="item-checkbox">
        </div>
        <div class="item-content">
          <div class="item-title">${item.title || 'Untitled'}</div>
          <div class="item-url">${truncateText(item.url, 50)}</div>
        </div>
        <div class="item-meta">
          <span class="item-date">${formatDate(item.lastVisitTime)}</span>
          <span class="item-visits">${item.visitCount} visits</span>
        </div>
      `;
      
      domainContainer.appendChild(historyItem);
    });
    
    historyList.appendChild(domainContainer);
    
    // Set up domain checkbox to select/deselect all items
    domainHeader.querySelector('.domain-checkbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      domainContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
      });
    });
    
    // Set up toggle to expand/collapse domain items
    domainHeader.querySelector('.domain-toggle').addEventListener('click', () => {
      domainContainer.style.display = domainContainer.style.display === 'none' ? 'block' : 'none';
      domainHeader.querySelector('.domain-toggle').textContent = 
        domainContainer.style.display === 'none' ? '▶' : '▼';
    });
  });
}

// Group history items by domain
function groupHistoryByDomain(items) {
  const grouped = {};
  
  items.forEach(item => {
    try {
      const url = new URL(item.url);
      const domain = url.hostname;
      
      if (!grouped[domain]) {
        grouped[domain] = [];
      }
      
      grouped[domain].push(item);
    } catch (error) {
      // Skip invalid URLs
      console.warn('Invalid URL in history:', item.url);
    }
  });
  
  // Sort each domain's items by lastVisitTime (most recent first)
  Object.values(grouped).forEach(domainItems => {
    domainItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  });
  
  return grouped;
}

// Filter history items based on search term
function filterHistory(allItems, searchTerm) {
  if (!searchTerm) {
    displayHistoryItems(allItems);
    return;
  }
  
  const filteredItems = allItems.filter(item => 
    item.title?.toLowerCase().includes(searchTerm) || 
    item.url.toLowerCase().includes(searchTerm)
  );
  
  displayHistoryItems(filteredItems);
}

async function captureSelectedItems() {
  console.log('captureSelectedItems function called');
  
  // Get active tab panel
  const activeTabPane = document.querySelector('.capture-tab-content .tab-pane.active');
  if (!activeTabPane) {
    console.error('No capture tab is active');
    showNotification('Error: No capture tab is active', 'error');
    return;
  }
  
  const type = activeTabPane.id.split('-')[0]; // tabs, bookmarks, or history
  console.log(`Capture type: ${type}`);
  
  // Get selected items
  let selectedCheckboxes;
  if (type === 'tabs') {
    selectedCheckboxes = activeTabPane.querySelectorAll('.tab-item input[type="checkbox"]:checked');
  } else {
    selectedCheckboxes = activeTabPane.querySelectorAll('.item-checkbox:checked');
  }
  
  if (selectedCheckboxes.length === 0) {
    console.log('No items selected');
    showNotification('Please select at least one item to capture', 'warning');
    return;
  }
  
  // Create batch ID for tracking multiple captures
  const batchId = `batch_${Date.now()}`;
  const batchTracker = new ProgressTracker(batchId, {
    stages: ['preparing', 'capturing', 'processing', 'complete'],
    persistence: true
  });
  
  // Update UI to show capture in progress
  const captureBtn = document.getElementById('capture-selected');
  const originalText = captureBtn?.textContent || 'Capture Selected';
  
  if (captureBtn) {
    captureBtn.textContent = `Capturing ${selectedCheckboxes.length} items...`;
    captureBtn.disabled = true;
  }
  
  // Create a notification for overall progress
  showNotification(`Capturing ${selectedCheckboxes.length} items...`, 'info', 0);
  
  try {
    // Gather selected items with proper error handling
    const selectedItems = [];
    
    Array.from(selectedCheckboxes).forEach(checkbox => {
      const item = checkbox.closest('.list-item') || checkbox.closest('.tab-item');
      if (!item) return;
      
      const id = item.getAttribute('data-id');
      const url = item.getAttribute('data-url');
      const titleElement = item.querySelector('.item-title') || item.querySelector('.tab-title');
      const title = titleElement ? titleElement.textContent : 'Untitled';
      
      if (url) {
        selectedItems.push({
          id,
          url,
          title,
          type,
          context: getContextForType(type)
        });
      }
    });
    
    // Update batch progress
    batchTracker.update(10, 0, 'preparing');
    
    // Track results for all captures
    const captureResults = [];
    let completedCount = 0;
    
    // Start capturing items
    batchTracker.update(20, 1, 'capturing');
    
    for (const [index, item] of selectedItems.entries()) {
      try {
        // Update the notification for each item
        const currentItem = index + 1;
        const progressPercent = Math.round((currentItem / selectedItems.length) * 100);
        updateNotificationProgress(`Capturing item ${currentItem}/${selectedItems.length}: ${item.title}`, progressPercent);
        
        // Create individual tracker for this item
        const itemTracker = new ProgressTracker(`capture_${Date.now()}_${index}`, {
          stages: ['preparing', 'extracting', 'sending', 'complete'],
          persistence: true
        });
        
        itemTracker.update(0, 0, 'preparing');
        
        // Extract content for tabs if needed
        let content = null;
        let extractedTitle = item.title;
        let metadata = {};
        
        if (type === 'tabs') {
          itemTracker.update(20, 1, 'extracting');
          
          try {
            const tabId = parseInt(item.id);
            const extractedData = await extractTabContent(tabId);
            
            content = extractedData.content || "";
            extractedTitle = extractedData.title || item.title;
            metadata = extractedData.metadata || {};
            
            itemTracker.update(50, 1, 'extracting');
          } catch (extractError) {
            console.error(`Error extracting content for tab ${item.id}:`, extractError);
            itemTracker.update(40, 1, 'extracting');
          }
        }
        
        // Prepare capture options
        const captureOptions = {
          context: item.context,
          title: extractedTitle,
          content: content,
          metadata: metadata,
          browser_contexts: [item.context]
        };
        
        // Add source-specific fields
        if (type === 'tabs') {
          captureOptions.tabId = item.id.toString();
          captureOptions.windowId = "1"; // Default window ID
        } else if (type === 'bookmarks') {
          captureOptions.bookmarkId = item.id.toString();
        }
        
        // Send capture request
        itemTracker.update(70, 2, 'sending');
        
        // Use the background page API directly for more control
        const response = await backgroundPage.marvin.captureUrl(item.url, captureOptions);
        
        // Process response
        if (response.success) {
          itemTracker.update(100, 3, 'complete');
          completedCount++;
          
          captureResults.push({
            url: item.url,
            success: true,
            data: response.data
          });
        } else {
          itemTracker.fail(response.error || 'Capture failed');
          
          captureResults.push({
            url: item.url,
            success: false,
            error: response.error
          });
        }
        
        // Update batch progress
        const batchProgress = 20 + Math.round((currentItem / selectedItems.length) * 60);
        batchTracker.update(batchProgress, 1, 'capturing');
        
      } catch (itemError) {
        console.error(`Error capturing ${item.url}:`, itemError);
        
        captureResults.push({
          url: item.url,
          success: false,
          error: itemError.message
        });
      }
      
      // Small delay between captures to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Update batch to processing
    batchTracker.update(80, 2, 'processing');
    
    // Update notification
    updateNotificationProgress(`Finishing capture: ${completedCount}/${selectedItems.length} successful`, 90);
    
    // Update capture history
    if (completedCount > 0) {
      // Fetch current history
      const data = await chrome.storage.local.get('captureHistory');
      const captureHistory = data.captureHistory || [];
      
      // Add new captures to history
      const newCaptures = captureResults
        .filter(result => result.success)
        .map(result => ({
          url: result.url,
          title: selectedItems.find(item => item.url === result.url)?.title || 'Untitled',
          timestamp: Date.now(),
          status: 'captured'
        }));
      
      const updatedHistory = [...newCaptures, ...captureHistory];
      
      // Keep only the latest 100 items
      if (updatedHistory.length > 100) {
        updatedHistory.splice(100);
      }
      
      // Save updated history
      await chrome.storage.local.set({ captureHistory: updatedHistory });
      
      // Update stats
      const stats = (await chrome.storage.local.get('stats')).stats || { captures: 0, relationships: 0, queries: 0 };
      stats.captures += completedCount;
      await chrome.storage.local.set({ stats });
    }
    
    // Complete batch
    batchTracker.update(100, 3, 'complete');
    
    // Update UI
    if (captureBtn) {
      if (completedCount === selectedItems.length) {
        captureBtn.textContent = 'Capture Successful!';
        showNotification(`Successfully captured ${completedCount} items`, 'success');
      } else if (completedCount > 0) {
        captureBtn.textContent = `${completedCount}/${selectedItems.length} Captured`;
        showNotification(`Partially successful: ${completedCount}/${selectedItems.length} captured`, 'warning');
      } else {
        captureBtn.textContent = 'Capture Failed';
        showNotification('All captures failed', 'error');
      }
      
      // Reset button after delay
      setTimeout(() => {
        captureBtn.textContent = originalText;
        captureBtn.disabled = false;
        
        // Uncheck all items
        selectedCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
        
        // Refresh dashboard data
        loadDashboardData();
      }, 2000);
    }
    
  } catch (error) {
    console.error('Error capturing items:', error);
    
    if (captureBtn) {
      captureBtn.textContent = 'Capture Failed';
      captureBtn.disabled = false;
      
      setTimeout(() => {
        captureBtn.textContent = originalText;
      }, 2000);
    }
    
    showNotification(`Error capturing items: ${error.message}`, 'error');
  }
}

// Update an existing progress notification
function updateNotificationProgress(message, progress) {
  const notification = document.querySelector('.notification.progress-notification');
  
  if (notification) {
    const messageEl = notification.querySelector('.notification-message');
    const progressBar = notification.querySelector('.notification-progress-bar');
    
    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
  } else {
    // Create a new one if it doesn't exist
    showNotification(message, 'info', progress);
  }
}

function getContextForType(type) {
  // Map item types to context types
  const contextMap = {
    'tabs': 'ACTIVE_TAB',
    'bookmarks': 'BOOKMARK',
    'history': 'HISTORY'
  };
  
  return contextMap[type] || 'ACTIVE_TAB';
}

function initSplitView() {
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

// Initialize knowledge panel
async function initKnowledgePanel() {
  if (knowledgeInitialized) {
    console.log('Knowledge panel already initialized, skipping');
    return;
  }
  
  console.log('Initializing knowledge panel');
  knowledgeInitialized = true;

  // Initialize the split view
  initSplitView();

  // Load initial knowledge data
  loadKnowledgeData();
  
  // Initialize graph
  initKnowledgeGraph();

  try {
    // Load initial knowledge data
    await debouncedLoadKnowledgeData();
    
    // Knowledge panel search
    document.getElementById('knowledge-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        debouncedSearchKnowledge(e.target.value);
      }
    });
    
    document.getElementById('search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('knowledge-search').value;
      debouncedSearchKnowledge(searchTerm);
    });
    
    // Set up filter handlers
    setupKnowledgeFilters();
  } catch (error) {
    console.error('Error initializing knowledge panel:', error);
    document.querySelector('.knowledge-list').innerHTML = 
      `<div class="error-state">Error loading knowledge: ${error.message}</div>`;
  }
}

async function loadKnowledgeData() {
  const knowledgeList = document.querySelector('.knowledge-list');
  knowledgeList.innerHTML = '<div class="loading-indicator">Loading knowledge items...</div>';
  
  try {
    // First try to get data from the API
    const response = await fetchAPI('/api/v1/pages/');
    
    if (response.success) {
      displayKnowledgeItems(response.data.pages);
    } else {
      // If API fails, show fallback message and use captured history instead
      console.error('API error:', response.error);
      
      // Load capture history from storage as fallback
      const data = await chrome.storage.local.get('captureHistory');
      const captureHistory = data.captureHistory || [];
      
      if (captureHistory.length > 0) {
        knowledgeList.innerHTML = `
          <div class="error-note">
            Could not load data from API server.
            Showing locally captured pages instead.
          </div>
        `;
        
        // Convert capture history to a format similar to API response
        const fallbackItems = captureHistory.map(item => ({
          id: item.url, // Use URL as ID
          url: item.url,
          title: item.title,
          domain: new URL(item.url).hostname,
          discovered_at: item.timestamp,
          browser_contexts: [BrowserContext.ACTIVE_TAB],
          keywords: {},
          relationships: []
        }));
        
        displayKnowledgeItems(fallbackItems);
      } else {
        knowledgeList.innerHTML = `
          <div class="error-state">
            Could not load knowledge data from API.
            <br>
            Error: ${response.error?.message || 'Unknown error'}
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading knowledge data:', error);
    
    // Show fallback UI and error message
    knowledgeList.innerHTML = `
      <div class="error-state">
        Error loading knowledge data:
        <br>
        ${error.message}
        <br><br>
        <button id="retry-load-btn" class="btn-secondary">Retry</button>
      </div>
    `;
    
    // Add retry button functionality
    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      loadKnowledgeData();
    });
  }
}

// For async loadKnowledgeData
const debouncedLoadKnowledgeData = (() => {
  let timeout;
  let pendingPromise = null;
  
  return function() {
    if (pendingPromise) return pendingPromise;
    
    clearTimeout(timeout);
    
    pendingPromise = new Promise(resolve => {
      timeout = setTimeout(async () => {
        try {
          const result = await loadKnowledgeData();
          resolve(result);
        } catch (error) {
          console.error('Error in debounced loadKnowledgeData:', error);
          resolve(null);
        } finally {
          pendingPromise = null;
        }
      }, 500);
    });
    
    return pendingPromise;
  };
})();

function displayKnowledgeItems(items) {
  const knowledgeList = document.querySelector('.knowledge-list');
  
  if (!items || items.length === 0) {
    knowledgeList.innerHTML = '<div class="empty-state">No knowledge items found</div>';
    return;
  }
  
  knowledgeList.innerHTML = '';
  
  items.forEach(item => {
    const knowledgeItem = document.createElement('div');
    knowledgeItem.className = 'knowledge-item';
    knowledgeItem.setAttribute('data-id', item.id);
    knowledgeItem.setAttribute('data-url', item.url);
    
    // Try to determine favicon
    let favicon = '';
    try {
      const urlObj = new URL(item.url);
      favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}`;
    } catch (e) {
      // Use default if URL parsing fails
      favicon = '../icons/icon16.png';
    }
    
    // Format date
    const discoveredDate = new Date(item.discovered_at);
    const dateStr = discoveredDate.toLocaleDateString();
    
    knowledgeItem.innerHTML = `
      <div class="item-icon">
        <img src="${favicon}" alt="" class="favicon">
      </div>
      <div class="item-content">
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-url">${truncateText(item.url, 50)}</div>
        <div class="item-meta">
          <span class="item-date">Captured: ${dateStr}</span>
          <span class="item-source">${formatContext(item.browser_contexts)}</span>
        </div>
        ${item.keywords && Object.keys(item.keywords).length > 0 
          ? `<div class="item-keywords">
              ${Object.entries(item.keywords).slice(0, 5).map(([keyword, score]) => 
                `<span class="keyword">${keyword}</span>`
              ).join('')}
             </div>` 
          : ''}
      </div>
      <div class="item-actions">
        <button class="btn-action">View Details</button>
      </div>
    `;
    
    // Add click handler to show details
    knowledgeItem.querySelector('.btn-action').addEventListener('click', () => {
      showKnowledgeDetails(item);
    });
    
    knowledgeList.appendChild(knowledgeItem);
  });
}

function formatContext(contexts) {
  if (!contexts || contexts.length === 0) return '';
  
  function formatContext(contexts) {
    if (!contexts || contexts.length === 0) return '';
    
    return contexts.map(c => BrowserContextLabels[c] || c).join(', ');
  }
}

function setupKnowledgeFilters() {
  // Set up source filter checkboxes
  document.querySelectorAll('.knowledge-filters input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      applyKnowledgeFilters();
    });
  });
  
  // Set up date filters
  document.getElementById('date-from').addEventListener('change', applyKnowledgeFilters);
  document.getElementById('date-to').addEventListener('change', applyKnowledgeFilters);
}

function applyKnowledgeFilters() {
  // This will be implemented to filter the knowledge items based on selected filters
  // For now, just reload all data
  loadKnowledgeData();
}

async function searchKnowledge(searchTerm) {
  if (!searchTerm.trim()) {
    loadKnowledgeData();
    return;
  }
  
  const knowledgeList = document.querySelector('.knowledge-list');
  knowledgeList.innerHTML = '<div class="loading-indicator">Searching...</div>';
  
  try {
    // First try the search endpoint that should be there
    let response;
    try {
      response = await fetchAPI(`/api/v1/pages/?query=${encodeURIComponent(searchTerm)}`);
    } catch (error) {
      // If the first attempt fails, try a fallback approach
      // by getting all pages and filtering client-side
      console.log('Search endpoint error, falling back to all pages:', error);
      response = await fetchAPI('/api/v1/pages/');
      
      if (response.success && response.data && response.data.pages) {
        // Filter pages by the search term
        const filteredPages = response.data.pages.filter(page => 
          page.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          page.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
          Object.keys(page.keywords || {}).some(k => 
            k.toLowerCase().includes(searchTerm.toLowerCase())
          )
        );
        
        // Create a modified response with filtered pages
        response = {
          success: true,
          data: {
            ...response.data,
            pages: filteredPages
          }
        };
      }
    }


    if (response.success) {
      displayKnowledgeItems(response.data.pages || []);
    } else {
      throw new Error(response.error?.message || 'Search failed');
    }
  } catch (error) {
    console.error('Search error:', error);
    knowledgeList.innerHTML = `<div class="error-state">Search error: ${error.message}</div>`;
  }
}


function showKnowledgeDetails(item) {
  // Get the details sidebar
  const sidebar = document.getElementById('details-sidebar');
  
  // Update sidebar content
  const detailsContent = sidebar.querySelector('.details-content');
  
  // Format date
  const discoveredDate = new Date(item.discovered_at);
  const dateStr = discoveredDate.toLocaleDateString();
  
  // Create HTML content for details
  detailsContent.innerHTML = `
    <div class="details-item">
      <h3>${item.title || 'Untitled'}</h3>
      <div class="details-url">
        <a href="${item.url}" target="_blank">${item.url}</a>
      </div>
      
      <div class="details-section">
        <h4>Metadata</h4>
        <dl class="details-data">
          <dt>Captured</dt>
          <dd>${dateStr}</dd>
          
          <dt>Source</dt>
          <dd>${formatContext(item.browser_contexts)}</dd>
          
          <dt>Status</dt>
          <dd>${item.status}</dd>
          
          <dt>Domain</dt>
          <dd>${item.domain}</dd>
        </dl>
      </div>
      
      ${item.keywords && Object.keys(item.keywords).length > 0 
        ? `<div class="details-section">
            <h4>Keywords</h4>
            <div class="keyword-cloud">
              ${Object.entries(item.keywords).map(([keyword, score]) => 
                `<div class="keyword-tag" style="font-size: ${Math.min(100, score * 100) + 80}%">
                  ${keyword} <span class="keyword-score">${(score * 100).toFixed(0)}%</span>
                </div>`
              ).join('')}
            </div>
          </div>` 
        : ''}
      
      ${item.relationships && item.relationships.length > 0 
        ? `<div class="details-section">
            <h4>Relationships</h4>
            <ul class="relationship-list">
              ${item.relationships.map(rel => 
                `<li>
                  <span class="relationship-type">${rel.type}</span>
                  <a href="#" class="relationship-target" data-id="${rel.target_id}">
                    ${rel.target_id}
                  </a>
                </li>`
              ).join('')}
            </ul>
          </div>` 
        : ''}
      
      <div class="details-actions">
        <button class="btn-secondary" id="view-in-browser">Open in Browser</button>
        <button class="btn-secondary" id="recapture-page">Recapture</button>
        <button class="btn-secondary" id="analyze-page">Analyze</button>
      </div>
    </div>
  `;
  
  // Add event listeners
  detailsContent.querySelector('#view-in-browser').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });
  
  detailsContent.querySelector('#recapture-page').addEventListener('click', async () => {
    const button = detailsContent.querySelector('#recapture-page');
    button.disabled = true;
    button.textContent = 'Recapturing...';
    
    try {
      // Request recapture
      const pageData = {
        url: item.url,
        title: item.title,
        context: item.browser_contexts[0] || 'active_tab',
        browser_contexts: item.browser_contexts
      };
      
      const response = await fetchAPI('/api/v1/pages/', {
        method: 'POST',
        body: JSON.stringify(pageData)
      });

      if (response.success) {
        button.textContent = 'Recaptured!';
        
        // Reload knowledge data to show updated information
        setTimeout(() => {
          loadKnowledgeData();
          button.disabled = false;
          button.textContent = 'Recapture';
        }, 2000);
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Recapture error:', error);
      button.textContent = 'Recapture Failed';
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Recapture';
      }, 2000);
    }
  });
  
  // Add analyze button handler
  detailsContent.querySelector('#analyze-page').addEventListener('click', async () => {
    const button = detailsContent.querySelector('#analyze-page');
    button.disabled = true;
    button.textContent = 'Analyzing...';
    
    try {
      // Request analysis
      const response = await fetchAPI('/api/v1/analysis/analyze', {
        method: 'POST',
        body: JSON.stringify({
          url: item.url,
          force: true
        })
      });

      if (response.success) {
        button.textContent = 'Analysis Started!';
        
        // Check analysis status periodically
        const taskId = response.data.task_id;
        if (taskId) {
          checkAnalysisStatus(taskId, button);
        } else {
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Analyze';
          }, 2000);
        }
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      button.textContent = 'Analysis Failed';
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Analyze';
      }, 2000);
    }
  });
  
  // Set up relationship item clicks to load related items
  detailsContent.querySelectorAll('.relationship-target').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-id');
      loadRelatedItem(targetId);
    });
  });
  
  // Display the sidebar
  sidebar.classList.add('active');
  
  // Set up close button
  sidebar.querySelector('.close-details-btn').addEventListener('click', () => {
    sidebar.classList.remove('active');
  });
}

async function checkAnalysisStatus(taskId, button) {
  try {
    const response = await fetchAPI(`/api/v1/analysis/status/${taskId}`);
    
    if (response.success) {
      const status = response.data.status;
      
      if (status === 'completed') {
        button.textContent = 'Analysis Complete!';
        
        // Reload knowledge data to show updated information
        setTimeout(() => {
          loadKnowledgeData();
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      } else if (status === 'error') {
        button.textContent = 'Analysis Failed';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      } else if (status === 'processing' || status === 'pending') {
        // Still processing, check again after a delay
        button.textContent = `Analyzing (${status})...`;
        setTimeout(() => checkAnalysisStatus(taskId, button), 2000);
      } else {
        button.textContent = 'Unknown Status';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Analyze';
        }, 2000);
      }
    } else {
      throw new Error(response.error?.message || 'Failed to check status');
    }
  } catch (error) {
    console.error('Error checking analysis status:', error);
    button.textContent = 'Status Check Failed';
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Analyze';
    }, 2000);
  }
}

async function loadRelatedItem(itemId) {
  try {
    // Request item details
    const response = await fetchAPI(`/api/v1/pages/${itemId}`);
    
    if (response.success) {
      showKnowledgeDetails(response.data);
    } else {
      throw new Error(response.error?.message || 'Failed to load related item');
    }
  } catch (error) {
    console.error('Error loading related item:', error);
    alert(`Error loading related item: ${error.message}`);
  }
}

// Initialize assistant panel
async function initAssistantPanel() {
  if (assistantInitialized) {
    console.log('Assistant panel already initialized, skipping');
    return;
  }
  
  console.log('Initializing assistant panel');
  assistantInitialized = true;

  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-message');
  const messagesContainer = document.getElementById('chat-messages');
  const contextButton = document.getElementById('context-selector-btn');
  const contextDropdown = document.getElementById('context-dropdown');
  
  // Toggle context dropdown
  contextButton.addEventListener('click', () => {
    contextDropdown.classList.toggle('active');
  });
  
  // Close context dropdown when clicking outside
  document.addEventListener('click', (event) => {
    if (!contextButton.contains(event.target) && !contextDropdown.contains(event.target)) {
      contextDropdown.classList.remove('active');
    }
  });
  
  // Updated sendMessage function in dashboard.js
  async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) return;
    
    // Add user message to chat
    addMessageToChat('user', messageText);
    
    // Clear input
    chatInput.value = '';
    
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'message assistant loading';
    loadingIndicator.innerHTML = '<div class="message-content"><p>Loading response...</p></div>';
    messagesContainer.appendChild(loadingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Get selected context
    const contextOptions = document.querySelectorAll('.context-options input:checked');
    const selectedContext = Array.from(contextOptions).map(option => option.id.replace('context-', ''));
    
    try {
      // Get relevant URLs based on selected context
      let relevantUrls = [];
      if (selectedContext.length > 0) {
        // If context items are selected, fetch relevant URLs
        try {
          const contextResponse = await fetchAPI('/api/v1/pages/?limit=5');
          if (contextResponse.success && contextResponse.data && contextResponse.data.pages) {
            relevantUrls = contextResponse.data.pages.map(page => page.url);
          }
        } catch (error) {
          console.error('Error fetching context URLs:', error);
        }
      }
      
      // Send query to agent API
      const agentResponse = await fetchAPI('/api/v1/agent/query', {
        method: 'POST',
        body: JSON.stringify({
          task_type: 'query',
          query: messageText,
          relevant_urls: relevantUrls
        })
      });
       
      // Remove loading indicator
      messagesContainer.removeChild(loadingIndicator);
      
      if (agentResponse.success && agentResponse.data && agentResponse.data.task_id) {
        // Start checking for completion
        const taskId = agentResponse.data.task_id;
        checkTaskStatus(taskId, messageText);
      } else {
        // Show error message
        const errorMessage = agentResponse.error?.message || 'Failed to send query to assistant';
        addMessageToChat('assistant', `Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error sending message to agent:', error);
      
      // Remove loading indicator
      messagesContainer.removeChild(loadingIndicator);
      
      // Show error message
      addMessageToChat('assistant', `Error: ${error.message || 'Failed to connect to assistant'}`);
    }
  }

  async function checkTaskStatus(taskId, originalQuery) {
    try {
      const statusResponse = await fetchAPI(`/api/v1/agent/status/${taskId}`);
      
      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data.status;
        
        if (status === 'completed') {
          // Task is complete, show response
          const result = statusResponse.data.result;
          
          // Format response with sources if available
          let responseText = result.response || 'No response received.';
          
          // Add sources if available
          if (result.sources && result.sources.length > 0) {
            responseText += '\n\nSources:';
            result.sources.forEach(source => {
              responseText += `\n- ${source.title || source.url}`;
            });
          }
          
          addMessageToChat('assistant', responseText);
        } else if (status === 'error') {
          // Show error message
          addMessageToChat('assistant', `Error: ${statusResponse.data.error || 'Assistant encountered an error'}`);
        } else if (status === 'processing' || status === 'enqueued') {
          // Still processing, check again after a delay
          setTimeout(() => checkTaskStatus(taskId, originalQuery), 2000);
        } else {
          // Unknown status
          addMessageToChat('assistant', `Unknown status: ${status}`);
        }
      } else {
        // Error checking status
        throw new Error(statusResponse.error?.message || 'Failed to check task status');
      }
    } catch (error) {
      console.error('Error checking task status:', error);
      addMessageToChat('assistant', `Error: ${error.message || 'Failed to get response from assistant'}`);
    }
  }
  
  // Add message to chat
  function addMessageToChat(type, text) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    messageElement.innerHTML = `
      <div class="message-content">
        <p>${text.replace(/\n/g, '<br>')}</p>
      </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Handle send button click
  sendButton.addEventListener('click', sendMessage);
  
  // Handle enter key
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  
  // Load chat history from storage
  loadChatHistory();
  
  // Set up context options
  loadContextOptions();
}

async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get('chatHistory');
    const chatHistory = data.chatHistory || [];
    
    const messagesContainer = document.getElementById('chat-messages');
    
    // Clear existing messages
    messagesContainer.innerHTML = '';
    
    // Add messages from history
    chatHistory.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${message.type}`;
      
      messageElement.innerHTML = `
        <div class="message-content">
          <p>${message.text.replace(/\n/g, '<br>')}</p>
        </div>
      `;
      
      messagesContainer.appendChild(messageElement);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}

async function loadContextOptions() {
  try {
    // Get recent pages to use as context options
    const response = await fetchAPI('/api/v1/pages/?limit=10');
    
    if (response.success && response.data && response.data.pages) {
      const contextOptions = document.querySelector('.context-options');
      contextOptions.innerHTML = '';
      
      // Add "Use Knowledge Graph" option
      const knowledgeOption = document.createElement('div');
      knowledgeOption.className = 'context-option';
      knowledgeOption.innerHTML = `
        <input type="checkbox" id="context-knowledge" checked>
        <label for="context-knowledge">Use Knowledge Graph</label>
      `;
      contextOptions.appendChild(knowledgeOption);
      
      // Add recent pages as options
      response.data.pages.forEach(page => {
        const option = document.createElement('div');
        option.className = 'context-option';
        
        const id = `context-${page.id}`;
        
        option.innerHTML = `
          <input type="checkbox" id="${id}">
          <label for="${id}" title="${page.url}">${page.title || 'Untitled'}</label>
        `;
        
        contextOptions.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading context options:', error);
  }
}

// Initialize settings panel
async function initSettingsPanel() {
  if (settingsInitialized) {
    console.log('Settings panel already initialized, skipping');
    return;
  }
  console.log('Initializing settings panel');
  settingsInitialized = true;
  
  // Load current settings
  await loadCurrentSettings();
  
  // Set up form submission handlers
  setupSettingsForms();
  
  // Set up clear data button
  const clearDataBtn = document.getElementById('clear-data-btn');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', handleClearData);
  }
  
  // Set up API test button
  const testApiBtn = document.getElementById('test-api-btn');
  if (testApiBtn) {
    testApiBtn.addEventListener('click', testApiConnection);
  }
}

async function testApiConnection() {
  const testApiBtn = document.getElementById('test-api-btn');
  const apiStatusEl = document.getElementById('api-status');
  
  if (!testApiBtn || !apiStatusEl) return;
  
  testApiBtn.disabled = true;
  testApiBtn.textContent = 'Testing...';
  apiStatusEl.textContent = 'Checking connection...';
  apiStatusEl.className = 'status-checking';
  
  try {
    // Get API URL from input
    const apiUrl = document.getElementById('api-url').value.trim();
    if (!apiUrl) {
      throw new Error('Please enter an API URL');
    }
    
    // Test connection
    const response = await fetch(`${apiUrl}/api/v1/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      apiStatusEl.textContent = 'Connected successfully!';
      apiStatusEl.className = 'status-success';
    } else {
      const errorText = await response.text();
      throw new Error(`API returned status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error('API connection test failed:', error);
    apiStatusEl.textContent = `Connection failed: ${error.message}`;
    apiStatusEl.className = 'status-error';
  } finally {
    testApiBtn.disabled = false;
    testApiBtn.textContent = 'Test Connection';
    
    // Clear status after delay
    setTimeout(() => {
      if (apiStatusEl.className !== 'status-error') {
        apiStatusEl.textContent = '';
        apiStatusEl.className = '';
      }
    }, 5000);
  }
}

async function loadCurrentSettings() {
  try {
    console.log('Loading current settings');
    
    // Get settings from storage
    const data = await chrome.storage.local.get(['apiConfig', 'captureSettings', 'analysisSettings']);
    const apiConfig = data.apiConfig || {};
    const captureSettings = data.captureSettings || {};
    const analysisSettings = data.analysisSettings || {};
    
    // Populate API config form
    const apiUrlInput = document.getElementById('api-url');
    if (apiUrlInput && apiConfig.baseUrl) {
      apiUrlInput.value = apiConfig.baseUrl;
    }
    
    // Populate capture settings form
    const autoCaptureCheckbox = document.getElementById('auto-capture');
    if (autoCaptureCheckbox) {
      autoCaptureCheckbox.checked = !!captureSettings.automaticCapture;
    }
    
    const minTimeInput = document.getElementById('min-time');
    if (minTimeInput && captureSettings.minTimeOnPage) {
      minTimeInput.value = captureSettings.minTimeOnPage;
    }
    
    const excludedDomainsTextarea = document.getElementById('excluded-domains');
    if (excludedDomainsTextarea && captureSettings.excludedDomains) {
      excludedDomainsTextarea.value = Array.isArray(captureSettings.excludedDomains) 
        ? captureSettings.excludedDomains.join('\n') 
        : captureSettings.excludedDomains;
    }
    
    const includedDomainsTextarea = document.getElementById('included-domains');
    if (includedDomainsTextarea && captureSettings.includedDomains) {
      includedDomainsTextarea.value = Array.isArray(captureSettings.includedDomains) 
        ? captureSettings.includedDomains.join('\n') 
        : captureSettings.includedDomains;
    }
    
    // Populate analysis settings form
    const autoAnalyzeCheckbox = document.getElementById('auto-analyze');
    if (autoAnalyzeCheckbox) {
      autoAnalyzeCheckbox.checked = analysisSettings.autoAnalyze !== false; // Default to true
    }
    
    console.log('Settings loaded:', { apiConfig, captureSettings, analysisSettings });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function setupSettingsForms() {
  // API config form
  const apiConfigForm = document.getElementById('api-config-form');
  if (apiConfigForm) {
    apiConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const apiUrl = document.getElementById('api-url').value.trim();
      
      try {
        // Save to storage
        await chrome.storage.local.set({
          apiConfig: { baseUrl: apiUrl }
        });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { apiConfig: { baseUrl: apiUrl } }
        });
        
        showSaveConfirmation(apiConfigForm);
        
        console.log('API settings saved successfully');
      } catch (error) {
        console.error('Error saving API settings:', error);
        alert('Error saving API settings: ' + error.message);
      }
    });
  }
  
  // Capture settings form
  const captureSettingsForm = document.getElementById('capture-settings-form');
  if (captureSettingsForm) {
    captureSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const automaticCapture = document.getElementById('auto-capture').checked;
      const minTimeOnPage = parseInt(document.getElementById('min-time').value, 10);
      const excludedDomainsText = document.getElementById('excluded-domains').value;
      const includedDomainsText = document.getElementById('included-domains').value;
      
      // Parse domains from textarea (one per line)
      const excludedDomains = excludedDomainsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      const includedDomains = includedDomainsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      const captureSettings = {
        automaticCapture,
        minTimeOnPage,
        excludedDomains,
        includedDomains
      };
      
      try {
        // Save to storage
        await chrome.storage.local.set({ captureSettings });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { captureSettings }
        });

        showSaveConfirmation(captureSettingsForm);
        
        console.log('Capture settings saved successfully');
      } catch (error) {
        console.error('Error saving capture settings:', error);
        alert('Error saving capture settings: ' + error.message);
      }
    });
  }
  
  // Analysis settings form
  const analysisSettingsForm = document.getElementById('analysis-settings-form');
  if (analysisSettingsForm) {
    analysisSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const autoAnalyze = document.getElementById('auto-analyze').checked;
      
      const analysisSettings = {
        autoAnalyze
      };
      
      try {
        // Save to storage
        await chrome.storage.local.set({ analysisSettings });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { analysisSettings }
        });

        showSaveConfirmation(analysisSettingsForm);
        
        console.log('Analysis settings saved successfully');
      } catch (error) {
        console.error('Error saving analysis settings:', error);
        alert('Error saving analysis settings: ' + error.message);
      }
    });
  }
}

async function handleClearData() {
  if (!confirm('Are you sure you want to clear all locally stored data? This cannot be undone.')) {
    return;
  }
  
  try {
    // Clear specific storage items but keep settings
    await chrome.storage.local.remove(['captureHistory', 'stats', 'chatHistory', 'pendingRequests']);
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'clearLocalData' });
    
    alert('Local data cleared successfully');
    
    // Reload the page to reflect changes
    window.location.reload();
  } catch (error) {
    console.error('Error clearing data:', error);
    alert('Error clearing data: ' + error.message);
  }
}

// Show save confirmation message
function showSaveConfirmation(form) {
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

// Setup status monitoring
function setupStatusMonitoring() {
  if (statusMonitoringInitialized) {
    console.log('Status monitoring already initialized, skipping');
    return;
  }
  
  console.log('Initializing status monitoring');
  statusMonitoringInitialized = true;

  // Network status
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  function updateNetworkStatus() {
    if (navigator.onLine) {
      statusDot.classList.add('online');
      statusText.textContent = 'Online';
    } else {
      statusDot.classList.remove('online');
      statusText.textContent = 'Offline';
    }
    
    // Send status to service worker
    chrome.runtime.sendMessage({ 
      action: 'networkStatusChange', 
      isOnline: navigator.onLine 
    });
  }
  
  // Check initial status
  updateNetworkStatus();
  
  // Listen for changes
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  
  // Check for active tasks
  checkActiveTasks();
  
  // Set up periodic task checking
  setInterval(checkActiveTasks, 10000); // Check every 10 seconds
}

async function checkActiveTasks() {
  try {
    // Request active tasks from background script
    chrome.runtime.sendMessage({ action: 'getActiveTasks' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting active tasks:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        updateTasksIndicator(response.tasks || []);
      }
    });
  } catch (error) {
    console.error('Error checking active tasks:', error);
  }
}

function updateTasksIndicator(tasks) {
  const tasksIndicator = document.querySelector('.tasks-indicator');
  if (!tasksIndicator) return;
  
  if (tasks.length === 0) {
    tasksIndicator.style.display = 'none';
    return;
  }
  
  // Count tasks by status
  const statusCounts = {
    pending: 0,
    processing: 0,
    analyzing: 0,
    complete: 0,
    error: 0
  };
  
  for (const task of tasks) {
    const status = task.status || 'pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  
  // Update indicator
  tasksIndicator.style.display = 'flex';
  tasksIndicator.innerHTML = `
    <span class="tasks-count">${tasks.length}</span>
    <span class="tasks-label">Active Tasks</span>
  `;
  
  // Add click handler to show tasks panel
  tasksIndicator.onclick = () => {
    showTasksPanel(tasks);
  };
}

function showTasksPanel(tasks) {
  // Create or get tasks panel
  let tasksPanel = document.getElementById('tasks-panel');
  
  if (!tasksPanel) {
    tasksPanel = document.createElement('div');
    tasksPanel.id = 'tasks-panel';
    tasksPanel.className = 'tasks-panel';
    document.body.appendChild(tasksPanel);
  }
    // Update panel content
    tasksPanel.innerHTML = `
    <div class="tasks-panel-header">
      <h3>Active Tasks (${tasks.length})</h3>
      <button class="close-panel-btn">&times;</button>
    </div>
    <div class="tasks-list">
      ${tasks.length === 0 
        ? '<div class="empty-state">No active tasks</div>' 
        : tasks.map(task => `
          <div class="task-item" data-id="${task.id}" data-status="${task.status || 'pending'}">
            <div class="task-info">
              <div class="task-title">${task.url || task.id}</div>
              <div class="task-meta">
                <span class="task-status">${task.status || 'pending'}</span>
                <span class="task-progress">${task.progress || 0}%</span>
              </div>
            </div>
            <div class="task-actions">
              ${task.status === 'error' 
                ? '<button class="btn-action retry-task">Retry</button>' 
                : ''}
              <button class="btn-action cancel-task">Cancel</button>
            </div>
          </div>
        `).join('')}
    </div>
  `;
  
  // Show panel
  tasksPanel.classList.add('active');
  
  // Set up close button
  tasksPanel.querySelector('.close-panel-btn').addEventListener('click', () => {
    tasksPanel.classList.remove('active');
  });
  
  // Set up retry buttons
  tasksPanel.querySelectorAll('.retry-task').forEach(button => {
    button.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      const taskId = taskItem.getAttribute('data-id');
      
      // Send retry message to background script
      chrome.runtime.sendMessage({ 
        action: 'retryTask', 
        taskId 
      }, (response) => {
        if (response && response.success) {
          // Update UI
          taskItem.setAttribute('data-status', 'pending');
          taskItem.querySelector('.task-status').textContent = 'pending';
          button.remove(); // Remove retry button
        } else {
          alert('Failed to retry task: ' + (response?.error || 'Unknown error'));
        }
      });
    });
  });
  
  // Set up cancel buttons
  tasksPanel.querySelectorAll('.cancel-task').forEach(button => {
    button.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      const taskId = taskItem.getAttribute('data-id');
      
      // Send cancel message to background script
      chrome.runtime.sendMessage({ 
        action: 'cancelTask', 
        taskId 
      }, (response) => {
        if (response && response.success) {
          // Remove task from list
          taskItem.remove();
          
          // If no tasks left, close panel
          if (tasksPanel.querySelectorAll('.task-item').length === 0) {
            tasksPanel.classList.remove('active');
          }
        } else {
          alert('Failed to cancel task: ' + (response?.error || 'Unknown error'));
        }
      });
    });
  });
}

// Utility: Truncate text with ellipsis
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

async function initKnowledgeGraph() {
  const graphContainer = document.querySelector('.graph-container');
  
  try {
    await debouncedLoadGraphData();
  } catch (error) {
    console.error('Error initializing knowledge graph:', error);
    graphContainer.innerHTML = `<div class="error-state">Error loading graph: ${error.message}</div>`;
  }
}

// For async loadGraphData
const debouncedLoadGraphData = (() => {
  let timeout;
  let pendingPromise = null;
  
  return function() {
    if (pendingPromise) return pendingPromise;
    
    clearTimeout(timeout);
    
    pendingPromise = new Promise(resolve => {
      timeout = setTimeout(async () => {
        try {
          const result = await loadGraphData();
          resolve(result);
        } catch (error) {
          console.error('Error in debounced loadGraphData:', error);
          resolve(null);
        } finally {
          pendingPromise = null;
        }
      }, 500);
    });
    
    return pendingPromise;
  };
})();