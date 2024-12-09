export interface TabState {
    id: number;
    url: string;
    title: string;
    content?: string;
    lastAccessed: Date;
}

export interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    children?: BookmarkNode[];
    dateAdded?: number;
}

export class TabStateManager {
    private tabStates: Map<number, TabState>;

    constructor() {
        this.tabStates = new Map();
    }

    private validateTabId(tabId: number | undefined, context: string): number | null {
        if (typeof tabId === 'undefined' || tabId === null) {
            console.warn(`Invalid tab ID in context: ${context}`);
            return null;
        }
        return tabId;
    }

    async getCurrentState(): Promise<Map<number, TabState>> {
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                const validTabId = this.validateTabId(tab.id, 'getCurrentState');
                if (validTabId && !this.tabStates.has(validTabId)) {
                    await this.initializeTab(validTabId);
                }
            }
            return this.tabStates;
        } catch (error) {
            console.error('Error getting current tab states:', error);
            throw error;
        }
    }

    async handleTabUpdate(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
        try {
            const validTabId = this.validateTabId(tabId, 'handleTabUpdate');
            if (!validTabId) {
                console.warn('Attempted to update invalid tab ID');
                return;
            }

            if (!tab.url) {
                console.warn('Tab update missing URL:', validTabId);
                return;
            }

            const currentState = this.tabStates.get(validTabId) || {
                id: validTabId,
                url: tab.url,
                title: tab.title || '',
                lastAccessed: new Date()
            };

            // Update relevant fields
            if (changeInfo.url) {
                currentState.url = changeInfo.url;
            }
            if (changeInfo.title) {
                currentState.title = changeInfo.title;
            }
            currentState.lastAccessed = new Date();

            this.tabStates.set(validTabId, currentState);

            // Notify listeners via custom event
            try {
                await chrome.runtime.sendMessage({
                    type: 'TAB_STATE_UPDATED',
                    payload: { tabId: validTabId, state: currentState }
                });
            } catch (error) {
                console.error('Error sending tab update notification:', error);
                // Don't throw here as this is a non-critical operation
            }
        } catch (error) {
            console.error('Error handling tab update:', error);
            throw error;
        }
    }

    async handleTabRemoved(tabId: number): Promise<void> {
        try {
            const validTabId = this.validateTabId(tabId, 'handleTabRemoved');
            if (!validTabId) {
                console.warn('Attempted to remove invalid tab ID');
                return;
            }

            this.tabStates.delete(validTabId);
            
            // Notify listeners of removal
            try {
                await chrome.runtime.sendMessage({
                    type: 'TAB_REMOVED',
                    payload: { tabId: validTabId }
                });
            } catch (error) {
                console.error('Error sending tab removal notification:', error);
                // Don't throw here as this is a non-critical operation
            }
        } catch (error) {
            console.error('Error handling tab removal:', error);
            throw error;
        }
    }

    async initializeTab(tabId: number): Promise<void> {
        try {
            const validTabId = this.validateTabId(tabId, 'initializeTab');
            if (!validTabId) {
                console.warn('Attempted to initialize invalid tab ID');
                return;
            }

            const tab = await chrome.tabs.get(validTabId);
            if (!tab.url) {
                console.warn(`Tab ${validTabId} has no URL, skipping initialization`);
                return;
            }

            this.tabStates.set(validTabId, {
                id: validTabId,
                url: tab.url,
                title: tab.title || '',
                lastAccessed: new Date()
            });
        } catch (error) {
            console.error(`Error initializing tab ${tabId}:`, error);
            throw error;
        }
    }
}

export class BookmarkManager {
    private bookmarkCache: BookmarkNode[];
    private lastUpdate: Date;

    constructor() {
        this.bookmarkCache = [];
        this.lastUpdate = new Date(0);
    }

    async getAllBookmarks(): Promise<BookmarkNode[]> {
        try {
            // Refresh cache if older than 5 minutes
            if (new Date().getTime() - this.lastUpdate.getTime() > 5 * 60 * 1000) {
                const tree = await chrome.bookmarks.getTree();
                this.bookmarkCache = this.transformBookmarkTree(tree);
                this.lastUpdate = new Date();
            }
            return this.bookmarkCache;
        } catch (error) {
            console.error('Error getting bookmarks:', error);
            throw error;
        }
    }

    async searchBookmarks(query: string): Promise<BookmarkNode[]> {
        try {
            const results = await chrome.bookmarks.search(query);
            return results.map(bookmark => ({
                id: bookmark.id,
                title: bookmark.title,
                url: bookmark.url,
                dateAdded: bookmark.dateAdded
            }));
        } catch (error) {
            console.error('Error searching bookmarks:', error);
            throw error;
        }
    }

    async addBookmark(url: string, title: string): Promise<BookmarkNode> {
        try {
            const created = await chrome.bookmarks.create({
                title,
                url
            });
            
            // Invalidate cache
            this.lastUpdate = new Date(0);
            
            return {
                id: created.id,
                title: created.title,
                url: created.url,
                dateAdded: created.dateAdded
            };
        } catch (error) {
            console.error('Error adding bookmark:', error);
            throw error;
        }
    }

    private transformBookmarkTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkNode[] {
        return nodes.map(node => ({
            id: node.id,
            title: node.title,
            url: node.url,
            dateAdded: node.dateAdded,
            children: node.children ? this.transformBookmarkTree(node.children) : undefined
        }));
    }
}