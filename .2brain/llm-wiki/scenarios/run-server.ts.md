---
source: scenarios/run-server.ts
sha256: cf3475dfa49358dabfe8b46a2cb0b93e2f5e9bf63a321942edc3eaa61d3133d3
generated_at: 2026-10-29T01:25:11.027478+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Entry point for the demo profile (`npm run demo`). Boots the real application against an in-memory MongoDB (or an externally supplied one), seeds the `shop` scenario, and serves on `NODE_PORT`. Eliminates Docker, Redis, and broker dependencies by forcing them off. Serves as the backing server for the paired frontend's dev server and e2e suite.

## Key elements

- **`DOTENV`** — Reads `.env` in isolation via `node:util`'s `parseEnv`; never uses `dotenv/config` so real secrets in the file don't leak into `process.env`.
- **`shellValue(key)`** — Distinguishes values set by the shell (or a CI runner) from those merely present because `.env` was loaded into `process.env` by `development-doubles`.
- **`REQUIRED_DEFAULTS`** — Fallback env map (token secrets, PII keys, shop config, CORS origins, SMTP sender, etc.) that lets a bare checkout boot without any `.env`.
- **`FORCED_ABSENT`** — Keys (Redis, RabbitMQ) blanked to `''` to defeat `dotenv/config`'s "only fill if absent" semantics later in `src/app.ts`.
- **`FORCED_MAIL_TRANSPORT`** — Unconditionally set to `'outbox'` so the e2e suite's `GET /__test/emails` endpoint always works.
- **`waitUntilListening(port)`** — Polls `GET /` until the server responds (60 s timeout). Valid as a "ready" signal because `createApp().start()` seeds before listening.
- **Boot sequence** (module-level, no wrapper): `startEphemeralMongo` → SIGTERM/SIGINT handlers → `installEnvironment` (defaults + forced-absent + rate limits + mail transport + `NODE_DB_URI` + `NODE_URL`) → app start.

## Relationships

- **`scenarios/rate-limits.ts`** — Imports `DEMO_BANK_TRANSFER` (spread into `REQUIRED_DEFAULTS`) and `SCRIPTED_RATE_LIMITS` (overridden unless the shell set its own).
- **`scenarios/support/demo-clock.ts`** — Imports `installDemoClock`, `registerDemoClock` for deterministic time in the demo.
- **`scenarios/support/ephemeral-mongo.ts`** — Calls `startEphemeralMongo` to obtain a disposable Mongo URI; also provides the `mongo.stop()` cleanup used by the signal handlers.
- **`scenarios/support/ephemeral-mongod.ts`** — Passes `startInProcessMongod` as the `startInProcess` option so `ephemeral-mongo` can launch an in-process `mongod` when no external URI is given.
- **`src/infrastructure/config/store.ts`** — Calls `installEnvironment` (twice: initial config, then `NODE_DB_URI`) to write the fully-resolved environment into the config store before the app reads it.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import before any Mongoose model loads, to apply Mongoose defaults at schema-build time.

## Notes

- `FORCED_ABSENT` keys are set to empty string, **not deleted**. `src/app.ts` later runs `import 'dotenv/config'`, which will re-populate any absent key from `.env`; an already-present (even empty) key is left alone. All downstream readers treat `''` as unset.
- The database name is always forced to `/demo` regardless of the Mongo source, giving a stable name across restarts when using an external URI.
- `NODE_URL` is **always** derived from the actual listening port; it is never read from `.env` or `process.env`, preventing stale single-instance URLs from breaking OAuth redirects and emailed links.
- SIGTERM/SIGINT handlers call `mongo.stop()` (removes ~200 MB temp data dir) before `process.exit(0)`. Without them, an in-memory instance's data directory leaks on every boot.
- `NODE_HOST` defaults to `127.0.0.1` because the demo uses public, hard-coded token/PII keys and a control surface that can wipe the database. Override with `NODE_HOST=0.0.0.0` for cross-device access.
