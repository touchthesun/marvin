export enum BrowserContext {
    ACTIVE_TAB = "active_tab",      // Currently focused tab
    OPEN_TAB = "open_tab",          // Open but not focused
    BACKGROUND = "background",       // Not currently open
    BOOKMARKED = "bookmarked",      // Saved in bookmarks
    HISTORY = "history"             // In browser history only
}

export enum PageStatus {
    DISCOVERED = "discovered",  // URL known but not yet processed
    IN_PROGRESS = "processing", // Currently being processed
    ACTIVE = "active",         // Successfully processed and active
    ARCHIVED = "archived",     // Marked as archived by user
    ERROR = "error"           // Processing failed
}

export interface ProcessingRequest {
    url: string;
    context: BrowserContext;
    tabId?: number;
    windowId?: number;
    bookmarkId?: string;
    title?: string;
    content?: string;
}

export interface ProcessingResult {
    url: string;
    status: PageStatus;
    error?: string;
    processingTime?: number;
    metadata?: Record<string, unknown>;
}