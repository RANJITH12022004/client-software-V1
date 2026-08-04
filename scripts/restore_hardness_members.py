#!/usr/bin/env python3
"""Restore Hardness members from .bak and verify desktop login."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

import paramiko

HOST = "100.108.222.67"
BASE = f"http://{HOST}:5000"


def http(method, path, body=None, token=None, timeout=30):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except Exception:
            return exc.code, raw.decode(errors="replace")[:300]
    except Exception as exc:
        return 0, str(exc)


REMOTE = r"""
import os, sys, json, pathlib, shutil, time
os.chdir('/opt/kiosk')
sys.path.insert(0, '/opt/kiosk')

storage = pathlib.Path('/media/usb_internal/storage')
members = storage / 'members.json'
bak = storage / 'members.json.bak'
stamp = time.strftime('%Y%m%d_%H%M%S')

print('before members', members.read_text(encoding='utf-8')[:80])
print('bak size', bak.stat().st_size if bak.exists() else None)

if bak.exists() and bak.stat().st_size > 10:
    # keep a copy of current empty file
    shutil.copy2(members, storage / f'members.json.empty_{stamp}')
    data = json.loads(bak.read_text(encoding='utf-8'))
    if not isinstance(data, list) or len(data) == 0:
        raise SystemExit('bak empty or invalid')
    # refresh password timestamps so period policy does not block login
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    for m in data:
        m['status'] = 'active'
        m['failedAttempts'] = 0
        # keep mustChangePassword as stored, but clear lockouts
        if not m.get('passwordLastChangedAt'):
            m['passwordLastChangedAt'] = now
    members.write_text(json.dumps(data, indent=2), encoding='utf-8')
    print('restored count', len(data))
    for m in data:
        print('-', m.get('id'), m.get('username'), m.get('role'), repr(m.get('password')), 'mustChange', m.get('mustChangePassword'))
else:
    raise SystemExit('no usable bak')

# also note recipes/reports wipe
for name in ('recipes.json', 'reports.json'):
    p = storage / name
    b = storage / f'{name}.bak'
    print(name, 'size', p.stat().st_size if p.exists() else None, 'bak', b.stat().st_size if b.exists() else None)

# verify via data_service
import data_service
from app import STORAGE_DIR
data_service.init({'STORAGE_DIR': str(STORAGE_DIR)})
ms = data_service.list_members()
print('list_members', len(ms))
print('FACTORY', data_service.FACTORY_USERNAME, repr(data_service.FACTORY_PASSWORD))
u = data_service.authenticate_user(data_service.FACTORY_USERNAME, data_service.FACTORY_PASSWORD)
print('factory auth', bool(u), (u or {}).get('username'))
if ms:
    m0 = ms[0]
    u2 = data_service.authenticate_user(m0['username'], m0.get('password'))
    print('member auth', m0['username'], bool(u2))
"""


def main() -> int:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="rle", password="rle", timeout=25, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file("/tmp/_restore_members.py", "w") as f:
        f.write(REMOTE)
    sftp.close()
    _, stdout, stderr = c.exec_command(
        "cd /opt/kiosk && /opt/kiosk/venv/bin/python3 /tmp/_restore_members.py", timeout=60
    )
    print(stdout.read().decode(errors="replace"))
    err = stderr.read().decode(errors="replace")
    if err.strip():
        print("STDERR:", err[:800])
    c.close()

    # HTTP checks — factory username is RLERLT / Rahul per device
    print("--- HTTP ---")
    for u, p in [
        ("RLERLT", "Rahul"),
        ("Rahul", "Rle@2024"),
        ("RAHULA", "Rle@1234"),
        ("RahulB", "DesktopAudit1!"),
        ("SAN", "San@1111"),
    ]:
        st, data = http("POST", "/api/desktop/v1/auth/login", {"username": u, "password": p})
        detail = data.get("error") if isinstance(data, dict) and st != 200 else (
            (data.get("user") or {}).get("username") if isinstance(data, dict) else data
        )
        print(f"{u} -> {st} {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
