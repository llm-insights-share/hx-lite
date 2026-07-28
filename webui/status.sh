#!/usr/bin/env bash
# Show HX WebUI process status.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.run"
BACKEND_PORT="${HX_WEBUI_BACKEND_PORT:-8000}"
FRONTEND_PORT="${HX_WEBUI_FRONTEND_PORT:-5173}"

status_one() {
  local name="$1"
  local pid_file="$2"
  local port="$3"
  local pid_state="stopped"
  local port_state="free"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      pid_state="running(pid=$pid)"
    else
      pid_state="stale(pid=$pid)"
    fi
  fi
  if command -v lsof >/dev/null 2>&1 && lsof -ti:"$port" >/dev/null 2>&1; then
    port_state="in-use($(lsof -ti:"$port" | tr '\n' ',' | sed 's/,$//'))"
  fi
  printf "%-10s  %-22s  port :%-5s %s\n" "$name" "$pid_state" "$port" "$port_state"
}

status_one "backend" "$PID_DIR/backend.pid" "$BACKEND_PORT"
status_one "frontend" "$PID_DIR/frontend.pid" "$FRONTEND_PORT"

if curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
  echo "API health: ok"
else
  echo "API health: unreachable"
fi
