#!/usr/bin/env bash
# Build RPM package for Fedora/Nobara
# Requires: rpm-build rpmdevtools (dnf install -y rpm-build rpmdevtools)
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="3.0.0"
RELEASE="1"
NAME="animeverse"
SUMMARY="AnimeVerse Enhanced - Anime Streaming & Discovery"
LICENSE="MIT"
URL="https://github.com/DarrylClay2005/animeverse-app"
BUILDROOT="$HOME/rpmbuild"

# Ensure rpmbuild tree exists
if [[ ! -d "$BUILDROOT" ]]; then
  mkdir -p "$BUILDROOT"
fi
mkdir -p "$BUILDROOT/BUILD" "$BUILDROOT/RPMS" "$BUILDROOT/SOURCES" "$BUILDROOT/SPECS" "$BUILDROOT/SRPMS"

# Create source tarball
TARBALL_NAME="${NAME}-${VERSION}.tar.gz"
SRC_TEMP_DIR="$(mktemp -d)"
cp -r "$PROJECT_ROOT" "$SRC_TEMP_DIR/${NAME}-${VERSION}"
# Remove VCS metadata and build artifacts
rm -rf "$SRC_TEMP_DIR/${NAME}-${VERSION}/.git" || true
rm -rf "$SRC_TEMP_DIR/${NAME}-${VERSION}/build" || true

# Tar it
( cd "$SRC_TEMP_DIR" && tar -czf "$BUILDROOT/SOURCES/$TARBALL_NAME" "${NAME}-${VERSION}" )
rm -rf "$SRC_TEMP_DIR"

echo "Creating SPEC file..."
SPEC_FILE="$BUILDROOT/SPECS/${NAME}.spec"
cat > "$SPEC_FILE" <<'SPEC'
Name:           animeverse
Version:        3.1.0
Release:        1%{?dist}
Summary:        AnimeVerse Enhanced - Anime Streaming & Discovery
License:        MIT
URL:            https://github.com/DarrylClay2005/animeverse-app
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch
# No runtime Python dependencies (bundled binary)

%description
AnimeVerse Enhanced brings anime discovery and streaming via Consumet integration.
Includes a Flask backend, modern UI, and HLS playback.

%prep
%setup -q

%build
# No build step needed

%install
rm -rf %{buildroot}
# Install application into /opt/animeverse
mkdir -p %{buildroot}/opt/animeverse
mkdir -p %{buildroot}/opt/animeverse/bin
install -m 0755 dist/animeverse %{buildroot}/opt/animeverse/bin/animeverse
install -m 0755 launch.sh %{buildroot}/opt/animeverse/launch.sh

# Desktop entry
mkdir -p %{buildroot}/usr/share/applications
install -m 0644 assets/animeverse.desktop %{buildroot}/usr/share/applications/animeverse.desktop

# Wrapper to launch app
mkdir -p %{buildroot}/usr/bin
cat > %{buildroot}/usr/bin/animeverse << 'EOF'
#!/usr/bin/env bash
exec /opt/animeverse/launch.sh "$@"
EOF
chmod 0755 %{buildroot}/usr/bin/animeverse

%files
%license LICENSE
%doc README.md
/opt/animeverse
/opt/animeverse/bin/animeverse
/usr/bin/animeverse
/usr/share/applications/animeverse.desktop

%changelog
* Thu Oct 02 2025 AnimeVerse Bot <noreply@example.com> - 3.0.0-1
- Initial Fedora/Nobara RPM release
SPEC

# Build RPM
rpmbuild -ba "$SPEC_FILE"

# Show result paths
echo "RPMs built under: $BUILDROOT/RPMS/"
find "$BUILDROOT/RPMS" -type f -name "*.rpm" -printf "Built: %p\n" || true
