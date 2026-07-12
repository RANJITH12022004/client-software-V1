#!/usr/bin/env python3
"""SSH probe for RLE machines on LAN."""

import json
import sys

try:
    import paramiko
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

HOSTS = ["192.168.1.33"]
USER = "rle"
PASSWORD = "rle"

REMOTE_SCRIPT = r"""#!/bin/bash
set +e
echo "=== LISTEN 5000 ==="
ss -tlnp 2>/dev/null | grep 5000 || netstat -tlnp 2>/dev/null | grep 5000 || true
echo "=== CURL desktop health ==="
curl -sS -m 5 http://127.0.0.1:5000/api/desktop/v1/health; echo
echo "=== ENDPOINT STATUS CODES ==="
for p in / /api/desktop/v1/health /api/data/auth/current-user /api/get_datetime; do
  code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:5000${p}" 2>/dev/null)
  echo "${p} -> ${code}"
done
echo "=== PROCESS ==="
ps aux | grep -E 'python|flask|bridge' | grep -v grep | head -6
echo "=== SYSTEMD ==="
systemctl is-active kiosk-bridge 2>/dev/null || echo inactive
echo "=== APP ROOT ==="
ls -la /opt/kiosk/bridge.py /opt/kiosk/app.py 2>/dev/null | head -3
test -f /opt/kiosk/app.py && grep -c 'desktop/v1' /opt/kiosk/app.py 2>/dev/null | xargs -I{} echo "desktop_api_routes_in_app: {}"
echo "=== BIND CHECK ==="
curl -sS -m 3 http://127.0.0.1:5000/api/desktop/v1/health >/dev/null && echo localhost_ok || echo localhost_fail
hostname -I 2>/dev/null | head -1
"""


def probe_host(host: str) -> None:
    print(f"\n{'=' * 60}\nHOST {host}\n{'=' * 60}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            host,
            username=USER,
            password=PASSWORD,
            timeout=15,
            allow_agent=False,
            look_for_keys=False,
        )
        stdin, stdout, stderr = client.exec_command(REMOTE_SCRIPT, timeout=45)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        print(out)
        if err.strip():
            print("STDERR:", err)
    except Exception as exc:
        print("SSH FAILED:", exc)
    finally:
        client.close()


def main() -> None:
    for host in HOSTS:
        probe_host(host)


if __name__ == "__main__":
    main()
