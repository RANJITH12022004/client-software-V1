#!/usr/bin/env python3
"""Inspect deployed kiosk app on Pi before adding desktop API."""

import paramiko

HOST = "192.168.1.33"
USER = "rle"
PASSWORD = "rle"

REMOTE = r"""#!/bin/bash
set +e
echo "=== HOST ==="
hostname; uname -a
echo "=== APP ==="
wc -l /opt/kiosk/app.py
grep -c 'desktop/v1' /opt/kiosk/app.py || echo 0
grep -n 'desktop/v1\|FLASK_HOST\|register.*blueprint\|Blueprint' /opt/kiosk/app.py | head -20
echo "=== RUN SCRIPT ==="
grep FLASK_HOST /opt/kiosk/run_kiosk_app.sh || echo no-flask-host
echo "=== LISTEN ==="
ss -tlnp | grep 5000
echo "=== SERVICE ==="
systemctl is-active kiosk-bridge
echo "=== IMPORTS tail app ==="
tail -30 /opt/kiosk/app.py
echo "=== SERVICES ==="
ls -la /opt/kiosk/*.py | head -20
echo "=== VENV ==="
/opt/kiosk/venv/bin/python3 -c "import flask; print('flask', flask.__version__)" 2>&1
/opt/kiosk/venv/bin/python3 -c "import flask_sock" 2>&1 && echo flask-sock-ok || echo flask-sock-missing
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20, allow_agent=False, look_for_keys=False)
_, stdout, stderr = c.exec_command(REMOTE, timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err)
c.close()
