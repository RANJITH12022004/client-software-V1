#!/usr/bin/env python3
"""Test main app login and data fetch on device via SSH."""

import json
import sys

import paramiko

HOST = "192.168.1.33"
USER = "rle"
PASSWORD = "rle"

REMOTE = r"""#!/bin/bash
echo "=== EXECSTART ==="
systemctl show kiosk-bridge -p ExecStart --value 2>/dev/null
echo "=== HEALTH ==="
curl -sS -m 5 http://127.0.0.1:5000/api/health; echo
echo "=== LOGIN factory/factory ==="
curl -sS -m 8 -X POST http://127.0.0.1:5000/api/data/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"factory","password":"factory"}'; echo
echo "=== LOGIN admin/admin ==="
curl -sS -m 8 -X POST http://127.0.0.1:5000/api/data/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}'; echo
echo "=== REPORTS (no auth session) ==="
curl -sS -m 8 http://127.0.0.1:5000/api/data/reports | head -c 600; echo
echo "=== AUDIT LOG ==="
curl -sS -m 8 'http://127.0.0.1:5000/api/data/audit-log?limit=3' | head -c 600; echo
echo "=== REPORT COUNT ==="
curl -sS -m 8 http://127.0.0.1:5000/api/data/reports 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('reports',d if isinstance(d,list) else []); print('reports:', len(r) if isinstance(r,list) else d)" 2>/dev/null || echo parse_fail
echo "=== PDF ROUTE probe report 1 ==="
curl -sS -m 5 -o /dev/null -w 'POST pdf report 1: %{http_code}\n' -X POST http://127.0.0.1:5000/api/reports/1/pdf
echo "=== EXPORT ROUTES POST ==="
curl -sS -m 5 -o /dev/null -w 'POST audit/export: %{http_code}\n' -X POST http://127.0.0.1:5000/api/audit/export -H 'Content-Type: application/json' -d '{}'
curl -sS -m 5 -o /dev/null -w 'POST reports/export: %{http_code}\n' -X POST http://127.0.0.1:5000/api/reports/export -H 'Content-Type: application/json' -d '{}'
echo "=== FLASK_HOST in env ==="
grep -r FLASK_HOST /opt/kiosk/scripts/ /etc/systemd/system/kiosk-bridge.service 2>/dev/null | head -5
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=15, allow_agent=False, look_for_keys=False)
_, stdout, stderr = c.exec_command(REMOTE, timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err)
c.close()
