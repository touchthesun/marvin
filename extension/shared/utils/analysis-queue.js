// Queue management class
export class AnalysisQueue {
    constructor() {
      this.items = [];
      this.processing = false;
      this._init();
    }
    
    async _init() {
      // Load queue from storage if available
      try {
        const data = await chrome.storage.local.get('analysisQueue');
        if (data.analysisQueue) {
          this.items = data.analysisQueue;
        }
      } catch (error) {
        console.error('Error loading queue from storage:', error);
      }
    }
    
    async _saveQueue() {
      try {
        await chrome.storage.local.set({ analysisQueue: this.items });
      } catch (error) {
        console.error('Error saving queue to storage:', error);
      }
    }
    
    async enqueue(item) {
      this.items.push(item);
      await this._saveQueue();
      this._notifyQueueChanged();
      return this.items.length;
    }
    
    async dequeue() {
      if (this.isEmpty()) {
        return null;
      }
      
      const item = this.items.shift();
      await this._saveQueue();
      this._notifyQueueChanged();
      return item;
    }
    
    peek() {
      if (this.isEmpty()) {
        return null;
      }
      
      return this.items[0];
    }
    
    isEmpty() {
      return this.items.length === 0;
    }
    
    size() {
      return this.items.length;
    }
    
    getItems() {
      return [...this.items];
    }
    
    async updateCurrent(updates) {
      if (!this.isEmpty()) {
        this.items[0] = { ...this.items[0], ...updates };
        await this._saveQueue();
        this._notifyQueueChanged();
      }
    }
    
    setProcessing(isProcessing) {
      this.processing = isProcessing;
    }
    
    isProcessing() {
      return this.processing;
    }
    
    _notifyQueueChanged() {
      // Dispatch event for UI to listen for
      chrome.runtime.sendMessage({
        action: 'analysisQueueChanged',
        queue: this.getItems()
      });
    }
  }
  
  // Queue UI rendering component
  export class AnalysisQueueUI {
    constructor(containerId, options = {}) {
      this.containerId = containerId;
      this.options = {
        maxItems: options.maxItems || 5,
        showTitle: options.showTitle !== undefined ? options.showTitle : true,
        compact: options.compact || false,
        autoRefresh: options.autoRefresh !== undefined ? options.autoRefresh : true,
        refreshInterval: options.refreshInterval || 2000,
        emptyMessage: options.emptyMessage || 'No active analysis tasks',
        title: options.title || 'Analysis Queue'
      };
      
      this.refreshInterval = null;
      this.init();
    }
    
    init() {
      // Set up event listener for queue changes
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'analysisQueueChanged') {
          this.render(message.queue);
        }
      });
      
      // Set up auto-refresh if enabled
      if (this.options.autoRefresh) {
        this.startAutoRefresh();
      }
      
      // Initial render
      this.refresh();
    }
    
    startAutoRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      
      this.refreshInterval = setInterval(() => {
        this.refresh();
      }, this.options.refreshInterval);
    }
    
    stopAutoRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    }
    
    async refresh() {
      try {
        // Add proper error handling and response checking
        const response = await chrome.runtime.sendMessage({ action: 'getAnalysisQueue' });
        if (response && typeof response === 'object') {
          const queue = response.success ? (response.queue || []) : [];
          this.render(queue);
        } else {
          console.warn('Invalid response from getAnalysisQueue:', response);
          this.render([]);
        }
      } catch (error) {
        console.error('Error refreshing analysis queue:', error);
        this.render([]); // Render empty queue on error
      }
    }
    
    render(queue) {
      const container = document.getElementById(this.containerId);
      if (!container) return;
      
      // Clear container
      let queueContent = '';
      
      // Add title if enabled
      if (this.options.showTitle) {
        queueContent += `<h3>${this.options.title}</h3>`;
      }
      
      // Create queue container
      queueContent += '<div class="analysis-queue-items">';
      
      // Check if queue is empty
      if (!queue || queue.length === 0) {
        queueContent += `<div class="empty-state">${this.options.emptyMessage}</div>`;
      } else {
        // Get items to display
        const displayItems = queue.slice(0, this.options.maxItems);
        
        // Create items
        displayItems.forEach(item => {
          const progressWidth = Math.max(5, item.progress * 100);
          
          if (this.options.compact) {
            // Compact version for popup
            queueContent += `
              <div class="queue-item ${item.status}">
                <div class="queue-item-header">
                  <span class="item-title">${this._truncateText(item.title, 30)}</span>
                  <span class="item-status">${item.status}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${progressWidth}%"></div>
                </div>
              </div>
            `;
          } else {
            // Full version for dashboard
            const timestamp = new Date(item.timestamp).toLocaleString();
            
            queueContent += `
              <div class="analysis-item ${item.status}">
                <div class="analysis-header">
                  <div class="analysis-title">${item.title || 'Untitled'}</div>
                  <div class="analysis-meta">
                    <span class="analysis-timestamp">${timestamp}</span>
                    <span class="analysis-status">${item.status}</span>
                  </div>
                </div>
                <div class="analysis-url">${item.url}</div>
                <div class="analysis-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressWidth}%"></div>
                  </div>
                  <div class="progress-text">${Math.round(progressWidth)}%</div>
                </div>
              </div>
            `;
          }
        });
        
        // Show count of remaining items if there are more than max
        if (queue.length > this.options.maxItems) {
          const remainingCount = queue.length - this.options.maxItems;
          queueContent += `
            <div class="queue-more">
              + ${remainingCount} more ${remainingCount === 1 ? 'item' : 'items'}
            </div>
          `;
        }
      }
      
      queueContent += '</div>';
      
      // Update container
      container.innerHTML = queueContent;
    }
    
    _truncateText(text, maxLength) {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    destroy() {
      this.stopAutoRefresh();
      // Could remove event listeners here if needed
    }
  }
  
  // Completed analyses management
  export class CompletedAnalyses {
    constructor(maxItems = 50) {
      this.maxItems = maxItems;
    }
    
    async add(analysisItem) {
      try {
        // Get existing completed analyses
        const data = await chrome.storage.local.get('completedAnalyses');
        const completedAnalyses = data.completedAnalyses || [];
        
        // Add new item at the beginning
        completedAnalyses.unshift({
          ...analysisItem,
          completedAt: Date.now()
        });
        
        // Keep only the latest items based on limit
        if (completedAnalyses.length > this.maxItems) {
          completedAnalyses.length = this.maxItems;
        }
        
        // Save updated list
        await chrome.storage.local.set({ completedAnalyses });
        
        return true;
      } catch (error) {
        console.error('Error storing completed analysis:', error);
        return false;
      }
    }
    
    async getAll() {
      try {
        const data = await chrome.storage.local.get('completedAnalyses');
        return data.completedAnalyses || [];
      } catch (error) {
        console.error('Error retrieving completed analyses:', error);
        return [];
      }
    }
    
    async clear() {
      try {
        await chrome.storage.local.set({ completedAnalyses: [] });
        return true;
      } catch (error) {
        console.error('Error clearing completed analyses:', error);
        return false;
      }
    }
  }