// components/assistant-panel.js
import { fetchAPI } from '../services/api-service.js';
import { LogManager } from '../../shared/utils/log-manager.js';
import { showNotification } from '../services/notification-service.js';


const logger = new LogManager({
  isBackgroundScript: false,
  storageKey: 'marvin_assistant_logs',
  maxEntries: 1000
});

// Panel initialization flag
let assistantInitialized = false;

/**
 * Initialize assistant panel
 */
export async function initAssistantPanel() {
  if (assistantInitialized) {
    logger.log('debug', 'Assistant panel already initialized, skipping');
    return;
  }
  
  logger.log('info', 'Initializing assistant panel');
  assistantInitialized = true;

  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-message');
  const contextButton = document.getElementById('context-selector-btn');
  const contextDropdown = document.getElementById('context-dropdown');

  // Check if elements exist to prevent errors
  if (!chatInput || !sendButton) {
    logger.log('error', 'Missing required elements for assistant panel');
    return;
  }
  
  // Toggle context dropdown
  if (contextButton && contextDropdown) {
    contextButton.addEventListener('click', () => {
      contextDropdown.classList.toggle('active');
    });
  
  // Close context dropdown when clicking outside
  document.addEventListener('click', (event) => {
    if (contextButton && contextDropdown &&
        !contextButton.contains(event.target) && 
        !contextDropdown.contains(event.target)) {
      contextDropdown.classList.remove('active');
    }
  });
  
  // Handle send button click
  sendButton?.addEventListener('click', sendMessage);
  
  // Handle enter key
  chatInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  
  try {
    // Load chat history from storage
    await loadChatHistory();
    
    // Set up context options
    await loadContextOptions();
    
    logger.log('info', 'Assistant panel initialized successfully');
  } catch (error) {
    logger.log('error', 'Error completing assistant panel initialization:', error);
    showNotification('Error initializing assistant panel', 'error');
  }
}

/**
 * Load chat history from storage
 */
async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get('chatHistory');
    const chatHistory = data.chatHistory || [];
    
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) {
      logger.log('warn', 'Messages container not found for loading chat history');
      return;
    }
    
    // Clear existing messages
    messagesContainer.innerHTML = '';
    
    // Add messages from history
    chatHistory.forEach(message => {
      addMessageToChat(message.type, message.text);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    logger.log('debug', `Loaded ${chatHistory.length} messages from chat history`);
  } catch (error) {
    logger.log('error', 'Error loading chat history:', error);
    throw error; // Rethrow to handle in the calling function
  }
}



/**
 * Add message to chat
 * @param {string} type - Message type ('user' or 'assistant')
 * @param {string} text - Message text
 */
function addMessageToChat(type, text) {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) {
    logger.log('warn', 'Messages container not found when adding message');
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
  saveChatMessage(type, text);
  
  logger.log('debug', `Added message of type ${type} to chat`);
}

/**
 * Save chat message to history
 * @param {string} type - Message type
 * @param {string} text - Message text
 * @returns {Promise<void>}
 */
async function saveChatMessage(type, text) {
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
    
    logger.log('debug', 'Saved chat message to history');
  } catch (error) {
    logger.log('error', 'Error saving chat message:', error);
    // Don't throw here as this is not a critical functionality
  }
}

/**
 * Load context options for the assistant
 * @returns {Promise<void>}
 */
async function loadContextOptions() {
  try {
    // Get recent pages to use as context options
    const response = await fetchAPI('/api/v1/pages/?limit=10');
    
    if (response.success && response.data && response.data.pages) {
      const contextOptions = document.querySelector('.context-options');
      if (!contextOptions) {
        logger.log('warn', 'Context options container not found');
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
      
      logger.log('debug', `Loaded ${response.data.pages.length} context options`);
    } else {
      logger.log('warn', 'No pages found for context options');
    }
  } catch (error) {
    logger.log('error', 'Error loading context options:', error);
    throw error; // Rethrow to handle in the calling function
  }
}

/**
 * Send message to assistant
 * @returns {Promise<void>}
 */
async function sendMessage() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) {
    logger.log('error', 'Chat input element not found');
    return;
  }
  
  const messageText = chatInput.value.trim();
  if (!messageText) return;
  
  logger.log('debug', 'Sending message to assistant');
  
  // Add user message to chat
  addMessageToChat('user', messageText);
  
  // Clear input
  chatInput.value = '';
  
  // Show loading indicator
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) {
    logger.log('error', 'Messages container not found');
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
  
  try {
    // Get relevant URLs based on selected context
    let relevantUrls = [];
    if (selectedContext.length > 0) {
      // If context items are selected, fetch relevant URLs
      try {
        const contextResponse = await fetchAPI('/api/v1/pages/?limit=5');
        if (contextResponse.success && contextResponse.data && contextResponse.data.pages) {
          relevantUrls = contextResponse.data.pages.map(page => page.url);
          logger.log('debug', `Using ${relevantUrls.length} context URLs`);
        }
      } catch (error) {
        logger.log('error', 'Error fetching context URLs:', error);
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
      logger.log('debug', `Query submitted successfully, task ID: ${taskId}`);
      checkTaskStatus(taskId, messageText);
    } else {
      // Show error message
      const errorMessage = agentResponse.error?.message || 'Failed to send query to assistant';
      logger.log('error', 'Error from agent API:', errorMessage);
      addMessageToChat('assistant', `Error: ${errorMessage}`);
      showNotification('Error communicating with assistant', 'error');
    }
  } catch (error) {
    logger.log('error', 'Error sending message to agent:', error);
    
    // Remove loading indicator
    if (messagesContainer.contains(loadingIndicator)) {
      messagesContainer.removeChild(loadingIndicator);
    }
    
    // Show error message
    addMessageToChat('assistant', `Error: ${error.message || 'Failed to connect to assistant'}`);
    showNotification('Connection error', 'error');
  }
}

/**
 * Check task status periodically
 * @param {string} taskId - Task ID to check
 * @param {string} originalQuery - Original query text
 * @returns {Promise<void>}
 */
async function checkTaskStatus(taskId, originalQuery) {
  try {
    const statusResponse = await fetchAPI(`/api/v1/agent/status/${taskId}`);
    
    if (statusResponse.success && statusResponse.data) {
      const status = statusResponse.data.status;
      logger.log('debug', `Task ${taskId} status: ${status}`);
      
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
          logger.log('debug', `Response includes ${result.sources.length} sources`);
        }
        
        addMessageToChat('assistant', responseText);
      } else if (status === 'error') {
        // Show error message
        const errorMessage = statusResponse.data.error || 'Assistant encountered an error';
        logger.log('error', `Task error: ${errorMessage}`);
        addMessageToChat('assistant', `Error: ${errorMessage}`);
        showNotification('Assistant error', 'error');
      } else if (status === 'processing' || status === 'enqueued') {
        // Still processing, check again after a delay
        setTimeout(() => checkTaskStatus(taskId, originalQuery), 2000);
      } else {
        // Unknown status
        logger.log('warn', `Unknown task status: ${status}`);
        addMessageToChat('assistant', `Unknown status: ${status}`);
      }
    } else {
      // Error checking status
      throw new Error(statusResponse.error?.message || 'Failed to check task status');
    }
  } catch (error) {
    logger.log('error', 'Error checking task status:', error);
    addMessageToChat('assistant', `Error: ${error.message || 'Failed to get response from assistant'}`);
  }
}}

// Export helper functions if needed by other modules
export { addMessageToChat, loadChatHistory };