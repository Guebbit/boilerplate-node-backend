---
source: scenarios/apply.ts
sha256: 126def662edaf9c6cf1e57d5b3ad5b4ea895da1adbfebe6d0cb0cb6430224c6c
generated_at: 2026-09-27T13:49:10.496404+00:00
model: ollama:qwen3.8:27b
---

# scenarios/apply.ts

## Purpose

CLI runner (`npm run scenario:apply [scenario]`) that seeds a database by booting the app **in-process** and driving the real checkout, payment, shipping, and refund endpoints. It owns the data; `db:sync` owns the schema. It exists so a scenario can only be built through the actual middleware stack (auth, rate-limiting, routing) rather than raw inserts.

## Key elements

- **Module-level env overrides** — Sets `SCRIPTED_RATE_LIMITS`, `NODE_MAIL_TRANSPORT='log'`, and `DEMO_BANK_TRANSFER` (via `??=`) *before* the dynamic `import('../src/app')` so the booted app picks them up.
- **CLI argument parsing** — Extracts the positional scenario name, `--reset`, and `--describe-to=<file>` from `process.argv`.
- **`bootAppInProcess()`** — Dynamically imports `src/app.ts`, calls `createApp()` → `boot()` (never `start()`), stores the instance in the module-level `application` variable, and returns the Express app.
- **`seed()`** — Main orchestration: safety gates → boot → optional `emptyDatabase()` / skip-if-non-empty → `buildScenario(name, app)` → `clearCache()` → optional `--describe-to` write.
- **`runScript` call + `process.exit()`** — Wraps `seed()` with a `finally` that calls `application?.stop()`, then forces exit (see Notes).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/index.ts` | Imports `DEFAULT_SCENARIO`, `isScenarioName`, `buildScenario` — the scenario registry. |
| `scenarios/accounts.ts` | Imports `hasFallbackSeedPassword` (gate check) and `seedCredentials` (written into `--describe-to` output). |
| `scenarios/rate-limits.ts` | Imports `DEMO_BANK_TRANSFER` and `SCRIPTED_RATE_LIMITS` for the env overrides. |
| `scripts/run-script.ts` | Provides the `runScript(signal, fn, cleanup)` wrapper for structured CLI execution. |
| `src/app.ts` | Dynamically imported; `createApp().boot()` is called, `start()` is **not**. |
| `src/infrastructure/runtime/database-snapshot.ts` | `emptyDatabase()` (on `--reset`) and `isDatabaseEmpty()` (skip gate). |
| `src/infrastructure/adapters/cache.ts` | `clearCache()` called after seeding to invalidate module-fixture cache entries. |
| `src/infrastructure/adapters/logger.ts` | All logging (info / warn) in this file. |

## Notes

- **Forced `process.exit()`** — Importing `src/app.ts` pulls in OpenTelemetry's `module.register()` ESM loader hook, which is process-lifetime and cannot be unregistered. Without a hard exit the event loop never drains. This is safe here only because `stop()` has already flushed async transports. Other `runScript` callers that never import `src/app` do not need this.
- **Non-empty DB → warn + succeed (exit 0)** — The compose `app` command runs `npm run db:bootstrap && <start server>`; a non-zero exit would prevent the container from starting.
- **`clearCache()` fails open** — If Redis is unreachable, seeding still succeeds; a warning is logged so the operator notices stale responses may persist until TTL expiry.
- **`--describe-to` writes to a file, not stdout** — `npm run` prints its own banner to stdout, and the paired frontend's live-profile reset needs parseable output.
- **`DEMO_BANK_TRANSFER` uses `??=`** (not `Object.assign`) so a deployment that sets its own beneficiary value is preserved; rate-limit and mail-transport overrides are unconditional.
