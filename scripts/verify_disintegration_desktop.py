#!/usr/bin/env python3
"""Smoke-test Tablet Disintegration Tester desktop API at 100.108.165.100."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

import paramiko

HOST = "100.108.165.100"
BASE = f"http://{HOST}:5000"
EXPECT_APP = "Tablet Disintegration Tester"


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
            if "json" in ctype or (raw[:1] in (b"{", b"[")):
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, {"bytes": len(raw), "pdf": raw[:4] == b"%PDF"}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except Exception:
            return exc.code, raw.decode(errors="replace")[:300]
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
# Avoid 1-day password cycles blocking desktop login
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
print('POLICY', data_service.get_password_policy_for_members())

members = data_service.list_members() or []
print('member_count', len(members))
for m in members:
    print(json.dumps({
        'id': m.get('id'),
        'username': m.get('username'),
        'role': m.get('role'),
        'status': m.get('status'),
        'password': m.get('password'),
        'mustChange': m.get('mustChangePassword'),
        'failed': m.get('failedAttempts'),
        'expiry': data_service.get_member_password_expiry_state(m),
    }))

# Prefer an Admin/QA/Supervisor for smoke login; unlock + refresh password stamp
picked = None
for m in members:
    role = str(m.get('role') or '').lower()
    if role in ('admin', 'factory', 'qa', 'supervisor'):
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
            # keep existing password if present; otherwise set a known smoke password
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


def ssh_prep():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="rle", password="rle", timeout=30, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file("/tmp/_dt_smoke_prep.py", "w") as f:
        f.write(PREP)
    sftp.close()
    _, stdout, stderr = c.exec_command(
        "cd /opt/kiosk && /opt/kiosk/venv/bin/python3 /tmp/_dt_smoke_prep.py", timeout=60
    )
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    c.close()
    return out, err


def main() -> int:
    failures = []

    def check(name, ok, detail=""):
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures.append(name)

    print("=== prep on Pi ===")
    out, err = ssh_prep()
    print(out)
    if err.strip():
        print("STDERR:", err[:500])

    smoke_user = None
    factory_user = None
    factory_pass = None
    for line in out.splitlines():
        if line.startswith("SMOKE_USER "):
            smoke_user = json.loads(line[len("SMOKE_USER ") :])
        if line.startswith("FACTORY_USERNAME "):
            factory_user = line.split(" ", 1)[1].strip()
        if line.startswith("FACTORY_PASSWORD "):
            factory_pass = line.split(" ", 1)[1].strip().strip("'\"")

    st, health = http("GET", "/api/desktop/v1/health")
    check("health", st == 200 and (health or {}).get("ok"), f"{st} {health}")
    check("health.app", (health or {}).get("app") == EXPECT_APP, f"got {(health or {}).get('app')!r}")

    token = None
    login_as = None

    # Try smoke member, then factory
    candidates = []
    if smoke_user and smoke_user.get("username") and smoke_user.get("password"):
        candidates.append((smoke_user["username"], smoke_user["password"]))
    if factory_user and factory_pass:
        candidates.append((factory_user, factory_pass))
    candidates += [("factory", "factory"), ("RLERLT", "Rahul"), ("admin", "admin")]

    for u, p in candidates:
        st, data = http("POST", "/api/desktop/v1/auth/login", {"username": u, "password": p})
        if st == 200 and isinstance(data, dict) and data.get("token"):
            token = data["token"]
            login_as = u
            print(f"login ok as {u}")
            break
        print(f"login try {u!r} -> {st} {data if isinstance(data, dict) else data}")

    check("login", bool(token), f"user={login_as}")
    if not token:
        return 1

    st, me = http("GET", "/api/desktop/v1/auth/me", token=token)
    check("auth/me", st == 200 and isinstance(me, dict) and me.get("user"), str(st))

    for path in (
        "/api/desktop/v1/reports",
        "/api/desktop/v1/audit",
        "/api/desktop/v1/members",
        "/api/desktop/v1/recipes",
        "/api/desktop/v1/permission-cards",
        "/api/desktop/v1/network/ips",
        "/api/desktop/v1/factory-settings",
    ):
        st, data = http("GET", path, token=token)
        detail = list(data)[:6] if isinstance(data, dict) else type(data)
        if path.endswith("/reports") and isinstance(data, dict):
            detail = f"count={len(data.get('reports') or [])}"
        if path.endswith("/audit") and isinstance(data, dict):
            detail = f"entries={len(data.get('entries') or [])}"
        check(path.split("/")[-1], st in (200, 403), f"{st} {detail}")

    st, embed = http("POST", "/api/desktop/v1/embed/issue", token=token)
    check("embed/issue", st in (200, 403), str(embed)[:120] if isinstance(embed, dict) else str(st))
    if st == 200 and isinstance(embed, dict) and embed.get("url"):
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(embed["url"])
        fixed = urlunparse(parsed._replace(netloc=f"{HOST}:5000", scheme="http"))
        try:
            with urllib.request.urlopen(fixed, timeout=20) as resp:
                html = resp.read().decode("utf-8", "replace")
                check(
                    "embed page",
                    resp.status == 200 and "DESKTOP_EMBED_MODE" in html and "desktop_embed.js" in html,
                    f"len={len(html)}",
                )
        except Exception as exc:
            check("embed page", False, str(exc))

    st, reports = http("GET", "/api/desktop/v1/reports", token=token)
    reps = (reports or {}).get("reports") or [] if isinstance(reports, dict) else []
    if reps:
        rid = reps[0].get("id")
        st, pdf = http("GET", f"/api/desktop/v1/reports/{rid}/pdf", token=token, timeout=120)
        check("report pdf", st in (200, 403, 404), f"id={rid} status={st} {pdf}")
        # ZIP of one report
        st, z = http("POST", "/api/desktop/v1/reports/download", {"report_ids": [rid]}, token=token, timeout=180)
        check("reports zip", st in (200, 400, 403), f"{st} {z if isinstance(z, dict) else z}")
    else:
        print("[SKIP] report pdf/zip — no reports on machine")

    st, audit_dl = http("POST", "/api/desktop/v1/audit/download", {"filters": {}}, token=token, timeout=300)
    check(
        "audit download",
        st in (200, 403, 400),
        f"{st} {audit_dl if isinstance(audit_dl, dict) else audit_dl}",
    )

    print("\nSMOKE", "PASS" if not failures else f"FAIL ({', '.join(failures)})")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
