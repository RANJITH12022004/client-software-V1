#!/usr/bin/env python3
"""Probe three RLE machines for desktop client compatibility."""

from __future__ import annotations

import paramiko

HOSTS = ["100.108.165.100", "100.85.166.118", "100.108.222.67"]
USER = "rle"
PASSWORD = "rle"

REMOTE = r"""
set +e
echo HOST=$(hostname)
echo IPS=$(hostname -I 2>/dev/null)
echo SERVICE=$(systemctl is-active kiosk-bridge 2>/dev/null)
echo APP_NAME=$(cat /opt/kiosk/desktop_app_name 2>/dev/null)
if test -f /opt/kiosk/bridge.py; then echo HAS_BRIDGE=yes; else echo HAS_BRIDGE=no; fi
if test -d /opt/kiosk/desktop_api; then echo HAS_DESKTOP=yes; else echo HAS_DESKTOP=no; fi
echo APP_HEAD=$(head -4 /opt/kiosk/app.py 2>/dev/null | tr '\n' ' ')
echo LISTEN=$(ss -tlnp 2>/dev/null | grep 5000 | head -1)
echo HEALTH_DESKTOP=$(curl -sS -m 5 http://127.0.0.1:5000/api/desktop/v1/health 2>/dev/null)
echo HEALTH_API=$(curl -sS -m 5 http://127.0.0.1:5000/api/health 2>/dev/null)
"""


def probe(host: str) -> None:
    print("=" * 64)
    print("HOST", host)
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            host,
            username=USER,
            password=PASSWORD,
            timeout=25,
            allow_agent=False,
            look_for_keys=False,
        )
        _, stdout, stderr = client.exec_command(REMOTE, timeout=45, get_pty=True)
        print(stdout.read().decode(errors="replace"))
        err = stderr.read().decode(errors="replace")
        if err.strip():
            print("STDERR", err[:400])
        client.close()
    except Exception as exc:
        print("CONNECT_FAIL", type(exc).__name__, exc)


def main() -> int:
    for host in HOSTS:
        probe(host)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
