#!/usr/bin/env python3
"""Deploy desktop_api module to any RLE Pi kiosk (/opt/kiosk) — does not modify app.py."""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import paramiko

USER = "rle"
PASSWORD = "rle"
KIOSK_ROOT = Path(__file__).resolve().parents[1] / "TD KIOSK FINAL PHASE 2"
REMOTE_ROOT = "/opt/kiosk"

DESKTOP_API_FILES = [
    "__init__.py",
    "routes.py",
    "auth_store.py",
    "desktop_helpers.py",
    "members_routes.py",
    "recipes_routes.py",
    "embed_routes.py",
    "rbac_compat.py",
    "recipes_compat.py",
]

STATIC_FILES = [
    "desktop_embed.js",
    "desktop_embed.css",
    "desktop_embed_bootstrap.js",
]

# Shared multi-product bridge (registers desktop_api; product-agnostic).
BRIDGE_TEMPLATE = KIOSK_ROOT / "bridge.py"


def sftp_put(sftp, local: Path, remote: str) -> None:
    sftp.put(str(local), remote)


def run(client, cmd: str, timeout: int = 120) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out += "\nSTDERR:\n" + err
    return out


def upload_desktop_api(sftp, app_name: str | None) -> None:
    remote_api = f"{REMOTE_ROOT}/desktop_api"
    remote_static = f"{remote_api}/static"
    for path in (remote_api, remote_static):
        try:
            sftp.mkdir(path)
        except OSError:
            pass

    for name in DESKTOP_API_FILES:
        local = KIOSK_ROOT / "desktop_api" / name
        sftp_put(sftp, local, f"{remote_api}/{name}")

    for name in STATIC_FILES:
        local = KIOSK_ROOT / "desktop_api" / "static" / name
        sftp_put(sftp, local, f"{remote_static}/{name}")

    sftp_put(sftp, BRIDGE_TEMPLATE, f"{REMOTE_ROOT}/bridge.py")

    if app_name:
        with sftp.file(f"{REMOTE_ROOT}/desktop_app_name", "w") as remote_file:
            remote_file.write(app_name.strip() + "\n")


def ensure_launch_scripts(client, stamp: str) -> None:
    print("Ensuring launch scripts use bridge.py and FLASK_HOST=0.0.0.0...")
    print(
        run(
            client,
            f"""
set +e
for RUN in {REMOTE_ROOT}/run_kiosk_app.sh {REMOTE_ROOT}/start_kiosk.sh {REMOTE_ROOT}/run_hardness_bridge.sh; do
  if [ -f "$RUN" ]; then
    if ! grep -q 'bridge.py' "$RUN"; then
      cp "$RUN" "$RUN.bak.{stamp}"
      sed -i 's|$APP_ROOT/app.py|$APP_ROOT/bridge.py|g' "$RUN"
      sed -i 's|/app.py|/bridge.py|g' "$RUN"
      echo patched:$RUN
    else
      echo already-patched:$RUN
    fi
    grep -q 'FLASK_HOST=0.0.0.0' "$RUN" || sed -i '/export APP_ROOT/a export FLASK_HOST=0.0.0.0' "$RUN" 2>/dev/null || true
  fi
done
# Prefer EnvironmentFile / drop-in for systemd unit if present
if [ -f {REMOTE_ROOT}/kiosk-bridge.service ]; then
  grep -q 'bridge.py' {REMOTE_ROOT}/kiosk-bridge.service && echo unit-mentions-bridge || true
fi
""",
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Deploy desktop_api to Pi kiosk (/opt/kiosk)")
    parser.add_argument(
        "--host",
        default=os.environ.get("PI_HOST") or None,
        help="Pi IP/hostname (or set PI_HOST). Required if not set.",
    )
    parser.add_argument(
        "--app-name",
        default=os.environ.get("DESKTOP_APP_NAME") or None,
        help='Product title for health.app (e.g. "Friability Tester", "Tap Density")',
    )
    args = parser.parse_args()
    host = (args.host or "").strip()
    if not host:
        print("ERROR: --host or PI_HOST is required.", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {host}...")
    client.connect(host, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    stamp = time.strftime("%Y%m%d_%H%M%S")
    print("Creating backup...")
    print(
        run(
            client,
            f"""
echo {PASSWORD} | sudo -S mkdir -p {REMOTE_ROOT}/backups/{stamp} 2>/dev/null
cp -a {REMOTE_ROOT}/desktop_api {REMOTE_ROOT}/backups/{stamp}/desktop_api 2>/dev/null || true
cp {REMOTE_ROOT}/bridge.py {REMOTE_ROOT}/backups/{stamp}/bridge.py 2>/dev/null || true
cp {REMOTE_ROOT}/desktop_app_name {REMOTE_ROOT}/backups/{stamp}/desktop_app_name 2>/dev/null || true
cp {REMOTE_ROOT}/run_kiosk_app.sh {REMOTE_ROOT}/backups/{stamp}/run_kiosk_app.sh 2>/dev/null || true
cp {REMOTE_ROOT}/start_kiosk.sh {REMOTE_ROOT}/backups/{stamp}/start_kiosk.sh 2>/dev/null || true
""",
        )
    )

    print("Uploading desktop_api package and multi-product bridge.py...")
    if args.app_name:
        print(f"Setting desktop_app_name to: {args.app_name}")
    sftp = client.open_sftp()
    try:
        upload_desktop_api(sftp, args.app_name)
    finally:
        sftp.close()

    ensure_launch_scripts(client, stamp)

    compile_targets = " ".join(
        [f"{REMOTE_ROOT}/desktop_api/{name}" for name in DESKTOP_API_FILES]
        + [f"{REMOTE_ROOT}/bridge.py"]
    )
    print("Syntax check on Pi...")
    print(run(client, f"{REMOTE_ROOT}/venv/bin/python3 -m py_compile {compile_targets}"))

    print("Restarting kiosk-bridge...")
    print(run(client, f"echo {PASSWORD} | sudo -S systemctl restart kiosk-bridge"))
    time.sleep(5)

    print("Verifying endpoints...")
    verify = run(
        client,
        f"""
sleep 2
ss -tlnp | grep 5000 || true
echo '--- health desktop ---'
curl -sS -m 8 http://127.0.0.1:5000/api/desktop/v1/health; echo
echo '--- permission-cards (expect 401) ---'
curl -sS -m 8 -o /dev/null -w 'permission-cards: %{{http_code}}\\n' http://127.0.0.1:5000/api/desktop/v1/permission-cards
echo '--- embed route (expect 403) ---'
curl -sS -m 8 -o /dev/null -w 'embed: %{{http_code}}\\n' http://127.0.0.1:5000/desktop/embed/recipes
echo '--- desktop routes count ---'
cd {REMOTE_ROOT} && {REMOTE_ROOT}/venv/bin/python3 -c "
import os, sys
os.chdir('{REMOTE_ROOT}')
sys.path.insert(0, '{REMOTE_ROOT}')
import app as kiosk_app
from app import app
try:
    from desktop_api import register as register_desktop_api
    register_desktop_api(app, kiosk_app)
except Exception as e:
    print('register-note', e)
rules = [r.rule for r in app.url_map.iter_rules() if '/api/desktop/v1' in r.rule or '/desktop/embed' in r.rule]
print('desktop routes:', len(set(rules)))
for r in sorted(set(rules))[:25]:
    print(' ', r)
" 2>&1 || echo import-check-failed
""",
    )
    print(verify)

    client.close()

    print("\nDeploy complete. Testing from LAN...")
    import urllib.request

    try:
        with urllib.request.urlopen(f"http://{host}:5000/api/desktop/v1/health", timeout=10) as resp:
            print("LAN desktop health:", resp.read().decode()[:300])
    except Exception as exc:
        print("LAN test failed:", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
