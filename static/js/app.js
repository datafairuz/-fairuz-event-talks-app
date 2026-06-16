// ==========================================================================
// Application State
// ==========================================================================
let allNotes = [];
let filteredNotes = [];
let currentFilterType = 'all';
let currentSort = 'newest';
let selectedNoteId = null;
let currentDraft = {
    noteId: null,
    text: '',
    defaultText: '',
    link: '',
    type: '',
    date: ''
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchNotes();
    fetchTweetHistory();
    
    // Set up text area height adjustments and character monitoring
    const textarea = document.getElementById('tweet-textarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        });
    }
});

// ==========================================================================
// API Operations
// ==========================================================================

/**
 * Fetch release notes from backend.
 * @param {boolean} forceRefresh - If true, bypasses server-side cache.
 */
async function fetchNotes(forceRefresh = false) {
    showSpinner(true);
    showOverlay('feed-loading', true);
    showOverlay('feed-error', false);
    showOverlay('feed-empty', false);

    try {
        const url = `/api/notes${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            allNotes = data.items;
            
            // Format timestamps for sorting
            allNotes.forEach(note => {
                note.timestamp = new Date(note.updated).getTime();
            });

            updateCategoryCounts();
            filterAndRenderNotes();
            updateLastFetchedStatus(data.fetched_at, data.is_fresh);
            
            if (forceRefresh) {
                showToast("⚡ Feed refreshed successfully!", "success");
            }
        } else {
            throw new Error(data.error || "Failed to load notes");
        }
    } catch (error) {
        console.error("Error fetching release notes:", error);
        document.getElementById('error-message').innerText = error.message || "Failed to contact release feed service.";
        showOverlay('feed-error', true);
        showToast("❌ Error updating feed", "danger");
    } finally {
        showSpinner(false);
        showOverlay('feed-loading', false);
    }
}

/**
 * Fetch logged tweet history.
 */
async function fetchTweetHistory() {
    try {
        const response = await fetch('/api/tweets');
        const data = await response.json();
        
        renderTweetHistory(data);
    } catch (error) {
        console.error("Error fetching tweet history:", error);
    }
}

/**
 * Save tweet locally and open Web Intent.
 */
async function publishTweet() {
    const text = document.getElementById('tweet-textarea').value.trim();
    if (!text) return;
    
    if (text.length > 280) {
        showToast("⚠️ Tweet exceeds character limit!", "warning");
        return;
    }

    const postBtn = document.getElementById('post-btn');
    postBtn.disabled = true;

    try {
        // Log to local history first
        const response = await fetch('/api/tweets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                note_id: currentDraft.noteId,
                note_title: `${currentDraft.type} - ${currentDraft.date}`
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Refresh history count and tab content
            fetchTweetHistory();
            showToast("🐦 Tweet logged in history!", "success");
            
            // Open Twitter web intent
            const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
            window.open(twitterIntentUrl, '_blank', 'width=550,height=420');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error("Error logging tweet:", error);
        showToast("❌ Failed to log tweet in history", "danger");
    } finally {
        postBtn.disabled = false;
    }
}

// ==========================================================================
// Rendering & UI Generation
// ==========================================================================

/**
 * Render notes cards to grid.
 */
function renderNotes() {
    const container = document.getElementById('notes-cards-container');
    container.innerHTML = '';

    if (filteredNotes.length === 0) {
        showOverlay('feed-empty', true);
        return;
    } else {
        showOverlay('feed-empty', false);
    }

    filteredNotes.forEach(note => {
        const isSelected = selectedNoteId === note.id;
        const card = document.createElement('div');
        card.className = `note-card ${isSelected ? 'selected' : ''}`;
        card.setAttribute('data-id', note.id);
        card.setAttribute('data-type', note.type);
        card.onclick = (e) => handleNoteSelect(note.id, e);

        // Render card inner content
        card.innerHTML = `
            <div class="card-header-meta">
                <div class="card-badges">
                    <span class="type-indicator">${note.type}</span>
                    <span class="card-date">${note.date}</span>
                </div>
                <div class="card-actions">
                    <div class="checkbox-select" title="Select for tweeting">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="card-body-content">
                ${note.content_html}
            </div>
            <div class="card-footer-row">
                <a href="${note.link}" target="_blank" class="source-link-tag" onclick="e.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>View Docs</span>
                </a>
                <button class="btn-tweet-now" onclick="triggerImmediateComposer('${note.id}', event)">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>Draft Tweet</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

/**
 * Render history log list.
 * @param {Array} history 
 */
function renderTweetHistory(history) {
    const countBadge = document.getElementById('tweet-history-count');
    const emptyOverlay = document.getElementById('history-empty');
    const container = document.getElementById('history-container');
    
    countBadge.textContent = history.length;
    container.innerHTML = '';

    if (history.length === 0) {
        emptyOverlay.classList.remove('hidden');
        container.classList.add('hidden');
        return;
    }

    emptyOverlay.classList.add('hidden');
    container.classList.remove('hidden');

    history.forEach(tweet => {
        const formattedTime = formatDateString(tweet.timestamp);
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-card-header">
                <span class="history-source-info">Source: <span>${escapeHtml(tweet.note_title || 'Direct Note')}</span></span>
                <span class="history-time">${formattedTime}</span>
            </div>
            <div class="history-tweet-body">${escapeHtml(tweet.text)}</div>
            <div class="history-card-footer">
                <button class="btn-repost-intent" onclick="repostIntent('${escapeJsString(tweet.text)}')">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>Post Again</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================================================
// Filtering, Searching, and Sorting
// ==========================================================================

function filterNotes() {
    const searchVal = document.getElementById('feed-search').value.toLowerCase().trim();
    
    filteredNotes = allNotes.filter(note => {
        // Apply type filter
        const typeMatches = currentFilterType === 'all' || note.type === currentFilterType;
        
        // Apply search query filter
        const searchMatches = !searchVal || 
            note.content_text.toLowerCase().includes(searchVal) ||
            note.type.toLowerCase().includes(searchVal) ||
            note.date.toLowerCase().includes(searchVal);
            
        return typeMatches && searchMatches;
    });

    sortNotes(); // Sort and render
}

function setFilterType(type) {
    currentFilterType = type;
    
    // Update active filter pill
    const pills = document.querySelectorAll('#type-filters .filter-pill');
    pills.forEach(pill => {
        if (pill.getAttribute('data-type') === type) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    filterNotes();
}

function sortNotes() {
    const sortVal = document.getElementById('feed-sort').value;
    currentSort = sortVal;

    filteredNotes.sort((a, b) => {
        if (sortVal === 'newest') {
            return b.timestamp - a.timestamp;
        } else {
            return a.timestamp - b.timestamp;
        }
    });

    renderNotes();
}

function clearFilters() {
    document.getElementById('feed-search').value = '';
    setFilterType('all');
}

/**
 * Recalculate size of each update category type
 */
function updateCategoryCounts() {
    document.getElementById('count-all').textContent = allNotes.length;
    
    const types = ['Feature', 'Changed', 'Deprecated', 'Issue'];
    types.forEach(type => {
        const count = allNotes.filter(n => n.type === type).length;
        const countId = `count-${type.toLowerCase()}`;
        const element = document.getElementById(countId);
        if (element) {
            element.textContent = count;
        }
    });
}

// ==========================================================================
// Note Selection & Tweet Composer Logic
// ==========================================================================

/**
 * Handle selection of note card
 * @param {string} noteId 
 * @param {Event} event 
 */
function handleNoteSelect(noteId, event) {
    // If user clicked View Docs link, don't trigger selection
    if (event.target.closest('a')) return;

    const cards = document.querySelectorAll('.note-card');
    
    if (selectedNoteId === noteId) {
        // Deselect
        selectedNoteId = null;
        cards.forEach(c => c.classList.remove('selected'));
        toggleComposerState(false);
    } else {
        // Select
        selectedNoteId = noteId;
        cards.forEach(c => {
            if (c.getAttribute('data-id') === noteId) {
                c.classList.add('selected');
            } else {
                c.classList.remove('selected');
            }
        });
        
        const selectedNote = allNotes.find(n => n.id === noteId);
        if (selectedNote) {
            loadNoteIntoComposer(selectedNote);
        }
    }
}

/**
 * Directly triggers note selection and focuses/displays the composer
 */
function triggerImmediateComposer(noteId, event) {
    event.stopPropagation(); // Stop click bubbling to card click handler
    
    const selectedNote = allNotes.find(n => n.id === noteId);
    if (!selectedNote) return;

    selectedNoteId = noteId;
    
    // Highlight in grid
    const cards = document.querySelectorAll('.note-card');
    cards.forEach(c => {
        if (c.getAttribute('data-id') === noteId) {
            c.classList.add('selected');
            // Scroll to view if card is partially out of bounds
            c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            c.classList.remove('selected');
        }
    });

    loadNoteIntoComposer(selectedNote);
    
    // Focus composer input
    const textarea = document.getElementById('tweet-textarea');
    if (textarea) {
        textarea.focus();
    }
}

/**
 * Pre-populate the composer details based on selected note.
 * @param {Object} note 
 */
function loadNoteIntoComposer(note) {
    toggleComposerState(true);
    
    // Populate source metadata preview
    document.getElementById('comp-source-type').textContent = note.type;
    document.getElementById('comp-source-date').textContent = note.date;
    document.getElementById('comp-source-preview').textContent = note.content_text;
    
    // Determine target color indicator for source card
    const sourceCard = document.querySelector('.selected-source-card');
    sourceCard.setAttribute('data-type', note.type);

    // Build default tweet text
    // Format: 📢 BigQuery Feature (June 15, 2026):
    // [Text]
    //
    // Read more: [Link]
    const header = `📢 BigQuery ${note.type} (${note.date}):\n`;
    const linkSection = `\n\nRead more: ${note.link}`;
    
    // Calculate max body length based on X limits (280 characters)
    // Links in Twitter count as 23 characters regardless of length, but locally we evaluate absolute string length.
    // To be strictly correct locally, we will truncate the body text to make sure the final string length is <= 280.
    const overhead = header.length + linkSection.length;
    const maxBodyLen = 280 - overhead - 2; // safety padding
    
    let bodyText = note.content_text;
    if (bodyText.length > maxBodyLen) {
        bodyText = bodyText.substring(0, maxBodyLen - 3) + "...";
    }
    
    const defaultTweetText = `${header}${bodyText}${linkSection}`;
    
    currentDraft = {
        noteId: note.id,
        text: defaultTweetText,
        defaultText: defaultTweetText,
        link: note.link,
        type: note.type,
        date: note.date
    };
    
    const textarea = document.getElementById('tweet-textarea');
    textarea.value = defaultTweetText;
    
    // Auto scale textarea height
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
    
    updateTweetLength();
}

/**
 * Restores the composer state back to empty or active.
 */
function toggleComposerState(hasNoteSelected) {
    const activeState = document.getElementById('composer-active-state');
    const emptyState = document.getElementById('composer-empty-state');
    
    if (hasNoteSelected) {
        activeState.classList.remove('hidden');
        emptyState.classList.add('hidden');
    } else {
        activeState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        currentDraft = { noteId: null, text: '', defaultText: '', link: '', type: '', date: '' };
    }
}

/**
 * Handle character counting and circle progress updates
 */
function updateTweetLength() {
    const text = document.getElementById('tweet-textarea').value;
    const len = text.length;
    currentDraft.text = text;

    // Update character counters
    const counterText = document.getElementById('char-counter');
    counterText.textContent = `${len} / 280`;

    // Update warning text if over 280
    const warning = document.getElementById('char-warning');
    const postBtn = document.getElementById('post-btn');
    
    if (len > 280) {
        warning.classList.remove('hidden');
        counterText.style.color = 'var(--danger)';
        postBtn.disabled = true;
    } else {
        warning.classList.add('hidden');
        counterText.style.color = 'var(--text-secondary)';
        postBtn.disabled = len === 0;
    }

    // Update radial SVG progress circle
    const circle = document.getElementById('progress-indicator');
    const radius = 14;
    const circumference = 2 * Math.PI * radius; // ~87.96
    
    const percent = Math.min(100, (len / 280) * 100);
    const offset = circumference - (percent / 100) * circumference;
    
    circle.style.strokeDashoffset = offset;

    // Color progress ring dynamically
    if (len > 280) {
        circle.style.stroke = 'var(--danger)';
    } else if (len >= 240) {
        circle.style.stroke = 'var(--color-deprecated)'; // orange warn
    } else {
        circle.style.stroke = 'var(--primary)'; // blue normal
    }

    // Update live tweet preview body
    const previewBody = document.getElementById('tweet-preview-text');
    previewBody.innerHTML = formatTweetTextPreview(text);
}

/**
 * Restore composer text to the initial default generated template
 */
function resetTweetToDefault() {
    if (!currentDraft.defaultText) return;
    
    const textarea = document.getElementById('tweet-textarea');
    textarea.value = currentDraft.defaultText;
    
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
    
    updateTweetLength();
    showToast("📝 Draft reset to default format", "success");
}

/**
 * Append link to the text if it is missing
 */
function appendShortLink() {
    if (!currentDraft.link) return;
    
    const textarea = document.getElementById('tweet-textarea');
    let text = textarea.value;
    
    // Check if the link already exists in the textarea
    if (text.includes(currentDraft.link)) {
        showToast("ℹ️ Link is already in your draft", "success");
        return;
    }
    
    // Append link with double newline
    textarea.value = text.trim() + `\n\nLink: ${currentDraft.link}`;
    updateTweetLength();
    showToast("🔗 Link appended", "success");
}

/**
 * Convert URLs into clickable anchor styling inside the tweet preview mockup
 */
function formatTweetTextPreview(text) {
    if (!text) return 'Select an update to start composing...';
    
    // HTML escape first to protect against injection in the live preview
    let escapedText = escapeHtml(text);
    
    // Regex for finding URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escapedText.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" onclick="event.preventDefault()">${url}</a>`;
    });
}

// ==========================================================================
// Helper Utilities & Navigation UI
// ==========================================================================

function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab-view');
    tabs.forEach(t => t.classList.remove('active'));
    
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.add('active');

    // Update active state in nav buttons
    document.getElementById('nav-feed-btn').classList.toggle('active', tabId === 'feed');
    document.getElementById('nav-history-btn').classList.toggle('active', tabId === 'history');
}

function showSpinner(show) {
    const refreshBtn = document.getElementById('sidebar-refresh-btn');
    const spinner = document.getElementById('refresh-spinner');
    
    if (show) {
        refreshBtn.disabled = true;
        spinner.classList.add('spinner-icon');
    } else {
        refreshBtn.disabled = false;
        spinner.classList.remove('spinner-icon');
    }
}

function showOverlay(overlayId, show) {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

/**
 * Render last fetched status and timestamp
 */
function updateLastFetchedStatus(isoTimeStr, isFresh) {
    const element = document.getElementById('last-fetched-text');
    if (!isoTimeStr) {
        element.textContent = "Last fetched: Never";
        return;
    }

    const date = new Date(isoTimeStr);
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const timeFormatted = `${hours}:${minutes}`;
    
    element.textContent = `Feed fetched at ${timeFormatted} (${isFresh ? 'Freshly downloaded' : 'Loaded from cache'})`;
}

/**
 * Open X Web Intent for old tweet log item
 */
function repostIntent(text) {
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterIntentUrl, '_blank', 'width=550,height=420');
}

/**
 * Trigger pop-up toast alerts
 * @param {string} message 
 * @param {string} type - 'success', 'warning', 'danger'
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');

    // Select emoji icon based on notification type
    let emoji = '⚡';
    if (type === 'warning') emoji = '⚠️';
    if (type === 'danger') emoji = '❌';

    iconEl.textContent = emoji;
    msgEl.textContent = message;
    
    // Update border color depending on status
    toast.className = 'toast'; // Reset
    if (type === 'danger') toast.style.borderColor = 'var(--danger)';
    else if (type === 'warning') toast.style.borderColor = 'var(--color-deprecated)';
    else toast.style.borderColor = 'var(--success)';

    toast.classList.remove('hidden');
    
    // Slide up/fade out
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

function formatDateString(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function escapeJsString(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}
