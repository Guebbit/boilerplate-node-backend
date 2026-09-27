---
source: scenarios/run-server.ts
sha256: 5567dfee4823c2cebe22544f9d65cc8fe139cbddae7f762cbac7515df5acf1a8
generated_at: 2026-09-27T13:50:55.168399+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose
Entry point for the `npm run demo` profile: boots the real application against an in-memory (or externally supplied) MongoDB, seeds it from the `shop` scenario, and serves the API on `NODE_PORT`. It exists so the paired frontend dev server and e2e suite get a fully working backend without Docker, Redis, or a message broker.

## Key elements

- **`REQUIRED_DEFAULTS`** — A record of environment variables the demo needs (loopback host, throwaway token/encryption secrets, CORS origins, rate-limit overrides, bank-transfer script flag). Applied only when the shell hasn't already set a non-empty value.
- **`FORCED_ABSENT`** — List of Redis/RabbitMQ env keys blanked to `''` so the app runs with cache and queue disabled, regardless of what a `.env` file or shell exports.
- **`waitUntilListening(port)`** — Polls `GET /` every 100 ms (60 s timeout) until the server responds. Because `createApp().start()` seeds *before* it begins listening, a successful response also implies the database is populated.
- **Main flow (top-level promise chain)** — Starts ephemeral Mongo, registers SIGTERM/SIGINT cleanup, shapes `process.env`, calls `enableDemoProfile()`, dynamically imports `src/app`, starts it, then waits for the listener.

## Relationships

- **`scenarios/rate-limits.ts`** — Provides `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER`, spread into `REQUIRED_DEFAULTS` so the seeder and e2e suite aren't throttled.
- **`scenarios/support/ephemeral-mongo.ts`** — `startEphemeralMongo({ startInProcess: startInProcessMongod })` is the Mongo lifecycle owner (start → URI → `stop()` on signal).
- **`scenarios/support/ephemeral-mongod.ts`** — `startInProcessMongod` is the in-process mongod implementation injected as the `startInProcess` strategy.
- **`src/infrastructure/runtime/demo-profile.ts`** — `enableDemoProfile()` mounts the demo control surface (e.g., DB-wipe endpoint). This file is the **only** call site in the codebase.

## Notes

- **Blanking ≠ deleting.** `dotenv/config` (imported inside `src/app.ts`) only skips keys that are already *present*, even if empty. Setting `FORCED_ABSENT` keys to `''` is what actually prevents a `.env` from re-introducing a Redis/RabbitMQ URL.
- **`NODE_URL` is always derived** from `NODE_PORT`, never left to a `.env` default. A stale checked-in value would send OAuth redirects and email links to the wrong instance.
- **Database name is fixed to `demo`** regardless of whether Mongo is in-memory or external, so the external path persists across restarts under a stable name.
- **In-memory mongod leaves ~200 MB** of temp data on unclean shutdown; the SIGTERM/SIGINT handlers call `mongo.stop()` to clean up. If `stop()` itself fails, the process still exits.
- **`src/app` is imported dynamically** *after* the environment is fully shaped, so `createApp()` reads the correct values on first use.
