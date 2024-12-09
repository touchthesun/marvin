import { TabStateManager, BookmarkManager } from './state';


class MarvinExtension {
    private tabManager: TabStateManager;
    private bookmarkManager: BookmarkManager;

    constructor() {
        this.tabManager = new TabStateManager();
        this.bookmarkManager = new BookmarkManager();
        this.setupEventListeners();
    }

    // Helper function for tab ID validation
    private validateTabId(tabId: number | undefined, context: string): number | null {
        if (typeof tabId === 'undefined' || tabId === null) {
            console.warn(`Invalid tab ID in context: ${context}`);
            return null;
        }
        return tabId;
    }

    private setupEventListeners(): void {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                if (sender.id !== chrome.runtime.id) {
                    console.warn('Message received from unknown sender:', sender.id);
                    return;
                }

                switch (message.type) {
                    case 'CONTENT_UPDATE':
                        const validTabId = this.validateTabId(sender.tab?.id, 'CONTENT_UPDATE');
                        if (!validTabId) {
                            sendResponse({ success: false, error: 'Invalid tab ID' });
                            return;
                        }
                        
                        this.tabManager.handleTabUpdate(
                            validTabId,
                            { url: message.payload.url },
                            sender.tab as chrome.tabs.Tab
                        );
                        break;

                    case 'BOOKMARK_ACTION':
                        if (!message.payload?.action) {
                            console.warn('Invalid bookmark action payload:', message.payload);
                            sendResponse({ success: false, error: 'Invalid bookmark action' });
                            return;
                        }

                        if (message.payload.action === 'add') {
                            this.bookmarkManager.addBookmark(
                                message.payload.url,
                                message.payload.title
                            );
                        }
                        break;

                    default:
                        console.warn('Unknown message type:', message.type);
                }

                sendResponse({ success: true });
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ success: false, error: String(error) });
            }
        });

        chrome.runtime.onConnect.addListener((port) => {
            if (port.name === 'popup') {
                port.onMessage.addListener(async (message) => {
                    try {
                        switch (message.type) {
                            case 'GET_TAB_STATE':
                                const validTabId = this.validateTabId(message.tabId, 'GET_TAB_STATE');
                                if (!validTabId) {
                                    port.postMessage({ type: 'ERROR', payload: 'Invalid tab ID' });
                                    return;
                                }

                                const states = await this.tabManager.getCurrentState();
                                const tabState = states.get(validTabId);
                                
                                if (!tabState) {
                                    console.warn(`No state found for tab ID: ${validTabId}`);
                                }
                                
                                port.postMessage({ type: 'TAB_STATE', payload: tabState });
                                break;

                            case 'GET_BOOKMARKS':
                                const bookmarks = await this.bookmarkManager.getAllBookmarks();
                                port.postMessage({ type: 'BOOKMARKS', payload: bookmarks });
                                break;

                            default:
                                console.warn('Unknown popup message type:', message.type);
                                port.postMessage({ type: 'ERROR', payload: 'Unknown message type' });
                        }
                    } catch (error) {
                        console.error('Error handling popup message:', error);
                        port.postMessage({ type: 'ERROR', payload: String(error) });
                    }
                });
            } else {
                console.warn('Unknown port connection attempted:', port.name);
            }
        });
    }

    async initialize(): Promise<void> {
        try {
            // Initialize tab states for all open tabs
            const tabs = await chrome.tabs.query({});
            await Promise.all(tabs.map(async tab => {
                const validTabId = this.validateTabId(tab.id, 'initialize');
                if (validTabId) {
                    await this.tabManager.initializeTab(validTabId);
                }
            }));

            // Set up tab creation/removal listeners
            chrome.tabs.onCreated.addListener((tab) => {
                const validTabId = this.validateTabId(tab.id, 'onCreated');
                if (validTabId) {
                    this.tabManager.initializeTab(validTabId);
                }
            });

            chrome.tabs.onRemoved.addListener((tabId) => {
                const validTabId = this.validateTabId(tabId, 'onRemoved');
                if (validTabId) {
                    this.tabManager.handleTabRemoved(validTabId);
                }
            });

            console.log('Marvin extension initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Marvin extension:', error);
            throw error;
        }
    }
}

export default MarvinExtension;