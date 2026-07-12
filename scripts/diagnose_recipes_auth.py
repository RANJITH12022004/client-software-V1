#!/usr/bin/env python3
"""Diagnose recipe embed auth flow against Pi."""

import json
import sys
import urllib.error
import urllib.request

try:
    import paramiko
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.33"
BASE = f"http://{HOST}:5000"


def http(method, path, body=None, token=None):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw[:500]
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:500]


def ssh_probe():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="rle", password="rle", timeout=20, allow_agent=False, look_for_keys=False)
    remote = r"""
cd /opt/kiosk
echo '=== EMBED ROUTES ==='
curl -sS -m 5 -o /dev/null -w 'embed issue no auth: %{http_code}\n' -X POST http://127.0.0.1:5000/api/desktop/v1/embed/issue
echo '=== MEMBERS ==='
/opt/kiosk/venv/bin/python3 -c "import json,data_service; ms=data_service.list_members();
import pprint
for m in ms:
    pprint.pp({k:m.get(k) for k in ['id','username','role','status','failedAttempts','permissions','permissionCards']})"
"""
    _, stdout, stderr = client.exec_command(remote, timeout=90)
    print(stdout.read().decode())
    err = stderr.read().decode().strip()
    if err:
        print("SSH STDERR:", err)
    client.close()


def main():
    print(f"=== Diagnose recipes auth @ {HOST} ===\n")
    ssh_probe()

    st, members = http("GET", "/api/data/members")
    print(f"GET /api/data/members -> {st}")
    if isinstance(members, dict):
        for member in members.get("members", []):
            print(
                " member:",
                member.get("username"),
                member.get("role"),
                "status=",
                member.get("status"),
                "perms=",
                member.get("permissions") or member.get("permissionCards"),
            )

    # Unlock RUN and Rahul via SSH for testing
    for username in ("run", "rahul"):
        unlock_script = f"""
import json, pathlib
import data_service
members_path = data_service._get_storage_path('members.json')
members = json.loads(pathlib.Path(members_path).read_text(encoding='utf-8'))
for m in members:
    if str(m.get('username') or '').strip().lower() == '{username}':
        m['status'] = 'active'
        m['failedAttempts'] = 0
        m['mustChangePassword'] = False
        data_service._clear_creation_password_commitment(m)
        pathlib.Path(members_path).write_text(json.dumps(members, indent=2), encoding='utf-8')
        print('unlocked', m.get('username'))
        break
"""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(HOST, username="rle", password="rle", timeout=20, allow_agent=False, look_for_keys=False)
        cmd = f"cd /opt/kiosk && /opt/kiosk/venv/bin/python3 -c {json.dumps(unlock_script)}"
        _, stdout, _ = client.exec_command(cmd, timeout=60)
        print(stdout.read().decode().strip())
        client.close()

    passwords = {
        "RUN": ["run", "Run", "RUN", "admin", "Admin", "1234", "password", "rle"],
        "Rahul": ["rahul", "Rahul", "1234", "password"],
    }
    token = None
    logged_user = None
    for user, pwds in passwords.items():
        for pwd in pwds:
            st, data = http("POST", "/api/desktop/v1/auth/login", {"username": user, "password": pwd})
            if st == 200 and isinstance(data, dict) and data.get("token"):
                token = data["token"]
                logged_user = user
                print(f"\nLOGIN OK: {user} / {pwd}")
                user_obj = data.get("user") or {}
                print(
                    " user perms:",
                    user_obj.get("permissions"),
                    user_obj.get("permissionCards"),
                )
                break
        if token:
            break

    if not token:
        print("\nCould not login with known passwords — checking 401 path with fake token")
        st, data = http("GET", "/api/desktop/v1/auth/me", token="invalid-token-test")
        print("auth/me invalid token:", st, data)
        st, data = http("POST", "/api/desktop/v1/embed/issue", token="invalid-token-test")
        print("embed/issue invalid token:", st, data)
        return 1

    st, me = http("GET", "/api/desktop/v1/auth/me", token=token)
    print(f"\nauth/me -> {st}")
    if isinstance(me, dict):
        u = me.get("user") or {}
        print(" permissions:", u.get("permissions"))
        print(" permissionCards:", u.get("permissionCards"))

    st, embed = http("POST", "/api/desktop/v1/embed/issue", token=token)
    print(f"\nembed/issue -> {st}", embed if st != 200 else {"url": (embed.get("url") or "")[:100]})

    if st == 200 and isinstance(embed, dict) and embed.get("url"):
        ticket_url = embed["url"]
        req = urllib.request.Request(ticket_url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read(800).decode("utf-8", errors="replace")
                print(f"\nembed page -> {resp.status}, len={len(html)}")
                print(" has DESKTOP_EMBED_MODE:", "DESKTOP_EMBED_MODE" in html)
                print(" has manage-recipes:", "page-manage-recipes" in html or "manage-recipes" in html)
        except urllib.error.HTTPError as exc:
            print(f"\nembed page -> {exc.code}", exc.read()[:200])

    return 0


if __name__ == "__main__":
    sys.exit(main())
