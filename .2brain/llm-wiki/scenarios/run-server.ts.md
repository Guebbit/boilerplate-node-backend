---
source: scenarios/run-server.ts
sha256: fc3ff8cefc58aa9ef2017c32653504eb2b8544e4dcc3fef7b2c4e66b486adc0c
generated_at: 2026-10-14T07:00:57.405177+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Entry point for the **demo profile** (`npm run demo`): boots the real application against a self-contained in-memory MongoDB, seeds it from the `shop` scenario, and listens on `NODE_PORT`. No Docker, Redis, or message broker is required — cache and queue run in `disabled` mode. The paired frontend dev server and e2e suite run against this instead of a hand-written mock.

## Key elements

- **`dotenvValues()`** — Reads `.env` into a plain object via `dotenv.parse` + `readFileSync` *without* writing to `process.env`. Returns `{}` when the file is absent.
- **`shellValue(key)`** — Returns the shell-set value of a key, or `undefined`. A value equal to the `.env` file's own value is treated as the file's, not the shell's.
- **`REQUIRED_DEFAULTS`** — Fallback env vars (loopback host, throwaway token/PII/TOTP/webhook secrets, shop address, CORS origins) so a bare checkout with no `.env` can boot.
- **`FORCED_ABSENT`** — List of Redis/RabbitMQ env vars blanked to `''` to disable those services (empty string, not deletion, so a later `dotenv/config` load in `src/app.ts` cannot resurrect them).
- **`FORCED_MAIL_TRANSPORT`** — Unconditionally sets `NODE_MAIL_TRANSPORT` to `'outbox'` so the e2e suite can read mail via `GET /__test/emails`.
- **`waitUntilListening(port)`** — Polls `GET /` (up to 60 s) as a readiness signal; because `createApp().start()` seeds before listening, a 200 implies the DB is already populated.
- **Top-level boot sequence** — `startEphemeralMongo({ startInProcess: startInProcessMongod })` → SIGTERM/SIGINT cleanup handlers → `installEnvironment` with merged defaults → forces DB name to `/demo` → derives `NODE_URL` from the actual port → (truncated) app creation and `listen`.

## Relationships

- **`scenarios/rate-limits.ts`** — Imports `DEMO_BANK_TRANSFER` (merged into `REQUIRED_DEFAULTS`) and `SCRIPTED_RATE_LIMITS` (applied via `installEnvironment`, overridable only by a true shell value).
- **`scenarios/support/demo-clock.ts`** — Imports `installDemoClock` and `registerDemoClock` to deterministically control time for the scenario seed.
- **`scenarios/support/ephemeral-mongo.ts`** — Imports `startEphemeralMongo`, which returns a handle with `.uri` and `.stop()`; the Mongo URI is then rewritten to `/demo`.
- **`scenarios/support/ephemeral-mongod.ts`** — Imports `startInProcessMongod`, passed as the `startInProcess` option to `startEphemeralMongo` so the mongod runs in-process.
- **`src/infrastructure/config/store.ts`** — Imports `installEnvironment` (writes the merged config before app code reads it) and `currentEnvironment`.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import *before* any model loads, to set Mongoose defaults at schema-build time.

## Notes

- **`dotenv/config` is deliberately *not* imported here.** `src/app.ts` imports it later; this file only uses `dotenv.parse` to read values in isolation. Confusing the two breaks the override logic.
- **Blank ≠ delete for `FORCED_ABSENT`.** `dotenv` never overrides a key already present in `process.env` (empty string included), so `''` is the only reliable way to neutralise a value that `.env` would otherwise supply after `src/app.ts` loads.
- **Multiple instances** can run side-by-side on different ports, each with its own in-memory Mongo. Setting `NODE_TEST_MONGO_URI` switches to a shared external Mongo where data persists across restarts — do not mix the two casually.
- **`NODE_URL` is always derived** from the actual `NODE_PORT`, never read from `.env`, to keep OAuth redirect URIs and emailed links pointing at the correct instance.
- **~200 MB temp data directory** is left behind on every in-memory Mongo boot if SIGTERM/SIGINT cleanup fails; the handler logs but still exits.
- The file is the executable entry point (`#!/usr/bin/env tsx`); it has no named exports.
