#!/bin/bash
# AnimeVerse Advanced Launcher Script v2.0.0

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR="/opt/animeverse/app"
readonly DATA_DIR="/opt/animeverse/data"
readonly LOG_DIR="/opt/animeverse/logs"
readonly PID_FILE="$DATA_DIR/animeverse.pid"
readonly LOG_FILE="$LOG_DIR/animeverse.log"
readonly PORT_RANGE_START=8000
readonly PORT_RANGE_END=8100
readonly APP_NAME="AnimeVerse"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    case "$level" in
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "INFO")  echo -e "${GREEN}[INFO]${NC} $message" ;;
        "DEBUG") [[ "${VERBOSE:-}" == "1" ]] && echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    exit "${2:-1}"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    log "INFO" "Cleanup initiated with exit code: $exit_code"
    
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log "INFO" "Terminating AnimeVerse server (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                log "WARN" "Force killing AnimeVerse server"
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    exit $exit_code
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Check dependencies
check_dependencies() {
    log "INFO" "Checking system dependencies..."
    
    local missing_deps=()
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    fi
    
    # Check required Python version
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        if [[ $(echo "$python_version < 3.8" | bc -l) -eq 1 ]]; then
            error_exit "Python 3.8 or higher is required. Found: $python_version"
        fi
    fi
    
    # Check for web browser
    local browsers=("firefox" "chromium-browser" "google-chrome" "chrome" "safari" "microsoft-edge")
    local browser_found=false
    for browser in "${browsers[@]}"; do
        if command -v "$browser" &> /dev/null; then
            browser_found=true
            break
        fi
    done
    
    if [[ "$browser_found" == false ]]; then
        log "WARN" "No web browser detected. You may need to manually open the application URL."
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error_exit "Missing dependencies: ${missing_deps[*]}"
    fi
    
    log "INFO" "All dependencies satisfied"
}

# Find available port
find_available_port() {
    log "DEBUG" "Searching for available port in range $PORT_RANGE_START-$PORT_RANGE_END"
    
    for port in $(seq $PORT_RANGE_START $PORT_RANGE_END); do
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "$port"
            return 0
        fi
    done
    
    error_exit "No available ports found in range $PORT_RANGE_START-$PORT_RANGE_END"
}

# Start HTTP server
start_server() {
    local port="${1:-$(find_available_port)}"
    
    log "INFO" "Starting $APP_NAME server on port $port..."
    
    # Change to app directory
    cd "$APP_DIR" || error_exit "Failed to change to app directory: $APP_DIR"
    
    # Start Python HTTP server in background
    nohup python3 -m http.server "$port" --bind 127.0.0.1 > "$LOG_FILE.server" 2>&1 &
    local server_pid=$!
    
    # Save PID
    echo "$server_pid" > "$PID_FILE"
    
    # Wait for server to start
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -s "http://127.0.0.1:$port" >/dev/null 2>&1; then
            log "INFO" "$APP_NAME server started successfully (PID: $server_pid, Port: $port)"
            echo "$port"
            return 0
        fi
        
        sleep 1
        ((attempt++))
        
        if ! kill -0 "$server_pid" 2>/dev/null; then
            error_exit "Server process died unexpectedly"
        fi
    done
    
    error_exit "Server failed to start within ${max_attempts} seconds"
}

# Open browser
open_browser() {
    local url="$1"
    
    log "INFO" "Opening $APP_NAME in web browser: $url"
    
    # Detect and open browser
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url" &
    elif command -v open &> /dev/null; then
        open "$url" &
    elif command -v start &> /dev/null; then
        start "$url" &
    else
        # Try common browsers directly
        local browsers=("firefox" "chromium-browser" "google-chrome" "chrome")
        local browser_opened=false
        
        for browser in "${browsers[@]}"; do
            if command -v "$browser" &> /dev/null; then
                "$browser" "$url" >/dev/null 2>&1 &
                browser_opened=true
                break
            fi
        done
        
        if [[ "$browser_opened" == false ]]; then
            log "WARN" "Could not detect web browser. Please open manually: $url"
            return 1
        fi
    fi
    
    log "INFO" "Browser launched successfully"
}

# Check if already running
check_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log "WARN" "$APP_NAME is already running (PID: $pid)"
            
            # Try to find the port
            local port=$(netstat -tuln 2>/dev/null | grep ":$pid " | head -n1 | awk '{print $4}' | cut -d: -f2)
            if [[ -n "$port" ]]; then
                local url="http://127.0.0.1:$port"
                echo -e "${YELLOW}$APP_NAME is already running at: $url${NC}"
                
                read -p "Would you like to open it in your browser? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    open_browser "$url"
                fi
            fi
            
            return 0
        else
            log "WARN" "Stale PID file found, removing"
            rm -f "$PID_FILE"
        fi
    fi
    
    return 1
}

# Stop server
stop_server() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log "INFO" "Stopping $APP_NAME server (PID: $pid)"
            kill "$pid"
            
            # Wait for graceful shutdown
            local max_attempts=10
            local attempt=0
            
            while [[ $attempt -lt $max_attempts ]] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                ((attempt++))
            done
            
            if kill -0 "$pid" 2>/dev/null; then
                log "WARN" "Force killing $APP_NAME server"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$PID_FILE"
            log "INFO" "$APP_NAME server stopped successfully"
        else
            log "WARN" "$APP_NAME is not running"
            rm -f "$PID_FILE"
        fi
    else
        log "WARN" "$APP_NAME is not running"
    fi
}

# Show status
show_status() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}$APP_NAME is running${NC} (PID: $pid)"
            
            # Try to determine port
            local port_info=$(netstat -tuln 2>/dev/null | grep "127.0.0.1:" | grep LISTEN | head -n1)
            if [[ -n "$port_info" ]]; then
                local port=$(echo "$port_info" | awk '{print $4}' | cut -d: -f2)
                echo -e "URL: ${CYAN}http://127.0.0.1:$port${NC}"
            fi
        else
            echo -e "${RED}$APP_NAME is not running${NC} (stale PID file)"
            rm -f "$PID_FILE"
        fi
    else
        echo -e "${RED}$APP_NAME is not running${NC}"
    fi
}

# Main function
main() {
    # Initialize
    mkdir -p "$DATA_DIR" "$LOG_DIR"
    
    # Parse command line arguments
    local action="${1:-start}"
    
    case "$action" in
        "start")
            log "INFO" "Starting $APP_NAME..."
            check_dependencies
            
            if ! check_running; then
                local port=$(start_server)
                local url="http://127.0.0.1:$port"
                
                echo
                echo -e "${GREEN}🎉 $APP_NAME is now running!${NC}"
                echo -e "📱 URL: ${CYAN}$url${NC}"
                echo -e "🔗 Opening in your default browser..."
                echo
                echo -e "💡 ${YELLOW}Tips:${NC}"
                echo -e "   • Use 'animeverse stop' to stop the server"
                echo -e "   • Use 'animeverse status' to check if it's running"
                echo -e "   • Check logs at: $LOG_FILE"
                echo
                
                # Open browser after a short delay
                sleep 2
                open_browser "$url" || true
                
                echo -e "${PURPLE}Enjoy discovering amazing anime! 📺${NC}"
            fi
            ;;
            
        "stop")
            log "INFO" "Stopping $APP_NAME..."
            stop_server
            ;;
            
        "restart")
            log "INFO" "Restarting $APP_NAME..."
            stop_server
            sleep 2
            exec "$0" start
            ;;
            
        "status")
            show_status
            ;;
            
        "logs")
            if [[ -f "$LOG_FILE" ]]; then
                tail -f "$LOG_FILE"
            else
                echo -e "${YELLOW}No log file found${NC}"
            fi
            ;;
            
        "help"|"-h"|"--help")
            cat << EOF
$APP_NAME Launcher v2.0.0

USAGE:
    $(basename "$0") [COMMAND]

COMMANDS:
    start     Start the AnimeVerse server (default)
    stop      Stop the AnimeVerse server
    restart   Restart the AnimeVerse server
    status    Show server status
    logs      Show live logs
    help      Show this help message

EXAMPLES:
    animeverse          # Start the server
    animeverse start    # Start the server
    animeverse stop     # Stop the server
    animeverse status   # Check if running

LOG FILES:
    Application: $LOG_FILE
    Server:      $LOG_FILE.server

For more information, visit: https://github.com/desmondrawls/animeverse-app
EOF
            ;;
            
        *)
            error_exit "Unknown command: $action. Use 'animeverse help' for usage information."
            ;;
    esac
}

# Run main function
main "$@"
