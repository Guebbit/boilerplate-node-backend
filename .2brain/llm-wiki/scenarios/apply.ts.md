---
source: scenarios/apply.ts
sha256: 9667ffd64d101c309a9b9cd2503de0d806dcdac1cd67eb9f46b5949d23e7a540
generated_at: 2026-10-29T01:21:31.079311+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI runner for `npm run scenario:apply`. Validates safety gates (non-production, non-public-password, non-empty-DB unless `--reset`), boots the app **in-process** via `createApp().boot()` (never `start()`), then delegates all seeding logic to `buildScenario` from the registry. It owns DATA; `db:sync` owns SCHEMA.

## Key elements

- **`seed()`** — Top-level orchestration: validates the scenario name, boots the app, handles `--reset` (empties DB + clears rate-limit counters) or the empty-DB gate, calls `buildScenario(scenarioName, app)`, clears the response cache, optionally writes a `--describe-to` JSON file.
- **`bootAppInProcess()`** — Dynamically imports `../src/app`, calls `createApp()` → `boot()`, stashes the instance in the module-level `app` variable for cleanup, returns the Express instance.
- **`app`** (module-level `let`) — Reference to the booted instance; the `finally` block calls `app.stop()` to close Mongo, Redis, intervals, etc.
- **Top-level `installEnvironment(...)` calls** — Override `.env` *before* the dynamic `import('../src/app')` so the booted app picks them up: `SCRIPTED_RATE_LIMITS` (in-memory limiter), `NODE_MAIL_TRANSPORT='log'` (no real SMTP), `NODE_RABBITMQ_ENABLED='0'` (inline job execution), and `DEMO_BANK_TRANSFER` defaults (only if unset).
- **`deploymentRateLimitRedisUrl`** — Captured from `limitsRedisUrl()` *before* the env overrides, used by `clearRateLimitCounters` on `--reset`.
- **Arg parsing** — `reset` (`--reset`), `scenarioArgument` (positional), `describeTo` (`--describe-to=<path>`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/index.ts` | Provides `DEFAULT_SCENARIO`, `isScenarioName()`, and `buildScenario()` — the registry that maps a name to the full seed routine. |
| `scenarios/accounts.ts` | `seedCredentials` is included in the `--describe-to` JSON output. |
| `scenarios/rate-limits.ts` | `SCRIPTED_RATE_LIMITS` overrides the limiter for this process; `DEMO_BANK_TRANSFER` fills in bank-transfer fields when unset. |
| `scenarios/support/database-snapshot.ts` | `emptyDatabase()` (on `--reset`) and `isDatabaseEmpty()` (gate). |
| `scenarios/support/development-doubles.ts` | Side-effect import: registers fake payment provider and mail log before the app boots. |
| `scripts/run-script.ts` | `runScript` wraps the entry-point with shared CLI plumbing. |
| `src/app.ts` | Dynamically imported; `createApp()` is called for `boot()` only, never `start()`. |
| `src/infrastructure/adapters/cache.ts` | `clearCache()` after seeding (fail-open: warns if Redis unreachable). |
| `src/infrastructure/adapters/limits-redis.ts` | `limitsRedisUrl()` read once at module top for the reset path. |
| `src/infrastructure/adapters/logger.ts` | Structured logging throughout. |
| `src/infrastructure/config/dotenv.ts` | Side-effect import; loads `.env` before anything else. |
| `src/infrastructure/config/store.ts` | `installEnvironment()` (overrides) and `currentEnvironment()` (read defaults). |
| `src/infrastructure/http/middlewares/rate-limit-store.ts` | `clearRateLimitCounters(url)` on `--reset` (SCAN + DEL under the limiter prefix, never FLUSHALL). |
| `src/infrastructure/runtime/config.ts` | `isRelaxedEnvironment` / `nodeEnvironment` for the production and public-password gates. |
| `src/infrastructure/runtime/mongoose-boot.ts` | Side-effect import (before any model loads); sets Mongoose defaults. |

## Notes

- **Import ordering is load-bearing.** `dotenv` → `mongoose-boot` → `development-doubles` must precede any model or adapter access. `installEnvironment` calls execute at module top-level, *before* the dynamic `import('../src/app')`, so they bind only this process's app instance.
- **Forced `process.exit()` in `finally`.** Importing `src/app` pulls in OpenTelemetry's `module.register()` loader hook (a worker-thread-backed ESM patch). That hook is process-lifetime and cannot be unregistered by `stop()`, so the event loop never drains. The exit is safe because `stop()` has already awaited `shutdownAnalytics()` and `shutdownTracing()`. Other `runScript` callers don't import `src/app` and don't hit this.
- **Non-empty DB → warn and return 0.** A non-zero exit would abort the Compose chain `db:bootstrap && <start server>` in a container that is already seeded. Use `--reset` to force.
- **Cache clear is fail-open.** Seeding must succeed even when Redis is down; an unreachable Redis logs a warning but does not throw.
- **`--describe-to` writes a file, not stdout.** `npm run` injects its own banner lines into stdout, which would break the frontend's JSON parse. It is also the only channel a live backend can expose its seeded dataset, since `/__test/*` is never mounted in production.
- **`buildRateLimiter` reads env exactly once** (at middleware wiring during the dynamic import). Setting variables at module top therefore has no per-request cost and cannot be overridden later.
- **`DEMO_BANK_TRANSFER` is applied conditionally** — only for keys the deployment hasn't already set in `.env` — unlike the rate-limit and mail overrides which are unconditional.
