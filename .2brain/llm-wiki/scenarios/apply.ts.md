---
source: scenarios/apply.ts
sha256: dc1be20c2e406bd48b4ede106979b9d2420e64ebe436a523292db37b3cf56cf2
generated_at: 2026-10-14T06:55:48.161776+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI runner for `npm run scenario:apply`. It boots the full app in-process (calling `createApp().boot()`, never `start()`), drives real HTTP endpoints to generate realistic data, and manages the lifecycle: environment guards, optional DB reset, scenario build, cache cleanup, and forced process exit. It owns **data** seeding; `db:sync` owns schema.

## Key elements

- **`seed()`** — Orchestrates the entire run: validates the scenario name, boots the app, optionally empties the DB (`--reset`), calls `buildScenario`, clears caches, optionally writes a description file, and logs completion.
- **`bootAppInProcess()`** — Dynamically imports `../src/app`, calls `createApp()` → `boot()`, stores the instance on a module-level `app` variable for cleanup, and returns the Express instance.
- **`reset` / `scenarioArgument` / `describeTo`** — Parsed from `process.argv`: `--reset` flag, one positional scenario name, and `--describe-to=<path>` for writing a JSON description file.
- **Environment overrides** (all set via `installEnvironment` *before* the app import):
  - `SCRIPTED_RATE_LIMITS` — relaxes per-IP budgets so hundreds of seed requests don't hit 429.
  - `NODE_MAIL_TRANSPORT: 'log'` — renders mail without opening a socket.
  - `NODE_RABBITMQ_ENABLED: '0'` — forces inline job execution so mail goes through `log`, not a live consumer's SMTP.
  - `DEMO_BANK_TRANSFER` — filled in **only where the key is undefined** in the existing env (unlike the others, which override).
- **`deploymentRateLimitRedisUrl`** — Captured from `limitsRedisUrl()` *before* the env overrides switch the limiter to in-memory, so `--reset` can still clear the deployment's Redis counters.
- **Production gate** — `isRelaxedEnvironment()` must be true (i.e. `development` or `test`); all other values refuse the run.
- **Forced `process.exit()`** — Called after cleanup instead of letting `runScript` resolve, because the OpenTelemetry ESM loader hook (`module.register()`) keeps the event loop alive indefinitely.

## Relationships

- **`scenarios/index.ts`** — Supplies `DEFAULT_SCENARIO`, `isScenarioName`, and `buildScenario` (the scenario registry). `apply.ts` calls only the registry entry; it never names scenario internals.
- **`scenarios/accounts.ts`** — `seedCredentials` is included in the `--describe-to` JSON output.
- **`scenarios/rate-limits.ts`** — Provides `SCRIPTED_RATE_LIMITS` (env override) and `DEMO_BANK_TRANSFER` (bank beneficiary defaults).
- **`scenarios/support/database-snapshot.ts`** — `isDatabaseEmpty` gates the non-reset path; `emptyDatabase` is called under `--reset`.
- **`scenarios/support/development-doubles.ts`** — Imported for side-effects: registers the fake payment provider and mail log that seeded flows depend on.
- **`src/app.ts`** — `createApp()` is the sole entry point; `boot()` opens Mongo/Redis/adapter connections, `stop()` closes them. Never `start()`.
- **`src/infrastructure/adapters/cache.ts`** — `clearCache()` is called after seeding to evict module-fixture responses that went straight to Mongo.
- **`src/infrastructure/adapters/limits-redis.ts`** — `limitsRedisUrl()` is read once at module level to target the deployment's Redis for counter cleanup.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — `clearRateLimitCounters(url)` removes limiter keys under `--reset`.
- **`src/infrastructure/config/store.ts`** — `installEnvironment` and `currentEnvironment` drive all env overrides.
- **`src/infrastructure/config/dotenv.ts`** — Loaded first; populates `.env` values before overrides are applied.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported before any model loads so Mongoose global defaults are set at schema-build time.
- **`src/infrastructure/runtime/config.ts`** — `isRelaxedEnvironment` gates the script; `nodeEnvironment` is referenced in guards.
- **`scripts/run-script.ts`** — `runScript` wraps the CLI; `apply.ts` diverges by calling `process.exit()` explicitly (see Notes).
- **`src/infrastructure/adapters/logger.ts`** — `logger` for structured info/warn output throughout.

## Notes

- **Exit code contract:** A non-empty DB without `--reset` logs a message and returns **0**, not an error. This is deliberate: the compose `app` command is `npm run db:bootstrap && <server>`, and a non-zero exit would prevent an already-seeded container from starting.
- **Env override ordering:** `installEnvironment` calls happen *before* the dynamic `import('../src/app')` because `buildRateLimiter` reads the environment once at middleware-wiring time, not per request. `dotenv/config` never overwrites a key already present.
- **Fail-open cleanup:** Both `clearCache` and `clearRateLimitCounters` log a warning on unreachable Redis but do **not** throw. Seeding must succeed even when Redis is down.
- **Plain-text passwords in fixtures:** Intentional. The model's pre-save hook performs hashing; writing a hash by hand would drift from that hook and make the plaintext unrecoverable.
- **`--describe-to` writes a file, not stdout:** `npm run` prints banner lines to stdout; the paired frontend's live-profile reset needs to parse clean JSON. This is also the only way a live backend can describe its dataset, since `/__test/*` is never mounted on one.
- **`DEMO_BANK_TRANSFER` is merge-on-missing, not override:** A deployment that names its own beneficiary keeps it; the default only fills gaps. This is the one env override that checks `currentEnvironment()[key] === undefined` before setting.
- **OpenTelemetry hangs the process:** The `module.register()` loader hook from `@opentelemetry/instrumentation` is process-lifetime and unregistrable. Without the explicit `process.exit()`, the event loop never drains. This is safe only because `stop()` has already awaited `shutdownAnalytics()` and `shutdownTracing()`. Other `runScript` callers never import `src/app.ts` and never hit this issue.
