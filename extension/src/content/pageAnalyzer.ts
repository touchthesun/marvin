import { Readability } from '@mozilla/readability';

interface PageMetadata {
    title?: string;
    author?: string;
    publicationDate?: string;
    url: string;
}

class PageAnalyzer {
    private observer: MutationObserver | null = null;
    private lastContent: string = '';

    async extractPageContent(): Promise<{ content: string; metadata: PageMetadata }> {
        try {
            // Get main content using readability
            const documentClone = document.cloneNode(true) as Document;
            const article = new Readability(documentClone).parse();
            const content = article?.textContent || document.body.textContent || '';

            // Extract metadata
            const metadata = this.extractMetadata();

            return {
                content: content.trim(),
                metadata
            };
        } catch (error) {
            console.error('Error extracting page content:', error);
            throw error;
        }
    }

    private extractMetadata(): PageMetadata {
        const metadata: PageMetadata = {
            url: window.location.href
        };

        try {
            // Try to extract from LD+JSON first
            const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
            for (const element of Array.from(ldJsonElements)) {
                try {
                    const data = JSON.parse(element.textContent || '');
                    if (data['@type'] === 'Article' || data['@type'] === 'NewsArticle') {
                        metadata.author = data.author?.name || data.author;
                        metadata.publicationDate = data.datePublished || data.dateCreated;
                        metadata.title = data.headline || data.name;
                        break;
                    }
                } catch (e) {
                    console.debug('Error parsing LD+JSON:', e);
                    continue;
                }
            }

            // Fallback to meta tags if needed
            if (!metadata.title) {
                metadata.title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                    document.title || undefined;
            }

            if (!metadata.author) {
                metadata.author = document.querySelector('meta[name="author"]')?.getAttribute('content') ||
                    document.querySelector('meta[property="article:author"]')?.getAttribute('content') || undefined;
            }

            if (!metadata.publicationDate) {
                metadata.publicationDate = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
                    document.querySelector('meta[name="publication_date"]')?.getAttribute('content') || undefined;
            }

            return metadata;
        } catch (error) {
            console.error('Error extracting metadata:', error);
            return metadata;
        }
    }    async observePageChanges(): Promise<void> {
        try {
            // Disconnect existing observer if any
            if (this.observer) {
                this.observer.disconnect();
            }

            const debounceTimeout = 1000; // 1 second
            let timeoutId: NodeJS.Timeout;

            this.observer = new MutationObserver(async (mutations) => {
                // Clear existing timeout
                clearTimeout(timeoutId);

                // Set new timeout to handle changes
                timeoutId = setTimeout(async () => {
                    const significantChange = mutations.some(mutation => 
                        mutation.type === 'childList' && 
                        Array.from(mutation.addedNodes).some(node => 
                            node.nodeType === Node.ELEMENT_NODE &&
                            ['P', 'DIV', 'ARTICLE', 'SECTION'].includes((node as Element).tagName)
                        )
                    );

                    if (significantChange) {
                        const { content } = await this.extractPageContent();
                        
                        // Only notify if content has meaningfully changed
                        if (Math.abs(content.length - this.lastContent.length) > 100) {
                            this.lastContent = content;
                            chrome.runtime.sendMessage({
                                type: 'PAGE_CONTENT_UPDATED',
                                payload: { content }
                            });
                        }
                    }
                }, debounceTimeout);
            });

            // Start observing
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        } catch (error) {
            console.error('Error setting up page observer:', error);
            throw error;
        }
    }
}