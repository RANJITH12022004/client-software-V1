#!/usr/bin/env bash
# Release FLASK_PORT so the bridge can bind after unclean shutdown.
# Wait for internal USB so factory settings / members load from the real storage volume.
set -uo pipefail
PORT="${FLASK_PORT:-5000}"
INTERNAL_USB_PATH="${INTERNAL_USB_PATH:-/media/usb_internal}"
STORAGE_DIR="${STORAGE_DIR:-$INTERNAL_USB_PATH/storage}"

if command -v mountpoint >/dev/null 2>&1; then
  for _i in $(seq 1 45); do
    if mountpoint -q "$INTERNAL_USB_PATH" 2>/dev/null && [ -d "$STORAGE_DIR" ]; then
      break
    fi
    sleep 1
  done
fi

if command -v fuser >/dev/null 2>&1; then
  fuser -k -TERM "${PORT}/tcp" >/dev/null 2>&1 || true
  sleep 0.5
  fuser -k -KILL "${PORT}/tcp" >/dev/null 2>&1 || true
  sleep 0.3
fi

# Orphan bridge.py (e.g. manual start) can keep port 5000 while systemd restarts fail silently.
pkill -TERM -f '/opt/kiosk/bridge\.py' 2>/dev/null || true
pkill -TERM -f '/opt/kiosk/venv/bin/python.*bridge\.py' 2>/dev/null || true
sleep 0.5
pkill -KILL -f '/opt/kiosk/bridge\.py' 2>/dev/null || true
pkill -KILL -f '/opt/kiosk/venv/bin/python.*bridge\.py' 2>/dev/null || true
sleep 0.3

exit 0
