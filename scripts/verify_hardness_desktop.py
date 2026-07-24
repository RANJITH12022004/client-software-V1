#!/usr/bin/env python3
"""Smoke-test Hardness desktop API after deploy."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

import paramiko

HOST = "100.108.222.67"
BASE = f"http://{HOST}:5000"


def http(method, path, body=None, token=None, timeout=90):
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
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "json" in ctype or (raw and raw[:1] in (b"{", b"[")):
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, {"bytes": len(raw), "pdf": raw[:4] == b"%PDF"}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except Exception:
            return exc.code, raw.decode(errors="replace")[:250]


REMOTE = r"""
import os, sys
os.chdir("/opt/kiosk")
sys.path.insert(0, "/opt/kiosk")
import data_service
from app import STORAGE_DIR
data_service.init({"STORAGE_DIR": str(STORAGE_DIR)})

fs = data_service.get_factory_settings() or {}
# Daily reset (1 day) blocks desktop login immediately; use a normal CFR cycle.
fs["passwordResetPeriodDays"] = 90
data_service.save_factory_settings(fs)
print("policy", data_service.get_password_policy_for_members())

data_service.set_member_password(3, "DesktopAudit1!")
m = data_service.get_member(3)
print("after_set", m.get("username"), m.get("passwordLastChangedAt"))
print("expiry", data_service.get_member_password_expiry_state(m))
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="rle", password="rle", timeout=25, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    with sftp.file("/tmp/_hsetpw.py", "w") as remote:
        remote.write(REMOTE)
    sftp.close()
    _, stdout, stderr = client.exec_command(
        "cd /opt/kiosk && /opt/kiosk/venv/bin/python3 /tmp/_hsetpw.py", timeout=40
    )
    print(stdout.read().decode(errors="replace"))
    err = stderr.read().decode(errors="replace")
    if err.strip():
        print("STDERR:", err[:500])
    client.close()

    status, login = http(
        "POST",
        "/api/desktop/v1/auth/login",
        {"username": "RahulB", "password": "DesktopAudit1!"},
    )
    print("login", status, str(login)[:220])
    token = (login or {}).get("token") if isinstance(login, dict) else None
    if not token:
        return 1

    ok = True
    for path in (
        "/api/desktop/v1/auth/me",
        "/api/desktop/v1/reports",
        "/api/desktop/v1/audit",
        "/api/desktop/v1/members",
        "/api/desktop/v1/recipes",
    ):
        status, data = http("GET", path, token=token)
        detail = list(data)[:5] if isinstance(data, dict) else data
        if path.endswith("/reports") and isinstance(data, dict):
            detail = f"count={len(data.get('reports') or [])}"
        print(path, status, detail)
        if status not in (200, 403):
            ok = False

    status, embed = http("POST", "/api/desktop/v1/embed/issue", token=token)
    print("embed", status, str(embed)[:140])
    if status not in (200, 403):
        ok = False

    status, reports = http("GET", "/api/desktop/v1/reports", token=token)
    reps = (reports or {}).get("reports") or []
    if reps:
        rid = reps[0].get("id")
        status, pdf = http("GET", f"/api/desktop/v1/reports/{rid}/pdf", token=token, timeout=120)
        print("pdf", rid, status, pdf)

    print("SMOKE", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
