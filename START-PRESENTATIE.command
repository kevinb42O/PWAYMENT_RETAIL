#!/bin/zsh

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_HEALTH_URL="http://localhost:4301/"
APP_URL="http://localhost:4301/?presentation=1"
DECK_URL="http://localhost:4173/retail-intelligence-deck.html"
APP_LOG="/tmp/pwayment-app.log"
DECK_LOG="/tmp/pwayment-presentation.log"
BUILD_LOG="/tmp/pwayment-build.log"
APP_PID=""
DECK_PID=""

cleanup() {
  [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null
  [[ -n "$DECK_PID" ]] && kill "$DECK_PID" 2>/dev/null
}

wait_for_text() {
  local url="$1"
  local expected="$2"
  local attempts=0

  while (( attempts < 60 )); do
    if curl -fsS "$url" 2>/dev/null | grep -Fq "$expected"; then
      return 0
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  return 1
}

trap cleanup EXIT INT TERM

clear
echo "Pwayment presentatie wordt voorbereid…"

if ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "Node.js/npm ontbreekt. Installeer Node.js en probeer opnieuw."
  read -r "?Druk op Enter om te sluiten."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo ""
  echo "Python 3 ontbreekt en is nodig om de presentatie lokaal te openen."
  read -r "?Druk op Enter om te sluiten."
  exit 1
fi

cd "$PROJECT_DIR" || exit 1

if [[ ! -d node_modules ]]; then
  echo "Dependencies worden eenmalig geïnstalleerd…"
  npm install || {
    echo "Installatie mislukt. Controleer je internetverbinding."
    read -r "?Druk op Enter om te sluiten."
    exit 1
  }
fi

echo "Stabiele presentatieversie van de kassa bouwen…"
VITE_PRESENTATION_BUILD=true npm run build >"$BUILD_LOG" 2>&1 || {
  echo ""
  echo "De kassa kon niet worden gebouwd. Details: $BUILD_LOG"
  read -r "?Druk op Enter om te sluiten."
  exit 1
}

if curl -fsS "$APP_HEALTH_URL" 2>/dev/null | grep -Fq "/@vite/client"; then
  echo ""
  echo "Poort 4301 wordt gebruikt door een developmentserver. Sluit die server en probeer opnieuw."
  read -r "?Druk op Enter om te sluiten."
  exit 1
fi

if ! curl -fsS "$APP_HEALTH_URL" 2>/dev/null | grep -Fq "PWAyment - Retail POS"; then
  echo "Kassasysteem starten…"
  python3 -m http.server 4301 --bind 127.0.0.1 --directory "$PROJECT_DIR/dist" >"$APP_LOG" 2>&1 &
  APP_PID=$!
fi

if ! curl -fsS "$DECK_URL" 2>/dev/null | grep -Fq "Pwayment | Pwayment × Talemate"; then
  echo "Presentatie starten…"
  python3 -m http.server 4173 --bind 127.0.0.1 --directory "$PROJECT_DIR/presentation-build" >"$DECK_LOG" 2>&1 &
  DECK_PID=$!
fi

if ! wait_for_text "$APP_HEALTH_URL" "PWAyment - Retail POS"; then
  echo ""
  echo "Het kassasysteem kon niet starten. Details: $APP_LOG"
  read -r "?Druk op Enter om te sluiten."
  exit 1
fi

if ! wait_for_text "$DECK_URL" "Pwayment | Pwayment × Talemate"; then
  echo ""
  echo "De presentatie kon niet starten. Details: $DECK_LOG"
  read -r "?Druk op Enter om te sluiten."
  exit 1
fi

echo "Beide onderdelen zijn klaar. De browser wordt geopend…"
if [[ "${PWAYMENT_NO_BROWSER:-0}" != "1" ]]; then
  open "$APP_URL"
  open "$DECK_URL"
fi

echo ""
echo "KLAAR"
echo "- Kassa:        $APP_URL"
echo "- Presentatie: $DECK_URL"
echo ""
echo "Laat dit venster open tijdens je presentatie."
echo "Druk op Ctrl+C wanneer je volledig klaar bent."

if [[ "${PWAYMENT_SMOKE_TEST:-0}" == "1" ]]; then
  exit 0
fi

while true; do
  sleep 30
done
