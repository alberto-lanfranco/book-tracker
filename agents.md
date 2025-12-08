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

#### 2. State Management
```javascript
state = {
    books: {
        wantToRead: [],
        reading: [],
        read: []
    },
    currentList: 'wantToRead'
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
    description: string   // Optional, HTML may be present
}
```

## API Integration

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
- **From search**: Shows 3 list buttons to add book
- **From list**: Shows 3 list buttons (current highlighted) + delete button
- Click outside or X button to close

### 4. Data Persistence
- localStorage key: `bookTrackerData`
- Saves entire state.books object as JSON
- Loaded on app initialization
- Auto-saves on any book operation

### 5. Toast Notifications
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
- Book notes/ratings
- Reading progress percentage
- Reading statistics/analytics
- Export/import data
- Multiple reading lists
- Search filters (year, genre, language)
- Sort options (title, author, date added)
- Dark/light theme toggle
- Authentication + cloud sync

### API Alternatives
- Open Library API (original, less reliable)
- ISBN DB API (ISBN-focused)
- Custom backend proxy (for Goodreads scraping)

### Performance
- Virtual scrolling for large lists
- Image lazy loading
- Search result pagination
- IndexedDB instead of localStorage

## Troubleshooting

### Common Issues
1. **Search not working**: Check Google Books API quota
2. **Books not persisting**: Check localStorage availability/quota
3. **Service Worker not updating**: Increment cache version
4. **Icons not showing**: SVG must be inline in HTML/JS
5. **Modal won't close**: Check event propagation on buttons

### Debug Tips
- Check console for errors
- Inspect localStorage: `localStorage.getItem('bookTrackerData')`
- Test API directly: Open endpoint URL in browser
- Clear cache: Unregister service worker in DevTools

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
