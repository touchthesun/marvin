// src/dashboard/index.js
import { initializeComponentSystem, getComponentSystemStatus } from '../core/component-system.js';
import './dashboard.css';

// Initialize the dashboard
async function initialize() {
  console.log('Initializing Marvin Dashboard...');
  
  try {
    // Initialize the entire component system
    const validation = await initializeComponentSystem();
    
    if (!validation.allValid) {
      throw new Error('Component validation failed');
    }
    
    // Set up dashboard event handlers
    setupDashboardEvents();
    
    // Start the dashboard (actual dashboard.js entry will be triggered by events)
    console.log('Dashboard ready for interaction');
    
    // Log status for debugging
    console.log('Component System Status:', getComponentSystemStatus());
    
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    
    // Show user-friendly error
    showInitializationError(error);
  }
}

/**
 * Set up dashboard event handlers
 */
function setupDashboardEvents() {
  // Handle DOM content loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDashboardReady);
  } else {
    onDashboardReady();
  }
  
  // Handle cleanup on unload
  window.addEventListener('beforeunload', onDashboardUnload);
}

/**
 * Called when dashboard DOM is ready
 */
function onDashboardReady() {
  console.log('Dashboard DOM ready');
  
  // Import and initialize main dashboard logic
  import('../../../notes/archive-code/dashboard.js').then(() => {
    console.log('Dashboard logic loaded');
  }).catch(error => {
    console.error('Error loading dashboard logic:', error);
  });
}

/**
 * Called when dashboard is unloading
 */
function onDashboardUnload() {
  console.log('Dashboard unloading');
  // Any cleanup needed
}

/**
 * Show initialization error to user
 */
function showInitializationError(error) {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 20px;
    background: white;
    border: 2px solid #f44336;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 9999;
    max-width: 80%;
  `;
  
  container.innerHTML = `
    <h2 style="color: #f44336; margin-top: 0;">Dashboard Initialization Error</h2>
    <p>${error.message}</p>
    <button id="retry-btn" style="
      padding: 8px 16px;
      background: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    ">Retry</button>
  `;
  
  document.body.appendChild(container);
  
  document.getElementById('retry-btn').addEventListener('click', () => {
    container.remove();
    window.location.reload();
  });
}

// Start the initialization
initialize();