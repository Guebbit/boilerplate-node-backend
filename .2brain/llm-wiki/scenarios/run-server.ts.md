---
source: scenarios/run-server.ts
sha256: 1926895d1a934681469da308178a284106349d4913801d1f996b34397cdcf4cb
generated_at: 2026-10-01T12:23:32.701548+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Entry point for the **demo profile** (`npm run demo`): boots the real application against an in-memory MongoDB, seeds it with the `shop` scenario, and serves on `NODE_PORT` (default 3000). No Docker, Redis, or message broker — cache and queue run disabled. This is the server the paired frontend dev-server and e2e suite target instead of a hand-written mock.

## Key elements

- **`corsOriginFromDotenv()`** — reads *only* `NODE_CORS_ORIGIN` from `.env` via `dotenv.parse` (no `process.env` write), so a lane's custom frontend port is respected without pulling in the file's real secrets.
- **`REQUIRED_DEFAULTS`** — env map filled when a key is absent or blank: hard-coded demo secrets (token, PII, TOTP, webhook), shop config (`NODE_SHOP_COUNTRY`, VAT rates), `SCRIPTED_RATE_LIMITS`, `DEMO_BANK_TRANSFER`, and the CORS fallback (`8080,8085`).
- **`FORCED_ABSENT`** — array of Redis/RabbitMQ env vars set to `''` (not deleted) to blank them out against `dotenv/config` re-injection.
- **`FORCED_MAIL_TRANSPORT`** — unconditionally sets `NODE_MAIL_TRANSPORT=outbox` so the e2e suite's `GET /__test/emails` endpoint always has data, regardless of `.env`.
- **`waitUntilListening(port)`** — polls `GET /` (60 s timeout) as a readiness gate; valid because `createApp().start()` seeds *before* listening.
- **Main IIFE** — orchestrates: `startEphemeralMongo` → SIGTERM/SIGINT cleanup handler → env shaping → `enableDemoProfile()` → `registerDemoClock(installDemoClock())` → `registerOAuthProvider('fake', …)` → **dynamic** `import('../src/app')` → `createApp().start()` → `waitUntilListening`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/rate-limits.ts` | Imports `SCRIPTED_RATE_LIMITS` (disables rate limits for e2e) and `DEMO_BANK_TRANSFER`. |
| `scenarios/support/demo-clock.ts` | Imports `installDemoClock()` to create the movable `Date` shim behind `/__test/clock`. |
| `scenarios/support/ephemeral-mongo.ts` | Imports `startEphemeralMongo` — returns a handle with `uri` and `stop()`. |
| `scenarios/support/ephemeral-mongod.ts` | Imports `startInProcessMongod`, passed as the `startInProcess` strategy. |
| `src/infrastructure/runtime/demo-profile.ts` | Imports `enableDemoProfile()` — mounts the `src/app/demo.ts` control surface (sole call site in the codebase). |
| `src/infrastructure/runtime/demo-clock.ts` | Imports `registerDemoClock` to wire the fake clock into the app's clock registry. |
| `src/modules/account/oauth/providers/index.ts` | Imports `registerOAuthProvider` to add the `'fake'` provider to the registry. |
| `src/modules/account/oauth/providers/fake.ts` | Imports `fakeOAuthProvider` so Cypress specs can complete the OAuth flow. |

## Notes

- **Empty-string, not deletion.** `FORCED_ABSENT` sets keys to `''` rather than `delete process.env[key]` because `src/app.ts` imports `dotenv/config`, which would re-inject `.env` values for any key the shell didn't already set. An empty string is treated as "unset" by every consumer.
- **Dynamic `import` is load-bearing.** `import('../src/app')` must execute *after* all `process.env` mutations. Static imports would let `src/app.ts` read the pre-shaped environment.
- **`NODE_URL` is always derived**, never defaulted-when-unset: `http://localhost:${NODE_PORT}/`. A stale checked-in `.env` value would break OAuth redirect URIs and email links on non-default ports.
- **Database name is always `demo`**, regardless of whether Mongo is in-process or external (`NODE_TEST_MONGO_URI`). This lets an external instance persist across restarts; in-process instances never shared data.
- **Multi-instance caveat.** Several in-memory instances can run in parallel (each owns its own mongod, ~200 MB temp dir). Pointing several at the *same* external Mongo via `NODE_TEST_MONGO_URI` means they share one database — do not combine the two paths unintentionally.
- **SIGTERM/SIGINT handler** calls `mongo.stop()` to remove the temp data directory before exiting; without it, ~200 MB of orphaned files accumulate per boot.
