---
source: scenarios/apply.ts
sha256: 78aa051a496004eb4dd3b7e7241e5f95c3f23f052839ee06ed2ea280ab804a79
generated_at: 2026-09-23T17:16:53.443382+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI runner for `npm run scenario:apply`. It validates safety gates, boots the Express app **in-process** (no port), calls the named scenario's `buildScenario` (which drives real checkout/payment/shipping flows through the middleware stack), clears the cache, and exits. It owns no scenario data — `scenarios/index.ts`'s registry does that.

## Key elements

- **Top-level env setup** — Sets `NODE_APP_NO_LISTEN`, merges `SCRIPTED_RATE_LIMITS`, forces `NODE_MAIL_TRANSPORT=log`, and applies `DEMO_BANK_TRANSFER` defaults. Must run before the dynamic `import('../src/app')` because `app.ts` reads these at import time.
- **`reset` / `scenarioArgument` / `describeTo`** — Parsed from `process.argv`; the only CLI surface (one positional, two flags).
- **`bootAppInProcess()`** — Dynamically imports `../src/app`, calls `bootInfrastructure()`, stores the module in `application`, returns the Express instance.
- **`seed()`** — Main body: production gate → unknown-scenario gate → public-password gate → boot → `--reset` / non-empty check → `buildScenario(name, app)` → `clearCache()` → optional `--describe-to` file write.
- **Entry point** — `runScript(seed, cleanup).then(() => process.exit(...))`; the forced exit is required (see Notes).

## Relationships

- **`scenarios/index.ts`** — Source of `DEFAULT_SCENARIO`, `isScenarioName`, and `buildScenario`; the registry maps scenario names to their builders.
- **`scenarios/accounts.ts`** — Provides `hasFallbackSeedPassword()` (safety gate) and `seedCredentials` (written into the `--describe-to` file).
- **`scenarios/rate-limits.ts`** — Provides `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER` env presets applied at the top of this file.
- **`src/app.ts`** — Dynamically imported; this file needs its Express instance and `bootInfrastructure`/`stopServer` lifecycle methods.
- **`src/infrastructure/runtime/database-snapshot.ts`** — `emptyDatabase()` (reset path) and `isDatabaseEmpty()` (skip-if-seeded guard).
- **`src/infrastructure/adapters/cache.ts`** — `clearCache()` invalidates stale responses after seeding; result is logged, never thrown.
- **`src/infrastructure/adapters/logger.ts`** — All human-facing output.
- **`scripts/db/run-script.ts`** — Wraps the async `seed` with a cleanup callback (`application?.stopServer()`); this file is the one caller that additionally forces `process.exit`.

## Notes

- **`NODE_APP_NO_LISTEN` must be set at top level, before the dynamic import.** `src/app.ts` reads it at import time for its auto-start; the cleanup path can also import the app, so the variable must already be present.
- **Forced `process.exit` is intentional and unique to this caller.** Importing `src/app.ts` pulls in `@opentelemetry/instrumentation`, whose `module.register()` hook spawns a worker thread that never drains. `stopServer()` cannot unregister it. Other `runScript` callers never import `src/app.ts` and rely on `process.exitCode` instead.
- **Non-empty DB → warn + exit 0, not throw.** The compose `app` command chains `npm run db:bootstrap && start`; a non-zero exit here would prevent an already-seeded container from booting.
- **Cache clear is fail-open.** If Redis is down, seeding still succeeds; the warning makes the stale-cache window visible in logs.
- **Plain-text passwords in fixtures are deliberate.** The model's pre-save hook performs hashing; writing a hash by hand would drift from that hook and leave no recoverable plaintext.
- **`dotenv/config` runs first but never overwrites.** The subsequent `Object.assign(process.env, …)` and `??=` assignments are safe because dotenv respects pre-existing keys.
