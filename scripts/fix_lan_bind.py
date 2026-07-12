#!/usr/bin/env python3
"""Apply FLASK_HOST=0.0.0.0 on device and verify LAN access."""

import paramiko
import time

HOST = "192.168.1.33"
USER = "rle"
PASSWORD = "rle"

FIX_SCRIPT = r"""#!/bin/bash
set -e
echo rle | sudo -S mkdir -p /etc/systemd/system/kiosk-bridge.service.d 2>/dev/null || sudo mkdir -p /etc/systemd/system/kiosk-bridge.service.d
echo '[Service]
Environment=FLASK_HOST=0.0.0.0' | (echo rle | sudo -S tee /etc/systemd/system/kiosk-bridge.service.d/lan-bind.conf >/dev/null 2>&1 || sudo tee /etc/systemd/system/kiosk-bridge.service.d/lan-bind.conf >/dev/null)
echo rle | sudo -S systemctl daemon-reload 2>/dev/null || sudo systemctl daemon-reload
echo rle | sudo -S systemctl restart kiosk-bridge 2>/dev/null || sudo systemctl restart kiosk-bridge
sleep 3
echo "=== LISTEN AFTER RESTART ==="
ss -tlnp | grep 5000 || true
echo "=== HEALTH localhost ==="
curl -sS -m 5 http://127.0.0.1:5000/api/health; echo
echo "=== HEALTH via LAN IP ==="
LAN=$(hostname -I | awk '{print $1}')
curl -sS -m 5 "http://${LAN}:5000/api/health"; echo
echo "=== DESKTOP API ==="
curl -sS -m 5 -o /dev/null -w 'desktop health: %{http_code}\n' http://127.0.0.1:5000/api/desktop/v1/health
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=15, allow_agent=False, look_for_keys=False)
_, stdout, stderr = c.exec_command(FIX_SCRIPT, timeout=90, get_pty=True)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("STDERR:", err[-2000:])
c.close()
