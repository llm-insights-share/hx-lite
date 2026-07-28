#!/usr/bin/env bash
# Stop HX WebUI backend + frontend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.run"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"
BACKEND_PORT="${HX_WEBUI_BACKEND_PORT:-8000}"
FRONTEND_PORT="${HX_WEBUI_FRONTEND_PORT:-5173}"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "[stop] $name pid=$pid"
      # Kill process group / children (uvicorn --reload, vite)
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    else
      echo "[skip] $name pid file stale"
    fi
    rm -f "$pid_file"
  else
    echo "[skip] $name not tracked"
  fi
}

kill_port() {
  local name="$1"
  local port="$2"
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[stop] $name port :$port -> $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.3
    pids="$(lsof -ti:"$port" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

stop_pid_file "frontend" "$FRONTEND_PID"
stop_pid_file "backend" "$BACKEND_PID"
kill_port "frontend" "$FRONTEND_PORT"
kill_port "backend" "$BACKEND_PORT"

echo "HX WebUI stopped."
