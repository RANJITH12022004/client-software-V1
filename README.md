# RLE Desktop Client

Standalone Electron desktop client for connecting to an RLE Pi kiosk over IP, saving reports and audit PDFs to a folder on the PC, with optional scheduled auto backup.

## What it does

1. **Add a machine** by IP address and choose a **save folder** on this computer (file explorer).
2. **Sign in** to the machine.
3. **Download Reports** or **Audit Trails** manually — only new items since the last save.
4. **Auto backup** — daily, weekly, or monthly at a chosen time; same incremental sync runs automatically.

Files are saved under your chosen folder:

```text
{savePath}/reports/report-{id}.pdf
{savePath}/audit/audit-{timestamp}.pdf
```

## Pi server requirement

The Pi must expose HTTP PDF download routes. See `docs/kiosk-api-contract.md`. The main kiosk app lists data at `/api/data/*`, but the desktop client needs `/api/desktop/v1/*` to stream PDFs to the PC (not USB export).

Also set `FLASK_HOST=0.0.0.0` on the Pi so the desktop can reach port 5000 over the LAN.

## Technology Choices

- Electron main process: Node.js with CommonJS for a simple, conventional Electron entry point.
- Renderer: plain HTML, CSS, and JavaScript only. No React, Vue, TypeScript, or frontend build framework.
- Packaging: `electron-builder.yml`.
- HTTP client: native `fetch`, assuming the Electron runtime uses a Node.js version that includes `globalThis.fetch`.

## Scripts

```sh
npm start
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

Install dependencies before running the scripts:

```sh
npm install
```

## Security Baseline

Renderer files must not use `require()` or access Node/Electron APIs directly. All privileged functionality should flow through `src/main/preload.js` using `contextBridge.exposeInMainWorld`.
