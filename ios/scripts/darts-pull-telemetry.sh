#!/usr/bin/env bash
# Pull Documents/darts-live.log from the phone every few seconds.
set -uo pipefail
DEVICE_ID="${DARTS_DEVICE_ID:-00008120-0012090926C2201E}"
BUNDLE="app.artdart.score"
OUT="${DARTS_LIVE_LOG:-/tmp/darts-live.log}"
TMP="$(mktemp)"
echo "Pulling ${BUNDLE} Documents/darts-live.log → ${OUT}"
echo "Ctrl+C to stop"
echo "────────────────────────────────────────────────────────────"
LAST=""
while true; do
  if xcrun devicectl device copy from \
      --device "${DEVICE_ID}" \
      --domain-type appDataContainer \
      --domain-identifier "${BUNDLE}" \
      --source "Documents/darts-live.log" \
      --destination "${TMP}" \
      >/dev/null 2>&1; then
    if ! cmp -s "${TMP}" "${OUT}" 2>/dev/null; then
      cp "${TMP}" "${OUT}"
      # print only new lines
      if [[ -n "${LAST}" ]]; then
        awk -v last="${LAST}" 'found || $0==last {found=1; next} found' "${OUT}" 2>/dev/null \
          || tail -20 "${OUT}"
      else
        tail -30 "${OUT}"
      fi
      LAST="$(tail -1 "${OUT}" 2>/dev/null || true)"
    fi
  else
    echo "$(date +%H:%M:%S) waiting for log file (start autoscore in app)…"
  fi
  sleep 2
done
