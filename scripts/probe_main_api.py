#!/usr/bin/env python3
"""Probe main kiosk API routes on deployed machines."""

import sys

import paramiko

HOSTS = ["192.168.1.33"]
USER = "rle"
PASSWORD = "rle"

REMOTE = r"""#!/bin/bash
echo "=== HOSTNAME / UNAME ==="
hostname; uname -n
echo "=== REPORTS / AUDIT API PROBE ==="
for p in \
  /api/data/reports \
  /api/reports \
  /api/data/audit \
  /api/audit \
  /api/data/auth/login \
  /api/data/auth/current-user \
  /api/reports/export \
  /api/audit/export; do
  code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:5000${p}" 2>/dev/null)
  echo "${p} -> ${code}"
done
echo "=== GREP ROUTES IN DEPLOYED app.py ==="
grep -E '@app\.route\("/api' /opt/kiosk/app.py 2>/dev/null | head -40
echo "=== SERVICE UNIT ==="
systemctl cat kiosk-bridge 2>/dev/null | head -25
echo "=== WHO OWNS 5000 ==="
ss -tlnp | grep 5000
"""

for host in HOSTS:
    print(f"\n{'='*60}\n{host}\n{'='*60}")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(host, username=USER, password=PASSWORD, timeout=15, allow_agent=False, look_for_keys=False)
        _, stdout, stderr = c.exec_command(REMOTE, timeout=60)
        print(stdout.read().decode("utf-8", errors="replace"))
        err = stderr.read().decode("utf-8", errors="replace")
        if err.strip():
            print("ERR:", err)
    except Exception as e:
        print("FAIL:", e)
    finally:
        c.close()
