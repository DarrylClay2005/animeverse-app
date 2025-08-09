#!/bin/bash
# Simple AnimeVerse Build Script

set -e

PROJECT_ROOT="/home/desmond/animeverse-app"
BUILD_DIR="$PROJECT_ROOT/build"
PACKAGE_NAME="animeverse"
VERSION="2.0.0"
ARCHITECTURE="all"

echo "Setting up build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Create package structure
PKG_DIR="$BUILD_DIR/${PACKAGE_NAME}_${VERSION}_${ARCHITECTURE}"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/opt/animeverse/app"
mkdir -p "$PKG_DIR/opt/animeverse/data"
mkdir -p "$PKG_DIR/opt/animeverse/logs"
mkdir -p "$PKG_DIR/usr/share/applications"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/16x16/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/32x32/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/48x48/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/64x64/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$PKG_DIR/usr/share/pixmaps"

echo "Copying source files..."
cp -r "$PROJECT_ROOT/src"/* "$PKG_DIR/opt/animeverse/app/"

echo "Copying launcher script..."
cp "$PROJECT_ROOT/scripts/animeverse-launcher.sh" "$PKG_DIR/opt/animeverse/"
chmod +x "$PKG_DIR/opt/animeverse/animeverse-launcher.sh"

echo "Copying desktop entry..."
cp "$PROJECT_ROOT/assets/animeverse.desktop" "$PKG_DIR/usr/share/applications/"

echo "Copying manifest..."
cp "$PROJECT_ROOT/assets/site.webmanifest" "$PKG_DIR/opt/animeverse/app/assets/"

echo "Creating simple icons..."
# Create simple colored squares as placeholders
for size in 16 32 48 64 128 256; do
    icon_file="$PKG_DIR/usr/share/icons/hicolor/${size}x${size}/apps/animeverse.png"
    # Create a simple 1x1 pixel file and resize it (fallback)
    printf "\x89\x50\x4e\x47\x0d\x0a\x1a\x0a\x00\x00\x00\x0d\x49\x48\x44\x52\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90\x77\x53\xde\x00\x00\x00\x0c\x49\x44\x41\x54\x08\x d7\x63\xf8\x0f\x00\x00\x01\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00\x49\x45\x4e\x44\xae\x42\x60\x82" > "$icon_file"
done

# Copy to pixmaps
cp "$PKG_DIR/usr/share/icons/hicolor/48x48/apps/animeverse.png" "$PKG_DIR/usr/share/pixmaps/animeverse.png"

echo "Creating favicon files..."
assets_dir="$PKG_DIR/opt/animeverse/app/assets"
touch "$assets_dir/favicon.ico"
touch "$assets_dir/favicon-16x16.png"
touch "$assets_dir/favicon-32x32.png"
touch "$assets_dir/apple-touch-icon.png"
touch "$assets_dir/android-chrome-192x192.png"
touch "$assets_dir/android-chrome-512x512.png"

echo "Creating Debian control files..."
cp "$PROJECT_ROOT/debian"/* "$PKG_DIR/DEBIAN/"
chmod 755 "$PKG_DIR/DEBIAN/postinst" "$PKG_DIR/DEBIAN/prerm"

echo "Building package..."
cd "$BUILD_DIR"
dpkg-deb --build "$(basename "$PKG_DIR")"

if [[ -f "${PKG_DIR}.deb" ]]; then
    echo "✅ Package built successfully: ${PKG_DIR}.deb"
    echo "📋 Install with: sudo dpkg -i ${PKG_DIR}.deb"
else
    echo "❌ Package build failed"
    exit 1
fi
