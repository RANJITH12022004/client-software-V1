#!/usr/bin/env python3
"""Unlock a kiosk member on the Pi (status=active, failedAttempts=0)."""

import argparse
import json
import sys

import paramiko

USER = "rle"
PASSWORD = "rle"
REMOTE_ROOT = "/opt/kiosk"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="192.168.1.33")
    parser.add_argument("--username", required=True, help="Member username to unlock (case-insensitive)")
    args = parser.parse_args()

    target = args.username.strip().lower()
    script = f"""import json, pathlib, os, sys
sys.path.insert(0, '{REMOTE_ROOT}')
os.chdir('{REMOTE_ROOT}')
import data_service
members_path = data_service._get_storage_path('members.json')
members = json.loads(pathlib.Path(members_path).read_text(encoding='utf-8'))
found = False
for m in members:
    un = str(m.get('username') or '').strip().lower()
    if un == '{target}':
        m['status'] = 'active'
        m['failedAttempts'] = 0
        m['mustChangePassword'] = False
        data_service._clear_creation_password_commitment(m)
        found = True
        print('Unlocked:', m.get('username'))
        break
if not found:
    print('NOT_FOUND')
    raise SystemExit(1)
pathlib.Path(members_path).write_text(json.dumps(members, indent=2), encoding='utf-8')
print('OK')
"""
    remote_script = f"/tmp/unlock_member_{target}.py"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(args.host, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    with sftp.file(remote_script, "w") as remote_file:
        remote_file.write(script)
    sftp.close()
    cmd = f"cd {REMOTE_ROOT} && {REMOTE_ROOT}/venv/bin/python3 {remote_script} && rm -f {remote_script}"
    _, stdout, stderr = client.exec_command(cmd, timeout=60)
    out = stdout.read().decode()
    err = stderr.read().decode()
    client.close()
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    return 0 if "OK" in out else 1


if __name__ == "__main__":
    sys.exit(main())
