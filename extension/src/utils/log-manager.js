export class LogManager {
  constructor(options = {}) {
    // Context-aware max entries
    this.maxEntries = options.maxEntries || this._getDefaultMaxEntries(options.context);
    this.isBackgroundScript = options.isBackgroundScript || false;
    this.storageKey = options.storageKey || 'marvin_debug_logs';
    this.context = options.context || 'default';
    this.logs = [];
    
    // Detect if we're in a service worker context
    this.isServiceWorkerContext = typeof window === 'undefined' || 
                                  (typeof self !== 'undefined' && 
                                   typeof self.ServiceWorkerGlobalScope !== 'undefined');
    
    // Use service worker context flag if detected
    if (this.isServiceWorkerContext) {
      this.isBackgroundScript = true;
    }
    
    // Level mapping with security context
    this.levelMap = {
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5
    };
    
    // Security-sensitive contexts
    this.securityContexts = ['auth', 'security', 'audit'];
    
    this._setup();
  }

  _getDefaultMaxEntries(context) {
    // Higher limits for security contexts
    if (this.securityContexts.includes(context)) {
      return 1000; // Preserve more security logs
    }
    // Development contexts
    if (context === 'test' || context === 'development') {
      return 100; // Lower limit for test/development
    }
    return 500; // Default for other contexts
  }
  
  _setup() {
    if (this.isBackgroundScript) {
      try {
        chrome.storage.local.get(this.storageKey, (data) => {
          if (data && data[this.storageKey] && data[this.storageKey].logs) {
            // For security contexts, load all logs
            if (this.securityContexts.includes(this.context)) {
              this.logs = data[this.storageKey].logs;
            } else {
              // For other contexts, only load recent logs
              this.logs = data[this.storageKey].logs.slice(-this.maxEntries);
            }
          }
        });
      } catch (e) {
        // Silent fail on startup
      }
    }
  }
  
  log(level, ...args) {
    try {
      let message = '';
      try {
        message = args.map(arg => {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'object') {
            try {
              // For security contexts, preserve more object details
              if (this.securityContexts.includes(this.context)) {
                return JSON.stringify(arg);
              }
              // For other contexts, just use type info
              const type = arg.constructor ? arg.constructor.name : 'Object';
              return `[${type}]`;
            } catch (e) {
              return '[Object]';
            }
          }
          return String(arg);
        }).join(' ');
        
        // Context-aware message size limits
        const maxLength = this.securityContexts.includes(this.context) ? 2000 : 500;
        message = this._limitMessageSize(message, maxLength);
      } catch (e) {
        message = '[Error formatting log message]';
      }
      
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        context: this.context,
        message,
        isSecurityContext: this.securityContexts.includes(this.context)
      };
      
      this.logs.push(entry);
      
      // Only trim non-security logs
      if (!this.securityContexts.includes(this.context) && 
          this.logs.length > this.maxEntries) {
        this.logs = this.logs.slice(-this.maxEntries);
      }
      
      if (!this.isBackgroundScript && !this.isServiceWorkerContext) {
        this._safeSendToBackground(entry);
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  async cleanup() {
    try {
      // Only clear non-security logs
      this.logs = this.logs.filter(log => log.isSecurityContext);
      
      if (this.isBackgroundScript || this.isServiceWorkerContext) {
        // Preserve security logs in storage
        const data = await chrome.storage.local.get(this.storageKey);
        const securityLogs = data[this.storageKey]?.logs.filter(log => 
          this.securityContexts.includes(log.context)
        ) || [];
        
        await chrome.storage.local.set({
          [this.storageKey]: { logs: securityLogs }
        });
      }
      
      return true;
    } catch (e) {
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