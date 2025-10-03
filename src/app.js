// AnimeVerse Enhanced v3.0.0 - Fixed and Fully Functional Version
'use strict';

// Global state management
const AppState = {
    loading: false,
    animeData: [],
    watchlist: JSON.parse(localStorage.getItem('animeverse_watchlist') || '[]'),
    elements: {},
    cache: new Map(),
    rateQueue: [],
    currentEpisode: null,
    hlsPlayer: null,
    isStreaming: false,
    provider: 'gogoanime'
};

// API configuration
const ApiConfig = {
    baseUrl: '/api',
    consumetUrl: 'https://api.consumet.org',
    rateLimit: 3,
    timeout: 30000,
    retries: 10000
};

// Initialize application
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    // Cache DOM elements
    const elementIds = [
        'hero-search', 'search-btn', 'loading-overlay', 'search-results', 
        'search-grid', 'featured-section', 'featured-grid', 'results-count', 
        'clear-search', 'toast-container', 'detail-modal', 'detail-content', 
        'close-detail', 'player-modal', 'player-video'
    ];
    
    elementIds.forEach(id => {
        AppState.elements[id] = document.getElementById(id);
    });

    // Setup event listeners
    setupEventListeners();
    
    // Load initial content
    loadFeaturedAnime();
    showToast('AnimeVerse Enhanced ready!', 'success');
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(link.dataset.section);
        });
    });

    // Search functionality
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    const searchInput = AppState.elements['hero-search'];
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const query = searchInput.value.trim();
            if (query && query.length >= 2) {
                performSearch();
            }
        }, 500));

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }

    const searchBtn = AppState.elements['search-btn'];
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }

    const clearBtn = AppState.elements['clear-search'];
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }

    // Modal handlers
    const closeDetail = AppState.elements['close-detail'];
    if (closeDetail) {
        closeDetail.addEventListener('click', () => {
            AppState.elements['detail-modal']?.classList.add('hidden');
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-featured');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadFeaturedAnime);
    }

    // Click delegation for anime cards
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.anime-card');
        if (card && card.dataset.animeData) {
            try {
                const animeData = JSON.parse(card.dataset.animeData);
                showAnimeDetails(animeData);
            } catch (err) {
                console.error('Error parsing anime data:', err);
            }
        }
    });
}

// Section switching
function switchSection(section) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        const isActive = link.dataset.section === section;
        link.classList.toggle('active', isActive);
        link.classList.toggle('text-anime-text', isActive);
        link.classList.toggle('text-anime-muted', !isActive);
    });

    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => {
        el.classList.add('hidden');
    });

    // Show/hide hero section
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        heroSection.style.display = section === 'home' ? 'block' : 'none';
    }

    // Show specific section
    const sectionMap = {
        'home': () => showSection('featured-section'),
        'trending': () => showSection('trending-section', loadTrendingAnime),
        'watchlist': () => showSection('watchlist-section', displayWatchlist),
        'search': () => {
            showSection('search-results');
            AppState.elements['hero-search']?.focus();
        }
    };

    const handler = sectionMap[section];
    if (handler) {
        handler();
    }
}

function showSection(sectionId, callback) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('hidden');
        if (callback) {
            callback();
        }
    }
}

// API request functionality
async function apiRequest(endpoint) {
    const url = `${ApiConfig.baseUrl}${endpoint}`;
    const cached = AppState.cache.get(url);
    
    if (cached && Date.now() - cached.timestamp < ApiConfig.timeout) {
        return cached.data;
    }

    await rateLimitDelay();

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ApiConfig.retries);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AnimeVerse/3.0'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        AppState.cache.set(url, { data, timestamp: Date.now() });
        return data;
    } catch (e) {
        if (e.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw e;
    }
}

async function rateLimitDelay() {
    const now = Date.now();
    AppState.rateQueue = AppState.rateQueue.filter(time => now - time < 1000);
    
    if (AppState.rateQueue.length >= ApiConfig.rateLimit) {
        const delay = 1000 - (now - AppState.rateQueue[0]);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    AppState.rateQueue.push(now);
}

// Search functionality
async function performSearch() {
    const searchInput = AppState.elements['hero-search'];
    const query = searchInput?.value.trim();
    
    if (!query || query.length < 2) {
        showToast('Enter at least 2 characters', 'warning');
        return;
    }

    try {
        showLoading('Searching anime...');
        const results = await searchAnime(query);
        displayResults(results, 'search');
        showSearchSection();
        showToast(`Found ${results.length} results`, 'success');
    } catch (e) {
        console.error('Search error:', e);
        showToast('Search failed. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function searchAnime(query) {
    try {
        const data = await apiRequest(`/search?q=${encodeURIComponent(query)}`);
        const results = (data && data.results) || [];
        return results.map(item => ({
            id: item.id,
            provider: item.provider || AppState.provider,
            title: item.title,
            englishTitle: item.english_title || item.title,
            type: item.type || 'Anime',
            episodes: item.episodes,
            year: item.releaseDate || 'Unknown',
            score: 'N/A',
            synopsis: '',
            genres: [],
            rating: '',
            image: item.image || generatePlaceholderImage(item.title),
            url: item.url || '#'
        }));
    } catch (e) {
        console.error('Search API error:', e);
        return getFallbackData(query);
    }
}

function getFallbackData(query) {
    return [{
        id: Date.now().toString(),
        provider: AppState.provider,
        title: `"${query}" - Demo Result`,
        englishTitle: 'Demo Result',
        type: 'TV',
        episodes: 12,
        year: '2024',
        score: '8.5',
        synopsis: 'Demo result when API is unavailable',
        genres: ['Demo'],
        rating: 'PG-13',
        image: generatePlaceholderImage(query),
        url: '#'
    }];
}

function clearSearch() {
    const searchInput = AppState.elements['hero-search'];
    if (searchInput) {
        searchInput.value = '';
    }

    const searchResults = AppState.elements['search-results'];
    if (searchResults) {
        searchResults.classList.add('hidden');
    }

    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        heroSection.style.display = 'block';
    }

    const searchGrid = AppState.elements['search-grid'];
    if (searchGrid) {
        searchGrid.innerHTML = '';
    }
}

function showSearchSection() {
    const searchResults = AppState.elements['search-results'];
    if (searchResults) {
        searchResults.classList.remove('hidden');
    }

    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        heroSection.style.display = 'none';
    }
}

// Featured and trending anime
async function loadFeaturedAnime() {
    try {
        showLoading('Loading featured anime...');
        const data = await apiRequest('/trending');
        const results = processApiData(data.results || []);
        displayResults(results, 'featured');
    } catch (e) {
        console.error('Featured anime error:', e);
        showToast('Failed to load featured anime', 'error');
    } finally {
        hideLoading();
    }
}

async function loadTrendingAnime() {
    try {
        showLoading('Loading trending anime...');
        const data = await apiRequest('/trending');
        const results = processApiData(data.results || []);
        displayResults(results, 'trending');
    } catch (e) {
        console.error('Trending anime error:', e);
        showToast('Failed to load trending anime', 'error');
    } finally {
        hideLoading();
    }
}

function processApiData(arr) {
    return arr.map(item => ({
        id: item.id,
        provider: item.provider || AppState.provider,
        title: item.title,
        englishTitle: item.english_title || item.title,
        type: item.type || 'Anime',
        episodes: item.episodes,
        year: item.releaseDate || 'Unknown',
        score: 'N/A',
        synopsis: '',
        genres: [],
        rating: '',
        image: item.image || generatePlaceholderImage(item.title),
        url: item.url || '#'
    }));
}

// Display functions
function displayResults(results, type) {
    const gridId = `${type === 'search' ? 'search' : type === 'trending' ? 'trending' : 'featured'}-grid`;
    const grid = document.getElementById(gridId);
    
    if (!grid) return;
    
    grid.innerHTML = '';
    AppState.animeData = results;

    const fragment = document.createDocumentFragment();
    results.forEach((anime, index) => {
        fragment.appendChild(createAnimeCard(anime, index));
    });
    
    grid.appendChild(fragment);

    // Update results count for search
    if (type === 'search' && AppState.elements['results-count']) {
        AppState.elements['results-count'].textContent = `${results.length} results`;
    }
}

function createAnimeCard(anime, index) {
    const card = document.createElement('div');
    card.className = 'anime-card bg-anime-secondary rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer';
    card.dataset.animeData = JSON.stringify(anime);
    card.style.animationDelay = `${index * 50}ms`;

    const genres = (anime.genres || []).slice(0, 3).map(genre => 
        `<span class="inline-block bg-anime-accent/20 text-anime-accent text-xs px-2 py-1 rounded-full">${genre}</span>`
    ).join('');

    const scoreElement = anime.score !== 'N/A' ? 
        `<div class="flex items-center text-amber-400">
            <i class="fas fa-star mr-1"></i>
            <span class="text-sm">${anime.score}</span>
        </div>` : '';

    card.innerHTML = `
        <div class="relative">
            <img src="${anime.image}" alt="${anime.title}" class="w-full h-64 object-cover" loading="lazy">
            <div class="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded-full text-xs">${anime.year}</div>
        </div>
        <div class="p-4">
            <h3 class="font-bold text-anime-text mb-2 line-clamp-2 min-h-[3rem]">${anime.title}</h3>
            <div class="flex items-center justify-between mb-2">
                <span class="text-anime-muted text-sm">${anime.type}</span>
                ${scoreElement}
            </div>
            <p class="text-anime-muted text-sm mb-3 line-clamp-3">${(anime.synopsis || 'No synopsis available').substring(0, 120)}...</p>
            <div class="flex flex-wrap gap-1">${genres}</div>
        </div>
    `;

    return card;
}

// Anime details functionality
async function showAnimeDetails(anime) {
    try {
        showLoading('Loading anime details...');
        
        // Fetch detailed info if missing
        let info = anime;
        if (!anime.episodes || !anime.synopsis || !anime.genres || anime.genres.length === 0) {
            const provider = anime.provider || AppState.provider;
            const id = anime.id;
            const detailData = await apiRequest(`/anime/${provider}/${encodeURIComponent(id)}`);
            
            if (detailData) {
                info = {
                    ...anime,
                    title: detailData.title || anime.title,
                    englishTitle: detailData.english_title || anime.englishTitle,
                    synopsis: detailData.synopsis || 'No synopsis available',
                    genres: detailData.genres || [],
                    episodes: detailData.totalEpisodes || detailData.episodes || anime.episodes,
                    image: detailData.image || anime.image,
                    provider: provider,
                    episodes_list: detailData.episodes_list || []
                };
            }
        }

        const genresHtml = (info.genres || []).map(genre => 
            `<span class="inline-block bg-anime-accent/20 text-anime-accent px-3 py-1 rounded-full text-sm">${genre}</span>`
        ).join('');

        const episodeButtons = (info.episodes_list || []).slice(0, 50).map(ep => 
            `<button class="episode-button px-3 py-2 rounded bg-anime-secondary hover:bg-gray-700 border border-gray-700 text-sm transition-all" 
                     onclick="playEpisode('${info.provider || AppState.provider}','${ep.id || ep.episodeId || ep.url || ''}','${ep.number || 1}')">
                EP ${ep.number || 1}
             </button>`
        ).join(' ');

        const isInWatchlist = AppState.watchlist.some(w => w.id === anime.id);

        const content = `
            <div class="flex flex-col lg:flex-row gap-6">
                <img src="${info.image}" alt="${info.title}" class="w-full lg:w-80 h-auto object-cover rounded-lg">
                <div class="flex-1">
                    <h2 class="text-3xl font-bold text-anime-text mb-4">${info.title}</h2>
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div><span class="text-anime-muted">Type:</span><span class="text-anime-text ml-2">${info.type || 'Anime'}</span></div>
                        <div><span class="text-anime-muted">Year:</span><span class="text-anime-text ml-2">${info.year || 'Unknown'}</span></div>
                        <div><span class="text-anime-muted">Episodes:</span><span class="text-anime-text ml-2">${info.episodes || 'Unknown'}</span></div>
                    </div>
                    <div class="mb-4">
                        <h3 class="text-anime-text font-semibold mb-2">Genres:</h3>
                        <div class="flex flex-wrap gap-2">${genresHtml}</div>
                    </div>
                    <div class="flex gap-3 mb-4">
                        <button class="bg-anime-accent hover:bg-anime-accent-hover text-white px-6 py-3 rounded-lg transition-colors flex items-center" 
                                onclick="scrollToEpisodes()">
                            <i class="fas fa-play mr-2"></i>Watch
                        </button>
                        <button class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center" 
                                onclick="toggleWatchlist(${JSON.stringify(anime).replace(/"/g, '&quot;')})">
                            <i class="fas fa-bookmark mr-2"></i>${isInWatchlist ? 'Remove from' : 'Add to'} Watchlist
                        </button>
                    </div>
                </div>
            </div>
            <div class="mt-6">
                <h3 class="text-anime-text font-semibold mb-3">Synopsis</h3>
                <p class="text-anime-muted leading-relaxed">${info.synopsis || 'No synopsis available'}</p>
            </div>
            <div id="episode-list" class="mt-6">
                <h3 class="text-anime-text font-semibold mb-3">Episodes</h3>
                <div class="flex flex-wrap gap-2">
                    ${episodeButtons || '<span class="text-anime-muted">No episodes available</span>'}
                </div>
            </div>
        `;

        AppState.elements['detail-content'].innerHTML = content;
        AppState.elements['detail-modal']?.classList.remove('hidden');
    } catch (e) {
        console.error('Anime details error:', e);
        showToast('Failed to load anime details', 'error');
    } finally {
        hideLoading();
    }
}

function scrollToEpisodes() {
    const episodeList = document.getElementById('episode-list');
    if (episodeList) {
        episodeList.scrollIntoView({ behavior: 'smooth' });
    }
}

// Video player functionality
async function playEpisode(provider, episodeId, epNum) {
    try {
        showLoading(`Loading episode ${epNum}...`);
        
        const data = await apiRequest(`/watch/${provider}/${encodeURIComponent(episodeId)}`);
        const sources = (data && data.sources) || [];
        
        if (!sources.length) {
            showToast('No streaming sources found', 'error');
            return;
        }

        // Find best source (prefer HLS)
        const hlsSource = sources.find(s => s.isM3U8) || 
                         sources.find(s => /m3u8/i.test(s.quality || '')) ||
                         sources[0];

        const video = AppState.elements['player-video'];
        const modal = AppState.elements['player-modal'];
        
        if (!video || !modal) {
            showToast('Video player not available', 'error');
            return;
        }

        // Reset video
        video.pause();
        video.removeAttribute('src');
        video.load();

        // Setup HLS if supported
        if (window.Hls && window.Hls.isSupported() && hlsSource && hlsSource.url && /m3u8/.test(hlsSource.url)) {
            if (AppState.hlsPlayer) {
                AppState.hlsPlayer.destroy();
                AppState.hlsPlayer = null;
            }
            
            AppState.hlsPlayer = new Hls();
            AppState.hlsPlayer.loadSource(hlsSource.url);
            AppState.hlsPlayer.attachMedia(video);
            AppState.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(console.error);
            });
        } else {
            // Fallback to native video
            video.src = hlsSource.url;
            video.play().catch(console.error);
        }

        modal.classList.remove('hidden');
        AppState.isStreaming = true;
        AppState.currentEpisode = episodeId;
        
        showToast(`Playing Episode ${epNum}`, 'success');
    } catch (e) {
        console.error('Streaming error:', e);
        showToast('Failed to load episode. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

function closePlayer() {
    const modal = AppState.elements['player-modal'];
    const video = AppState.elements['player-video'];
    
    if (AppState.hlsPlayer) {
        try {
            AppState.hlsPlayer.destroy();
        } catch (e) {
            console.error('Error destroying HLS player:', e);
        }
        AppState.hlsPlayer = null;
    }
    
    if (video) {
        try {
            video.pause();
        } catch (e) {
            console.error('Error pausing video:', e);
        }
    }
    
    if (modal) {
        modal.classList.add('hidden');
    }
    
    AppState.isStreaming = false;
}

// Watchlist functionality
function displayWatchlist() {
    const grid = document.getElementById('watchlist-grid');
    const empty = document.getElementById('watchlist-empty');
    
    if (!grid || !empty) return;
    
    if (AppState.watchlist.length === 0) {
        empty.classList.remove('hidden');
        grid.classList.add('hidden');
    } else {
        empty.classList.add('hidden');
        grid.classList.remove('hidden');
        displayResults(AppState.watchlist, 'watchlist');
    }
}

function toggleWatchlist(anime) {
    const index = AppState.watchlist.findIndex(w => w.id === anime.id);
    
    if (index > -1) {
        AppState.watchlist.splice(index, 1);
        showToast('Removed from watchlist', 'success');
    } else {
        AppState.watchlist.push(anime);
        showToast('Added to watchlist', 'success');
    }
    
    localStorage.setItem('animeverse_watchlist', JSON.stringify(AppState.watchlist));
    showAnimeDetails(anime); // Refresh the modal
}

// Utility functions
function showLoading(message = 'Loading...') {
    if (AppState.loading) return;
    
    AppState.loading = true;
    const overlay = AppState.elements['loading-overlay'];
    
    if (overlay) {
        overlay.classList.remove('hidden');
        const text = overlay.querySelector('.loading-text');
        if (text) {
            text.textContent = message;
        }
    }
}

function hideLoading() {
    AppState.loading = false;
    const overlay = AppState.elements['loading-overlay'];
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function generatePlaceholderImage(title) {
    const colors = ['ff6b6b', '4ecdc4', '45b7d1', '96ceb4', 'ffeaa7', 'fd79a8', 'fdcb6e'];
    const hash = title.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    const color = colors[Math.abs(hash) % colors.length];
    return `https://via.placeholder.com/400x600/${color}/ffffff?text=${encodeURIComponent(title.substring(0, 20))}`;
}

function showToast(message, type = 'info') {
    const container = AppState.elements['toast-container'];
    if (!container) return;

    const icons = {
        success: 'fa-check-circle text-green-400',
        error: 'fa-exclamation-circle text-red-400',
        warning: 'fa-exclamation-triangle text-yellow-400',
        info: 'fa-info-circle text-blue-400'
    };

    const colors = {
        success: 'bg-green-900/80 border-green-500',
        error: 'bg-red-900/80 border-red-500',
        warning: 'bg-yellow-900/80 border-yellow-500',
        info: 'bg-blue-900/80 border-blue-500'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${colors[type]} backdrop-blur-sm border rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 transform translate-x-full transition-all duration-300`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span class="text-white font-medium">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white ml-2">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.remove('translate-x-full'), 100);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Global functions for onclick handlers
window.playEpisode = playEpisode;
window.closePlayer = closePlayer;
window.toggleWatchlist = toggleWatchlist;
window.scrollToEpisodes = scrollToEpisodes;