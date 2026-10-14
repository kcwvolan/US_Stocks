#!/usr/bin/env bash
# Daily headless analysis run — reads tickers from watchlist.json and runs
# /analyze for each via `claude -p`. Logs output to logs/cron_YYYYMMDD.log.
#
# Usage:
#   ./scripts/daily-cron.sh               # all tickers in watchlist.json
#   ./scripts/daily-cron.sh AAPL MSFT     # override with specific tickers
#
# Cron (8 am ET Mon–Fri):
#   0 13 * * 1-5 cd /Users/kcw/Documents/US_Stocks && ./scripts/daily-cron.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO/logs"
DATE="$(date -u +%Y%m%d)"
LOG="$LOG_DIR/cron_${DATE}.log"

mkdir -p "$LOG_DIR"

# Resolve ticker list: CLI args take priority, otherwise read watchlist.json
if [ $# -gt 0 ]; then
  TICKERS=("$@")
else
  mapfile -t TICKERS < <(
    node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$REPO/watchlist.json')).tickers.join('\n'))"
  )
fi

echo "[$(date -u +%FT%TZ)] Starting daily run — ${#TICKERS[@]} tickers: ${TICKERS[*]}" | tee -a "$LOG"

PASS=0
FAIL=0
FAILED_TICKERS=()

for T in "${TICKERS[@]}"; do
  echo "[$(date -u +%FT%TZ)] Analyzing $T..." | tee -a "$LOG"
  if claude -p "/analyze $T" \
       --allowedTools "Bash,Write,Read,Edit" \
       >> "$LOG" 2>&1; then
    echo "[$(date -u +%FT%TZ)] ✓ $T" | tee -a "$LOG"
    (( PASS++ ))
  else
    echo "[$(date -u +%FT%TZ)] ✗ $T (exit $?)" | tee -a "$LOG"
    FAILED_TICKERS+=("$T")
    (( FAIL++ )) || true
  fi
done

echo "" | tee -a "$LOG"
echo "[$(date -u +%FT%TZ)] Done. $PASS succeeded, $FAIL failed." | tee -a "$LOG"

if [ ${#FAILED_TICKERS[@]} -gt 0 ]; then
  echo "Failed: ${FAILED_TICKERS[*]}" | tee -a "$LOG"
  exit 1
fi
