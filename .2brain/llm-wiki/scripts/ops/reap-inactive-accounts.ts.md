---
source: scripts/ops/reap-inactive-accounts.ts
sha256: 4ebea3dc03bea5f7a8c227f697838337115b665b2e015c989449e42421653861
generated_at: 2026-10-15T09:44:03.616947+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-inactive-accounts.ts

## Purpose

CLI entry point for the inactivity reaper (`npm run reap:inactive-accounts`). It runs a periodic, lease-guarded job that (a) always minimises personal data on accounts idle beyond `NODE_INACTIVE_MINIMIS_DAYS` (default 1095 d) and (b) optionally — only when `NODE_INACTIVE_ACCOUNT_DAYS > 0` — warns, soft-deletes, and hard-deletes accounts through a fixed grace chain. Deletion ships disabled by default; minimising ships enabled.

## Key elements

- **`LEASE_TTL_MS`** (15 min) — how long the lease is held before another runner may steal it. Picked generously because a double-run hard-deletes accounts.
- **`initI18n`** — boots the i18n layer using `enabledModuleDirectories('locales')` so the warning email can render translated copy outside the HTTP process.
- **`main`** — reads `accountConfig()`, bails if both dials are 0; calls `startJob()`, acquires `withLease('reap:inactive-accounts', …)`, registers all enabled modules' hooks, conditionally inits i18n, then delegates to `reapInactiveAccounts({ inactiveDays, minimiseDays })`. Logs and resolves normally if the lease is already held.
- **Entry-point line** — `void runScript(undefined, main, cleanup)`. The `undefined` name tells `runScript` not to record its own outcome, because `withLease`'s `releaseLease` already records under the same lease name.
- **Shebang** — `#!/usr/bin/env tsx` so the file is directly executable.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, which wraps `main` with a try/finally and an optional outcome-recording hook (suppressed here via the `undefined` name).
- **`src/infrastructure/persistence/lease.ts`** — `withLease` / `releaseLease` prevent a second concurrent run; this script is the sole consumer of the lease primitive in the codebase.
- **`src/modules/account/config.ts`** — `accountConfig()` exposes the two `NODE_INACTIVE_*` env dials that gate the stages.
- **`src/modules/account/index.ts`** → **`src/modules/account/services/reap-inactive.ts`** — the actual stage logic (minimise, warn, soft-delete, hard-delete) lives in the account module; this script only orchestrates.
- **`src/infrastructure/runtime/database.ts`** — `startJob()` opens Mongo (needed before the lease); `stopDatabase()` is part of the cleanup callback.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported before any model so Mongoose schema defaults are set.
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` loads locale bundles for the warning email.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` included in the cleanup `Promise.all`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` for the "disabled" and "lease held" early-exit messages.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` makes every module's `personalData.minimise` / `personalData.erase` hooks resolvable.
- **`src/modules.ts`** — `enabledModules` and `enabledModuleDirectories` supply the module list and locale directories.
- **`src/infrastructure/config/dotenv.ts`** — loaded first so env vars are present before any other import reads them.

## Notes

- **Import order matters.** `mongoose-boot` must be imported before any Mongoose model is touched; `dotenv` must come before everything else. The `// Before any model loads` comment is load-bearing.
- **No outcome recorded at the `runScript` layer.** Passing `undefined` as the first arg prevents a false "success" from overwriting the genuine result that `releaseLease` already wrote. If you add a name here, you'll clobber the lease's record when the run is skipped.
- **Grace timing is relative to the warning, not to last activity.** This guarantees a single cron run can never both warn and soft-delete the same account in one pass.
- **`deletedBy: 'reaper'`** is the discriminator that stage 3 uses to hard-delete only its own soft deletes and never a staff-member's.
- **Disabled accounts (`active: false`) are excluded from every stage**, including minimise.
- **Intended to run on a fixed cron schedule** (same container as `reap:quarantine` and `reap:orders`), never on application boot.
