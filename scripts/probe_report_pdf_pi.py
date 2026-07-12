#!/usr/bin/env python3
import paramiko

HOST = "192.168.1.33"
REMOTE = r"""
cd /opt/kiosk
/opt/kiosk/venv/bin/python3 <<'PY'
import pathlib
import report_service
import data_service
import pdf_generator

reports = data_service.list_reports("all")[:5]
print("reports", len(reports))
for r in reports:
    rid = int(r.get("id"))
    html = report_service.build_report_pdf_html(r)
    print("id", rid, "html_len", len(html), "text_snip", html[html.find('<pre>')+5:html.find('<pre>')+40].replace('\n','\\n'))
    out = pathlib.Path(f"/tmp/probe-report-{rid}.pdf")
    try:
        pdf_generator.render_html_to_pdf(html, out)
        data = out.read_bytes()
        print("  pdf", out, "bytes", len(data), "magic", data[:5])
    except Exception as e:
        print("  pdf FAIL", e)
PY
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="rle", password="rle", timeout=20, allow_agent=False, look_for_keys=False)
_, o, e = c.exec_command(REMOTE, timeout=120)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print("STDERR:", err)
c.close()
