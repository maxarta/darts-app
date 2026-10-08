#!/bin/bash
# Live USB console for ArtDart (devicectl --console).
# Usage: bash ios/scripts/darts-live-console.sh
set -uo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"

DEVICE_ID="${DARTS_DEVICE_ID:-00008120-0012090926C2201E}"
BUNDLE_ID="app.artdart.score"
LOG="${DARTS_LIVE_LOG:-/tmp/darts-live.log}"
APP=""
if [[ -d /tmp/DartsScore-dd/Build/Products/Debug-iphoneos/DartsScore.app ]]; then
  APP="/tmp/DartsScore-dd/Build/Products/Debug-iphoneos/DartsScore.app"
else
  APP="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/DartsScore-*/Build/Products/Debug-iphoneos/DartsScore.app 2>/dev/null | head -1 || true)"
fi

if [[ -z "${APP}" ]]; then
  echo "No Debug build found. Build once, then re-run this script."
  exit 1
fi
echo "Using ${APP}"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found — install Xcode Command Line Tools."
  exit 1
fi

pkill -f "devicectl device process launch.*${BUNDLE_ID}" 2>/dev/null || true
sleep 0.2

echo "Installing ${APP##*/} → ${DEVICE_ID}"
xcrun devicectl device install app --device "${DEVICE_ID}" "${APP}" >/dev/null

: > "${LOG}"
echo "Console → ${LOG}"
echo "Filter: DARTS_LIVE   |  Ctrl+C stops stream (app keeps running)"
echo "────────────────────────────────────────────────────────────"

# Full console → log; filtered lines → Terminal (grep is always on macOS).
xcrun devicectl device process launch \
  --device "${DEVICE_ID}" \
  --console \
  --terminate-existing \
  "${BUNDLE_ID}" 2>&1 \
  | tee "${LOG}" \
  | /usr/bin/grep -E --line-buffered 'DARTS_LIVE|Launched|Waiting|error|Error|SCORE'
