#!/bin/bash
# AnimeVerse Enhanced Launcher Script v3.0.0
# Integrated Consumet API for anime streaming

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKEND_DIR="$SCRIPT_DIR/backend"
readonly SRC_DIR="$SCRIPT_DIR/src"
readonly REQUIREMENTS_FILE="$BACKEND_DIR/requirements.txt"
readonly APP_NAME="AnimeVerse Enhanced"
readonly DEFAULT_PORT=8000
readonly DEFAULT_HOST="127.0.0.1"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m' # No Color

# Logging
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "INFO")  echo -e "${GREEN}[INFO]${NC} $message" ;;
        "DEBUG") echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    exit "${2:-1}"
}

# Check dependencies
check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        error_exit "Python 3 is required but not installed"
    fi
    
    # Check Python version (3.8+)
    local python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    if [[ $(echo "$python_version < 3.8" | bc -l 2>/dev/null || echo "1") -eq 1 ]]; then
        error_exit "Python 3.8 or higher is required. Found: $python_version"
    fi
    
    # Check pip
    if ! python3 -m pip --version &> /dev/null; then
        log "WARN" "pip not found, attempting to install..."
        python3 -m ensurepip --default-pip || error_exit "Failed to install pip"
    fi
    
    log "INFO" "Dependencies check passed"
}

# Verify required Python modules are available
verify_python_modules() {
    python3 - <<'PY'
try:
    import flask, requests
except Exception as e:
    import sys
    print("[ERROR] Missing Python modules. Please install system packages:", file=sys.stderr)
    print("        Debian/Ubuntu: sudo apt install -y python3-flask python3-requests", file=sys.stderr)
    print("        Fedora/Nobara: sudo dnf install -y python3-flask python3-requests", file=sys.stderr)
    sys.exit(1)
print("OK")
PY
}

# Find available port
find_available_port() {
    local start_port=${1:-$DEFAULT_PORT}
    local end_port=$((start_port + 50))
    
    for port in $(seq $start_port $end_port); do
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "$port"
            return 0
        fi
    done
    
    error_exit "No available ports found in range $start_port-$end_port"
}

# Start the application
start_app() {
    local host="${1:-$DEFAULT_HOST}"
    local port="${2:-$(find_available_port)}"
    local debug="${3:-false}"
    
    log "INFO" "Starting $APP_NAME..."
    log "INFO" "Host: $host"
    log "INFO" "Port: $port"
    log "INFO" "Debug mode: $debug"
    
    # Change to backend directory
    cd "$BACKEND_DIR" || error_exit "Failed to change to backend directory"
    
    # Set environment variables
    export FLASK_APP="app.py"
    export FLASK_ENV="${debug:+development}"
    
    # Start the Flask app
    local debug_flag=""
    if [[ "$debug" == "true" ]]; then
        debug_flag="--debug"
    fi
    
    log "INFO" "Starting Flask server..."
    python3 app.py --host "$host" --port "$port" $debug_flag &
    local server_pid=$!
    
    # Wait a moment for server to start
    sleep 3
    
    # Check if server is running
    if ! kill -0 "$server_pid" 2>/dev/null; then
        error_exit "Server failed to start"
    fi
    
    # Test server connectivity
    if curl -s "http://$host:$port/api/health" >/dev/null 2>&1; then
        log "INFO" "Server started successfully (PID: $server_pid)"
        log "INFO" "Application URL: http://$host:$port"
        
        # Open browser
        open_browser "http://$host:$port"
        
        # Wait for server
        wait "$server_pid"
    else
        error_exit "Server health check failed"
    fi
}

# Open browser
open_browser() {
    local url="$1"
    
    log "INFO" "Opening browser: $url"
    
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url" &
    elif command -v open &> /dev/null; then
        open "$url" &
    elif command -v start &> /dev/null; then
        start "$url" &
    else
        log "WARN" "Could not detect browser. Please open manually: $url"
    fi
}

# Setup function
setup() {
    log "INFO" "Setting up $APP_NAME..."
    
    check_dependencies
    verify_python_modules
    
    log "INFO" "Setup completed successfully!"
}

# Clean function
clean() {
    log "INFO" "Cleaning up..."
    
    # Remove cache files
    find "$SCRIPT_DIR" -name "*.pyc" -delete 2>/dev/null || true
    find "$SCRIPT_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Remove database
    if [[ -f "$BACKEND_DIR/animeverse.db" ]]; then
        rm -f "$BACKEND_DIR/animeverse.db"
        log "INFO" "Removed database"
    fi
    
    log "INFO" "Cleanup completed"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    start       Start the application (default)
    setup       Setup dependencies and environment
    clean       Clean up files and virtual environment
    help        Show this help message

Options for start:
    --host HOST     Host to bind to (default: $DEFAULT_HOST)
    --port PORT     Port to bind to (default: auto-detect)
    --debug         Enable debug mode

Examples:
    $0                          # Start with default settings
    $0 start                    # Same as above
    $0 start --debug            # Start in debug mode
    $0 start --host 0.0.0.0     # Start and bind to all interfaces
    $0 setup                    # Verify dependencies
    $0 clean                    # Clean up

EOF
}

# Main function
main() {
    local command="start"
    local host="$DEFAULT_HOST"
    local port=""
    local debug="false"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            start|setup|clean|help)
                command="$1"
                shift
                ;;
            --host)
                host="$2"
                shift 2
                ;;
            --port)
                port="$2"
                shift 2
                ;;
            --debug)
                debug="true"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log "ERROR" "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Execute command
    case "$command" in
        start)
            setup  # Always setup before starting
            start_app "$host" "${port:-$(find_available_port)}" "$debug"
            ;;
        setup)
            setup
            ;;
        clean)
            clean
            ;;
        help)
            usage
            ;;
        *)
            log "ERROR" "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Trap cleanup
trap 'log "INFO" "Shutting down..."; kill $(jobs -p) 2>/dev/null || true' EXIT INT TERM

# Run main function
main "$@"