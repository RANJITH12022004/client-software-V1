#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.33", username="rle", password="rle", timeout=15, allow_agent=False, look_for_keys=False)
REMOTE = r"""
cat /opt/kiosk/run_kiosk_app.sh 2>/dev/null
echo '---'
systemctl show kiosk-bridge -p ExecStart -p Environment --no-pager 2>/dev/null
echo '---'
grep -n 'FLASK_HOST\|app.run\|127.0.0.1' /opt/kiosk/run_kiosk_app.sh /opt/kiosk/app.py 2>/dev/null | head -15
echo '--- MEMBERS sample ---'
curl -sS -m 5 http://127.0.0.1:5000/api/data/members 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('members',[]); print([(x.get('username'), x.get('role')) for x in m[:5]])" 2>/dev/null
"""
_, stdout, _ = c.exec_command(REMOTE, timeout=30)
print(stdout.read().decode())
c.close()
