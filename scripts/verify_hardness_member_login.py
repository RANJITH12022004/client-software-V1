#!/usr/bin/env python3
"""Verify restored Hardness member logins and restore recipes/reports if wiped."""

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
stamp = time.strftime('%Y%m%d_%H%M%S')

# Show exact usernames
members = json.loads((storage/'members.json').read_text(encoding='utf-8'))
print('MEMBERS_EXACT')
for m in members:
    print(json.dumps({'id': m.get('id'), 'username': m.get('username'), 'name': m.get('name'), 'role': m.get('role'), 'password': m.get('password')}))

# Restore recipes/reports if emptied by factory reset
for name in ('recipes.json', 'reports.json'):
    p = storage / name
    b = storage / f'{name}.bak'
    cur = json.loads(p.read_text(encoding='utf-8')) if p.exists() else []
    if (not cur) and b.exists() and b.stat().st_size > 10:
        shutil.copy2(p, storage / f'{name}.empty_{stamp}')
        shutil.copy2(b, p)
        data = json.loads(p.read_text(encoding='utf-8'))
        print('restored', name, 'count', len(data) if isinstance(data, list) else type(data))
    else:
        print('skip', name, 'cur_len', len(cur) if isinstance(cur, list) else cur)

# Why wipe happened: factory_reset clears these three files
import inspect, data_service
print('factory_reset clears members/recipes/reports:', 'members_path' in inspect.getsource(data_service.factory_reset))
"""


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="rle", password="rle", timeout=25, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file("/tmp/_verify_restored.py", "w") as f:
        f.write(REMOTE)
    sftp.close()
    _, stdout, stderr = c.exec_command(
        "cd /opt/kiosk && /opt/kiosk/venv/bin/python3 /tmp/_verify_restored.py", timeout=60
    )
    out = stdout.read().decode(errors="replace")
    print(out)
    err = stderr.read().decode(errors="replace")
    if err.strip():
        print("STDERR:", err[:500])
    c.close()

    # parse usernames/passwords from output
    members = []
    for line in out.splitlines():
        if line.startswith("{") and "username" in line:
            members.append(json.loads(line))

    print("--- HTTP login ---")
    st, data = http("POST", "/api/desktop/v1/auth/login", {"username": "RLERLT", "password": "Rahul"})
    print("factory RLERLT", st, (data.get("user") or {}).get("username") if st == 200 else data)

    for m in members:
        u = m["username"]
        p = m["password"]
        st, data = http("POST", "/api/desktop/v1/auth/login", {"username": u, "password": p})
        if st == 200:
            print("OK", repr(u), "->", (data.get("user") or {}).get("username"), (data.get("user") or {}).get("role"))
            # also me + reports
            token = data["token"]
            st2, me = http("GET", "/api/desktop/v1/auth/me", token=token)
            st3, reps = http("GET", "/api/desktop/v1/reports", token=token)
            print("  me", st2, "reports", st3, "count", len((reps or {}).get("reports") or []) if isinstance(reps, dict) else None)
        else:
            print("FAIL", repr(u), st, data)


if __name__ == "__main__":
    main()
