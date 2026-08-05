#!/usr/bin/env python3
"""Verify desktop major audits + report PDF on Disintegration Tester."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

HOST = "100.108.165.100"
BASE = f"http://{HOST}:5000"


def http(method, path, body=None, token=None, timeout=90):
    data = None
    headers = {"Accept": "*/*"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "json" in ctype or (raw[:1] in (b"{", b"[")):
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, {"bytes": len(raw), "pdf": raw[:4] == b"%PDF"}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except Exception:
            return exc.code, raw.decode(errors="replace")[:300]


def main() -> int:
    st, login = http("POST", "/api/desktop/v1/auth/login", {"username": "RA", "password": "Rle@1234"})
    print("login", st, (login.get("user") or {}).get("username") if isinstance(login, dict) else login)
    token = login.get("token") if isinstance(login, dict) else None
    if not token:
        return 1

    st, reports = http("GET", "/api/desktop/v1/reports", token=token)
    reps = (reports or {}).get("reports") or []
    rid = reps[0]["id"] if reps else None
    print("reports", st, "count", len(reps), "first", rid)

    if rid is not None:
        st, pdf = http("GET", f"/api/desktop/v1/reports/{rid}/pdf?purpose=view", token=token)
        print("pdf view", rid, st, pdf)

    st, _ = http("POST", "/api/desktop/v1/auth/logout", token=token)
    print("logout", st)

    time.sleep(1)
    st, login2 = http("POST", "/api/desktop/v1/auth/login", {"username": "RA", "password": "Rle@1234"})
    token2 = login2.get("token")
    st, audit = http("GET", "/api/desktop/v1/audit", token=token2)
    entries = (audit or {}).get("entries") or []
    print("audit entries", len(entries))
    interesting = []
    for e in entries:
        action = str(e.get("action") or "")
        details = str(e.get("details") or "")
        if action in ("Login", "Logout", "Reports exported", "Audit trail exported") or "Desktop" in details or "desktop" in details.lower():
            interesting.append(e)
    print("interesting count", len(interesting))
    for e in interesting[-12:]:
        print(
            "-",
            e.get("action"),
            "|",
            e.get("user"),
            e.get("role"),
            "|",
            (e.get("details") or "")[:100],
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
