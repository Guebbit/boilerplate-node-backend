---
source: scenarios/apply.ts
sha256: d14dcde41a9c2eefcb86f71ac611052d97d6519c14071e092ebb51c3a43b092c
generated_at: 2026-10-01T12:20:13.808165+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI entry point for `npm run scenario:apply`. Boots the full application in-process (middleware stack included), validates environment safety, then delegates all data construction to the named scenario's `buildScenario` from the registry. It is the runner — it owns the connection, the gates, and the single call — not the scenario itself.

## Key elements

- **`seed()`** — Main orchestrator. Validates the scenario name, boots the app, optionally empties the DB (`--reset`), calls `buildScenario(scenarioName, app)`, clears the cache, optionally writes a description file (`--describe-to`), and logs completion.
- **`bootAppInProcess()`** — Dynamically imports `src/app.ts`, calls `createApp()` → `instance.boot()`, stores the instance in the module-level `app` variable (for cleanup), and returns the Express instance.
- **Module-level env overrides** (executed at import time, before the dynamic `import('../src/app')`):
  - `Object.assign(process.env, SCRIPTED_RATE_LIMITS)` — forces in-memory rate limiting so the scripted flows (hundreds of requests from one IP) don't 429.
  - `process.env.NODE_MAIL_TRANSPORT = 'log'` — prevents real email sends during seeding.
  - `DEMO_BANK_TRANSFER` entries set via `??=` — fills in a default bank transfer only if the deployment hasn't named one.
- **`deploymentRateLimitRedisUrl`** — captured from `rateLimitRedisUrl()` *before* the in-memory override, so `--reset` can still clear the deployment's real Redis counters.
- **CLI argument parsing** — `reset` (`--reset`), `scenarioArgument` (positional), `describeTo` (`--describe-to=<file>`).
- **Bottom-level gate** — `isRelaxedEnvironment()` check: refuses to run unless `NODE_ENV` is `development` or `test`. On success, wraps `seed` in `runScript` with a `finally`-style cleanup (`app?.stop()`) and calls `process.exit()` explicitly.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/index.ts` | Imports `DEFAULT_SCENARIO`, `isScenarioName`, `buildScenario` — the registry that maps a name to a builder. |
| `scenarios/accounts.ts` | Imports `seedCredentials` (demo account list) for inclusion in the `--describe-to` output. |
| `scenarios/rate-limits.ts` | Imports `SCRIPTED_RATE_LIMITS` (env overrides) and `DEMO_BANK_TRANSFER` (default beneficiary). |
| `scripts/run-script.ts` | Imports `runScript` — the shared wrapper that applies environment-variable validation and structured error handling around the seed function. |
| `src/app.ts` | Dynamically imported; `createApp()` is called for `boot()` only (never `start()`), giving the flows a loopback listener. |
| `src/infrastructure/runtime/database-snapshot.ts` | Imports `emptyDatabase` (for `--reset`) and `isDatabaseEmpty` (the non-empty guard). |
| `src/infrastructure/adapters/cache.ts` | Imports `clearCache` — invalidates cached responses after seeding; fails open if Redis is down. |
| `src/infrastructure/adapters/logger.ts` | Imports `logger` for all structured output. |
| `src/infrastructure/http/middlewares/rate-limit-store.ts` | Imports `clearRateLimitCounters` (for `--reset`) and `rateLimitRedisUrl` (captured pre-override). |
| `src/infrastructure/runtime/config.ts` | Imports `isRelaxedEnvironment` and `nodeEnvironment` for the production-refusal gate. |

## Notes

- **`process.exit()` instead of natural drain.** Importing `src/app.ts` pulls in OpenTelemetry's `module.register()` ESM loader hook (a process-lifetime worker thread). Without a forced exit the event loop never empties. Safe here because `stop()` has already awaited analytics/tracing shutdown. Other `runScript` callers that never import `src/app.ts` don't hit this.
- **Env overrides are set at module top level**, before the dynamic import. They bind only to the app instance this process boots; they do not affect any other process or the `.env` file on disk.
- **Non-empty DB without `--reset` exits 0 with a warning**, not an error. This is deliberate: the compose `app` command runs `db:bootstrap && <start>`, and a non-zero exit would prevent a container from ever starting if the DB is already seeded.
- **Cache clear and rate-limit clear both fail open** (log a warning, do not throw) so seeding succeeds even when Redis is unreachable.
- **`describeTo` writes to a file, not stdout**, because `npm run` injects its own banner lines into stdout and the consuming frontend parser can't tolerate them.
- **`DEMO_BANK_TRANSFER` uses `??=`** (fill-only), unlike the rate-limit and mail overrides which use unconditional assignment. A deployment that names its own beneficiary keeps it.
