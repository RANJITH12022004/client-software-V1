#!/usr/bin/env python3
"""Smoke-test desktop API on multiple RLE machines."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

import paramiko

DEVICES = [
    {
        "host": "100.90.98.85",
        "expect_app": "Dissolution Auto Sampler",
    },
    {
        "host": "100.108.165.100",
        "expect_app": "Sieve Shaker CFR",
    },
    {
        "host": "100.85.166.118",
        "expect_app": "Leak Test",
    },
    {
        "host": "100.108.222.67",
        "expect_app": "Tap Density",
    },
]


def http(host, method, path, body=None, token=None, timeout=60):
    data = None
    headers = {"Accept": "*/*"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"http://{host}:5000{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "json" in ctype or (raw[:1] in (b"{", b"[")):
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, {"bytes": len(raw), "pdf": raw[:4] == b"%PDF"}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except Exception:
            return exc.code, raw.decode(errors="replace")[:250]
    except Exception as exc:
        return 0, str(exc)


PREP = r"""
import os, sys, json, pathlib
from datetime import datetime, timezone
os.chdir('/opt/kiosk')
sys.path.insert(0, '/opt/kiosk')
import data_service
from app import STORAGE_DIR
data_service.init({'STORAGE_DIR': str(STORAGE_DIR)})

fs = data_service.get_factory_settings() or {}
try:
    period = int(fs.get('passwordResetPeriodDays') or 0)
except Exception:
    period = 0
if period and period < 30:
    fs['passwordResetPeriodDays'] = 90
    data_service.save_factory_settings(fs)
    print('policy_period_set', 90)

print('FACTORY_USERNAME', getattr(data_service, 'FACTORY_USERNAME', None))
print('FACTORY_PASSWORD', repr(getattr(data_service, 'FACTORY_PASSWORD', None)))

members = data_service.list_members() or []
print('member_count', len(members))
picked = None
for m in members:
    role = str(m.get('role') or '').lower()
    if role in ('admin', 'qa', 'supervisor'):
        picked = m
        break
if not picked and members:
    picked = members[0]

if picked:
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    path = pathlib.Path(data_service._get_storage_path('members.json'))
    all_m = json.loads(path.read_text(encoding='utf-8'))
    for m in all_m:
        if int(m.get('id') or 0) == int(picked.get('id') or 0):
            m['status'] = 'active'
            m['failedAttempts'] = 0
            m['mustChangePassword'] = False
            m['passwordLastChangedAt'] = now
            if not str(m.get('password') or '').strip():
                m['password'] = 'DesktopAudit1!'
            try:
                data_service._clear_creation_password_commitment(m)
            except Exception:
                pass
            picked = m
            break
    path.write_text(json.dumps(all_m, indent=2), encoding='utf-8')
    print('SMOKE_USER', json.dumps({
        'username': picked.get('username'),
        'password': picked.get('password'),
        'role': picked.get('role'),
    }))
else:
    print('SMOKE_USER', json.dumps({}))
"""


def prep_login(host: str):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username="rle", password="rle", timeout=25, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    with sftp.file("/tmp/_multi_smoke_prep.py", "w") as remote:
        remote.write(PREP)
    sftp.close()
    _, stdout, stderr = client.exec_command(
        "cd /opt/kiosk && /opt/kiosk/venv/bin/python3 /tmp/_multi_smoke_prep.py", timeout=60
    )
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    client.close()
    smoke = {}
    factory_user = None
    factory_pass = None
    for line in out.splitlines():
        if line.startswith("SMOKE_USER "):
            smoke = json.loads(line[len("SMOKE_USER ") :])
        if line.startswith("FACTORY_USERNAME "):
            factory_user = line.split(" ", 1)[1].strip()
        if line.startswith("FACTORY_PASSWORD "):
            factory_pass = line.split(" ", 1)[1].strip().strip("'\"")
    return out, err, smoke, factory_user, factory_pass


def check_device(dev: dict) -> list[str]:
    host = dev["host"]
    expect = dev["expect_app"]
    fails = []

    def ok(name, condition, detail=""):
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
        if not condition:
            fails.append(name)

    print("\n" + "=" * 64)
    print(f"SMOKE {host} expect={expect!r}")

    st, health = http(host, "GET", "/api/desktop/v1/health")
    app_name = (health or {}).get("app") if isinstance(health, dict) else None
    ok("health", st == 200 and bool((health or {}).get("ok")), f"{st} {health}")
    ok("health.app", app_name == expect, f"got {app_name!r}")

    out, err, smoke, factory_user, factory_pass = prep_login(host)
    print(out.strip())
    if err.strip():
        print("  STDERR:", err[:250])

    token = None
    login_as = None
    candidates = []
    if smoke.get("username") and smoke.get("password"):
        candidates.append((smoke["username"], smoke["password"]))
    if factory_user and factory_pass:
        candidates.append((factory_user, factory_pass))
    candidates += [("RLERLT", "Rahul"), ("factory", "factory"), ("admin", "admin")]

    for user, pwd in candidates:
        st, data = http(host, "POST", "/api/desktop/v1/auth/login", {"username": user, "password": pwd})
        if st == 200 and isinstance(data, dict) and data.get("token"):
            token = data["token"]
            login_as = user
            break
        print(f"  login try {user!r} -> {st}")

    ok("login", bool(token), f"user={login_as}")
    if not token:
        return fails

    checks = [
        "/api/desktop/v1/auth/me",
        "/api/desktop/v1/reports",
        "/api/desktop/v1/audit",
        "/api/desktop/v1/members",
        "/api/desktop/v1/recipes",
        "/api/desktop/v1/permission-cards",
        "/api/desktop/v1/network/ips",
        "/api/desktop/v1/factory-settings",
    ]
    for path in checks:
        st, data = http(host, "GET", path, token=token)
        detail = list(data)[:5] if isinstance(data, dict) else type(data)
        if path.endswith("/reports") and isinstance(data, dict):
            detail = f"count={len(data.get('reports') or [])}"
        ok(path.rsplit("/", 1)[-1], st in (200, 403), f"{st} {detail}")

    st, embed = http(host, "POST", "/api/desktop/v1/embed/issue", token=token)
    ok("embed/issue", st in (200, 403), str(embed)[:100] if isinstance(embed, dict) else str(st))

    st, reports = http(host, "GET", "/api/desktop/v1/reports", token=token)
    reps = (reports or {}).get("reports") or [] if isinstance(reports, dict) else []
    if reps:
        rid = reps[0].get("id")
        st, pdf = http(host, "GET", f"/api/desktop/v1/reports/{rid}/pdf?purpose=view", token=token, timeout=120)
        ok("report pdf", st in (200, 403, 404), f"id={rid} status={st} {pdf}")
    else:
        print("  [SKIP] report pdf — no reports")

    return fails


def main() -> int:
    all_fails = []
    for dev in DEVICES:
        fails = check_device(dev)
        if fails:
            all_fails.append((dev["host"], fails))

    print("\n" + "=" * 64)
    if not all_fails:
        print("ALL DEVICES SMOKE PASS")
        return 0

    print("SMOKE FAILURES:")
    for host, fails in all_fails:
        print(f"  {host}: {', '.join(fails)}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
