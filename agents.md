# Book Tracker PWA - Developer Guide

## Overview
A Progressive Web App (PWA) for tracking reading lists with an iOS-inspired minimal dark theme interface. Users can search for books and organize them into three lists: To Read, Reading, and Read.

## Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **API**: Google Books API (no authentication required)
- **Storage**: localStorage for persistence
- **PWA**: Service Worker for offline support
- **Design**: iOS inspired, mobile-first, dark theme

## Architecture

### File Structure
```
book-tracker/
├── index.html          # Main HTML with bottom navigation
├── styles.css          # iOS-inspired styling
├── app.js              # Application logic and state management
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker for offline caching
└── README.md           # Project documentation
```

### Core Components

#### 1. Views (Bottom Navigation)
- **Search View**: Search and add books
- **To Read View**: Books to be read
- **Reading View**: Currently reading
- **Read View**: Completed books
- **Settings View**: Configure PasteMyst sync

#### 2. State Management
```javascript
state = {
    books: {
        wantToRead: [],
        reading: [],
        read: []
    },
    currentList: 'wantToRead',
    settings: {
        pasteId: '',
        apiToken: ''
    },
    isSyncing: false
}
```

#### 3. Book Object Structure
```javascript
{
    id: string,           // Google Books ID
    title: string,
    author: string,       // Comma-separated if multiple
    year: string,         // YYYY format
    coverUrl: string,     // Google Books thumbnail URL
    isbn: string,         // Optional
    description: string,  // Optional, HTML may be present
    rating: number        // Optional, 1-10 for books in Read list
}
```

## API Integration

### PasteMyst API

#### Authentication
```javascript
headers: {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
}
```

#### Endpoints

**Fetch Paste**
```
GET https://paste.myst.rs/api/v2/paste/{pasteId}
```
Returns paste object with pasties array containing content.

**Create Paste**
```
POST https://paste.myst.rs/api/v2/paste
Body: {
    "title": "Book Tracker Data",
    "pasties": [{
        "title": "books.tsv",
        "language": "plain text",
        "code": "{tsv content}"
    }]
}
```
Returns paste object with new pasteId.

**Update Paste**
```
PATCH https://paste.myst.rs/api/v2/paste/{pasteId}
Body: {
    "pasties": [{
        "title": "books.tsv",
        "language": "plain text",
        "code": "{tsv content}"
    }]
}
```

#### Error Handling
- 404: Paste not found (invalid ID)
- 401: Unauthorized (invalid token)
- 429: Rate limit exceeded (5 req/sec)
- Network errors: Show error status

### Google Books API
- **Endpoint**: `https://www.googleapis.com/books/v1/volumes`
- **Parameters**: `q` (query), `maxResults=20`, `printType=books`
- **No authentication required** for basic searches
- **Rate limits**: 1000 requests/day per IP (free tier)
- **Error codes**:
  - 429: Rate limit exceeded
  - 403: Quota exceeded

### API Response Mapping
```javascript
// Google Books volumeInfo → App bookData
{
    id: item.id,
    title: volumeInfo.title,
    author: volumeInfo.authors?.join(', ') || 'Unknown Author',
    year: volumeInfo.publishedDate?.substring(0, 4) || 'N/A',
    coverUrl: volumeInfo.imageLinks?.thumbnail || null,
    isbn: volumeInfo.industryIdentifiers?.[0]?.identifier || null,
    description: volumeInfo.description || null
}
```

## Key Features

### 1. Search
- Auto-search with 500ms debounce on input
- Search on Enter key
- 20 results displayed
- Each result shows:
  - Cover image (60x90px)
  - Title, author, year
  - Three list action buttons (icons)
- Tap result to open detail modal
- Tap icon to add directly to list

### 2. Book Lists
- Books displayed as cards with:
  - Cover image (80x120px)
  - Title, author, year
  - Rating (⭐ X/10) - displayed only for Read list books
  - Description (truncated to 150 chars)
  - Three list icons (current one highlighted/active)
  - Delete button (far right)
- Tap card to open detail modal
- Empty state: "No books" message

### 3. Book Detail Modal
- Full-screen overlay with blur backdrop
- Larger cover image (200x300px)
- Complete description
- ISBN display if available
- **Rating input** (1-10) - shown only for books in Read list
- **From search**: Shows 3 list buttons to add book
- **From list**: Shows 3 list buttons (current highlighted) + delete button
- Click outside or X button to close

### 4. Data Persistence

#### Cloud Sync (Primary Storage)
- **Service**: PasteMyst (https://paste.myst.rs)
- **Format**: TSV (Tab-Separated Values) - minimal schema
- **Source of Truth**: PasteMyst paste stores ISBN, list placement, and ratings only
- **Authentication**: Bearer token via API key
- **Endpoint**: https://paste.myst.rs/api/v2
- **Rate Limit**: 5 requests/second
- **Sync Strategy**: Cloud stores essential data only (isbn, list, rating). Full book metadata is fetched from Google Books API on sync and cached locally.

#### TSV Structure
```tsv
isbn	list	rating
9780547928227	wantToRead	
9780451524935	reading	
9780441013593	read	9
```
- **Columns**: isbn, list, rating
- **Delimiter**: Tab character (\t)
- **Encoding**: UTF-8
- **Rating**: Empty for non-Read books, 1-10 for Read books (optional)
- **Data Model**: TSV stores only essential sync data (ISBN as identifier, list placement, rating). All other book metadata (title, author, cover, description) is fetched from Google Books API and cached locally only.

#### Local Storage (Cache)
- localStorage key: `bookTrackerData`
- Saves entire state.books object as JSON
- Loaded on app initialization
- Auto-saves on any book operation
- Syncs to PasteMyst automatically after each save

#### Settings Storage
- localStorage key: `bookTrackerSettings`
- Stores: pasteId, apiToken
- Persists between sessions

### 5. Cloud Sync Flow

#### Initial Setup (Settings View)
1. User enters PasteMyst API token
2. User enters existing Paste ID (or leaves empty for new)
3. Click "Save Settings" → `saveSettings()`
4. If Paste ID empty: `createPaste()` → new paste created
5. Settings saved to localStorage
6. Returns to list view

#### Auto-Sync on Startup
1. App loads → `init()`
2. Loads settings from localStorage
3. If token + pasteId exist: `syncWithPasteMyst(false)`
4. Fetches paste → `fetchPaste(pasteId)`
5. Parses TSV → `tsvToBooks(tsvContent)`
6. For each ISBN in TSV:
   - Check local cache first
   - If not cached, fetch book data from Google Books API
7. Builds complete book objects with cloud ratings
8. Updates state (cloud takes precedence)
9. Updates UI

#### Manual Sync
1. User clicks "Sync Now" button
2. `syncWithPasteMyst(true)` with showStatus=true
3. Shows "Syncing..." status message
4. Fetches paste, parses, updates state
5. Shows success/error status message

#### Push on Change
1. Any book operation (add/move/delete/rate)
2. `saveToLocalStorage()` called (caches full book data locally)
3. Automatically calls `pushToPasteMyst()`
4. Converts books to minimal TSV → `booksToTSV()` (only isbn, list, rating)
5. Updates paste → `updatePaste(pasteId, tsvContent)`
6. Silent push (no UI status shown)
7. Note: Only books with ISBN are synced to cloud

### 6. Toast Notifications
- Success messages for:
  - "Book added!"
  - "Book moved!"
- Error message for duplicates
- 2-second display with fade-out animation

## Styling Guidelines

### Color Palette
```css
--bg-primary: #000000
--bg-secondary: #1c1c1e
--bg-tertiary: #2c2c2e
--text-primary: #ffffff
--text-secondary: #98989d
--text-tertiary: #636366
--accent: #0a84ff
--accent-hover: #409cff
--separator: rgba(84, 84, 88, 0.65)
```

### Typography
- Font: -apple-system, SF Pro Display
- Header: 34px, weight 700, letter-spacing -0.8px
- Book title (card): 17px, weight 600, letter-spacing -0.4px
- Book title (detail): 28px, weight 700, letter-spacing -0.8px
- Description: 13px/15px, line-height 1.4/1.6

### Key Design Patterns
- Border radius: 10-14px (cards), 8-10px (buttons)
- Borders: None or 0.5px separator lines
- Blur: backdrop-filter: blur(20px) for headers/modals
- Shadows: rgba(0, 0, 0, 0.3) for covers
- Animations: cubic-bezier(0.25, 0.46, 0.45, 0.94)

## Icons (SVG)

### List Icons
- **To Read**: Closed book icon
- **Reading**: Open book icon  
- **Read**: Checkmark icon
- **Delete**: Trash bin icon
- **Close**: X icon
- **Search**: Magnifying glass icon

All icons: 18x18px in cards, 24x24px in navigation, stroke-width 2

## Mobile Optimization

### Bottom Navigation
- Fixed position at bottom
- Safe area support: `env(safe-area-inset-bottom)`
- 4 nav items with icons + labels
- Active state with accent color
- Hidden when keyboard open

### Touch Interactions
- Minimum touch target: 36-44px
- `-webkit-tap-highlight-color: transparent`
- Active states: scale(0.95-0.98), opacity 0.7-0.8
- No hover states (touch-first)

### Responsive Breakpoints
- Mobile: < 480px (primary target)
- Landscape: max-height 500px
- Adjusts: font sizes, padding, button sizes

## Common Operations

### Adding a Book
1. Search result click → `addBookToList(book, listName)`
2. Check for duplicates across all lists
3. Push to `state.books[listName]`
4. Save to localStorage
5. Render list
6. Show toast notification

### Moving a Book
1. Click non-active list icon
2. `moveBook(bookId, fromList, toList)`
3. Find book, remove from source, add to target
4. Save to localStorage
5. Render both lists
6. Show toast notification

### Deleting a Book
1. Click delete button
2. `removeBookFromList(bookId, listName)`
3. Filter book out of list
4. Save to localStorage
5. Render list

## PWA Configuration

### Manifest
- Name: "Book Tracker"
- Display: standalone
- Theme: #000000 (black)
- Icons: 192x192, 512x512 (required but placeholder)

### Service Worker
- Cache-first strategy
- Caches: HTML, CSS, JS, manifest, icons
- Cache name: `book-tracker-v1`
- Update: Increment version number in sw.js

## Error Handling

### API Errors
- Display in `.error-message` div with red styling
- Specific messages for:
  - 429: "Rate limit exceeded. Please try again in a few minutes."
  - 403: "API quota exceeded. Daily limit reached. Please try again tomorrow."
  - Network: "Network error. Please check your connection."

### Data Validation
- Check book doesn't exist before adding
- Handle missing book properties (author, description, coverUrl)
- Graceful fallback to placeholder SVG for missing covers

## Future Enhancement Considerations

### Potential Features
- Book notes (add to TSV columns)
- Reading progress percentage
- Reading statistics/analytics
- Export/import TSV files
- Multiple reading lists (expand TSV list column values)
- Search filters (year, genre, language)
- Sort options (title, author, date added)
- Dark/light theme toggle
- Conflict resolution UI for sync conflicts
- Offline queue for sync operations
- Sync history/audit log

### API Alternatives
- Open Library API (original, less reliable)
- ISBN DB API (ISBN-focused)
- Custom backend proxy (for Goodreads scraping)

### Storage Alternatives
- GitHub Gist (similar to PasteMyst, requires GitHub auth)
- Pastebin.com (less developer-friendly API)
- JSONBin.io (JSON-focused, rate limits)
- Firebase Realtime Database (requires account)
- Cloudflare Workers KV (requires account)

### Performance
- Virtual scrolling for large lists
- Image lazy loading
- Search result pagination
- IndexedDB instead of localStorage for local cache
- Debounced sync pushes (batch updates)
- Optimistic UI updates before sync completes
- Delta sync (only send changed books)
- Compression for large TSV files

## Troubleshooting

### Common Issues
1. **Search not working**: Check Google Books API quota
2. **Books not persisting**: Check localStorage availability/quota
3. **Sync not working**: 
   - Verify API token is valid (generate at paste.myst.rs)
   - Check paste ID format (alphanumeric string)
   - Verify rate limits not exceeded (5 req/sec)
   - Check network connectivity
4. **Service Worker not updating**: Increment cache version
5. **Icons not showing**: SVG must be inline in HTML/JS
6. **Modal won't close**: Check event propagation on buttons
7. **Duplicate books after sync**: Cloud sync overrides local data
8. **Book not syncing to cloud**: Book must have ISBN to sync (warning shown on add)
9. **Missing book data after sync**: Ensure Google Books API is accessible to fetch metadata

### Debug Tips
- Check console for errors
- Inspect localStorage: `localStorage.getItem('bookTrackerData')`
- Inspect settings: `localStorage.getItem('bookTrackerSettings')`
- Test Google Books API: Open endpoint URL in browser
- Test PasteMyst API: 
  - GET https://paste.myst.rs/api/v2/paste/{pasteId}
  - Check response in browser DevTools
- View paste content: https://paste.myst.rs/{pasteId}
- Clear cache: Unregister service worker in DevTools
- Force sync: Click "Sync Now" in Settings and watch console

## Code Style Guidelines

### JavaScript
- Use ES6+ features (arrow functions, template literals, destructuring)
- Avoid jQuery or frameworks
- Functions: verb + noun naming (e.g., `showBookDetail`, `addBookToList`)
- Event handlers inline in HTML for simple actions, addEventListener for complex
- No semicolons (consistent with existing code)

### CSS
- Mobile-first approach
- Use CSS variables for colors
- BEM-like naming without strict BEM
- Avoid !important
- Group related styles together

### HTML
- Semantic elements where possible
- Accessibility: title attributes on icon buttons
- SVG icons inline for performance
- No unnecessary divs

## Testing Checklist
- [ ] Search finds books by title
- [ ] Search finds books by author
- [ ] Search finds translated titles
- [ ] Add book to each list
- [ ] Move book between lists
- [ ] Delete book from list
- [ ] Detail modal opens/closes
- [ ] Data persists on reload
- [ ] Works offline (after first load)
- [ ] Bottom nav switches views
- [ ] Toast notifications appear
- [ ] Error handling for API failures
- [ ] Responsive on mobile
- [ ] Safe area handling on notched devices
- [ ] Keyboard doesn't overlap bottom nav
