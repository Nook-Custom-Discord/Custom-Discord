#!/usr/bin/env bash
# Baut die Android-App (.apk) – läuft auf GitHub Actions (Ubuntu) oder jedem Rechner mit Android-SDK + Java 21.
# Voraussetzung: "npm run mobile:prepare", "npx cap add android" und "npx cap sync android" sind gelaufen.
# Unterschrift: Sind NOOK_KEYSTORE_B64, NOOK_KEYSTORE_PASSWORD, NOOK_KEY_ALIAS und NOOK_KEY_PASSWORD gesetzt
# (GitHub-Secrets), wird mit diesem festen Schlüssel signiert – nur dann lassen sich spätere Versionen einfach
# drüberinstallieren. Sonst entsteht eine Test-Version mit wechselndem Schlüssel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BUILD_NR="${GITHUB_RUN_NUMBER:-1}"
APP="$ROOT/android/app"
SRC="$APP/src/main"
mkdir -p "$ROOT/dist"

echo "==> Eigene Android-Erweiterung (Anrufe im Hintergrund)"
cp "$ROOT"/native/android/java/app/nook/client/*.java "$SRC/java/app/nook/client/"
cp -R "$ROOT"/native/android/res/. "$SRC/res/"

echo "==> Berechtigungen, Dienst, Version, Unterschrift"
python3 "$ROOT/scripts/android-patch.py" "$SRC/AndroidManifest.xml" "$APP/build.gradle" "$VERSION" "$BUILD_NR"

echo "==> App-Icon"
python3 -m pip install --quiet --break-system-packages pillow 2>/dev/null || python3 -m pip install --quiet pillow
python3 "$ROOT/scripts/android-icons.py" "$ROOT/build/icon.png" "$SRC/res"

echo "==> Bauen"
SIGNED=0
if [ -n "${NOOK_KEYSTORE_B64:-}" ]; then
  export NOOK_KEYSTORE="${RUNNER_TEMP:-/tmp}/nook-release.jks"
  echo "$NOOK_KEYSTORE_B64" | base64 -d > "$NOOK_KEYSTORE"
  SIGNED=1
fi
cd "$ROOT/android"
chmod +x gradlew
LOG="$ROOT/dist/build-log.txt"
if [ "$SIGNED" = 1 ]; then TASK=assembleRelease; else TASK=assembleDebug; fi
if ! ./gradlew "$TASK" --no-daemon --stacktrace > "$LOG" 2>&1; then
  echo "!!! Bauen fehlgeschlagen – Fehler:"
  grep -E "error:|FAILURE|What went wrong" -A3 "$LOG" | head -60 || true
  tail -30 "$LOG"
  exit 1
fi
tail -5 "$LOG"

if [ "$SIGNED" = 1 ]; then
  cp app/build/outputs/apk/release/app-release.apk "$ROOT/dist/Nook-Android-$VERSION.apk"
else
  echo "Hinweis: kein Signier-Schlüssel hinterlegt – Test-Version (Updates nur nach Deinstallieren)."
  cp app/build/outputs/apk/debug/app-debug.apk "$ROOT/dist/Nook-Android-$VERSION-test.apk"
fi
ls -la "$ROOT"/dist/*.apk
