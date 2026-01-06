#!/bin/bash
# install_mac.sh
# One-click installer for VideoText Chrome Extension Native Host on macOS.
# Bypasses Gatekeeper by removing quarantine attributes locally.

set -e

# Configuration
APP_NAME="VideoTextHost"
HOST_NAME="com.video_text.transcriber"
INSTALL_DIR="$HOME/Library/Application Support/$APP_NAME"
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
EDGE_HOSTS_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
ZIP_NAME="video-text-host-macos.zip"
# TODO: Replace with actual release URL when publishing
# Release URL
DOWNLOAD_URL="https://github.com/kangchainx/video-text-chrome-extension/releases/download/v0.1.0/video-text-host-macos.zip"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== VideoText Native Host Installer (macOS) ===${NC}"

# 1. Prepare installation directory
echo -e "\n${YELLOW}[1/5] Preparing installation directory...${NC}"
mkdir -p "$INSTALL_DIR"
echo "Target: $INSTALL_DIR"

# 2. Get the artifacts
echo -e "\n${YELLOW}[2/5] Looking for installation files...${NC}"
if [ -f "$ZIP_NAME" ]; then
    echo "Found local file: $ZIP_NAME"
    cp "$ZIP_NAME" "$INSTALL_DIR/"
else
    # Fallback to downloading
    echo "Local file '$ZIP_NAME' not found."
    echo "Downloading from GitHub..."
    if curl -L -f -o "$INSTALL_DIR/$ZIP_NAME" "$DOWNLOAD_URL"; then
        echo "✅ Download complete."
    else
        echo -e "${RED}Error: Download failed. Please check your internet connection or the URL.${NC}"
        echo "URL: $DOWNLOAD_URL"
        exit 1
    fi
fi

# 3. Extract and Clean
echo -e "\n${YELLOW}[3/5] Installing application...${NC}"
cd "$INSTALL_DIR"
# Unzip quietly, overwrite existing
unzip -o -q "$ZIP_NAME"
rm "$ZIP_NAME"

# 💡 CRITICAL STEP: Remove Quarantine Attributes (Fixes Gatekeeper Delay)
echo -e "${GREEN}>>> Bypassing Gatekeeper security checks...${NC}"
xattr -dr com.apple.quarantine . 2>/dev/null || true
echo "✅ Quarantine attributes removed."

# Set permissions
chmod +x host-macos.sh
chmod +x video-text-transcriber/video-text-transcriber

# Get Extension ID
if [ -f "extension-id.txt" ]; then
    EXTENSION_ID=$(cat extension-id.txt)
else
    echo -e "${RED}Error: extension-id.txt missing from package.${NC}"
    exit 1
fi
echo "Extension ID: $EXTENSION_ID"

# 4. Register Native Host
echo -e "\n${YELLOW}[4/5] Registering with browser...${NC}"

# Generate manifest.json
cat > "$INSTALL_DIR/manifest.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "VideoText Transcriber Native Host",
  "path": "$INSTALL_DIR/host-macos.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

# Install manifest for Chrome
if [ -d "$HOME/Library/Application Support/Google/Chrome" ]; then
    mkdir -p "$CHROME_HOSTS_DIR"
    cp "$INSTALL_DIR/manifest.json" "$CHROME_HOSTS_DIR/$HOST_NAME.json"
    echo "✅ Registered for Google Chrome"
fi

# Install manifest for Edge
if [ -d "$HOME/Library/Application Support/Microsoft Edge" ]; then
    mkdir -p "$EDGE_HOSTS_DIR"
    cp "$INSTALL_DIR/manifest.json" "$EDGE_HOSTS_DIR/$HOST_NAME.json"
    echo "✅ Registered for Microsoft Edge"
fi

# 5. Cleanup & Restart
echo -e "\n${YELLOW}[5/5] Finishing up...${NC}"
# Kill existing process so new one starts on next extension usage
pkill -9 video-text-transcriber 2>/dev/null || true

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}   Installation Successful!   ${NC}"
echo -e "${GREEN}==========================================${NC}"
echo "1. The native host has been installed to:"
echo "   $INSTALL_DIR"
echo "2. Gatekeeper checks have been bypassed."
echo "3. Please reload the VideoText extension in Chrome."
echo ""
