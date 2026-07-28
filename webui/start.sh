#!/usr/bin/env bash
# Start HX WebUI backend + frontend (dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PID_DIR="$ROOT/.run"
LOG_DIR="$ROOT/.run/logs"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"
BACKEND_PORT="${HX_WEBUI_BACKEND_PORT:-8000}"
FRONTEND_PORT="${HX_WEBUI_FRONTEND_PORT:-5173}"

mkdir -p "$PID_DIR" "$LOG_DIR"

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$port" >/dev/null 2>&1
  else
    return 1
  fi
}

if [[ ! -d "$BACKEND/.venv" ]]; then
  echo "[setup] creating backend venv..."
  python3 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"
fi

if [[ ! -d "$FRONTEND/node_modules" ]]; then
  echo "[setup] installing frontend deps..."
  (cd "$FRONTEND" && npm install)
fi

if is_running "$BACKEND_PID" || port_in_use "$BACKEND_PORT"; then
  echo "[skip] backend already running on :$BACKEND_PORT"
else
  echo "[start] backend  http://127.0.0.1:$BACKEND_PORT"
  (
    cd "$BACKEND"
    nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload \
      >"$LOG_DIR/backend.log" 2>&1 &
    echo $! >"$BACKEND_PID"
  )
fi

if is_running "$FRONTEND_PID" || port_in_use "$FRONTEND_PORT"; then
  echo "[skip] frontend already running on :$FRONTEND_PORT"
else
  echo "[start] frontend http://127.0.0.1:$FRONTEND_PORT"
  (
    cd "$FRONTEND"
    nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" \
      >"$LOG_DIR/frontend.log" 2>&1 &
    echo $! >"$FRONTEND_PID"
  )
fi

echo
echo "HX WebUI started."
echo "  UI:      http://127.0.0.1:$FRONTEND_PORT"
echo "  API:     http://127.0.0.1:$BACKEND_PORT/api/health"
echo "  Login:   admin / admin123"
echo "  Logs:    $LOG_DIR/"
echo "  Stop:    $ROOT/stop.sh"
