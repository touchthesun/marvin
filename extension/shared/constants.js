// shared/constants.js

export const BrowserContext = {
  ACTIVE_TAB: "active_tab",
  OPEN_TAB: "open_tab",
  BACKGROUND: "background",
  BOOKMARKED: "bookmarked",
  HISTORY: "history",
  RECOVERED: "recovered"
};

// Human-readable labels for UI display
export const BrowserContextLabels = {
  [BrowserContext.ACTIVE_TAB]: "Active Tab",
  [BrowserContext.OPEN_TAB]: "Open Tab",
  [BrowserContext.BACKGROUND]: "Background",
  [BrowserContext.BOOKMARKED]: "Bookmark",
  [BrowserContext.HISTORY]: "History",
  [BrowserContext.RECOVERED]: "Recovered"
};

// Mapping from tab type to context type
export const TabTypeToContext = {
  'tabs': BrowserContext.ACTIVE_TAB,
  'bookmarks': BrowserContext.BOOKMARKED,
  'history': BrowserContext.HISTORY
};