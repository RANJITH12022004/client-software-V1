#!/usr/bin/env python3
"""Verify desktop login token works for embed/issue (unified auth_store)."""

import json
import sys

import paramiko

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.33"

REMOTE = r"""
cd /opt/kiosk
/opt/kiosk/venv/bin/python3 - <<'PY'
import json
import data_service
from app import app
from desktop_api import register as register_desktop_api
import app as kiosk_app

register_desktop_api(app, kiosk_app)

client = app.test_client()
member = data_service.get_member_by_username('RUN')
if not member:
    raise SystemExit('RUN member missing')

# Simulate legacy app.py login path (first-registered desktop_auth_login handler).
from app import _desktop_issue_token
user = data_service.sanitize_member_for_client(member)
token, snapshot = _desktop_issue_token(user)
print('issued token via app._desktop_issue_token:', token[:16] + '...')

me = client.get('/api/desktop/v1/auth/me', headers={'Authorization': 'Bearer ' + token})
print('auth/me status:', me.status_code, me.get_json())

embed = client.post('/api/desktop/v1/embed/issue', headers={'Authorization': 'Bearer ' + token})
print('embed/issue status:', embed.status_code)
body = embed.get_json() if embed.is_json else embed.get_data(as_text=True)[:200]
print('embed/issue body:', body)
if embed.status_code != 200:
    raise SystemExit(1)
url = body.get('url') if isinstance(body, dict) else ''
if not url:
    raise SystemExit('missing embed url')
page = client.get(url.replace('http://localhost', '').split('://', 1)[-1].split('/', 1)[-1] if '://' in url else url)
# fetch relative ticket path
from urllib.parse import urlparse
path = urlparse(url).path + ('?' + urlparse(url).query if urlparse(url).query else '')
page = client.get(path)
print('embed page status:', page.status_code, 'len', len(page.get_data()))
if page.status_code != 200:
    raise SystemExit(1)
html = page.get_data(as_text=True)
print('has DESKTOP_EMBED_MODE:', 'DESKTOP_EMBED_MODE' in html)
print('OK')
PY
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username="rle", password="rle", timeout=30, allow_agent=False, look_for_keys=False)
_, stdout, stderr = client.exec_command(REMOTE, timeout=120)
out = stdout.read().decode()
err = stderr.read().decode()
client.close()
print(out)
if err.strip():
    print("STDERR:", err)
sys.exit(0 if "OK" in out and "embed/issue status: 200" in out else 1)
