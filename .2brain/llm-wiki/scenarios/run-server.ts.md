---
source: scenarios/run-server.ts
sha256: b006375bd78b97da08ec034a7c01c7e4031cb1dd06713c3b8a7e301b105e783c
generated_at: 2026-09-23T17:19:43.271667+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Entry point for the **demo profile** (`npm run demo`). Boots the real application against a self-contained, in-memory MongoDB, seeds the `shop` scenario, and serves on `NODE_PORT`. No Docker, Redis, or message broker required — cache and queue are disabled (a supported deployment shape). Serves as the backend for the paired frontend dev server and e2e suite, replacing any hand-written mock.

## Key elements

- **`REQUIRED_DEFAULTS`** — Map of env vars set when the shell hasn't already provided a non-empty value: `NODE_ENV=development`, `NODE_HOST=127.0.0.1` (loopback-only), hard-coded token secrets, plus spread-in `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER`.
- **`FORCED_ABSENT`** — Array of Redis/RabbitMQ env var names blanked to `''` (not deleted) to neutralize any `.env` or shell value.
- **`waitUntilListening(port)`** — Polls `GET /` (100 ms interval, 60 s timeout) until the server responds. Valid "ready" signal because `src/app.ts` seeds _before_ listening begins.
- **Main flow (top-level IIFE)** — `startEphemeralMongo({ startInProcess: startInProcessMongod })` → register SIGTERM/SIGINT cleanup → shape `process.env` → rewrite DB path to `/demo` → derive `NODE_URL` from `NODE_PORT` → call `enableDemoProfile()` → `import('../src/app')` (which self-boots) → `waitUntilListening`.

## Relationships

- **`scenarios/rate-limits.ts`** — Imports `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER` to relax rate-limiting and enable bank-transfer endpoints for the seeder and e2e suite.
- **`scenarios/support/ephemeral-mongo.ts`** — Calls `startEphemeralMongo()` to obtain a Mongo URI (in-memory by default; external if `NODE_TEST_MONGO_URI` is set).
- **`scenarios/support/ephemeral-mongod.ts`** — Provides `startInProcessMongod`, passed as the `startInProcess` strategy so the ephemeral Mongo spins up an in-process `mongod` when no external URI is given.
- **`src/infrastructure/runtime/demo-profile.ts`** — Calls `enableDemoProfile()` (the sole call site in the codebase) to mount the demo control surface in `src/app/demo.ts`.

## Notes

- **Blanking, not deleting, external-service vars.** `dotenv/config` (loaded by `src/app.ts`) won't override a key already present in `process.env`, even if empty. Setting `''` is the only way to ensure a stale `.env` value (e.g. a compose Redis hostname) cannot resurface. All readers in the codebase treat `''` as unset.
- **`NODE_URL` is always derived, never defaulted-when-unset.** A checked-in `.env` typically names the single-instance `:3000` setup; a stale `NODE_URL` would make OAuth `redirect_uri` and emailed password-reset/verify links point at the wrong instance on every non-default port.
- **Import order matters.** `import('../src/app')` is deferred until _after_ the environment is fully shaped, because `src/app.ts` self-boots (seeds + listens) on import.
- **Cleanup on signal.** SIGTERM/SIGINT handlers call `mongo.stop()` to remove the ~200 MB in-process data directory from the temp dir. Failure to stop logs an error but still exits — a lingering directory is a cleanup annoyance, not a reason to hang shutdown.
- **Multiple instances.** Each `NODE_PORT` value yields an independent in-memory Mongo. Pointing `NODE_TEST_MONGO_URI` at a shared compose Mongo makes all instances share one database — do not combine the two modes unintentionally.
