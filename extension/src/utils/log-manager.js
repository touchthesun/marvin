export class LogManager {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 10000;
    this.isBackgroundScript = options.isBackgroundScript || false;
    this.storageKey = options.storageKey || 'marvin_debug_logs';
    this.logs = [];
    
    // Detect if we're in a service worker context
    this.isServiceWorkerContext = typeof window === 'undefined' || 
                                  (typeof self !== 'undefined' && 
                                   typeof self.ServiceWorkerGlobalScope !== 'undefined');
    
    // Use service worker context flag if detected
    if (this.isServiceWorkerContext) {
      this.isBackgroundScript = true; // Service workers are background scripts
    }
    
    // Minimal level mapping
    this.levelMap = {
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5
    };
    
    // This flag prevents us from intercepting console
    this.shouldInterceptConsole = false; // Disable console interception
    
    this._setup();
  }
  
  _setup() {
    // If we're not intercepting console, there's nothing to set up
    // Just load existing logs if in background script
    if (this.isBackgroundScript) {
      try {
        chrome.storage.local.get(this.storageKey, (data) => {
          if (data && data[this.storageKey] && data[this.storageKey].logs) {
            this.logs = data[this.storageKey].logs.slice(0, this.maxEntries);
          }
        });
      } catch (e) {
        // Silent fail on startup
      }
    }
  }
  
  // Basic log method without any console interception
  log(level, ...args) {
    try {
      // Create a basic message string
      let message = '';
      try {
        message = args.map(arg => {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'object') {
            try {
              // For objects, just give type information to avoid circular reference issues
              const type = arg.constructor ? arg.constructor.name : 'Object';
              return `[${type}]`;
            } catch (e) {
              return '[Object]';
            }
          }
          return String(arg);
        }).join(' ');
        
        // Limit message size
        message = this._limitMessageSize(message, 1000);
      } catch (e) {
        message = '[Error formatting log message]';
      }
      
      // Create log entry with appropriate context
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        context: this.isServiceWorkerContext ? 'service-worker' : 
                (this.isBackgroundScript ? 'background' : 'content'),
        message
      };
      
      // Add to logs array
      this.logs.push(entry);
      
      // Keep logs under max size
      if (this.logs.length > this.maxEntries) {
        this.logs.splice(0, this.logs.length - this.maxEntries);
      }
      
      // Send to background if not in background or service worker
      if (!this.isBackgroundScript && !this.isServiceWorkerContext) {
        this._safeSendToBackground(entry);
      }
      
      return true;
    } catch (e) {
      // Fail silently - we can't log the error or we'd cause recursion
      return false;
    }
  }
  
  // Convenience methods
  debug(...args) {
    return this.log('debug', ...args);
  }
  
  info(...args) {
    return this.log('info', ...args);
  }
  
  warn(...args) {
    return this.log('warn', ...args);
  }
  
  error(...args) {
    return this.log('error', ...args);
  }

  _limitMessageSize(message, maxLength = 1000) {
    if (typeof message !== 'string') {
      return message;
    }
    
    if (message.length <= maxLength) {
      return message;
    }
    
    return message.substring(0, maxLength) + `... [truncated, ${message.length - maxLength} more characters]`;
  }
  
  // Safe send to background with immediate error handling
  _safeSendToBackground(entry) {
    try {
      // Make a copy of the entry with limited message size to ensure it's not too large
      const safeEntry = {
        timestamp: entry.timestamp,
        level: entry.level,
        context: entry.context,
        message: this._limitMessageSize(entry.message, 500) // More aggressive limit for messages being sent
      };
      
      chrome.runtime.sendMessage(
        {
          action: 'marvin_log_entry',
          entry: safeEntry
        },
        () => {
          // Just access lastError to prevent unhandled errors
          const lastError = chrome.runtime.lastError;
        }
      );
    } catch (e) {
      // Silent fail
    }
  }
  
  // Export logs
  async exportLogs(format = 'json') {
    try {
      let allLogs;
      
      if (this.isBackgroundScript || this.isServiceWorkerContext) {
        allLogs = this.logs;
      } else {
        try {
          const data = await chrome.storage.local.get(this.storageKey);
          allLogs = data[this.storageKey]?.logs || [];
        } catch (e) {
          return 'Error retrieving logs';
        }
      }
      
      // Sort by timestamp
      allLogs.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      // Format based on request
      if (format === 'text') {
        return allLogs.map(log => 
          `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.context}] ${log.message}`
        ).join('\n');
      } else {
        return JSON.stringify(allLogs, null, 2);
      }
    } catch (e) {
      return `Error exporting logs: ${e.message}`;
    }
  }
  
  // Clear logs
  clearLogs() {
    try {
      this.logs = [];
      
      if (this.isBackgroundScript || this.isServiceWorkerContext) {
        chrome.storage.local.remove(this.storageKey);
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }
}