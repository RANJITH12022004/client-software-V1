#!/usr/bin/env python3
"""End-to-end recipe save + approval test on Pi desktop API."""

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
import app as kiosk_app
from desktop_api import register as register_desktop_api

register_desktop_api(app, kiosk_app)
client = app.test_client()

member = data_service.get_member_by_username('RUN')
user = data_service.sanitize_member_for_client(member)
from desktop_api import auth_store
login_token, _ = auth_store.issue_token(user)
headers = {'Authorization': 'Bearer ' + login_token, 'Content-Type': 'application/json'}

# Approval verify (creator session + approver credentials)
# Use RUN as both creator and approver for test - need someone with recipe-approve
# RUN has recipe-approve perms
verify_body = {
    'method': 'credentials',
    'username': 'RUN',
    'password': 'PLACEHOLDER',
    'purpose': 'recipe'
}
# Issue approval token directly (simulates successful verify without password)
approver = data_service.get_member_by_username('RUN')
approval_token, _ = auth_store.issue_approval_verify_token(approver, 'recipe')

recipe = {
    'productName': 'Desktop Embed Test Recipe',
    'steps': [{'speed': 300, 'dropHeight': 14, 'tapCount': 500}],
    'stepCount': 1,
    'cylinder': {'volume': 100},
    'usp': 'USP 1',
    'uspMode': 'USP1',
    'speed': 300,
    'dropHeight': 14
}
save_headers = dict(headers)
save_headers['X-Approval-Verify-Token'] = approval_token
resp = client.post('/api/desktop/v1/recipes', headers=save_headers, data=json.dumps(recipe))
print('save status:', resp.status_code)
print('save body:', resp.get_json())
if resp.status_code not in (200, 201):
    raise SystemExit(1)
body = resp.get_json()
saved = body.get('recipe') or {}
if saved.get('recipeApprovalStatus') != 'approved':
    print('expected approved, got', saved.get('recipeApprovalStatus'))
    raise SystemExit(1)
rid = body.get('id')
listed = client.get('/api/desktop/v1/recipes', headers=headers)
recipes = (listed.get_json() or {}).get('recipes') or []
found = any(int(r.get('id') or 0) == int(rid) for r in recipes)
print('listed recipe:', found)
if not found:
    raise SystemExit(1)
# cleanup - disable test recipe
client.delete('/api/desktop/v1/recipes/' + str(rid), headers=headers)
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
sys.exit(0 if "OK" in out else 1)
