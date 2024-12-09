import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { TabState, BookmarkNode } from '../background/state';

interface PopupAppProps {
    currentTab: TabState;
    bookmarks: BookmarkNode[];
}

const PopupApp: React.FC<PopupAppProps> = ({ currentTab, bookmarks }) => {
    const [relevantBookmarks, setRelevantBookmarks] = useState<BookmarkNode[]>([]);
    const [isBookmarked, setIsBookmarked] = useState(false);

    useEffect(() => {
        // Check if current URL is bookmarked
        const isCurrentUrlBookmarked = bookmarks.some(
            bookmark => bookmark.url === currentTab.url
        );
        setIsBookmarked(isCurrentUrlBookmarked);

        // Find relevant bookmarks based on title/url similarity
        const filtered = bookmarks.filter(bookmark => 
            bookmark.url && (
                bookmark.title.toLowerCase().includes(currentTab.title.toLowerCase()) ||
                currentTab.title.toLowerCase().includes(bookmark.title.toLowerCase())
            )
        ).slice(0, 5); // Show top 5 relevant bookmarks
        
        setRelevantBookmarks(filtered);
    }, [currentTab, bookmarks]);

    const handleBookmarkToggle = async () => {
        try {
            if (isBookmarked) {
                // Find and remove bookmark
                const bookmark = bookmarks.find(b => b.url === currentTab.url);
                if (bookmark) {
                    await chrome.bookmarks.remove(bookmark.id);
                }
            } else {
                // Add new bookmark
                await chrome.bookmarks.create({
                    title: currentTab.title,
                    url: currentTab.url
                });
            }
            setIsBookmarked(!isBookmarked);
        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    };

    return (
        <PopupContainer>
            <Header>
                <Title>Marvin</Title>
                <BookmarkButton 
                    onClick={handleBookmarkToggle}
                    isBookmarked={isBookmarked}
                >
                    {isBookmarked ? '★' : '☆'}
                </BookmarkButton>
            </Header>

            <CurrentPage>
                <h2>Current Page</h2>
                <PageTitle>{currentTab.title}</PageTitle>
                <PageUrl>{currentTab.url}</PageUrl>
                {currentTab.lastAccessed && (
                    <LastAccessed>
                        Last visited: {new Date(currentTab.lastAccessed).toLocaleString()}
                    </LastAccessed>
                )}
            </CurrentPage>

            {relevantBookmarks.length > 0 && (
                <RelatedSection>
                    <h2>Related Bookmarks</h2>
                    <BookmarkList>
                        {relevantBookmarks.map(bookmark => (
                            <BookmarkItem 
                                key={bookmark.id}
                                onClick={() => chrome.tabs.create({ url: bookmark.url })}
                            >
                                <BookmarkTitle>{bookmark.title}</BookmarkTitle>
                                <BookmarkUrl>{bookmark.url}</BookmarkUrl>
                            </BookmarkItem>
                        ))}
                    </BookmarkList>
                </RelatedSection>
            )}
        </PopupContainer>
    );
};

// Styled Components
const PopupContainer = styled.div`
    width: 350px;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
`;

const Header = styled.header`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
`;

const Title = styled.h1`
    margin: 0;
    font-size: 24px;
    color: #1a73e8;
`;

const BookmarkButton = styled.button<{ isBookmarked: boolean }>`
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: ${props => props.isBookmarked ? '#f1c40f' : '#bdc3c7'};
    transition: color 0.2s;
    
    &:hover {
        color: #f1c40f;
    }
`;

const CurrentPage = styled.section`
    margin-bottom: 16px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
`;

const PageTitle = styled.h3`
    margin: 0 0 8px 0;
    font-size: 16px;
    color: #202124;
`;

const PageUrl = styled.div`
    font-size: 14px;
    color: #5f6368;
    word-break: break-all;
`;

const LastAccessed = styled.div`
    font-size: 12px;
    color: #80868b;
    margin-top: 8px;
`;

const RelatedSection = styled.section`
    margin-top: 16px;
`;

const BookmarkList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const BookmarkItem = styled.div`
    padding: 8px;
    background: #fff;
    border: 1px solid #dadce0;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
        background-color: #f1f3f4;
    }
`;

const BookmarkTitle = styled.div`
    font-size: 14px;
    font-weight: 500;
    color: #202124;
`;

const BookmarkUrl = styled.div`
    font-size: 12px;
    color: #5f6368;
    word-break: break-all;
`;

export default PopupApp;