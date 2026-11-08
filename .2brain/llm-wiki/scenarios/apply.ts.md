---
source: scenarios/apply.ts
sha256: 9667ffd64d101c309a9b9cd2503de0d806dcdac1cd67eb9f46b5949d23e7a540
generated_at: 2026-11-08T02:27:39.856254+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI seeder invoked as `npm run scenario:apply [scenario]`. It owns **data** (as opposed to `db:sync`, which owns schema). It boots the app in-process via `createApp().boot()`, runs the named scenario's `buildScenario` against that instance, clears the cache, optionally writes a JSON description file, and shuts down. It exists so a fresh or reset database gets a coherent, flow-driven dataset without needing a live server.

## Key elements

- **`seed()`** — main entry: validates the scenario name, boots the app, gates on environment / DB emptiness, calls `buildScenario`, clears cache, writes `--describe-to` output, logs completion.
- **`bootAppInProcess()`** — dynamically imports `src/app`, calls `createApp()` then `.boot()` (never `.start()`), returns the Express instance. Stored in the module-level `app` ref so `finally` can call `.stop()`.
- **`reset` / `scenarioArgument` / `describeTo`** — parsed from `process.argv`; `--reset` triggers `emptyDatabase()` + rate-limit counter wipe before seeding.
- **Environment overrides** (module-top, before any dynamic import):
  - `SCRIPTED_RATE_LIMITS` — replaces deployment budgets so hundreds of seed requests don't hit 429.
  - `NODE_MAIL_TRANSPORT: 'log'` — prevents real SMTP sends to fictional recipients.
  - `NODE_RABBITMQ_ENABLED: '0'` — forces inline job execution through the `log` transport.
  - `DEMO_BANK_TRANSFER` — filled only where unset, so a real deployment's beneficiary is preserved.
- **`deploymentRateLimitRedisUrl`** — captured *before* the rate-limit override so `--reset` can still `SCAN + DEL` the deployment's counters (never `FLUSHALL`).
- **Cleanup in `finally`** — calls `app.stop()`, then `process.exit()`. The forced exit is required because `src/app.ts` pulls in OpenTelemetry's ESM `module.register()` loader hook (a worker-thread-backed process-lifetime hook), which keeps the event loop alive; `stop()` alone cannot unregister it.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/index.ts` | Provides `DEFAULT_SCENARIO`, `isScenarioName`, and `buildScenario` (the registry the runner delegates to). |
| `scenarios/accounts.ts` | Exports `seedCredentials`, written into the `--describe-to` JSON. |
| `scenarios/rate-limits.ts` | Exports `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER` used in the env overrides. |
| `scenarios/support/database-snapshot.ts` | `emptyDatabase()` / `isDatabaseEmpty()` for the `--reset` path and the non-empty gate. |
| `scenarios/support/development-doubles.ts` | Side-effect import that registers the fake payment provider and mail-log double before any model loads. |
| `scripts/run-script.ts` | `runScript` wraps `seed()` as the CLI entry; this file overrides its default exit strategy with an explicit `process.exit()`. |
| `src/app.ts` | Dynamically imported; `createApp().boot()` provides the middleware stack and loopback listener the scenario flows drive. |
| `src/infrastructure/adapters/cache.ts` | `clearCache()` invalidates stale module-fixture responses after seeding; fail-open if Redis is down. |
| `src/infrastructure/adapters/limits-redis.ts` | `limitsRedisUrl()` read once, pre-override, to target the deployment's Redis for counter cleanup. |
| `src/infrastructure/adapters/logger.ts` | Structured logging throughout. |
| `src/infrastructure/config/dotenv.ts` | Side-effect import (`.env` loaded before any model reads config); guarantees keys already present in `process.env` are not overwritten by later `installEnvironment` calls. |
| `src/infrastructure/config/store.ts` | `installEnvironment` / `currentEnvironment` for the env overrides and the `DEMO_BANK_TRANSFER` filter. |
| `src/infrastructure/http/middlewares/rate-limit-store.ts` | `clearRateLimitCounters` for the `--reset` counter wipe. |
| `src/infrastructure/runtime/config.ts` | `isRelaxedEnvironment` / `nodeEnvironment` used in the production / public-password gates. |
| `docker-compose.production.yml` | Context for the production-environment refusal gate; the compose `app` command chains `db:bootstrap && start`, so this seeder must exit 0 on a skip. |

## Notes

- **`boot()` ≠ `start()`.** The app binds a loopback listener only, so the seed flows hit a local port rather than the deployment's `NODE_PORT`.
- **Non-empty DB → warn and return 0, never throw.** The compose `app` entrypoint runs this before starting the server; a non-zero exit would prevent an already-seeded container from ever starting.
- **Cache clear is fail-open.** An unreachable Redis logs a warning but does not fail the seed.
- **Rate-limit counter cleanup is best-effort.** If the URL is unset or Redis is unreachable, a warning is logged; the seed itself still succeeds.
- **Plain-text passwords in fixtures are intentional.** A Mongoose pre-save hook hashes them; writing a pre-hashed value here would drift from that hook and make the plaintext unrecoverable.
- **`process.exit()` in the `finally` block is load-bearing.** Without it the OpenTelemetry worker-thread hook keeps the event loop alive forever. It is safe here only because `stop()` has already flushed async analytics/tracing transports; other `runScript` callers that never import `src/app.ts` do not need it.
