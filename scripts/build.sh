#!/bin/bash
# AnimeVerse Build Script v2.0.0

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly BUILD_DIR="$PROJECT_ROOT/build"
readonly PACKAGE_NAME="animeverse"
readonly VERSION="3.0.0"
readonly ARCHITECTURE="all"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging
log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

# Create build directory structure
setup_build_directory() {
    log "Setting up build directory..."
    
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    
    # Create package structure
    local pkg_dir="$BUILD_DIR/${PACKAGE_NAME}_${VERSION}_${ARCHITECTURE}"
    mkdir -p "$pkg_dir"/{DEBIAN,opt/animeverse/{app,data,logs},usr/share/{applications,icons/hicolor/{16x16,32x32,48x48,64x64,128x128,256x256}/apps,pixmaps}}
    
    printf "%s" "$pkg_dir"
}

# Copy source files
copy_source_files() {
    local pkg_dir="$1"
    
    log "Copying source files..."
    
    # Copy application files (frontend)
    cp -r "$PROJECT_ROOT/src"/* "$pkg_dir/opt/animeverse/app/"

    # Copy backend
    mkdir -p "$pkg_dir/opt/animeverse/backend"
    cp -r "$PROJECT_ROOT/backend"/* "$pkg_dir/opt/animeverse/backend/"

    # Copy launcher scripts
    cp "$PROJECT_ROOT/launch.sh" "$pkg_dir/opt/animeverse/"
    chmod +x "$pkg_dir/opt/animeverse/launch.sh"
    # Keep legacy launcher for compatibility
    cp "$PROJECT_ROOT/scripts/animeverse-launcher.sh" "$pkg_dir/opt/animeverse/" || true
    chmod +x "$pkg_dir/opt/animeverse/animeverse-launcher.sh" || true

    # Copy desktop entry
    cp "$PROJECT_ROOT/assets/animeverse.desktop" "$pkg_dir/usr/share/applications/"

    # Copy manifest
    mkdir -p "$pkg_dir/opt/animeverse/app/assets"
    cp "$PROJECT_ROOT/assets/site.webmanifest" "$pkg_dir/opt/animeverse/app/assets/"
}

# Generate placeholder icons
generate_icons() {
    local pkg_dir="$1"
    
    log "Generating application icons..."
    
    # Create a simple SVG icon
    local svg_content='<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0f0f0f" rx="64"/>
  <circle cx="256" cy="256" r="180" fill="#ff6b35" opacity="0.1"/>
  <circle cx="256" cy="256" r="120" fill="#ff6b35" opacity="0.2"/>
  <circle cx="256" cy="256" r="60" fill="#ff6b35"/>
  <text x="256" y="320" font-family="Arial, sans-serif" font-size="180" font-weight="bold" fill="#ffffff" text-anchor="middle">📺</text>
</svg>'
    
    # Save SVG
    echo "$svg_content" > "$pkg_dir/opt/animeverse/app/assets/animeverse.svg"
    
    # Create simple PNG placeholders for different sizes
    local sizes=(16 32 48 64 128 256)
    for size in "${sizes[@]}"; do
        local icon_dir="$pkg_dir/usr/share/icons/hicolor/${size}x${size}/apps"
        
        # Create a simple colored square as placeholder
        convert -size "${size}x${size}" xc:"#ff6b35" \
                -pointsize $((size/4)) -fill white -gravity center \
                -annotate +0+0 "📺" \
                "$icon_dir/animeverse.png" 2>/dev/null || {
            # Fallback: create a simple colored square
            convert -size "${size}x${size}" xc:"#ff6b35" "$icon_dir/animeverse.png" 2>/dev/null || {
                # Ultimate fallback: copy from system if available
                if [[ -f "/usr/share/pixmaps/image-x-generic.png" ]]; then
                    cp "/usr/share/pixmaps/image-x-generic.png" "$icon_dir/animeverse.png"
                else
                    # Create empty file as last resort
                    touch "$icon_dir/animeverse.png"
                fi
            }
        }
    done
    
    # Copy to pixmaps for older systems
    cp "$pkg_dir/usr/share/icons/hicolor/48x48/apps/animeverse.png" "$pkg_dir/usr/share/pixmaps/animeverse.png" 2>/dev/null || true
}

# Create favicon files
create_favicon_files() {
    local pkg_dir="$1"
    local assets_dir="$pkg_dir/opt/animeverse/app/assets"
    
    log "Creating favicon files..."
    
    mkdir -p "$assets_dir"
    
    # Create simple favicon.ico (16x16)
    if command -v convert >/dev/null 2>&1; then
        convert -size 16x16 xc:"#ff6b35" "$assets_dir/favicon.ico" 2>/dev/null || {
            touch "$assets_dir/favicon.ico"
        }
        
        # Create other favicon sizes
        convert -size 16x16 xc:"#ff6b35" "$assets_dir/favicon-16x16.png" 2>/dev/null || touch "$assets_dir/favicon-16x16.png"
        convert -size 32x32 xc:"#ff6b35" "$assets_dir/favicon-32x32.png" 2>/dev/null || touch "$assets_dir/favicon-32x32.png"
        convert -size 180x180 xc:"#ff6b35" "$assets_dir/apple-touch-icon.png" 2>/dev/null || touch "$assets_dir/apple-touch-icon.png"
        convert -size 192x192 xc:"#ff6b35" "$assets_dir/android-chrome-192x192.png" 2>/dev/null || touch "$assets_dir/android-chrome-192x192.png"
        convert -size 512x512 xc:"#ff6b35" "$assets_dir/android-chrome-512x512.png" 2>/dev/null || touch "$assets_dir/android-chrome-512x512.png"
    else
        # Create empty files if ImageMagick not available
        touch "$assets_dir"/{favicon.ico,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png}
    fi
}

# Create Debian control files
create_debian_files() {
    local pkg_dir="$1"
    
    log "Creating Debian package files..."
    
    # Copy control files
    cp "$PROJECT_ROOT/debian"/* "$pkg_dir/DEBIAN/"
    
    # Make scripts executable
    chmod 755 "$pkg_dir/DEBIAN/postinst" "$pkg_dir/DEBIAN/prerm"
    
    # Calculate installed size
    local size_kb=$(du -sk "$pkg_dir" | cut -f1)
    
    # Update control file with calculated size
    sed -i "s/^Installed-Size:.*/Installed-Size: $size_kb/" "$pkg_dir/DEBIAN/control" 2>/dev/null || true
}

# Build the package
build_package() {
    local pkg_dir="$1"
    
    log "Building Debian package..."
    
    cd "$BUILD_DIR"
    
    # Build the package
    dpkg-deb --build "$(basename "$pkg_dir")" || error "Failed to build package"
    
    # Verify the package
    local deb_file="${pkg_dir}.deb"
    if [[ -f "$deb_file" ]]; then
        log "Package built successfully: $(basename "$deb_file")"
        
        # Show package info
        echo
        log "Package Information:"
        dpkg-deb --info "$deb_file" | head -20
        
        # Show package contents
        echo
        log "Package Contents:"
        dpkg-deb --contents "$deb_file" | head -20
        if [[ $(dpkg-deb --contents "$deb_file" | wc -l) -gt 20 ]]; then
            echo "... and $(( $(dpkg-deb --contents "$deb_file" | wc -l) - 20 )) more files"
        fi
        
        return 0
    else
        error "Package file not created"
    fi
}

# Cleanup temporary files
cleanup() {
    log "Cleaning up temporary files..."
    # Keep the final .deb file but clean up the build directory structure
    find "$BUILD_DIR" -type d -name "${PACKAGE_NAME}_*" -exec rm -rf {} + 2>/dev/null || true
}

# Main build function
main() {
    log "Starting AnimeVerse v$VERSION build process..."
    
    # Check dependencies
    if ! command -v dpkg-deb >/dev/null 2>&1; then
        error "dpkg-deb is required but not installed. Please install dpkg-dev package."
    fi
    
    # Setup build environment
    local pkg_dir=$(setup_build_directory)
    
    # Build process
    copy_source_files "$pkg_dir"
    generate_icons "$pkg_dir"
    create_favicon_files "$pkg_dir"
    create_debian_files "$pkg_dir"
    build_package "$pkg_dir"
    cleanup
    
    echo
    log "🎉 Build completed successfully!"
    log "📦 Package: $BUILD_DIR/${PACKAGE_NAME}_${VERSION}_${ARCHITECTURE}.deb"
    log "📋 Install with: sudo dpkg -i $BUILD_DIR/${PACKAGE_NAME}_${VERSION}_${ARCHITECTURE}.deb"
    echo
}

# Run main function
main "$@"
