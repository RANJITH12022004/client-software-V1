#!/usr/bin/env bash
# Launcher used by kiosk-bridge.service to start the Flask backend.
# Mirrors the manual flow in /opt/kiosk/start_kiosk.sh (backend only; no Chromium).

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/kiosk}"
PYTHON="${PYTHON:-/opt/kiosk/venv/bin/python3}"
INTERNAL_USB_PATH="${INTERNAL_USB_PATH:-/media/usb_internal}"

cd "$APP_ROOT"

# Internal pendrive (sda1): PDFs, JSON storage, audit_log.db — not on the OS SD card.
if [ -d "$INTERNAL_USB_PATH" ]; then
  export INTERNAL_USB_PATH
  export STORAGE_DIR="${STORAGE_DIR:-$INTERNAL_USB_PATH/storage}"
  export REPORTS_DIR="${REPORTS_DIR:-$INTERNAL_USB_PATH/reports}"
  export AUDIT_DB_DIR="${AUDIT_DB_DIR:-$INTERNAL_USB_PATH/db}"
  export INTERNAL_USB_UUIDS="${INTERNAL_USB_UUIDS:-9588114d-4b26-4aaa-b664-05ef9e4a68dc}"
fi

export APP_ROOT PYTHONUNBUFFERED=1
exec "$PYTHON" "$APP_ROOT/bridge.py"
