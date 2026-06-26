#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${STEUERBERATER_DB_PORT:-4182}"
HOST="${STEUERBERATER_DB_HOST:-0.0.0.0}"
PID_FILE="$ROOT_DIR/showcase/runtime/steuerberater-db.pid"
LOG_FILE="$ROOT_DIR/showcase/runtime/steuerberater-db.log"
HEALTH_URL="http://127.0.0.1:${PORT}/api/steuerberater/health"
UNIT_NAME="steuerberater-db-frontend"

mkdir -p "$ROOT_DIR/showcase/runtime"
: >"$LOG_FILE"

stop_existing_process() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      sleep 0.5
    fi
  fi

  while read -r pid; do
    [[ -n "${pid:-}" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done < <(pgrep -f 'node .*steuerberater-db-server\.js|node steuerberater-db-server\.js' || true)
  sleep 0.5
}

HAS_SYSTEMD_USER=1
systemctl --user show-environment >/dev/null 2>&1 || HAS_SYSTEMD_USER=0

if [[ "$HAS_SYSTEMD_USER" -eq 1 ]]; then
  systemctl --user stop "$UNIT_NAME" >/dev/null 2>&1 || true
  systemctl --user reset-failed "$UNIT_NAME" >/dev/null 2>&1 || true
else
  stop_existing_process
fi

cd "$ROOT_DIR"
if [[ "$HAS_SYSTEMD_USER" -eq 1 ]]; then
  systemd-run --user --unit="$UNIT_NAME" --collect --same-dir \
    bash -lc "exec env STEUERBERATER_DB_HOST='$HOST' STEUERBERATER_DB_PORT='$PORT' node showcase/steuerberater-db-server.js >>'$LOG_FILE' 2>&1"
else
  nohup env STEUERBERATER_DB_HOST="$HOST" STEUERBERATER_DB_PORT="$PORT" \
    node showcase/steuerberater-db-server.js >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
fi

for _ in $(seq 1 40); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    if [[ "$HAS_SYSTEMD_USER" -eq 1 ]]; then
      systemctl --user show "$UNIT_NAME" --property MainPID --value >"$PID_FILE" || true
    fi
    echo "Steuerberater DB frontend started on ${HOST}:${PORT} (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  sleep 0.25
done

echo "Steuerberater DB frontend failed to start; last log lines:" >&2
tail -n 40 "$LOG_FILE" >&2 || true
exit 1
