#!/bin/bash
# demo.sh -- One-command demo orchestrator for Crystal Ball.
#
# Usage:
#   ./demo.sh local           Simulated sessions, single user, no relay
#   ./demo.sh multi [N]       Relay + local (simulate) + N bots (default 1)
#   ./demo.sh live  [N]       Relay + local (real macOS) + N bots (default 0)
#
# Options:
#   -p, --port <number>        Local daemon port (default: 3000)
#   -r, --relay-port <number>  Relay server port (default: 3001)
#   -t, --token <string>       Auth token (default: "demo")
#   -h, --help                 Show this help

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELAY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/crystal-ball-relay"

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Bot presets (cycled via modulo for >4 bots)
BOT_NAMES=("Bob" "Alice" "Charlie" "Diana")
BOT_COLORS=("#FF6B6B" "#6BCB77" "#4D96FF" "#FFD93D")

# Defaults
PORT=3000
RELAY_PORT=3001
TOKEN="demo"

# Process tracking
PIDS=()

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
info()    { echo -e "${BLUE}[info]${RESET}    $*"; }
success() { echo -e "${GREEN}[ok]${RESET}      $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}    $*"; }
error()   { echo -e "${RED}[error]${RESET}   $*" >&2; }

cleanup() {
  echo ""
  info "Shutting down..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  success "All processes stopped."
  exit 0
}

wait_for_server() {
  local url="$1"
  local name="$2"
  local max_attempts=30
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      success "$name is ready"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.5
  done

  error "$name failed to start within 15s ($url)"
  cleanup
  exit 1
}

enable_sharing() {
  local port="$1"
  local url="http://localhost:${port}/api/sharing"
  curl -sf -X PUT "$url" \
    -H "Content-Type: application/json" \
    -d '{"enabled":true}' >/dev/null 2>&1
  success "Sharing enabled on :${port}"
}

check_port() {
  local port="$1"
  if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    error "Port $port is already in use"
    lsof -iTCP:"$port" -sTCP:LISTEN -P | tail -1
    exit 1
  fi
}

usage() {
  echo -e "${BOLD}Crystal Ball Demo Orchestrator${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./demo.sh local           Simulated sessions, single user, no relay"
  echo "  ./demo.sh multi [N]       Relay + local (simulate) + N bots (default 1)"
  echo "  ./demo.sh live  [N]       Relay + local (real macOS) + N bots (default 0)"
  echo ""
  echo "Options:"
  echo "  -p, --port <number>        Local daemon port (default: 3000)"
  echo "  -r, --relay-port <number>  Relay server port (default: 3001)"
  echo "  -t, --token <string>       Auth token (default: \"demo\")"
  echo "  -h, --help                 Show this help"
  echo ""
  echo "Examples:"
  echo "  ./demo.sh local"
  echo "  ./demo.sh multi 3          Relay + local + 3 bots"
  echo "  ./demo.sh live             Relay + real macOS discovery"
  echo "  ./demo.sh multi --port 4000 --relay-port 4001"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
preflight() {
  if ! command -v node &>/dev/null; then
    error "node is required but not found in PATH"
    exit 1
  fi

  if ! command -v curl &>/dev/null; then
    error "curl is required but not found in PATH"
    exit 1
  fi

  if [ ! -f "$SCRIPT_DIR/server/index.js" ]; then
    error "Cannot find server/index.js -- run this from the crystal-ball directory"
    exit 1
  fi

  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    info "Installing dependencies..."
    (cd "$SCRIPT_DIR" && npm install)
  fi
}

# ---------------------------------------------------------------------------
# Mode handlers
# ---------------------------------------------------------------------------
run_local() {
  info "Mode: ${BOLD}local${RESET} (simulated sessions, no relay)"
  echo ""

  check_port "$PORT"

  info "Starting daemon on :${PORT}..."
  node "$SCRIPT_DIR/server/index.js" --port "$PORT" --simulate &
  PIDS+=($!)

  wait_for_server "http://localhost:${PORT}/api/sessions" "Daemon"

  echo ""
  echo -e "${BOLD}${GREEN}Demo ready!${RESET}"
  echo -e "  Dashboard: ${CYAN}http://localhost:${PORT}${RESET}"
  echo ""

  open "http://localhost:${PORT}" 2>/dev/null || true
  wait
}

run_multi() {
  local bot_count="${1:-1}"

  info "Mode: ${BOLD}multi${RESET} (simulate + relay + ${bot_count} bot(s))"
  echo ""

  # Check relay project exists
  if [ ! -d "$RELAY_DIR" ]; then
    error "Relay project not found at $RELAY_DIR"
    error "Clone crystal-ball-relay alongside this project."
    exit 1
  fi

  if [ ! -d "$RELAY_DIR/node_modules" ]; then
    info "Installing relay dependencies..."
    (cd "$RELAY_DIR" && npm install)
  fi

  # Check all ports
  check_port "$RELAY_PORT"
  check_port "$PORT"
  local bot_port=$((PORT + 2))
  for i in $(seq 1 "$bot_count"); do
    check_port "$bot_port"
    bot_port=$((bot_port + 1))
  done

  local relay_url="http://localhost:${RELAY_PORT}"

  # 1. Start relay
  info "Starting relay on :${RELAY_PORT}..."
  node "$RELAY_DIR/server/index.js" --port "$RELAY_PORT" --token "$TOKEN" &
  PIDS+=($!)
  wait_for_server "${relay_url}/api/combined" "Relay"

  # 2. Start local daemon (simulate)
  info "Starting local daemon on :${PORT}..."
  node "$SCRIPT_DIR/server/index.js" \
    --port "$PORT" --simulate \
    --relay-url "$relay_url" --token "$TOKEN" &
  PIDS+=($!)
  wait_for_server "http://localhost:${PORT}/api/sessions" "Local daemon"
  enable_sharing "$PORT"

  # 3. Start bots
  bot_port=$((PORT + 2))
  for i in $(seq 1 "$bot_count"); do
    local idx=$(( (i - 1) % ${#BOT_NAMES[@]} ))
    local name="${BOT_NAMES[$idx]}"
    local color="${BOT_COLORS[$idx]}"

    info "Starting bot \"${name}\" on :${bot_port}..."
    SIMULATE=true node "$SCRIPT_DIR/server/index.js" \
      --port "$bot_port" \
      --relay-url "$relay_url" --token "$TOKEN" \
      --user-name "$name" --user-color "$color" &
    PIDS+=($!)
    wait_for_server "http://localhost:${bot_port}/api/sessions" "$name"
    enable_sharing "$bot_port"
    bot_port=$((bot_port + 1))
  done

  echo ""
  echo -e "${BOLD}${GREEN}Demo ready!${RESET}"
  echo -e "  Dashboard: ${CYAN}http://localhost:${PORT}${RESET}"
  echo -e "  Relay:     ${CYAN}${relay_url}${RESET}"
  bot_port=$((PORT + 2))
  for i in $(seq 1 "$bot_count"); do
    local idx=$(( (i - 1) % ${#BOT_NAMES[@]} ))
    echo -e "  Bot ${BOT_NAMES[$idx]}:   ${CYAN}http://localhost:${bot_port}${RESET}"
    bot_port=$((bot_port + 1))
  done
  echo ""

  open "http://localhost:${PORT}" 2>/dev/null || true
  wait
}

run_live() {
  local bot_count="${1:-0}"

  info "Mode: ${BOLD}live${RESET} (real macOS discovery + relay"
  if [ "$bot_count" -gt 0 ]; then
    echo -e " + ${bot_count} bot(s))"
  else
    echo ")"
  fi
  echo ""

  # Check relay project exists
  if [ ! -d "$RELAY_DIR" ]; then
    error "Relay project not found at $RELAY_DIR"
    error "Clone crystal-ball-relay alongside this project."
    exit 1
  fi

  if [ ! -d "$RELAY_DIR/node_modules" ]; then
    info "Installing relay dependencies..."
    (cd "$RELAY_DIR" && npm install)
  fi

  # Check all ports
  check_port "$RELAY_PORT"
  check_port "$PORT"
  local bot_port=$((PORT + 2))
  for i in $(seq 1 "$bot_count"); do
    check_port "$bot_port"
    bot_port=$((bot_port + 1))
  done

  local relay_url="http://localhost:${RELAY_PORT}"

  # 1. Start relay
  info "Starting relay on :${RELAY_PORT}..."
  node "$RELAY_DIR/server/index.js" --port "$RELAY_PORT" --token "$TOKEN" &
  PIDS+=($!)
  wait_for_server "${relay_url}/api/combined" "Relay"

  # 2. Start local daemon (real macOS discovery -- no --simulate)
  info "Starting local daemon on :${PORT} (macOS discovery)..."
  node "$SCRIPT_DIR/server/index.js" \
    --port "$PORT" \
    --relay-url "$relay_url" --token "$TOKEN" &
  PIDS+=($!)
  wait_for_server "http://localhost:${PORT}/api/sessions" "Local daemon"
  enable_sharing "$PORT"

  # 3. Start bots (if any)
  bot_port=$((PORT + 2))
  for i in $(seq 1 "$bot_count"); do
    local idx=$(( (i - 1) % ${#BOT_NAMES[@]} ))
    local name="${BOT_NAMES[$idx]}"
    local color="${BOT_COLORS[$idx]}"

    info "Starting bot \"${name}\" on :${bot_port}..."
    SIMULATE=true node "$SCRIPT_DIR/server/index.js" \
      --port "$bot_port" \
      --relay-url "$relay_url" --token "$TOKEN" \
      --user-name "$name" --user-color "$color" &
    PIDS+=($!)
    wait_for_server "http://localhost:${bot_port}/api/sessions" "$name"
    enable_sharing "$bot_port"
    bot_port=$((bot_port + 1))
  done

  echo ""
  echo -e "${BOLD}${GREEN}Demo ready!${RESET}"
  echo -e "  Dashboard: ${CYAN}http://localhost:${PORT}${RESET}"
  echo -e "  Relay:     ${CYAN}${relay_url}${RESET}"
  if [ "$bot_count" -gt 0 ]; then
    bot_port=$((PORT + 2))
    for i in $(seq 1 "$bot_count"); do
      local idx=$(( (i - 1) % ${#BOT_NAMES[@]} ))
      echo -e "  Bot ${BOT_NAMES[$idx]}:   ${CYAN}http://localhost:${bot_port}${RESET}"
      bot_port=$((bot_port + 1))
    done
  fi
  echo ""

  open "http://localhost:${PORT}" 2>/dev/null || true
  wait
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
MODE=""
BOT_COUNT=""

while [ $# -gt 0 ]; do
  case "$1" in
    local|multi|live)
      MODE="$1"
      shift
      # Check for bare number (bot count) immediately after mode
      if [ $# -gt 0 ] && [[ "$1" =~ ^[0-9]+$ ]]; then
        BOT_COUNT="$1"
        shift
      fi
      ;;
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    -r|--relay-port)
      RELAY_PORT="$2"
      shift 2
      ;;
    -t|--token)
      TOKEN="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      echo ""
      usage
      exit 1
      ;;
  esac
done

if [ -z "$MODE" ]; then
  usage
  exit 1
fi

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
trap cleanup SIGINT SIGTERM

preflight

case "$MODE" in
  local)
    run_local
    ;;
  multi)
    run_multi "${BOT_COUNT:-1}"
    ;;
  live)
    run_live "${BOT_COUNT:-0}"
    ;;
esac
