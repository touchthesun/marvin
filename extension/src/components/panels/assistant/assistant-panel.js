// src/components/panels/assistant/assistant-panel.js
import { container } from '@core/dependency-container.js';

/**
 * Assistant Panel Component
 * Provides chat interface for interacting with the Marvin assistant
 */
const AssistantPanel = {
  /**
   * Initialize the assistant panel
   * @returns {Promise<boolean>} Success state
   */
  async initAssistantPanel() {
    // Get dependencies from container
    const logger = new (container.getUtil('LogManager'))({
      context: 'assistant-panel',
      isBackgroundScript: false,
      maxEntries: 1000
    });
    
    const notificationService = container.getService('notificationService');
    
    logger.info('Initializing assistant panel');
    
    try {
      // Initialize state
      this.initialized = false;
      
      // Get required elements
      const chatInput = document.getElementById('chat-input');
      const sendButton = document.getElementById('send-message');
      const contextButton = document.getElementById('context-selector-btn');
      const contextDropdown = document.getElementById('context-dropdown');

      // Check if elements exist to prevent errors
      if (!chatInput || !sendButton) {
        logger.error('Missing required elements for assistant panel');
        throw new Error('Required UI elements not found');
      }
      
      // Set up event listeners
      this.setupEventListeners(logger, chatInput, sendButton, contextButton, contextDropdown);
      
      // Load chat history from storage
      await this.loadChatHistory(logger);
      
      // Set up context options
      await this.loadContextOptions(logger);
      
      this.initialized = true;
      logger.info('Assistant panel initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing assistant panel:', error);
      notificationService.showNotification('Error initializing assistant panel', 'error');
      return false;
    }
  },
  
  /**
   * Set up event listeners for the assistant panel
   * @param {LogManager} logger - Logger instance
   * @param {HTMLElement} chatInput - Chat input element
   * @param {HTMLElement} sendButton - Send button element
   * @param {HTMLElement} contextButton - Context selector button
   * @param {HTMLElement} contextDropdown - Context dropdown element
   */
  setupEventListeners(logger, chatInput, sendButton, contextButton, contextDropdown) {
    logger.debug('Setting up assistant panel event listeners');
    
    try {
      // Toggle context dropdown
      if (contextButton && contextDropdown) {
        contextButton.addEventListener('click', () => {
          contextDropdown.classList.toggle('active');
          logger.debug('Context dropdown toggled');
        });
        
        // Close context dropdown when clicking outside
        document.addEventListener('click', (event) => {
          if (contextButton && contextDropdown &&
              !contextButton.contains(event.target) && 
              !contextDropdown.contains(event.target)) {
            contextDropdown.classList.remove('active');
          }
        });
        
        logger.debug('Context dropdown listeners attached');
      } else {
        logger.warn('Context button or dropdown elements not found');
      }
      
      // Handle send button click
      if (sendButton) {
        sendButton.addEventListener('click', () => {
          this.sendMessage(logger);
        });
        logger.debug('Send button listener attached');
      }
      
      // Handle enter key in chat input
      if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage(logger);
          }
        });
        logger.debug('Chat input keyboard listener attached');
      }
      
      logger.debug('Assistant panel event listeners set up successfully');
    } catch (error) {
      logger.error('Error setting up event listeners:', error);
      throw error;
    }
  },
  
  /**
   * Load chat history from storage
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadChatHistory(logger) {
    logger.debug('Loading chat history');
    
    try {
      const data = await chrome.storage.local.get('chatHistory');
      const chatHistory = data.chatHistory || [];
      
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) {
        logger.warn('Messages container not found for loading chat history');
        return;
      }
      
      // Clear existing messages
      messagesContainer.innerHTML = '';
      
      // Add messages from history
      chatHistory.forEach(message => {
        this.addMessageToChat(logger, message.type, message.text);
      });
      
      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      logger.debug(`Loaded ${chatHistory.length} messages from chat history`);
    } catch (error) {
      logger.error('Error loading chat history:', error);
      throw error;
    }
  },
  
  /**
   * Add message to chat UI and save to history
   * @param {LogManager} logger - Logger instance
   * @param {string} type - Message type ('user' or 'assistant')
   * @param {string} text - Message text
   */
  addMessageToChat(logger, type, text) {
    logger.debug(`Adding message of type ${type} to chat`);
    
    try {
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) {
        logger.warn('Messages container not found when adding message');
        return;
      }
      
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
      
      // Save message to history
      this.saveChatMessage(logger, type, text);
    } catch (error) {
      logger.error('Error adding message to chat:', error);
    }
  },
  
  /**
   * Save chat message to history
   * @param {LogManager} logger - Logger instance
   * @param {string} type - Message type
   * @param {string} text - Message text
   * @returns {Promise<void>}
   */
  async saveChatMessage(logger, type, text) {
    logger.debug('Saving chat message to history');
    
    try {
      // Get existing history
      const data = await chrome.storage.local.get('chatHistory');
      const chatHistory = data.chatHistory || [];
      
      // Add new message
      chatHistory.push({
        type,
        text,
        timestamp: Date.now()
      });
      
      // Keep only the latest 50 messages
      if (chatHistory.length > 50) {
        chatHistory.shift();
      }
      
      // Save updated history
      await chrome.storage.local.set({ chatHistory });
      logger.debug('Chat message saved to history');
    } catch (error) {
      logger.error('Error saving chat message:', error);
      // Don't throw here as this is not a critical functionality
    }
  },
  
  /**
   * Load context options for the assistant
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async loadContextOptions(logger) {
    logger.debug('Loading context options');
    
    try {
      // Get API service from container
      const apiService = container.getService('apiService');
      
      // Get recent pages to use as context options
      const response = await apiService.fetchAPI('/api/v1/pages/?limit=10');
      
      if (response.success && response.data && response.data.pages) {
        const contextOptions = document.querySelector('.context-options');
        if (!contextOptions) {
          logger.warn('Context options container not found');
          return;
        }
        
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
        
        logger.debug(`Loaded ${response.data.pages.length} context options`);
      } else {
        logger.warn('No pages found for context options');
      }
    } catch (error) {
      logger.error('Error loading context options:', error);
      throw error;
    }
  },
  
  /**
   * Send message to assistant
   * @param {LogManager} logger - Logger instance
   * @returns {Promise<void>}
   */
  async sendMessage(logger) {
    logger.debug('Sending message to assistant');
    
    try {
      // Get dependencies
      const apiService = container.getService('apiService');
      const notificationService = container.getService('notificationService');
      
      const chatInput = document.getElementById('chat-input');
      if (!chatInput) {
        logger.error('Chat input element not found');
        return;
      }
      
      const messageText = chatInput.value.trim();
      if (!messageText) return;
      
      // Add user message to chat
      this.addMessageToChat(logger, 'user', messageText);
      
      // Clear input
      chatInput.value = '';
      
      // Show loading indicator
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) {
        logger.error('Messages container not found');
        return;
      }
      
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'message assistant loading';
      loadingIndicator.innerHTML = '<div class="message-content"><p>Loading response...</p></div>';
      messagesContainer.appendChild(loadingIndicator);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Get selected context
      const contextOptions = document.querySelectorAll('.context-options input:checked');
      const selectedContext = Array.from(contextOptions).map(option => option.id.replace('context-', ''));
      
      // Get relevant URLs based on selected context
      let relevantUrls = [];
      if (selectedContext.length > 0) {
        try {
          const contextResponse = await apiService.fetchAPI('/api/v1/pages/?limit=5');
          if (contextResponse.success && contextResponse.data && contextResponse.data.pages) {
            relevantUrls = contextResponse.data.pages.map(page => page.url);
            logger.debug(`Using ${relevantUrls.length} context URLs`);
          }
        } catch (error) {
          logger.error('Error fetching context URLs:', error);
        }
      }
      
      // Send query to agent API
      const agentResponse = await apiService.fetchAPI('/api/v1/agent/query', {
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
        logger.debug(`Query submitted successfully, task ID: ${taskId}`);
        this.checkTaskStatus(logger, taskId, messageText);
      } else {
        // Show error message
        const errorMessage = agentResponse.error?.message || 'Failed to send query to assistant';
        logger.error('Error from agent API:', errorMessage);
        this.addMessageToChat(logger, 'assistant', `Error: ${errorMessage}`);
        notificationService.showNotification('Error communicating with assistant', 'error');
      }
    } catch (error) {
      const notificationService = container.getService('notificationService');
      
      logger.error('Error sending message to agent:', error);
      
      // Remove loading indicator
      const messagesContainer = document.getElementById('chat-messages');
      const loadingIndicator = messagesContainer.querySelector('.message.assistant.loading');
      if (messagesContainer && loadingIndicator) {
        messagesContainer.removeChild(loadingIndicator);
      }
      
      // Show error message
      this.addMessageToChat(logger, 'assistant', `Error: ${error.message || 'Failed to connect to assistant'}`);
      notificationService.showNotification('Connection error', 'error');
    }
  },
  
  /**
   * Check task status periodically
   * @param {LogManager} logger - Logger instance
   * @param {string} taskId - Task ID to check
   * @param {string} originalQuery - Original query text
   * @returns {Promise<void>}
   */
  async checkTaskStatus(logger, taskId, originalQuery) {
    logger.debug(`Checking status for task ${taskId}`);
    
    try {
      // Get dependencies
      const apiService = container.getService('apiService');
      const notificationService = container.getService('notificationService');
      
      const statusResponse = await apiService.fetchAPI(`/api/v1/agent/status/${taskId}`);
      
      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data.status;
        logger.debug(`Task ${taskId} status: ${status}`);
        
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
            logger.debug(`Response includes ${result.sources.length} sources`);
          }
          
          this.addMessageToChat(logger, 'assistant', responseText);
        } else if (status === 'error') {
          // Show error message
          const errorMessage = statusResponse.data.error || 'Assistant encountered an error';
          logger.error(`Task error: ${errorMessage}`);
          this.addMessageToChat(logger, 'assistant', `Error: ${errorMessage}`);
          notificationService.showNotification('Assistant error', 'error');
        } else if (status === 'processing' || status === 'enqueued') {
          // Still processing, check again after a delay
          setTimeout(() => this.checkTaskStatus(logger, taskId, originalQuery), 2000);
        } else {
          // Unknown status
          logger.warn(`Unknown task status: ${status}`);
          this.addMessageToChat(logger, 'assistant', `Unknown status: ${status}`);
        }
      } else {
        // Error checking status
        throw new Error(statusResponse.error?.message || 'Failed to check task status');
      }
    } catch (error) {
      logger.error('Error checking task status:', error);
      this.addMessageToChat(logger, 'assistant', `Error: ${error.message || 'Failed to get response from assistant'}`);
    }
  }
};

// Export using named export
export { AssistantPanel };