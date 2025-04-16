// utils/constants.js
export const BrowserContext = {
    ACTIVE_TAB: 'ACTIVE_TAB',
    OPEN_TAB: 'OPEN_TAB',
    BOOKMARK: 'BOOKMARK',
    HISTORY: 'HISTORY'
  };
  
  export const BrowserContextLabels = {
    'ACTIVE_TAB': 'Active Tab',
    'OPEN_TAB': 'Open Tab',
    'BOOKMARK': 'Bookmark',
    'HISTORY': 'History'
  };
  
  export const TabTypeToContext = {
    'active': 'ACTIVE_TAB',
    'open': 'OPEN_TAB',
    'bookmark': 'BOOKMARK',
    'history': 'HISTORY'
  };
  
  export const DEFAULT_SETTINGS = {
    apiBaseUrl: 'http://localhost:8000',
    autoCapture: false,
    autoAnalyze: true,
    captureTimeout: 5,
    extractContent: true,
    maxConcurrentAnalysis: 2
  };