import { TabStateManager, BookmarkManager, TabState, BookmarkNode } from './state';
import { BrowserContext, PageStatus, ProcessingRequest, ProcessingResult } from './types';

export class BrowserPipelineMonitor {
    private processingQueue: Set<string> = new Set();
    private processingResults: Map<string, ProcessingResult> = new Map();
    private tabManager: TabStateManager;
    private bookmarkManager: BookmarkManager;

    constructor(tabManager: TabStateManager, bookmarkManager: BookmarkManager) {
        this.tabManager = tabManager;
        this.bookmarkManager = bookmarkManager;
        this.setupListeners();
    }

    private setupListeners(): void {
        chrome.runtime.onMessage.addListener(async (message) => {
            if (message.type === 'TAB_STATE_UPDATED') {
                const { tabId, state } = message.payload;
                await this.handleTabStateChange(state);
            }
        });

        chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
            if (bookmark.url) {
                await this.handleBookmarkChange(id, bookmark);
            }
        });

        chrome.bookmarks.onChanged.addListener(async (id) => {
            const bookmarks = await this.bookmarkManager.getAllBookmarks();
            const bookmark = this.findBookmarkById(bookmarks, id);
            if (bookmark?.url) {
                await this.handleBookmarkChange(id, bookmark);
            }
        });
    }

    private findBookmarkById(bookmarks: BookmarkNode[], id: string): BookmarkNode | null {
        for (const bookmark of bookmarks) {
            if (bookmark.id === id) return bookmark;
            if (bookmark.children) {
                const found = this.findBookmarkById(bookmark.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    private async handleTabStateChange(tabState: TabState): Promise<void> {
        const request: ProcessingRequest = {
            url: tabState.url,
            context: tabState.content ? BrowserContext.ACTIVE_TAB : BrowserContext.OPEN_TAB,
            tabId: tabState.id,
            title: tabState.title,
            content: tabState.content
        };

        await this.queueForProcessing(request);
    }

    private async handleBookmarkChange(id: string, bookmark: BookmarkNode): Promise<void> {
        if (!bookmark.url) return;

        const request: ProcessingRequest = {
            url: bookmark.url,
            context: BrowserContext.BOOKMARKED,
            bookmarkId: id,
            title: bookmark.title
        };

        await this.queueForProcessing(request);
    }

    private async queueForProcessing(request: ProcessingRequest): Promise<void> {
        if (this.processingQueue.has(request.url)) return;
        
        this.processingQueue.add(request.url);
        this.processingResults.set(request.url, {
            url: request.url,
            status: PageStatus.DISCOVERED
        });

        const startTime = Date.now();

        try {
            // Mock pipeline processing
            await this.updateProcessingStatus(request.url, PageStatus.IN_PROGRESS);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Simulate successful processing
            await this.updateProcessingStatus(request.url, PageStatus.ACTIVE, {
                processingTime: Date.now() - startTime
            });
            
        } catch (error) {
            await this.updateProcessingStatus(request.url, PageStatus.ERROR, {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            this.processingQueue.delete(request.url);
        }
    }

    private async updateProcessingStatus(
        url: string, 
        status: PageStatus, 
        additionalData: Partial<ProcessingResult> = {}
    ): Promise<void> {
        const result = this.processingResults.get(url) || { url, status: PageStatus.DISCOVERED };
        this.processingResults.set(url, {
            ...result,
            ...additionalData,
            status
        });

        // Log status update
        console.log(`[${new Date().toISOString()}] ${url}: ${status}`, additionalData);
    }

    public async getCurrentState(): Promise<{
        tabs: TabState[],
        bookmarks: BookmarkNode[],
        processing: ProcessingResult[]
    }> {
        const tabStates = await this.tabManager.getCurrentState();
        const bookmarks = await this.bookmarkManager.getAllBookmarks();

        return {
            tabs: Array.from(tabStates.values()),
            bookmarks: bookmarks,
            processing: Array.from(this.processingResults.values())
        };
    }

    public async processBatch(urls: string[]): Promise<void> {
        for (const url of urls) {
            if (!this.processingQueue.has(url)) {
                await this.queueForProcessing({
                    url,
                    context: BrowserContext.BACKGROUND
                });
            }
        }
    }

    public async getProcessingStatus(url: string): Promise<ProcessingResult | undefined> {
        return this.processingResults.get(url);
    }
}