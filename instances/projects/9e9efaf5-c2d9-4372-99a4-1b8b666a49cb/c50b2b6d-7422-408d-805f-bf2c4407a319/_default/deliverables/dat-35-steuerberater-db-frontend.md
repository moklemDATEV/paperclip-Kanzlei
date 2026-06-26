# DAT-35 Steuerberater DB Frontend

## Delivered

- Added a dedicated Node service at `showcase/steuerberater-db-server.js`.
- Added a browser UI under `showcase/steuerberater-db/` for CRUD access to:
  - `mandanten`
  - `account_catalog`
  - `buchungen`
  - `buchung_lines`
- Added automatic SQLite migrations for:
  - `buchungen.annotation`
  - `buchung_lines.annotation`
  - `buchungen_changelog`
- Added changelog-first update handling for `buchungen` and `buchung_lines`.
- Added a focused smoke test: `npm run steuerberater-db:smoke`
- Added a background deploy script: `npm run deploy:steuerberater-db`

## Runtime

- Default host: `0.0.0.0`
- Default port: `4182`
- Public HTTPS path: `https://13.49.175.198/steuerberater-db/`
- Log file: `showcase/runtime/steuerberater-db.log`
- PID file: `showcase/runtime/steuerberater-db.pid`
- Browser note: the nginx certificate is self-signed, so a trust warning is expected.

## Verification

Run:

```bash
npm run steuerberater-db:smoke
```

Deploy:

```bash
npm run deploy:steuerberater-db
curl -sS http://127.0.0.1:4182/api/steuerberater/health
```
