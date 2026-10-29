#!/usr/bin/env bash
# Baut die iPhone-App OHNE Signatur (läuft auf einem Mac, z. B. dem Mac-Rechner von GitHub Actions).
# Unterschrieben wird beim Installieren mit Sideloadly und der eigenen (kostenlosen) Apple-ID.
# Voraussetzung: "npm run mobile:prepare", "npx cap add ios" und "npx cap sync ios" sind gelaufen.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BUILD_NR="${GITHUB_RUN_NUMBER:-1}"
PLIST="$ROOT/ios/App/App/Info.plist"
TMP="${RUNNER_TEMP:-/tmp}/nook-ios"
rm -rf "$TMP" && mkdir -p "$TMP" "$ROOT/dist"

pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" >/dev/null 2>&1 || true; }
setkey() { pb "Delete :$1"; pb "Add :$1 $2 $3"; }

echo "==> Berechtigungen & Einstellungen"
setkey NSMicrophoneUsageDescription string "Nook braucht dein Mikrofon für Anrufe, Lounges und Sprachnachrichten."
setkey NSCameraUsageDescription string "Nook braucht deine Kamera für Videoanrufe und Fotos."
setkey NSPhotoLibraryUsageDescription string "Nook braucht Zugriff auf deine Fotos, damit du Bilder verschicken kannst."
setkey NSPhotoLibraryAddUsageDescription string "Nook speichert Bilder und Dateien, die du herunterlädst."
# Anrufe laufen weiter, wenn Nook im Hintergrund ist
pb "Delete :UIBackgroundModes"
pb "Add :UIBackgroundModes array"
pb "Add :UIBackgroundModes:0 string audio"
setkey CFBundleDisplayName string "Nook"
setkey CFBundleShortVersionString string "$VERSION"
setkey CFBundleVersion string "$BUILD_NR"
setkey ITSAppUsesNonExemptEncryption bool false

echo "==> App-Icon"
ICONSET="$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset"
python3 -m pip install --quiet --break-system-packages pillow 2>/dev/null || python3 -m pip install --quiet pillow
python3 - "$ROOT/build/icon.png" "$TMP/icon-1024.png" <<'PY'
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert('RGBA')
w, h = src.size
# Rand des runden Desktop-Icons abschneiden; iOS rundet die Ecken selbst ab
m = int(w * 0.0625)
inner = src.crop((m, m, w - m, h - m)).resize((1024, 1024), Image.LANCZOS)
bg = Image.new('RGBA', (1024, 1024), inner.getpixel((512, 40))[:3] + (255,))
bg.alpha_composite(inner)
bg.convert('RGB').save(sys.argv[2])  # iOS-Icons dürfen keine Transparenz haben
PY
for f in "$ICONSET"/*.png; do cp "$TMP/icon-1024.png" "$f"; done

echo "==> Bauen (ohne Signatur)"
cd "$ROOT/ios/App"
if [ -d App.xcworkspace ]; then TARGET=(-workspace App.xcworkspace); else TARGET=(-project App.xcodeproj); fi
xcodebuild "${TARGET[@]}" -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -archivePath "$TMP/App.xcarchive" archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" | tail -25

echo "==> .ipa verpacken"
mkdir -p "$TMP/ipa/Payload"
cp -R "$TMP/App.xcarchive/Products/Applications/App.app" "$TMP/ipa/Payload/"
(cd "$TMP/ipa" && zip -qry "$ROOT/dist/Nook-iPhone-$VERSION.ipa" Payload)
echo "Fertig: dist/Nook-iPhone-$VERSION.ipa"
