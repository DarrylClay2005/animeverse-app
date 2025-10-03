#!/usr/bin/env python3
"""
AnimeVerse Enhanced Backend with Consumet API Integration
Provides streaming capabilities and enhanced anime discovery
"""

import os
import sys
import json
import time
import requests
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from urllib.parse import quote, unquote
from flask import Flask, request, jsonify, render_template, send_from_directory
import sqlite3
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_folder='../src', template_folder='../src')

# Enable CORS for all domains on all routes
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    return response

# Configuration
class Config:
    # API URLs
    CONSUMET_BASE_URL = "https://api.consumet.org"
    JIKAN_BASE_URL = "https://api.jikan.moe/v4"
    
    # Default provider for streaming
    DEFAULT_PROVIDER = "gogoanime"
    BACKUP_PROVIDERS = ["zoro", "9anime", "animepahe"]
    
    # Rate limiting
    CONSUMET_RATE_LIMIT = 0.5  # seconds between requests
    JIKAN_RATE_LIMIT = 0.3
    
    # Cache settings
    CACHE_DURATION = 3600  # 1 hour for anime info
    EPISODE_CACHE_DURATION = 1800  # 30 minutes for episodes
    
    # Database
    DATABASE_PATH = "animeverse.db"

# Global session and cache
session: Optional[aiohttp.ClientSession] = None
cache_db_lock = threading.Lock()

@dataclass
class AnimeInfo:
    id: str
    title: str
    english_title: Optional[str]
    synopsis: str
    genres: List[str]
    episodes: int
    year: int
    score: float
    image: str
    status: str
    type: str
    total_episodes: int
    provider: str = "consumet"

@dataclass 
class Episode:
    id: str
    number: int
    title: str
    url: str

@dataclass
class StreamingLink:
    url: str
    quality: str
    isM3U8: bool

# Database initialization
def init_database():
    """Initialize SQLite database for caching"""
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS anime_cache (
                id TEXT PRIMARY KEY,
                provider TEXT,
                data TEXT,
                cached_at TIMESTAMP,
                expires_at TIMESTAMP
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS episode_cache (
                anime_id TEXT,
                provider TEXT,
                episode_number INTEGER,
                data TEXT,
                cached_at TIMESTAMP,
                expires_at TIMESTAMP,
                PRIMARY KEY (anime_id, provider, episode_number)
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS streaming_cache (
                episode_id TEXT PRIMARY KEY,
                provider TEXT,
                data TEXT,
                cached_at TIMESTAMP,
                expires_at TIMESTAMP
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anime_id TEXT,
                title TEXT,
                image TEXT,
                current_episode INTEGER DEFAULT 1,
                total_episodes INTEGER,
                status TEXT DEFAULT 'watching',
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        logger.info("Database initialized successfully")

# Cache management
def get_from_cache(key: str, table: str = "anime_cache") -> Optional[dict]:
    """Retrieve data from cache if not expired"""
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        cursor = conn.execute(
            f"SELECT data FROM {table} WHERE id = ? AND expires_at > datetime('now')",
            (key,)
        )
        result = cursor.fetchone()
        if result:
            return json.loads(result[0])
    return None

def save_to_cache(key: str, data: dict, table: str = "anime_cache", duration: int = Config.CACHE_DURATION):
    """Save data to cache with expiration"""
    expires_at = datetime.now() + timedelta(seconds=duration)
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        conn.execute(
            f"INSERT OR REPLACE INTO {table} (id, provider, data, cached_at, expires_at) VALUES (?, ?, ?, datetime('now'), ?)",
            (key, data.get('provider', 'unknown'), json.dumps(data), expires_at.isoformat())
        )

# HTTP Client management
async def get_session() -> aiohttp.ClientSession:
    """Get or create aiohttp session"""
    global session
    if session is None or session.closed:
        timeout = aiohttp.ClientTimeout(total=30)
        session = aiohttp.ClientSession(timeout=timeout)
    return session

async def close_session():
    """Close aiohttp session"""
    global session
    if session and not session.closed:
        await session.close()

# API Request helpers
async def make_request(url: str, params: Dict = None) -> Optional[Dict]:
    """Make async HTTP request with error handling"""
    try:
        session = await get_session()
        async with session.get(url, params=params) as response:
            if response.status == 200:
                return await response.json()
            else:
                logger.error(f"HTTP {response.status} for {url}")
                return None
    except Exception as e:
        logger.error(f"Request failed for {url}: {str(e)}")
        return None

# Consumet API functions
async def search_anime_consumet(query: str, provider: str = Config.DEFAULT_PROVIDER) -> List[Dict]:
    """Search anime using Consumet API"""
    cache_key = f"search_{provider}_{query.lower()}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached.get('results', [])
    
    url = f"{Config.CONSUMET_BASE_URL}/anime/{provider}/{quote(query)}"
    data = await make_request(url)
    
    if data and 'results' in data:
        # Process and clean results
        results = []
        for item in data['results']:
            result = {
                'id': item.get('id', ''),
                'title': item.get('title', ''),
                'english_title': item.get('title', ''),
                'image': item.get('image', ''),
                'releaseDate': item.get('releaseDate', ''),
                'status': item.get('status', 'Unknown'),
                'provider': provider,
                'url': f"/anime/{provider}/{item.get('id', '')}"
            }
            results.append(result)
        
        # Cache results
        cache_data = {'results': results, 'provider': provider}
        save_to_cache(cache_key, cache_data, duration=1800)  # 30 min cache for searches
        
        return results
    
    return []

async def get_anime_info_consumet(anime_id: str, provider: str = Config.DEFAULT_PROVIDER) -> Optional[Dict]:
    """Get detailed anime information from Consumet"""
    cache_key = f"info_{provider}_{anime_id}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached
    
    url = f"{Config.CONSUMET_BASE_URL}/anime/{provider}/info/{anime_id}"
    data = await make_request(url)
    
    if data:
        # Clean and structure the data
        info = {
            'id': data.get('id', ''),
            'title': data.get('title', ''),
            'english_title': data.get('title', ''),
            'synopsis': data.get('description', ''),
            'genres': data.get('genres', []),
            'episodes': len(data.get('episodes', [])),
            'totalEpisodes': data.get('totalEpisodes', 0),
            'year': data.get('releaseDate', '').split('-')[0] if data.get('releaseDate') else 'Unknown',
            'score': data.get('rating', 0),
            'image': data.get('image', ''),
            'status': data.get('status', 'Unknown'),
            'type': data.get('type', 'Unknown'),
            'episodes_list': data.get('episodes', []),
            'provider': provider
        }
        
        save_to_cache(cache_key, info)
        return info
    
    return None

async def get_episode_streaming_links(episode_id: str, provider: str = Config.DEFAULT_PROVIDER) -> Optional[Dict]:
    """Get streaming links for specific episode"""
    cache_key = f"stream_{provider}_{episode_id}"
    cached = get_from_cache(cache_key, "streaming_cache")
    if cached:
        return cached
    
    url = f"{Config.CONSUMET_BASE_URL}/anime/{provider}/watch/{episode_id}"
    data = await make_request(url)
    
    if data:
        # Structure streaming data
        streaming_info = {
            'sources': data.get('sources', []),
            'subtitles': data.get('subtitles', []),
            'intro': data.get('intro', {}),
            'outro': data.get('outro', {}),
            'provider': provider
        }
        
        save_to_cache(cache_key, streaming_info, "streaming_cache", Config.EPISODE_CACHE_DURATION)
        return streaming_info
    
    return None

# Fallback to multiple providers
async def search_with_fallback(query: str) -> List[Dict]:
    """Search across multiple providers as fallback"""
    all_results = []
    
    # Try default provider first
    results = await search_anime_consumet(query, Config.DEFAULT_PROVIDER)
    if results:
        all_results.extend(results)
    
    # If we don't have enough results, try backup providers
    if len(all_results) < 10:
        for provider in Config.BACKUP_PROVIDERS:
            try:
                backup_results = await search_anime_consumet(query, provider)
                all_results.extend(backup_results)
                await asyncio.sleep(Config.CONSUMET_RATE_LIMIT)  # Rate limiting
            except Exception as e:
                logger.error(f"Backup provider {provider} failed: {str(e)}")
                continue
    
    # Remove duplicates based on title similarity
    seen_titles = set()
    unique_results = []
    for result in all_results:
        title_key = result['title'].lower().strip()
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_results.append(result)
    
    return unique_results[:20]  # Limit to 20 results

# Flask routes
@app.route('/')
def index():
    """Serve main application"""
    return render_template('index.html')

@app.route('/api/search')
async def api_search():
    """API endpoint for anime search"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'error': 'Query must be at least 2 characters'}), 400
    
    try:
        results = await search_with_fallback(query)
        return jsonify({
            'results': results,
            'total': len(results),
            'query': query
        })
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({'error': 'Search failed'}), 500

@app.route('/api/anime/<provider>/<anime_id>')
async def api_anime_info(provider, anime_id):
    """Get detailed anime information"""
    try:
        info = await get_anime_info_consumet(anime_id, provider)
        if info:
            return jsonify(info)
        else:
            return jsonify({'error': 'Anime not found'}), 404
    except Exception as e:
        logger.error(f"Info error: {str(e)}")
        return jsonify({'error': 'Failed to fetch anime info'}), 500

@app.route('/api/watch/<provider>/<episode_id>')
async def api_watch_episode(provider, episode_id):
    """Get streaming links for episode"""
    try:
        streaming_info = await get_episode_streaming_links(episode_id, provider)
        if streaming_info:
            return jsonify(streaming_info)
        else:
            return jsonify({'error': 'Episode not found'}), 404
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
        return jsonify({'error': 'Failed to fetch streaming links'}), 500

@app.route('/api/trending')
async def api_trending():
    """Get trending anime (using gogoanime top airing)"""
    try:
        url = f"{Config.CONSUMET_BASE_URL}/anime/gogoanime/top-airing"
        data = await make_request(url)
        
        if data and 'results' in data:
            results = data['results'][:20]  # Limit to top 20
            return jsonify({
                'results': results,
                'total': len(results)
            })
        else:
            return jsonify({'results': [], 'total': 0})
    except Exception as e:
        logger.error(f"Trending error: {str(e)}")
        return jsonify({'error': 'Failed to fetch trending anime'}), 500

@app.route('/api/recent')
async def api_recent():
    """Get recent episodes"""
    try:
        url = f"{Config.CONSUMET_BASE_URL}/anime/gogoanime/recent-episodes"
        data = await make_request(url)
        
        if data and 'results' in data:
            results = data['results'][:20]
            return jsonify({
                'results': results,
                'total': len(results)
            })
        else:
            return jsonify({'results': [], 'total': 0})
    except Exception as e:
        logger.error(f"Recent episodes error: {str(e)}")
        return jsonify({'error': 'Failed to fetch recent episodes'}), 500

# Watchlist endpoints
@app.route('/api/watchlist', methods=['GET'])
def api_get_watchlist():
    """Get user's watchlist"""
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        cursor = conn.execute("""
            SELECT anime_id, title, image, current_episode, total_episodes, status, added_at
            FROM user_watchlist
            ORDER BY added_at DESC
        """)
        watchlist = []
        for row in cursor.fetchall():
            watchlist.append({
                'id': row[0],
                'title': row[1],
                'image': row[2],
                'currentEpisode': row[3],
                'totalEpisodes': row[4],
                'status': row[5],
                'addedAt': row[6]
            })
        return jsonify({'watchlist': watchlist, 'total': len(watchlist)})

@app.route('/api/watchlist', methods=['POST'])
def api_add_to_watchlist():
    """Add anime to watchlist"""
    data = request.get_json()
    required_fields = ['anime_id', 'title', 'image']
    
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO user_watchlist
                (anime_id, title, image, total_episodes, status)
                VALUES (?, ?, ?, ?, ?)
            """, (
                data['anime_id'],
                data['title'],
                data['image'],
                data.get('total_episodes', 0),
                data.get('status', 'watching')
            ))
            return jsonify({'success': True, 'message': 'Added to watchlist'})
        except Exception as e:
            logger.error(f"Watchlist add error: {str(e)}")
            return jsonify({'error': 'Failed to add to watchlist'}), 500

@app.route('/api/watchlist/<anime_id>', methods=['DELETE'])
def api_remove_from_watchlist(anime_id):
    """Remove anime from watchlist"""
    with sqlite3.connect(Config.DATABASE_PATH) as conn:
        try:
            cursor = conn.execute("DELETE FROM user_watchlist WHERE anime_id = ?", (anime_id,))
            if cursor.rowcount > 0:
                return jsonify({'success': True, 'message': 'Removed from watchlist'})
            else:
                return jsonify({'error': 'Anime not found in watchlist'}), 404
        except Exception as e:
            logger.error(f"Watchlist remove error: {str(e)}")
            return jsonify({'error': 'Failed to remove from watchlist'}), 500

# Health check
@app.route('/api/health')
def api_health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '3.0.0'
    })

# Static files
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory(app.static_folder, filename)

# Error handlers
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

# Application lifecycle
def run_app(host='127.0.0.1', port=8000, debug=False):
    """Run the Flask application"""
    init_database()
    logger.info(f"Starting AnimeVerse Enhanced Backend on {host}:{port}")
    
    try:
        app.run(host=host, port=port, debug=debug, threaded=True)
    finally:
        # Cleanup
        asyncio.run(close_session())

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='AnimeVerse Enhanced Backend')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    run_app(args.host, args.port, args.debug)