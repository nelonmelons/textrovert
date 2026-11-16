#!/bin/bash
# Builds build/Textrovert.app with a pinned, checksum-verified copy of imessage-exporter inside it, plus
# build/textrovert-upload (the same export and upload without a window).
set -euo pipefail
cd "$(dirname "$0")"

EXPORTER_VERSION=5.0.1
case "$(uname -m)" in
  arm64) EXPORTER_TARGET=aarch64-apple-darwin EXPORTER_SHA256=8c81117e1cb6d6e724d438e58a7db0a02995834268483a872362fbbdfc011067 ;;
  x86_64) EXPORTER_TARGET=x86_64-apple-darwin EXPORTER_SHA256=091b52e7deac607b2a7b51bbc0d08353ff93d0e8b88114f3057ac6ca0b84a6ad ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

VENDOR=".build/vendor/imessage-exporter-$EXPORTER_VERSION-$EXPORTER_TARGET"
if [ ! -x "$VENDOR/imessage-exporter" ]; then
  mkdir -p "$VENDOR"
  curl -fsSL -o "$VENDOR/download" "https://github.com/ReagentX/imessage-exporter/releases/download/$EXPORTER_VERSION/imessage-exporter-$EXPORTER_TARGET"
  echo "$EXPORTER_SHA256  $VENDOR/download" | shasum -a 256 -c -
  curl -fsSL -o "$VENDOR/LICENSE" "https://raw.githubusercontent.com/ReagentX/imessage-exporter/$EXPORTER_VERSION/LICENSE"
  chmod +x "$VENDOR/download"
  mv "$VENDOR/download" "$VENDOR/imessage-exporter"
fi

swift build -c release
BIN="$(swift build -c release --show-bin-path)"

APP=build/Textrovert.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"
cp "$BIN/Textrovert" "$APP/Contents/MacOS/Textrovert"
cp "$VENDOR/imessage-exporter" "$APP/Contents/MacOS/imessage-exporter"
cp "$VENDOR/LICENSE" "$APP/Contents/Resources/imessage-exporter-LICENSE.txt"
codesign --force --sign - "$APP/Contents/MacOS/imessage-exporter"
codesign --force --sign - "$APP"
cp "$BIN/textrovert-upload" build/textrovert-upload

echo "Built $(pwd)/$APP"
