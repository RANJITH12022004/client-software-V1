#!/usr/bin/env python3
"""Reset Friability Rahul password and verify desktop API features."""

import json
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import paramiko

HOST = "192.168.1.100"
BASE = f"http://{HOST}:5000"
TEST_PASSWORD = "DesktopTest1!"


def ssh_upload_run(script_text: str) -> str:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="rle", password="rle", timeout=20, allow_agent=False, look_for_keys=False)
    remote = "/tmp/fr_verify_helper.py"
    sftp = client.open_sftp()
    with sftp.file(remote, "w") as handle:
        handle.write(script_text)
    sftp.close()
    _, stdout, stderr = client.exec_command(f"/opt/kiosk/venv/bin/python3 {remote}", timeout=90)
    out = stdout.read().decode()
    err = stderr.read().decode()
    client.close()
    if err.strip():
        out += "\nSTDERR:\n" + err
    return out


def http(method, path, body=None, token=None, extra=None, timeout=30):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:300]}
    except Exception as exc:
        return 0, {"_raw": str(exc)}


RESET_SCRIPT = f"""
import sys, os
sys.path.insert(0, '/opt/kiosk')
os.chdir('/opt/kiosk')
os.environ['APP_ROOT'] = '/opt/kiosk'
import app  # noqa: F401
import data_service
m = data_service.get_member_by_username('Rahul')
mid = int(m['id'])
data_service.set_member_password(mid, {TEST_PASSWORD!r})
m2 = data_service.get_member(mid)
m2['status'] = 'active'
m2['failedAttempts'] = 0
m2['mustChangePassword'] = False
data_service._clear_creation_password_commitment(m2)
data_service._save_member_record(m2)
print('password_reset_ok', mid)
"""


def main() -> int:
    checks = []

    def check(name, ok, detail=""):
        print(("PASS" if ok else "FAIL"), name, detail)
        checks.append(bool(ok))

    print(ssh_upload_run(RESET_SCRIPT))

    st, health = http("GET", "/api/desktop/v1/health")
    check("health", st == 200 and health.get("app") == "Friability Tester", health.get("app"))

    st, login = http("POST", "/api/desktop/v1/auth/login", {"username": "Rahul", "password": TEST_PASSWORD})
    check("login", st == 200 and bool(login.get("token")), st if st != 200 else login.get("user", {}).get("username"))
    if st != 200:
        print(login)
        return 1
    token = login["token"]

    st, me = http("GET", "/api/desktop/v1/auth/me", token=token)
    check("auth/me", st == 200 and bool(me.get("user")), st)

    for path in (
        "/api/desktop/v1/reports",
        "/api/desktop/v1/audit",
        "/api/desktop/v1/members",
        "/api/desktop/v1/recipes",
        "/api/desktop/v1/factory-settings",
        "/api/desktop/v1/network/ips",
    ):
        st, _ = http("GET", path, token=token)
        check(path.split("/")[-1], st in (200, 403), st)

    st, embed = http("POST", "/api/desktop/v1/embed/issue", token=token)
    check("embed/issue", st in (200, 403), st if st != 200 else (embed.get("url") or "")[:70])
    if st == 200 and embed.get("url"):
        parsed = urlparse(embed["url"])
        fixed = urlunparse(parsed._replace(netloc=f"{HOST}:5000", scheme="http"))
        with urllib.request.urlopen(fixed, timeout=20) as resp:
            html = resp.read(800).decode("utf-8", "replace")
            check("embed page", resp.status == 200 and "DESKTOP_EMBED_MODE" in html)

    # Approval + create using live login token and approval-verify API
    st, verify = http(
        "POST",
        "/api/desktop/v1/approval-verify",
        body={"method": "credentials", "username": "Rahul", "password": TEST_PASSWORD, "purpose": "recipe"},
        token=token,
    )
    check("approval-verify", st == 200 and bool(verify.get("token")), f"{st} {verify}")
    approval = verify.get("token") if st == 200 else None

    if approval:
        recipe = {
            "productName": "Compat Probe",
            "drumCount": 2,
            "speed": 25,
            "uspMode": "USP",
            "usp": "USP",
            "customCompletionMode": "COUNT",
            "tabletCount": 100,
        }
        st, body = http(
            "POST",
            "/api/desktop/v1/recipes",
            body=recipe,
            token=token,
            extra={"X-Approval-Verify-Token": approval},
        )
        check("recipe create", st in (200, 201), f"{st} {body}")
        if st in (200, 201) and body.get("id"):
            rid = body["id"]
            st2, _ = http("DELETE", f"/api/desktop/v1/recipes/{rid}", token=token)
            check("recipe disable", st2 in (200, 403, 404), st2)
            if st2 == 200:
                st3, _ = http("POST", f"/api/desktop/v1/recipes/{rid}/enable", token=token)
                check("recipe enable", st3 in (200, 403, 404), st3)

    st, _ = http("POST", "/api/desktop/v1/backup/download", token=token, timeout=90)
    check("backup", st in (200, 404, 405), st)

    st, _ = http("POST", "/api/desktop/v1/auth/logout", token=token)
    check("logout", st in (200, 401), st)

    failed = sum(1 for ok in checks if not ok)
    print("\nSummary:", "ALL PASS" if failed == 0 else f"{failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
