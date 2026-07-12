#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.33", username="rle", password="rle", timeout=15, allow_agent=False, look_for_keys=False)

REMOTE = r"""
echo '=== override file ==='
cat /etc/systemd/system/kiosk-bridge.service.d/lan-bind.conf 2>/dev/null || echo MISSING
echo '=== sudo test ==='
echo rle | sudo -S whoami 2>&1
echo '=== patch run script ==='
grep FLASK_HOST /opt/kiosk/run_kiosk_app.sh || true
if ! grep -q 'FLASK_HOST' /opt/kiosk/run_kiosk_app.sh; then
  echo rle | sudo -S sed -i '/export APP_ROOT/a export FLASK_HOST=0.0.0.0' /opt/kiosk/run_kiosk_app.sh 2>&1
fi
grep -A2 'export APP_ROOT' /opt/kiosk/run_kiosk_app.sh
echo rle | sudo -S systemctl restart kiosk-bridge 2>&1
sleep 4
ss -tlnp | grep 5000
curl -sS -m 5 http://192.168.1.33:5000/api/health; echo
"""
_, stdout, stderr = c.exec_command(REMOTE, timeout=90, get_pty=True)
print(stdout.read().decode())
print(stderr.read().decode()[-1500:])
c.close()
