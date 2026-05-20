#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if lsof -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Порт 5000 занят (часто macOS AirPlay Receiver)."
  echo "Отключите: Системные настройки → Основные → AirDrop и Handoff → Приёмник AirPlay → Выкл."
  echo ""
  echo "Запускаю на http://localhost:5001 …"
  exec npx next dev -p 5001
fi

exec npx next dev -p 5000
