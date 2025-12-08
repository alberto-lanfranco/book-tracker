// App version (semantic versioning)
const APP_VERSION = '1.0.0';

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed', err));
    });
}

// App state
const state = {
    books: {
        wantToRead: [],
        reading: [],
        read: []
    },
    currentList: 'wantToRead',
    sortBy: 'dateAdded', // dateAdded, title, author, year, rating
    sortOrder: 'desc', // asc or desc
    settings: {
        gistId: '',
        apiToken: ''
    },
    isSyncing: false,
    lastSyncTime: null // Track last sync timestamp
};

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const gistIdInput = document.getElementById('gistId');
const apiTokenInput = document.getElementById('apiToken');
const saveSettingsBtn = document.getElementById('saveSettings');
const syncNowBtn = document.getElementById('syncNow');
const syncStatus = document.getElementById('syncStatus');
const clearCacheBtn = document.getElementById('clearCache');
const updatePWABtn = document.getElementById('updatePWA');
const maintenanceStatus = document.getElementById('maintenanceStatus');

// Initialize app
function init() {
    loadSettingsFromStorage();
    loadFromLocalStorage();
    loadSortPreference();
    
    // Display app version
    document.getElementById('appVersion').textContent = APP_VERSION;
    
    // Render all lists
    renderList('wantToRead');
    renderList('reading');
    renderList('read');
    
    // Show search view by default
    switchView('searchView');
    
    setupEventListeners();
    
    // Auto-sync on startup if configured
    if (state.settings.apiToken && state.settings.gistId) {
        syncWithGitHub(false);
    }
}

// Event listeners
function setupEventListeners() {
    // Search on input
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        if (query.length > 2) {
            searchTimeout = setTimeout(() => handleSearch(), 500);
        } else if (query.length === 0) {
            searchResults.innerHTML = '';
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            handleSearch();
        }
    });

    // Bottom navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            switchView(viewId);
        });
    });

    // Keyboard detection for mobile
    let initialHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        if (window.innerHeight < initialHeight - 100) {
            document.body.classList.add('keyboard-open');
        } else {
            document.body.classList.remove('keyboard-open');
        }
    });

    // Modal close handlers
    document.getElementById('closeModal').addEventListener('click', closeBookDetail);
    document.getElementById('bookDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'bookDetailModal') {
            closeBookDetail();
        }
    });

    // Settings handlers
    saveSettingsBtn.addEventListener('click', saveSettings);
    syncNowBtn.addEventListener('click', () => syncWithGitHub(true));
    
    // Maintenance handlers
    clearCacheBtn.addEventListener('click', clearLocalCache);
    updatePWABtn.addEventListener('click', updatePWA);
    
    // Auto-sync on focus (if last sync > 5 minutes ago)
    window.addEventListener('focus', () => {
        if (state.settings.apiToken && state.settings.gistId) {
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (!state.lastSyncTime || (now - state.lastSyncTime) > fiveMinutes) {
                syncWithGitHub(false);
            }
        }
    });
    
    // Sort handlers
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderBtn = document.getElementById('sortOrder');
    
    if (sortBySelect) {
        sortBySelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            saveSortPreference();
            renderList(state.currentList);
        });
    }
    
    if (sortOrderBtn) {
        sortOrderBtn.addEventListener('click', () => {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            sortOrderBtn.textContent = state.sortOrder === 'asc' ? '↑' : '↓';
            saveSortPreference();
            renderList(state.currentList);
        });
    }
}

// Search books via Google Books API
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResults.innerHTML = '<div class="loading">Searching...</div>';

    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`);
        
        // Check for rate limit or quota errors
        if (response.status === 429) {
            searchResults.innerHTML = '<div class="error-message">Rate limit exceeded. Please try again in a few minutes.</div>';
            return;
        }
        
        if (response.status === 403) {
            searchResults.innerHTML = '<div class="error-message">API quota exceeded. Daily limit reached. Please try again tomorrow.</div>';
            return;
        }
        
        if (!response.ok) {
            searchResults.innerHTML = `<div class="error-message">Search failed (Error ${response.status}). Please try again.</div>`;
            return;
        }
        
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            displaySearchResults(data.items);
        } else {
            searchResults.innerHTML = '<div class="loading">No books found</div>';
        }
    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<div class="error-message">Network error. Please check your connection and try again.</div>';
    }
}

// Helper function to get highest resolution cover image
function getBestCoverUrl(imageLinks) {
    if (!imageLinks) return null;
    // Priority: extraLarge > large > medium > small > thumbnail > smallThumbnail
    return imageLinks.extraLarge || 
           imageLinks.large || 
           imageLinks.medium || 
           imageLinks.small || 
           imageLinks.thumbnail || 
           imageLinks.smallThumbnail || 
           null;
}

// Display search results
function displaySearchResults(books) {
    searchResults.innerHTML = '';

    books.forEach(item => {
        const book = item.volumeInfo;
        const bookData = {
            id: item.id,
            title: book.title,
            author: book.authors ? book.authors.join(', ') : 'Unknown Author',
            year: book.publishedDate ? book.publishedDate.substring(0, 4) : 'N/A',
            coverUrl: getBestCoverUrl(book.imageLinks),
            isbn: book.industryIdentifiers ? book.industryIdentifiers[0]?.identifier : null,
            description: book.description || null,
            tags: [],
            addedAt: new Date().toISOString()
        };

        const resultItem = createSearchResultItem(bookData);
        searchResults.appendChild(resultItem);
    });
}

// Create search result item
function createSearchResultItem(book) {
    const div = document.createElement('div');
    div.className = 'search-result-item';

    const coverUrl = book.coverUrl 
        ? book.coverUrl.replace('http://', 'https://')
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="90" fill="%232c2c2e"%3E%3Crect width="60" height="90"/%3E%3Crect width="60" height="90"/%3E%3Ctext x="50%25" y="50%25" fill="%238e8e93" text-anchor="middle" dy=".3em" font-size="24"%3E📖%3C/text%3E%3C/svg%3E';

    div.innerHTML = `
        <img src="${coverUrl}" alt="${book.title}" class="book-cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'60\\' height=\\'90\\' fill=\\'%232c2c2e\\'%3E%3Crect width=\\'60\\' height=\\'90\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' fill=\\'%238e8e93\\' text-anchor=\\'middle\\' dy=\\'.3em\\' font-size=\\'24\\'%3E📖%3C/text%3E%3C/svg%3E'">
        <div class="book-info">
            <div class="book-title">${book.title}</div>
            <div class="book-author">${book.author}</div>
            <div class="book-year">${book.year}</div>
        </div>
        <div class="search-result-actions">
            <button class="btn btn-icon" data-list="wantToRead" title="To Read">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
            </button>
            <button class="btn btn-icon" data-list="reading" title="Reading">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
            </button>
            <button class="btn btn-icon" data-list="read" title="Read">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
        </div>
    `;

    // Add click handlers to action buttons
    div.querySelectorAll('.search-result-actions button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const listName = btn.dataset.list;
            addBookToList(book, listName);
        });
    });

    // Add click handler to open detail view
    div.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
            showBookDetail(book, 'search');
        }
    });

    return div;
}



// Add book to list
function addBookToList(book, listName) {
    // Check if book has ISBN (required for cloud sync)
    if (!book.isbn) {
        showToast('⚠️ Book has no ISBN - won\'t sync to cloud');
        // Still add to local list, but warn user
    }
    
    // Check if book already exists in any list
    const allBooks = [...state.books.wantToRead, ...state.books.reading, ...state.books.read];
    if (allBooks.some(b => b.id === book.id)) {
        // Create a simple toast notification
        showToast('Book already in your lists');
        return;
    }

    state.books[listName].push(book);
    saveToLocalStorage();
    renderList(listName);
    
    // Clear search and show success
    searchResults.innerHTML = '';
    searchInput.value = '';
    if (book.isbn) {
        showToast('Book added!');
    }
}

// Simple toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(44, 44, 46, 0.95);
        backdrop-filter: blur(20px);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 15px;
        font-weight: 500;
        z-index: 10000;
        pointer-events: none;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Remove book from list
function removeBookFromList(bookId, listName) {
    state.books[listName] = state.books[listName].filter(book => book.id !== bookId);
    saveToLocalStorage();
    renderList(listName);
}

// Move book to different list
function moveBook(bookId, fromList, toList) {
    const book = state.books[fromList].find(b => b.id === bookId);
    if (book) {
        state.books[fromList] = state.books[fromList].filter(b => b.id !== bookId);
        // Update timestamp when moving to new list
        book.addedAt = new Date().toISOString();
        state.books[toList].push(book);
        saveToLocalStorage();
        renderList(fromList);
        renderList(toList);
        showToast('Book moved!');
    }
}

// Update book rating
function updateBookRating(bookId, rating) {
    const book = state.books.read.find(b => b.id === bookId);
    if (book) {
        book.rating = rating;
        saveToLocalStorage();
        renderList('read');
    }
}

// Add tag to book
function addTagToBook(bookId, tag) {
    for (const list of Object.values(state.books)) {
        const book = list.find(b => b.id === bookId);
        if (book) {
            if (!book.tags) book.tags = [];
            if (!book.tags.includes(tag)) {
                book.tags.push(tag);
                saveToLocalStorage();
                renderList(state.currentList);
            }
            break;
        }
    }
}

// Remove tag from book
function removeTagFromBook(bookId, tag) {
    for (const list of Object.values(state.books)) {
        const book = list.find(b => b.id === bookId);
        if (book && book.tags) {
            book.tags = book.tags.filter(t => t !== tag);
            saveToLocalStorage();
            renderList(state.currentList);
            break;
        }
    }
}

// Switch view
function switchView(viewId) {
    // Update navigation
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Update views
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });

    // If switching to a list view, update the current list and render
    if (viewId === 'wantToReadView') {
        state.currentList = 'wantToRead';
        renderList('wantToRead');
    } else if (viewId === 'readingView') {
        state.currentList = 'reading';
        renderList('reading');
    } else if (viewId === 'readView') {
        state.currentList = 'read';
        renderList('read');
    }

    // Scroll to top of new view
    window.scrollTo(0, 0);
}

// Switch list (legacy function for compatibility)
function switchList(listName) {
    const viewMap = {
        'wantToRead': 'wantToReadView',
        'reading': 'readingView',
        'read': 'readView'
    };
    switchView(viewMap[listName]);
}

// Sort books based on current sort settings
function sortBooks(books) {
    const sorted = [...books];
    
    sorted.sort((a, b) => {
        let aVal, bVal;
        
        switch(state.sortBy) {
            case 'title':
                aVal = a.title.toLowerCase();
                bVal = b.title.toLowerCase();
                break;
            case 'author':
                aVal = a.author.toLowerCase();
                bVal = b.author.toLowerCase();
                break;
            case 'year':
                aVal = a.year === 'N/A' ? '0' : a.year;
                bVal = b.year === 'N/A' ? '0' : b.year;
                break;
            case 'rating':
                aVal = a.rating || 0;
                bVal = b.rating || 0;
                break;
            case 'dateAdded':
            default:
                aVal = a.addedAt || '';
                bVal = b.addedAt || '';
                break;
        }
        
        if (aVal < bVal) return state.sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return state.sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
    
    return sorted;
}

// Render specific list
function renderList(listName) {
    const listElement = document.getElementById(listName);
    const books = state.books[listName];

    if (books.length === 0) {
        listElement.innerHTML = '';
        listElement.classList.add('empty');
        return;
    }

    listElement.classList.remove('empty');
    listElement.innerHTML = '';

    // Sort books before rendering
    const sortedBooks = sortBooks(books);
    
    sortedBooks.forEach(book => {
        const bookCard = createBookCard(book);
        listElement.appendChild(bookCard);
    });
}

// Render current list
function renderCurrentList() {
    renderList(state.currentList);
}

// Create book card
function createBookCard(book) {
    const div = document.createElement('div');
    div.className = 'book-card';
    div.style.cursor = 'pointer';

    const coverUrl = book.coverUrl 
        ? book.coverUrl.replace('http://', 'https://')
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="120" fill="%232c2c2e"%3E%3Crect width="80" height="120"/%3E%3Ctext x="50%25" y="50%25" fill="%23636366" text-anchor="middle" dy=".3em" font-size="32"%3E📖%3C/text%3E%3C/svg%3E';

    const description = book.description ? `<div class="book-description">${book.description.length > 150 ? book.description.substring(0, 150) + '...' : book.description}</div>` : '';
    
    // Show rating for books in Read list
    const ratingDisplay = (state.currentList === 'read' && book.rating) 
        ? `<div class="book-rating">⭐ ${book.rating}/10</div>` 
        : '';
    
    // Show tags
    const tags = book.tags && book.tags.length > 0 
        ? `<div class="book-tags">${book.tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('')}</div>` 
        : '';

    div.innerHTML = `
        <img src="${coverUrl}" alt="${book.title}" class="book-cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'120\' fill=\'%232c2c2e\'%3E%3Crect width=\'80\' height=\'120\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' fill=\'%23636366\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'32\'%3E📖%3C/text%3E%3C/svg%3E'">
        <div class="book-card-content">
            <div class="book-card-header">
                <div class="book-title">${book.title}</div>
                <div class="book-author">${book.author}</div>
                <div class="book-year">${book.year}</div>
                ${ratingDisplay}
                ${tags}
                ${description}
            </div>
            <div class="book-card-actions">
                <div class="action-group">
                    ${getMoveButtons(state.currentList, book.id)}
                </div>
                <button class="btn btn-icon btn-danger" onclick="removeBookFromList('${book.id}', '${state.currentList}')" title="Remove">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // Add click handler to open detail view, except on buttons
    div.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
            showBookDetail(book, 'list');
        }
    });

    return div;
}

// Get move buttons based on current list
function getMoveButtons(currentList, bookId) {
    const buttons = [];
    const icons = {
        wantToRead: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
        reading: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
        read: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    };
    const labels = {
        wantToRead: 'To Read',
        reading: 'Reading',
        read: 'Read'
    };

    for (const [key, icon] of Object.entries(icons)) {
        const isActive = key === currentList;
        const activeClass = isActive ? ' active' : '';
        const onclick = isActive ? '' : `onclick="moveBook('${bookId}', '${currentList}', '${key}')"`;
        buttons.push(`<button class="btn btn-icon${activeClass}" ${onclick} title="${labels[key]}" ${isActive ? 'disabled' : ''}>${icon}</button>`);
    }

    return buttons.join('');
}

// Show book detail modal
function showBookDetail(book, source = 'list') {
    const modal = document.getElementById('bookDetailModal');
    const content = document.getElementById('bookDetailContent');

    const coverUrl = book.coverUrl 
        ? book.coverUrl.replace('http://', 'https://')
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" fill="%232c2c2e"%3E%3Crect width="200" height="300"/%3E%3Ctext x="50%25" y="50%25" fill="%23636366" text-anchor="middle" dy=".3em" font-size="64"%3E📖%3C/text%3E%3C/svg%3E';

    const description = book.description || 'No description available.';
    const isbn = book.isbn ? `<div class="detail-isbn"><strong>ISBN:</strong> ${book.isbn}</div>` : '';

    // Show tags section for books in lists
    let tagsSection = '';
    if (source === 'list') {
        const tags = book.tags || [];
        const tagPills = tags.map(tag => `<span class="tag-pill">${tag}<button class="tag-remove" data-tag="${tag}">×</button></span>`).join('');
        tagsSection = `
            <div class="detail-tags">
                <label>Tags:</label>
                <div class="tags-container">
                    ${tagPills}
                    <input type="text" class="tag-input" placeholder="Add tag..." data-book-id="${book.id}">
                </div>
            </div>
        `;
    }

    // Show rating input for books in Read list
    let ratingSection = '';
    if (source === 'list' && state.currentList === 'read') {
        const currentRating = book.rating || 0;
        let stars = '';
        for (let i = 1; i <= 10; i++) {
            const filled = i <= currentRating ? 'filled' : '';
            stars += `<span class="star ${filled}" data-rating="${i}">★</span>`;
        }
        ratingSection = `
            <div class="detail-rating">
                <label>Rating:</label>
                <div class="star-rating" data-book-id="${book.id}">${stars}</div>
            </div>
        `;
    }

    // Show list action buttons
    let listActions = '';
    if (source === 'search') {
        listActions = `
            <div class="detail-actions">
                <button class="btn btn-icon" data-list="wantToRead" data-book-id="${book.id}" title="To Read">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                </button>
                <button class="btn btn-icon" data-list="reading" data-book-id="${book.id}" title="Reading">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    </svg>
                </button>
                <button class="btn btn-icon" data-list="read" data-book-id="${book.id}" title="Read">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </button>
            </div>
        `;
    } else {
        // Show move and delete buttons for books in lists
        const icons = {
            wantToRead: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
            reading: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
            read: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        };
        const labels = {
            wantToRead: 'To Read',
            reading: 'Reading',
            read: 'Read'
        };
        
        let buttons = '<div class="action-group">';
        for (const [key, icon] of Object.entries(icons)) {
            const isActive = key === state.currentList;
            const activeClass = isActive ? ' active' : '';
            buttons += `<button class="btn btn-icon${activeClass}" data-list="${key}" data-book-id="${book.id}" title="${labels[key]}" ${isActive ? 'disabled' : ''}>${icon}</button>`;
        }
        buttons += '</div>';
        
        listActions = `
            <div class="detail-actions">
                ${buttons}
                <button class="btn btn-icon btn-danger" data-action="delete" data-book-id="${book.id}" title="Remove">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
    }

    content.innerHTML = `
        <div class="detail-cover-container">
            <img src="${coverUrl}" alt="${book.title}" class="detail-cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\' fill=\'%232c2c2e\'%3E%3Crect width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' fill=\'%23636366\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'64\'%3E📖%3C/text%3E%3C/svg%3E'">
        </div>
        <div class="detail-info">
            <h2 class="detail-title">${book.title}</h2>
            <div class="detail-author">${book.author}</div>
            <div class="detail-year">${book.year}</div>
            ${isbn}
            ${tagsSection}
            ${ratingSection}
            ${listActions}
            <div class="detail-description">${description}</div>
        </div>
    `;

    // Add event listeners for action buttons
    content.querySelectorAll('.detail-actions button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.dataset.action === 'delete') {
                // Delete button
                removeBookFromList(book.id, state.currentList);
                closeBookDetail();
            } else if (btn.dataset.list) {
                // List buttons
                if (source === 'search') {
                    addBookToList(book, btn.dataset.list);
                    closeBookDetail();
                } else {
                    // Move book to different list
                    if (btn.dataset.list !== state.currentList) {
                        moveBook(book.id, state.currentList, btn.dataset.list);
                        closeBookDetail();
                    }
                }
            }
        });
    });

    // Add event listener for star rating
    const starRating = content.querySelector('.star-rating');
    if (starRating) {
        starRating.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => {
                const rating = parseInt(e.target.dataset.rating);
                updateBookRating(book.id, rating);
                
                // Update star display
                starRating.querySelectorAll('.star').forEach(s => {
                    const starValue = parseInt(s.dataset.rating);
                    if (starValue <= rating) {
                        s.classList.add('filled');
                    } else {
                        s.classList.remove('filled');
                    }
                });
            });
        });
    }

    // Add event listeners for tags
    const tagInput = content.querySelector('.tag-input');
    if (tagInput) {
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                const tag = e.target.value.trim();
                addTagToBook(book.id, tag);
                e.target.value = '';
                
                // Re-render the book detail to show new tag
                setTimeout(() => showBookDetail(book, source), 100);
            }
        });
        
        // Remove tag event listeners
        content.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tag = btn.dataset.tag;
                removeTagFromBook(book.id, tag);
                
                // Re-render the book detail
                setTimeout(() => showBookDetail(book, source), 100);
            });
        });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close book detail modal
function closeBookDetail() {
    const modal = document.getElementById('bookDetailModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ===== PASTEMYST SYNC FUNCTIONS =====

// Convert books to TSV format (minimal: isbn, list, rating, tags, addedAt)
function booksToTSV() {
    const lines = ['isbn\tlist\trating\ttags\taddedAt'];
    
    for (const [listName, books] of Object.entries(state.books)) {
        books.forEach(book => {
            // Only sync books that have ISBN
            if (book.isbn) {
                const tags = book.tags && book.tags.length > 0 ? book.tags.join(',') : '';
                const row = [
                    book.isbn,
                    listName,
                    book.rating || '',
                    tags,
                    book.addedAt || ''
                ];
                lines.push(row.join('\t'));
            }
        });
    }
    
    return lines.join('\n');
}

// Parse TSV to books (fetch full data from Google Books API using ISBN)
async function tsvToBooks(tsv) {
    const lines = tsv.trim().split('\n');
    if (lines.length < 1) return { wantToRead: [], reading: [], read: [] };
    
    const books = {
        wantToRead: [],
        reading: [],
        read: []
    };
    
    // Skip header line and fetch book data from Google Books API
    const fetchPromises = [];
    
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        if (cols.length < 2) continue;
        
        const [isbn, listName, rating, tagsStr, addedAt] = cols;
        const tags = tagsStr ? tagsStr.split(',').filter(t => t.trim()) : [];
        
        // Check if we already have this book in local cache
        let cachedBook = null;
        for (const list of Object.values(state.books)) {
            cachedBook = list.find(b => b.isbn === isbn);
            if (cachedBook) break;
        }
        
        if (cachedBook) {
            // Use cached data
            const book = {
                ...cachedBook,
                rating: rating ? parseInt(rating) : null,
                tags: tags,
                addedAt: addedAt || null
            };
            if (books[listName]) {
                books[listName].push(book);
            }
        } else {
            // Fetch from Google Books API
            fetchPromises.push(
                fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.items && data.items.length > 0) {
                            const item = data.items[0];
                            const volumeInfo = item.volumeInfo;
                            
                            const book = {
                                id: item.id,
                                title: volumeInfo.title || 'Unknown Title',
                                author: volumeInfo.authors?.join(', ') || 'Unknown Author',
                                year: volumeInfo.publishedDate?.substring(0, 4) || 'N/A',
                                coverUrl: getBestCoverUrl(volumeInfo.imageLinks),
                                isbn: isbn,
                                description: volumeInfo.description || null,
                                rating: rating ? parseInt(rating) : null,
                                tags: tags,
                                addedAt: addedAt || null
                            };
                            
                            if (books[listName]) {
                                books[listName].push(book);
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`Failed to fetch book with ISBN ${isbn}:`, err);
                    })
            );
        }
    }
    
    // Wait for all API calls to complete
    await Promise.all(fetchPromises);
    
    return books;
}

// Fetch paste from PasteMyst
async function fetchGist(gistId, token) {
    const headers = {
        'Accept': 'application/vnd.github+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers
    });
    
    if (!response.ok) {
        let errorMsg = 'Failed to fetch gist';
        if (response.status === 404) {
            errorMsg = 'Gist not found. Check your Gist ID in Settings.';
        } else if (response.status === 401) {
            errorMsg = 'Invalid GitHub token. Please check your token in Settings.';
        } else if (response.status === 403) {
            errorMsg = 'GitHub token lacks permission or rate limit exceeded.';
        } else {
            errorMsg = `Failed to fetch gist (${response.status}).`;
        }
        throw new Error(errorMsg);
    }
    
    return await response.json();
}

// Create new gist on GitHub
async function createGist(token) {
    const tsv = booksToTSV();
    
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description: 'Book Tracker Database',
            public: false,
            files: {
                'books.tsv': {
                    content: tsv
                }
            }
        })
    });
    
    if (!response.ok) {
        let errorMsg = 'Failed to create gist';
        if (response.status === 401) {
            errorMsg = 'Invalid GitHub token. Please check your token in Settings.';
        } else if (response.status === 403) {
            errorMsg = 'GitHub token lacks permission. Generate a new token at github.com/settings/tokens with "gist" scope.';
        } else if (response.status === 422) {
            errorMsg = 'Invalid request. Please check your settings.';
        } else {
            errorMsg = `Failed to create gist (${response.status}). Check your GitHub token.`;
        }
        throw new Error(errorMsg);
    }
    
    return await response.json();
}

// Update existing gist on GitHub
async function updateGist(gistId, token) {
    const tsv = booksToTSV();
    
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            files: {
                'books.tsv': {
                    content: tsv
                }
            }
        })
    });
    
    if (!response.ok) {
        let errorMsg = 'Failed to update gist';
        if (response.status === 401) {
            errorMsg = 'Invalid GitHub token. Please check your token in Settings.';
        } else if (response.status === 403) {
            errorMsg = 'GitHub token lacks permission or rate limit exceeded.';
        } else if (response.status === 404) {
            errorMsg = 'Gist not found. The Gist ID may be invalid. Try creating a new gist by clearing the Gist ID field.';
        } else if (response.status === 422) {
            errorMsg = 'Invalid request. Please check your settings.';
        } else {
            errorMsg = `Failed to update gist (${response.status}). Check your settings.`;
        }
        throw new Error(errorMsg);
    }
    
    return await response.json();
}

// Main sync function
async function syncWithGitHub(manualSync = false) {
    if (state.isSyncing) return;
    
    const token = state.settings.apiToken.trim();
    const gistId = state.settings.gistId.trim();
    
    if (!token) {
        if (manualSync) {
            showSyncStatus('Please configure GitHub token in settings', 'error');
        }
        return;
    }
    
    state.isSyncing = true;
    if (manualSync) showSyncStatus('Syncing...', 'info');
    
    try {
        if (!gistId) {
            // Create new gist
            const gist = await createGist(token);
            state.settings.gistId = gist.id;
            gistIdInput.value = gist.id;
            saveSettingsToStorage();
            showSyncStatus(`Synced! New gist created: ${gist.id}`, 'success');
        } else {
            // Fetch existing gist and sync
            const gist = await fetchGist(gistId, token);
            
            if (gist.files && gist.files['books.tsv']) {
                const tsv = gist.files['books.tsv'].content;
                const remoteBooks = await tsvToBooks(tsv);
                
                // Remote is source of truth - overwrite local
                state.books = remoteBooks;
                
                // Re-render all lists
                renderList('wantToRead');
                renderList('reading');
                renderList('read');
                
                // Save to localStorage as cache
                saveToLocalStorage();
            }
            
            if (manualSync) {
                showSyncStatus('Synced successfully!', 'success');
            }
        }
        
        // Update last sync time on successful sync
        state.lastSyncTime = Date.now();
    } catch (error) {
        console.error('Sync error:', error);
        let errorMsg = error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMsg = 'Network error. Check your internet connection.';
        }
        showSyncStatus(errorMsg, 'error');
    } finally {
        state.isSyncing = false;
    }
}

// Push local changes to GitHub
async function pushToGitHub() {
    const token = state.settings.apiToken.trim();
    const gistId = state.settings.gistId.trim();
    
    if (!token || !gistId) return;
    if (state.isSyncing) return;
    
    state.isSyncing = true;
    
    try {
        await updateGist(gistId, token);
    } catch (error) {
        console.error('Push error:', error);
    } finally {
        state.isSyncing = false;
    }
}

// Show sync status message
function showSyncStatus(message, type = 'info') {
    syncStatus.textContent = message;
    syncStatus.className = `sync-status sync-${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            syncStatus.textContent = '';
            syncStatus.className = 'sync-status';
        }, 3000);
    }
}

// Save settings
function saveSettings() {
    state.settings.gistId = gistIdInput.value.trim();
    state.settings.apiToken = apiTokenInput.value.trim();
    saveSettingsToStorage();
    showSyncStatus('Settings saved!', 'success');
}

// Load settings from storage
function loadSettingsFromStorage() {
    const saved = localStorage.getItem('bookTrackerSettings');
    if (saved) {
        try {
            state.settings = JSON.parse(saved);
            gistIdInput.value = state.settings.gistId || '';
            apiTokenInput.value = state.settings.apiToken || '';
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
}

// Save settings to storage
function saveSettingsToStorage() {
    localStorage.setItem('bookTrackerSettings', JSON.stringify(state.settings));
}

// Save sort preference
function saveSortPreference() {
    localStorage.setItem('bookTrackerSort', JSON.stringify({
        sortBy: state.sortBy,
        sortOrder: state.sortOrder
    }));
}

// Load sort preference
function loadSortPreference() {
    const saved = localStorage.getItem('bookTrackerSort');
    if (saved) {
        try {
            const sortPref = JSON.parse(saved);
            state.sortBy = sortPref.sortBy || 'dateAdded';
            state.sortOrder = sortPref.sortOrder || 'desc';
            
            // Update UI
            const sortBySelect = document.getElementById('sortBy');
            const sortOrderBtn = document.getElementById('sortOrder');
            if (sortBySelect) sortBySelect.value = state.sortBy;
            if (sortOrderBtn) sortOrderBtn.textContent = state.sortOrder === 'asc' ? '↑' : '↓';
        } catch (error) {
            console.error('Error loading sort preference:', error);
        }
    }
}

// ===== LOCAL STORAGE FUNCTIONS =====

// Local storage functions
function saveToLocalStorage() {
    localStorage.setItem('bookTrackerData', JSON.stringify(state.books));
    // Also push to PasteMyst if configured
    pushToGitHub();
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('bookTrackerData');
    if (saved) {
        try {
            state.books = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }
}

// ===== MAINTENANCE FUNCTIONS =====

// Clear local cache
function clearLocalCache() {
    if (confirm('Are you sure you want to clear the local cache? This will remove all books from this device. Books synced to cloud will be restored on next sync.')) {
        localStorage.removeItem('bookTrackerData');
        state.books = {
            wantToRead: [],
            reading: [],
            read: []
        };
        renderList('wantToRead');
        renderList('reading');
        renderList('read');
        showMaintenanceStatus('Local cache cleared. Sync to restore from cloud.', 'success');
    }
}

// Update PWA
function updatePWA() {
    if ('serviceWorker' in navigator) {
        showMaintenanceStatus('Checking for updates...', 'info');
        
        navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
                registration.update().then(() => {
                    // Check if there's a waiting service worker
                    if (registration.waiting) {
                        // Tell the waiting service worker to skip waiting
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        showMaintenanceStatus('Update available! Reloading app...', 'success');
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        showMaintenanceStatus('App is up to date!', 'success');
                    }
                });
            } else {
                showMaintenanceStatus('No service worker registered.', 'error');
            }
        }).catch(err => {
            console.error('Update check failed:', err);
            showMaintenanceStatus('Failed to check for updates.', 'error');
        });
    } else {
        showMaintenanceStatus('Service workers not supported.', 'error');
    }
}

// Show maintenance status message
function showMaintenanceStatus(message, type = 'info') {
    maintenanceStatus.textContent = message;
    maintenanceStatus.className = `sync-status sync-${type}`;
    maintenanceStatus.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            maintenanceStatus.style.display = 'none';
        }, 3000);
    }
}

// Start the app
init();
