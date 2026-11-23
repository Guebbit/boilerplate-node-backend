---
source: scenarios/apply.ts
source_sha256: ba860190c786aed26c6410653a38639079e20514aeab9adc95e60226212631ff
context_sha256: 7549e07f68303a774d4c9e9504235dac57fed730388702f9e0323311c438d787
generated_at: 2026-11-22T01:41:44.523665+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/apply.ts

## Purpose
CLI runner behind `npm run scenario:apply` (and `scenario:apply:reset`). It owns seeding **data** (`db:sync` owns schema). It boots the real app in-process, applies safety gates, connects to the database, and makes a single call into `buildScenario`. The scenario contents live in the registry in `scenarios/index.ts`, not here.

## Key elements
- **CLI flags**
  - `--reset` empties the database first.
  - A single positional argument names the scenario. It defaults to `DEFAULT_SCENARIO` (`shop`) and is validated with `isScenarioName`.
  - `--describe-to=<file>` writes JSON `{ scenario, accounts, subjects }` to a file. It creates parent directories first. The file is used by the demo profile's `GET /__test/scenario` and the paired frontend's reset.
- **`bootAppInProcess()`** — dynamically imports `../src/app`, calls `createApp()` and `boot()` only (never `start()`), stores the instance for cleanup, and returns the Express app.
- **`seed()`** — the main flow:
  1. Rejects an unknown scenario name with a warning and returns.
  2. Boots the app.
  3. Reads the seed marker.
  4. Either rebuilds (`--reset`, or the marker is `running`) or skips (marker `done`, or the database is non-empty).
  5. Calls `buildScenario(name, app)`.
  6. Clears the cache.
  7. Optionally writes the description file.
  8. Writes the `done` marker.
- **Rebuild path** — writes the `running` marker, calls `emptyDatabase([SEED_MARKER_COLLECTION])` to keep the marker, then calls `clearRateLimitCounters(deploymentRateLimitRedisUrl)` and logs one of three outcomes: `not-configured`, `cleared`, or Redis unreachable.
- **Top-level gate** — if `isRelaxedEnvironment()` is true, it runs `runScript(undefined, seed, cleanup)`, where cleanup is `app?.stop()`. It then forces `process.exit(process.exitCode ?? 0)`. Otherwise it logs a refusal and exits 1.

## Relationships
- `scenarios/index.ts` supplies `DEFAULT_SCENARIO`, `isScenarioName` and `buildScenario`, which does all the scenario work.
- `scenarios/accounts.ts` supplies `seedCredentials`, written into the description file.
- `scenarios/support/database-snapshot.ts` supplies the seed marker helpers (`readSeedMarker`, `writeSeedMarker`, `SEED_MARKER_COLLECTION`) and `emptyDatabase` / `isDatabaseEmpty`.
- `scenarios/support/scripted-environment.ts` is imported for its side effects: it lifts budgets and pins the mail, broker and bank-transfer settings. It also exports `deploymentRateLimitRedisUrl`.
- `scenarios/support/development-doubles.ts` is imported for its side effects: it registers the fake payment provider and the mail log.
- `scripts/run-script.ts` supplies `runScript`, the wrapper that handles the environment gate and the exit code.
- `src/app.ts` supplies `createApp()`, imported lazily.
- `src/infrastructure/config/dotenv.ts` is imported first to load the environment.
- `src/infrastructure/runtime/mongoose-boot.ts` is imported before any model loads, because Mongoose defaults are read at schema build.
- `src/infrastructure/runtime/config.ts` supplies `isRelaxedEnvironment` and `nodeEnvironment`.
- `src/infrastructure/adapters/cache.ts` supplies `clearCache()`, which returns `{ deleted, reachable }`.
- `src/infrastructure/adapters/logger.ts` supplies `logger`.
- `src/infrastructure/http/middlewares/rate-limit-store.ts` supplies `clearRateLimitCounters`.

## Notes
- **Import order matters.** `dotenv` comes first, then `scripted-environment`, then `mongoose-boot`, then `development-doubles`. Each must run before the modules that read what it sets.
- **Environment gate.** It runs only when `NODE_ENV` is `development` or `test`. An unset value, `staging` and `production` all refuse with exit code 1. The check runs before `runScript` so its own environment gate does not mask the reason.
- **Seed marker protocol.** `running` is written before the first write and `done` is the last write. A found `running` means the previous seed died, and the next boot rebuilds. The wipe keeps the marker, so a death mid-wipe is still recognised.
- **Skip is a success.** When the database already holds data, the script logs and returns without throwing. The compose `app` command is `npm run db:bootstrap && <start the server>`, so a non-zero exit would stop the container from starting.
- **Fail-open cache clear.** An unreachable Redis only changes the log line, and seeding still succeeds.
- **Rate-limit reset limits.** Only Redis-held counters are reset (SCAN + DEL under the limiter's prefix, never FLUSHALL). In-memory counters in a running server are out of reach. Both of those cases only warn.
- **Forced exit.** `process.exit()` is used because importing the app leaves handles that `stop()` cannot vouch for (the OTel SDK, third-party timers). Other `runScript` callers never boot the app and stay on `process.exitCode`.
- **Plain-text passwords.** Passwords are left in plain text so the model's pre-save hook hashes them.
- **Two adjacent doc comments.** The cleanup/exit comment is stacked directly above the environment-gate comment, which is a leftover of ordering rather than a separate block.
