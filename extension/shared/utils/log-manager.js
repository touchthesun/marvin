// log-manager.js
export class LogManager {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 10000;
    this.persistInterval = options.persistInterval || 10000; // 10 seconds
    this.logLevel = options.logLevel || 'debug';
    this.logs = [];
    this.contexts = new Set();
    this.isBackgroundScript = options.isBackgroundScript || false;
    this.storageKey = options.storageKey || 'marvin_debug_logs';
    this.deduplicationTimeout = options.deduplicationTimeout || 0; // 0 = disabled
    this.maxDuplicateCache = options.maxDuplicateCache || 100;
    this.messageCache = new Map();
    this._isLogging = false;
    this._setup();
    
    // Level mapping (lower number = more severe)
    this.levelMap = {
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5
    };
    
    this._setup();
  }
  
  _setup() {
    // Set up auto-persist for background script
    if (this.isBackgroundScript) {
      setInterval(() => this.persistLogs(), this.persistInterval);
    }
    
    // Intercept console methods
    this._interceptConsole();
  }
  
  _interceptConsole() {
    const originalMethods = {
      log: console.log,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
     
// Override console methods
Object.keys(originalMethods).forEach(method => {
  console[method] = (...args) => {
    if (this._isLogging) {
      originalMethods[method].apply(console, args);
      return;
    }
    // Check for deduplication if enabled
    if (this.deduplicationTimeout > 0) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const cacheKey = method === 'error' ? 'ERROR:' + message : 
                       method === 'warn' ? 'WARN:' + message : message;
      
      const now = Date.now();
      const cachedTime = this.messageCache.get(cacheKey);
      
      // If this exact message was logged recently, ignore it
      if (cachedTime && (now - cachedTime) < this.deduplicationTimeout) {
        return;
      }
      
      // Cache the timestamp
      this.messageCache.set(cacheKey, now);
      
      // Cleanup old messages periodically
      if (this.messageCache.size > this.maxDuplicateCache) {
        for (const [key, timestamp] of this.messageCache.entries()) {
          if (now - timestamp > this.deduplicationTimeout) {
            this.messageCache.delete(key);
          }
        }
      }
    }
    
    // Call original method
    originalMethods[method].apply(console, args);
    
    // Add to our logs
    const level = method === 'log' ? 'info' : method;
    this.log(level, ...args);
  };
});
}
  
  // Convenience methods for different log levels
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
  
  trace(...args) {
    return this.log('trace', ...args);
  }
  
  log(level, ...args) {
    if (this.levelMap[level] > this.levelMap[this.logLevel]) {
      return; // Skip logs below current level
    }
    
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const context = this._getContext();
    const timestamp = new Date().toISOString();
    
    const entry = {
      timestamp,
      level,
      context,
      message,
      details: this._getStackDetails()
    };
  
    // Use a flag to prevent recursion
    if (!this._isLogging) {
      this._isLogging = true;
      const formattedMessage = `[${level.toUpperCase()}] [${context}] ${message}`;
      const objectArgs = args.filter(arg => typeof arg === 'object');
      
      // Use the original console methods directly
      switch (level) {
        case 'error':
          console.error(formattedMessage, ...objectArgs);
          break;
        case 'warn':
          console.warn(formattedMessage, ...objectArgs);
          break;
        case 'info':
          console.info(formattedMessage, ...objectArgs);
          break;
        default:
          console.log(formattedMessage, ...objectArgs);
      }
      this._isLogging = false;
    }
    
    this.logs.push(entry);
    
    // Keep logs under max size
    if (this.logs.length > this.maxEntries) {
      this.logs.splice(0, this.logs.length - this.maxEntries);
    }
    
    // Sync to background if in foreground context
    if (!this.isBackgroundScript) {
      this._sendToBackground(entry);
    }
  }
  
  
  _getContext() {
    // Determine context
    if (chrome.extension?.getBackgroundPage?.() === window) {
      return 'background';
    }
    
    if (chrome.extension && document.body.dataset.context) {
      return document.body.dataset.context;
    }
    
    if (window.location.pathname.includes('popup')) {
      return 'popup';
    }
    
    if (window.location.pathname.includes('dashboard')) {
      return 'dashboard';
    }
    
    if (window.location.pathname.includes('options')) {
      return 'options';
    }
    
    // Check for content script
    if (document.body.dataset.marvinInitialized) {
      return 'content';
    }
    
    return 'unknown';
  }
  
  _getStackDetails() {
    // Get call site details
    const stack = new Error().stack;
    const lines = stack.split('\n');
    
    // Skip LogManager frames
    let relevantLine = '';
    for (let i = 2; i < lines.length; i++) {
      if (!lines[i].includes('log-manager.js')) {
        relevantLine = lines[i];
        break;
      }
    }
    
    // Parse line for details
    const matches = relevantLine.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
    if (matches) {
      return {
        function: matches[1],
        file: matches[2].split('/').pop(),
        line: parseInt(matches[3]),
        column: parseInt(matches[4])
      };
    }
    
    return { stack: relevantLine };
  }
  
  _sendToBackground(entry) {
    try {
      chrome.runtime.sendMessage({
        action: 'marvin_log_entry',
        entry
      });
    } catch (e) {
      // Silent fail if background not available
    }
  }
  
  async persistLogs() {
    try {
      // Save to storage
      const data = {
        logs: this.logs,
        timestamp: new Date().toISOString()
      };
      
      await chrome.storage.local.set({ [this.storageKey]: data });
    } catch (e) {
      console.error('Error persisting logs:', e);
    }
  }
  
  async exportLogs(format = 'json') {
    // Get logs from all contexts
    let allLogs;
    
    if (this.isBackgroundScript) {
      allLogs = this.logs;
    } else {
      try {
        const data = await chrome.storage.local.get(this.storageKey);
        allLogs = data[this.storageKey]?.logs || [];
      } catch (e) {
        console.error('Error retrieving logs for export:', e);
        return null;
      }
    }
    
    // Sort by timestamp
    allLogs.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    // Format based on request
    if (format === 'text') {
      return this._formatAsText(allLogs);
    } else if (format === 'html') {
      return this._formatAsHtml(allLogs);
    } else {
      return JSON.stringify(allLogs, null, 2);
    }
  }
  
  _formatAsText(logs) {
    return logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.context}] ${log.message} ${log.details.file ? `(${log.details.file}:${log.details.line})` : ''}`
    ).join('\n');
  }
  
  _formatAsHtml(logs) {
    // Generate HTML table
    const rows = logs.map(log => `
      <tr class="log-level-${log.level}">
        <td>${log.timestamp}</td>
        <td>${log.level.toUpperCase()}</td>
        <td>${log.context}</td>
        <td>${log.message}</td>
        <td>${log.details.file ? `${log.details.file}:${log.details.line}` : ''}</td>
      </tr>
    `).join('');
    
    return `
      <html>
      <head>
        <style>
          body { font-family: monospace; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .log-level-error { background-color: #ffeeee; }
          .log-level-warn { background-color: #ffffee; }
          .log-level-debug { color: #888; }
        </style>
      </head>
      <body>
        <h1>Marvin Extension Logs</h1>
        <p>Generated: ${new Date().toISOString()}</p>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Context</th>
              <th>Message</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }
  
  clearLogs() {
    this.logs = [];
    
    if (this.isBackgroundScript) {
      chrome.storage.local.remove(this.storageKey);
    }
  }
}
