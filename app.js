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
    currentList: 'wantToRead'
};

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

// Initialize app
function init() {
    loadFromLocalStorage();
    
    // Render all lists
    renderList('wantToRead');
    renderList('reading');
    renderList('read');
    
    // Show search view by default
    switchView('searchView');
    
    setupEventListeners();
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
            coverUrl: book.imageLinks ? book.imageLinks.thumbnail : null,
            isbn: book.industryIdentifiers ? book.industryIdentifiers[0]?.identifier : null,
            description: book.description || null
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
    showToast('Book added!');
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
        state.books[toList].push(book);
        saveToLocalStorage();
        renderList(fromList);
        renderList(toList);
        showToast('Book moved!');
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

    books.forEach(book => {
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

    div.innerHTML = `
        <img src="${coverUrl}" alt="${book.title}" class="book-cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'120\' fill=\'%232c2c2e\'%3E%3Crect width=\'80\' height=\'120\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' fill=\'%23636366\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'32\'%3E📖%3C/text%3E%3C/svg%3E'">
        <div class="book-card-content">
            <div class="book-card-header">
                <div class="book-title">${book.title}</div>
                <div class="book-author">${book.author}</div>
                <div class="book-year">${book.year}</div>
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
        ? book.coverUrl.replace('http://', 'https://').replace('zoom=1', 'zoom=2')
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" fill="%232c2c2e"%3E%3Crect width="200" height="300"/%3E%3Ctext x="50%25" y="50%25" fill="%23636366" text-anchor="middle" dy=".3em" font-size="64"%3E📖%3C/text%3E%3C/svg%3E';

    const description = book.description || 'No description available.';
    const isbn = book.isbn ? `<div class="detail-isbn"><strong>ISBN:</strong> ${book.isbn}</div>` : '';

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

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close book detail modal
function closeBookDetail() {
    const modal = document.getElementById('bookDetailModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Local storage functions
function saveToLocalStorage() {
    localStorage.setItem('bookTrackerData', JSON.stringify(state.books));
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

// Start the app
init();
