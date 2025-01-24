import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupApp from './PopupApp';
import { TabState, BookmarkNode } from '../background/state';

// Initial empty state
const initialProps = {
    currentTab: {
        id: 0,
        url: '',
        title: '',
        lastAccessed: new Date()
    } as TabState,
    bookmarks: [] as BookmarkNode[]
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<PopupApp {...initialProps} />);
}