#!/usr/bin/env python3
"""End-to-end desktop API test on Pi."""

import json
import paramiko
import urllib.request

HOST = "192.168.1.33"

REMOTE = r"""
echo '=== MEMBERS ==='
curl -sS -m 5 http://127.0.0.1:5000/api/data/members | /opt/kiosk/venv/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print([(m.get('username'), m.get('role')) for m in d.get('members',[])[:8]])" 2>/dev/null
echo '=== DESKTOP LOGIN Factory ==='
curl -sS -m 10 -X POST http://127.0.0.1:5000/api/desktop/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"Factory","password":"factory"}'; echo
echo '=== REPORTS with token ==='
TOKEN=$(curl -sS -m 10 -X POST http://127.0.0.1:5000/api/desktop/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"Factory","password":"factory"}' | /opt/kiosk/venv/bin/python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  curl -sS -m 10 -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5000/api/desktop/v1/reports | head -c 400; echo
  curl -sS -m 30 -o /tmp/test-report.pdf -w 'pdf report 2: %{http_code} size=%{size_download}\n' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5000/api/desktop/v1/reports/2/pdf
  file /tmp/test-report.pdf 2>/dev/null || ls -la /tmp/test-report.pdf
fi
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="rle", password="rle", timeout=15, allow_agent=False, look_for_keys=False)
_, stdout, _ = c.exec_command(REMOTE, timeout=120)
print(stdout.read().decode())
c.close()

with urllib.request.urlopen(f"http://{HOST}:5000/api/desktop/v1/health", timeout=10) as r:
    print("LAN health OK:", r.status)
