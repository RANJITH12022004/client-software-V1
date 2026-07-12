# Pi Server API for RLE Desktop Client

The desktop client connects to the Pi kiosk over **IP (HTTP port 5000)**. Files are streamed to the user's chosen folder on the laptop/desktop.

**Production deploy** extends only `desktop_api/` and `bridge.py` — **`app.py` is not modified** on live machines.

**Multi-product:** The same contract is used for Tap Density, Friability Tester, and future `/opt/kiosk` instruments. Health `app` is product-specific (`DESKTOP_APP_NAME` or `/opt/kiosk/desktop_app_name`). Onboarding checklist: [new-machine-desktop.md](new-machine-desktop.md).

## Architecture

| Layer | Path prefix | Auth |
|-------|-------------|------|
| Desktop API | `/api/desktop/v1/*` | `Authorization: Bearer <token>` |
| Recipe embed shell | `/desktop/embed/recipes?ticket=…` | One-time ticket (30 min) |
| Kiosk SPA (touchscreen) | `/api/data/*`, `/` | Session + `X-User-*` headers |

## Core endpoints

```text
GET  /api/desktop/v1/health              → { ok, app, model, serial, time }
POST /api/desktop/v1/auth/login          → { token, user { permissions, permissionCards } }
GET  /api/desktop/v1/auth/me
POST /api/desktop/v1/auth/logout
GET  /api/desktop/v1/reports             → reports-view
GET  /api/desktop/v1/reports/<id>/pdf
POST /api/desktop/v1/reports/download
GET  /api/desktop/v1/audit               → audit-view
POST /api/desktop/v1/audit/download
GET  /api/desktop/v1/network/ips
```

## Deploy

```bash
python scripts/deploy_desktop_api_pi.py --host 192.168.1.100 --app-name "Friability Tester"
python scripts/deploy_desktop_api_pi.py --host 192.168.1.33 --app-name "Tap Density"
```

## Members / profiles (RBAC)

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/desktop/v1/members` | `user-manage` |
| POST | `/api/desktop/v1/members` | `user-add` |
| GET | `/api/desktop/v1/members/<id>` | `user-manage` or self |
| PUT | `/api/desktop/v1/members/<id>` | `user-manage` or self (self: name/password only) |
| DELETE | `/api/desktop/v1/members/<id>` | `user-delete` + `X-Approval-Verify-Token` |
| POST | `/api/desktop/v1/members/<id>/unlock` | `user-unlock` |
| POST | `/api/desktop/v1/members/<id>/enable` | `user-enable` |
| GET/PUT | `/api/desktop/v1/profile` | any authenticated (self) |
| POST | `/api/desktop/v1/approval-verify` | authenticated caller; verifier credentials in body |
| GET | `/api/desktop/v1/permission-cards` | authenticated |

Approval verify body: `{ method: "credentials", purpose: "recipe"|"user_admin"|"report"|"export", username, password }`  
Returns: `{ ok, token, expiresInSec, verifier }` — pass token as `X-Approval-Verify-Token` on subsequent mutating requests.

## Recipes (Bearer mirror of kiosk)

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/desktop/v1/recipes` | `recipe-list` / view keys |
| POST | `/api/desktop/v1/recipes` | `recipe-manage` |
| GET | `/api/desktop/v1/recipes/<id>` | view keys |
| PUT | `/api/desktop/v1/recipes/<id>` | `recipe-manage` |
| DELETE | `/api/desktop/v1/recipes/<id>` | `recipe-delete` / `disable-recipes` |
| POST | `/api/desktop/v1/recipes/<id>/approve` | `recipe-approve` + verify token |
| POST | `/api/desktop/v1/recipes/validate` | `recipe-manage` / test keys |

## Recipe embed flow

1. Client logs in → Bearer token.
2. `POST /api/desktop/v1/embed/issue` (requires `recipe-list` or `recipe-manage`) → `{ ticket, url }`.
3. Desktop **webview** loads `url` (`/desktop/embed/recipes?ticket=…`).
4. Shell injects `desktop_embed.js`, which:
   - Sets `window.currentUser` from ticket
   - Patches `apiRequest()` → `/api/desktop/v1/recipes*` with Bearer
   - Hides non-recipe navigation; auto-opens **Manage Recipes**

This avoids overwriting the kiosk's shared `current_user.json` session file.

## Permission cards (Pi `rbac_service.py`)

| Card | Internal keys (subset) |
|------|------------------------|
| `perm_reports_view` | `reports-view` |
| `perm_audit_view` | `audit-view` |
| `perm_profile_admin` | `user-manage`, `user-add`, `user-delete`, … |
| `perm_recipe_manage` | `recipe-manage`, `recipe-list`, `recipe-edit` |
| `perm_recipe_approve` | `recipe-approve` |

Factory role bypasses all checks server-side.

## Deploy to production Pi

```bash
python scripts/deploy_desktop_api_pi.py --host 192.168.1.33
```

Script steps:

1. Backup `/opt/kiosk/desktop_api/` and `bridge.py` → `/opt/kiosk/backups/{timestamp}/`
2. Upload `desktop_api/` + `bridge.py`
3. `python3 -m py_compile` on Pi
4. `sudo systemctl restart kiosk-bridge`
5. Smoke: health, route count, embed 403 without ticket

### Rollback

```bash
sudo cp -a /opt/kiosk/backups/{timestamp}/desktop_api /opt/kiosk/
sudo cp /opt/kiosk/backups/{timestamp}/bridge.py /opt/kiosk/
sudo systemctl restart kiosk-bridge
```

## Desktop client behaviour

| Feature | Gated by |
|---------|----------|
| Reports tab / export | `reports-view` / `perm_reports_view` |
| Audit tab / export | `audit-view` / `perm_audit_view` |
| Sync new files | reports-view **or** audit-view |
| Profiles tab | `user-manage` / profile admin card |
| Recipes tab (webview) | `recipe-list` / `recipe-manage` |

User permissions refresh via `GET /auth/me` on dashboard load; cached in `sessionStorage` per device id.

## Incremental sync state (PC)

Per machine: `downloadedReportIds`, `lastAuditTimestampMs`, `savePath` under `{savePath}/{nickname}/reports|audit`.
