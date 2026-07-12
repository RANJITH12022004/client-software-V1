#!/usr/bin/env python3
"""Smoke-test report PDF generation on the Pi."""

import json
import sys
import urllib.error
import urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.33"
BASE = f"http://{HOST}:5000"


def post_json(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_bytes(path, token):
    req = urllib.request.Request(
        BASE + path,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read(), resp.status


def main():
    login = post_json("/api/desktop/v1/auth/login", {"username": "Factory", "password": "factory"})
    token = login.get("token") or ""
    print("token_len", len(token))

    req = urllib.request.Request(
        BASE + "/api/desktop/v1/reports",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    reports = data.get("reports") or []
    print("reports", len(reports))
    for report in reports[:5]:
        rid = report.get("id")
        status = report.get("reportApprovalStatus") or report.get("status")
        print(f"  id={rid} status={status}")
        try:
            blob, code = get_bytes(f"/api/desktop/v1/reports/{rid}/pdf", token)
            head = blob[:8]
            print(f"    pdf bytes={len(blob)} head={head!r} pdf_magic={head.startswith(b'%PDF-')}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:200]
            print(f"    pdf http {exc.code}: {body}")


if __name__ == "__main__":
    main()
