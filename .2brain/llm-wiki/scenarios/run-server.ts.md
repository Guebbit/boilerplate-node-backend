---
source: scenarios/run-server.ts
sha256: 27cffc9f0163a9b192f537189c7270f191cadce5fd4177f9fe5b71973bbadab7
generated_at: 2026-11-14T17:16:31.222590+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Boots the real application as a self-contained, disposable demo server (`npm run demo`). It starts an in-memory (or externally supplied) MongoDB, seeds it from the `shop` scenario, installs a fixed environment, and serves the API on `NODE_PORT` with cache and queue disabled. No Docker, Redis, or broker required. Multiple instances can run side by side on different ports.

## Key elements

- **`DOTENV`** — Reads `.env` into a plain object via `node:util` `parseEnv` without touching `process.env`, so real secrets in the file are isolated from the demo profile's overrides.
- **`shellValue(key)`** — Returns a variable only if the *shell* (not `.env`) set it to a value different from what `.env` itself declares. Used to let intentional overrides (e.g., a pinned rate limit) win while ignoring a plain `.env` copy.
- **`REQUIRED_DEFAULTS`** — Fallback environment values (loopback host, throwaway secrets, legal/VAT fields, CORS origins) so a bare checkout with no `.env` can boot. Only fills keys the shell and `.env` did not already set.
- **`FORCED_ABSENT`** — List of Redis/RabbitMQ env vars blanked to `''` (not deleted) to defeat `dotenv/config`'s "only fills absent keys" semantics later in `src/app.ts`.
- **`FORCED_MAIL_TRANSPORT`** — Unconditionally set to `'outbox'` so the e2e suite can read sent mail via `GET /__test/emails` regardless of what `.env` says.
- **`waitUntilListening(port)`** — Polls `GET /` every 100 ms (60 s timeout) to confirm the server is seeding-complete and accepting connections.
- **Boot sequence (bottom of file)** — `startEphemeralMongo` → signal handlers for clean shutdown → `installEnvironment` (merging defaults, forced-absent, scripted rate limits, derived `NODE_DB_URI`/`NODE_URL`) → `installDemoClock` / `registerDemoClock` → app creation via `createApp` extension → `waitUntilListening`.

## Relationships

- **`scenarios/rate-limits.ts`** — Imports `DEMO_BANK_TRANSFER` (spread into `REQUIRED_DEFAULTS`) and `SCRIPTED_RATE_LIMITS` (applied as overrides in `installEnvironment`) to pin demo-friendly rate-limit budgets and a known bank-transfer config.
- **`scenarios/support/demo-clock.ts`** — Imports `installDemoClock` and `registerDemoClock` to replace real-time clocks with a deterministic one before the app starts.
- **`scenarios/support/ephemeral-mongo.ts`** — Imports `startEphemeralMongo` to launch (or connect to) a MongoDB instance and obtain a URI; the returned handle's `stop()` is wired into SIGTERM/SIGINT cleanup.
- **`scenarios/support/ephemeral-mongod.ts`** — Imports `startInProcessMongod` and passes it as the `startInProcess` strategy to `startEphemeralMongo`, enabling the in-process mongod path.
- **`src/infrastructure/config/store.ts`** — Imports `currentEnvironment` and `installEnvironment`; the latter is the single write path through which all env overrides, forced-absent values, and the derived `NODE_DB_URI`/`NODE_URL` reach the app.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import (first line after stdlib) to set Mongoose global defaults before any schema/model is built.
- **`src/infrastructure/adapters/logger.ts`** — Consumed indirectly: the app this script boots (`createApp`) configures logging through the logger adapter; this file does not import it directly.

## Notes

- **`.env` is deliberately not loaded via `dotenv/config` here.** The `FORCED_ABSENT` vars are set to `''` (present-but-empty) rather than deleted because `src/app.ts` later calls `dotenv/config`, which only fills keys that are *absent* from `process.env`. An empty string blocks the reload; a missing key would not.
- **Database name is always `demo`**, regardless of whether the Mongo is in-memory or external (`NODE_TEST_MONGO_URI`). This gives the external path a stable, persistent name across restarts.
- **`NODE_URL` is always derived** from the actual listening port, never defaulted from `.env`, because OAuth redirect URIs and password-reset links are built from it and must match the instance actually serving.
- **Signal cleanup matters**: without the SIGTERM/SIGINT handlers, an in-process mongod leaves a ~200 MB data directory in the temp folder on every boot.
- **`NODE_HOST` defaults to `127.0.0.1`** because the demo's token secrets are public and the control surface can wipe the database. Override explicitly to expose on LAN.
- The paired frontend's dev server and e2e suite run against this profile instead of a hand-written mock; the e2e shard runner waits on `waitUntilListening`'s same `GET /` endpoint.
