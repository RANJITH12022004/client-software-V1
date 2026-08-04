# New machine onboarding — RLE Desktop Client

Use this checklist for **any** product that should work with the RLE Desktop Client (Tap Density, Friability Tester, future instruments).

## Contract (shared)

All machines expose the same HTTP surface on **port 5000**:

- `GET /api/desktop/v1/health` → `{ ok, app, model, serial }` (`app` is product title)
- Bearer auth: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- Reports, audit, members/profile, recipes, approval-verify, recipe embed (`/desktop/embed/recipes?ticket=…`)

See [kiosk-api-contract.md](kiosk-api-contract.md) for the full path list.

## Pi requirements (`/opt/kiosk` only)

1. Product Flask app under `/opt/kiosk` (`app.py`, `data_service`, `rbac_service`, storage, venv).
2. Process started via **`bridge.py`** (not bare `app.py`) so desktop routes register once.
3. Shared package **`desktop_api/`** deployed from this repo (do **not** paste product UI into the desktop client).
4. Optional product title file: `/opt/kiosk/desktop_app_name` (one line), or env `DESKTOP_APP_NAME`.
5. Bind `0.0.0.0:5000` (LAN reachable). Systemd unit typically `kiosk-bridge`.

## Deploy

```bash
python scripts/deploy_desktop_api_pi.py --host <PI_IP> --app-name "Product Title"
```

Examples:

- Friability: `--host 192.168.1.100 --app-name "Friability Tester"`
- Tap Density: `--host 192.168.1.33 --app-name "Tap Density"`
- Tablet Hardness: `--host 100.108.222.67 --app-name "Tablet Hardness Tester"`
  (also reachable on LAN as `192.168.1.100` when on the same subnet)
- Tablet Disintegration: `--host 100.108.165.100 --app-name "Tablet Disintegration Tester"`
  (LAN also `192.168.1.60` / `192.168.1.32` when on the same subnet)
The script uploads `desktop_api/`, installs the multi-product `bridge.py`, writes `desktop_app_name`, restarts `kiosk-bridge`, and checks LAN health.

## Desktop client

1. **Add Machine** → enter IP → Test Connection (shows `health.app` / model / serial).
2. Nickname + save folder → Save.
3. Sign in with a machine member account that has the needed permission cards.
4. If the Pi IP changes later: **Edit** the machine, update IP, Test Connection, Save (session token for that device is cleared automatically).

## Verification

```bash
python scripts/deploy_desktop_api_pi.py --host 100.108.222.67 --app-name "Tablet Hardness Tester"
python scripts/verify_hardness_desktop.py
python scripts/deploy_desktop_api_pi.py --host 100.108.165.100 --app-name "Tablet Disintegration Tester"
python scripts/verify_disintegration_desktop.py
# or health only:
curl -s http://<PI_IP>:5000/api/desktop/v1/health
```

Manual matrix: login, reports download, audit PDF, profiles, recipes embed (create/edit/disable/approve), backup if exposed.

## Adapting a new product

- Keep product-specific validation in the Pi `calculation_service` / recipe form (Friability drums vs Tap Density cylinders).
- Prefer thin adapters in `desktop_api/` (`rbac_compat.py`, `recipes_compat.py`) over forking the Electron app.
- If the kiosk SPA uses different API paths, extend embed remap rules in `desktop_api/static/desktop_embed.js` only.
- Never copy another product’s `app.py` onto a live `/opt/kiosk` tree.
