---
source: scripts/ops/reap-inactive-accounts.ts
sha256: cf8fc4953fdf039a6fb8443e0bf98e0b48f439e1886d3dd5b936bca0a34a82ea
generated_at: 2026-09-27T13:57:13.784129+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-inactive-accounts.ts

## Purpose

Three-stage inactivity reaper (warn → soft-delete → hard-delete) for accounts whose "last active" timestamp falls behind a configurable threshold. Exists to satisfy the data-minimisation principle (Art. 5(1)(e) GDPR): personal data kept only as long as its purpose needs it. Disabled by default and intended for periodic cron execution, never per-boot.

## Key elements

- **`GRACE_DAYS` (30)** — Fixed pause between each stage. Deliberately not configurable; keeps the script to a single `NODE_INACTIVE_ACCOUNT_DAYS` dial.
- **`LEASE_TTL_MS` (15 min)** — TTL passed to `withLease`; generous enough to survive a slow run, short enough to unblock next week's cron if the holder truly crashed.
- **`initI18n`** — Calls `bootI18n(enabledModuleLocales())` to render translated email copy outside the HTTP process.
- **`warn(user)`** — Stage one: builds the warning email via `inactivityWarningEmail`, enqueues it through `enqueueEmail`, then stamps `inactivityWarnedAt` via `userService.markInactivityWarned`.
- **`main`** — Reads `NODE_INACTIVE_ACCOUNT_DAYS` (default 0 = disabled), then inside `withLease('reap:inactive-accounts', …)` runs three sequential loops: warn unwarned → soft-delete warned-still-inactive → hard-delete past-grace soft-deleted. Hard-delete passes `systemCallerContext('User')` as its audit caller.
- **Entry point** — `void runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]));`

## Relationships

- **`scripts/run-script.ts`** — Wraps `main` with a unified script lifecycle (argument parsing, teardown callback). Called with `undefined` as the script name (see Notes).
- **`src/infrastructure/adapters/logger.ts`** — Structured `info` logging for each stage's summary and for skip/disable messages.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the stage-one warning.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` in the teardown callback.
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` initialises translation catalogs for email rendering.
- **`src/infrastructure/i18n/index.ts`** — Re-exports `getDefaultLocale` used as fallback locale in `warn`.
- **`src/infrastructure/persistence/lease.ts`** — `withLease` / `releaseLease` guard against concurrent double-runs.
- **`src/infrastructure/runtime/database.ts`** — `start` opens Mongo; `stopDatabase` in teardown.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_INACTIVE_ACCOUNT_DAYS` from the environment.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` supplies the audit-actor identity for the hard-delete path (no HTTP controller present).
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` wires the module graph so `userService` is available.
- **`src/modules.ts`** — `enabledModules` and `enabledModuleLocales()` provide the module list and locale set for boot.
- **`src/modules/account/index.ts`** — Re-exports `inactivityWarningEmail` (implemented in `emails.ts`) used by `warn`.

## Notes

- **`runScript` name is `undefined`.** `withLease` internally records its own outcome under the key `'reap:inactive-accounts'`. Passing the same name to `runScript` would let that outer-layer record overwrite a genuine success with a false "skipped" whenever the lease was already held and `main` returned early. Hence no name is forwarded.
- **Returning-user gap.** A user who reactivates and later goes inactive *again* retains their original `inactivityWarnedAt` timestamp, so they skip the warning stage and go straight to soft-delete. Accepted as a known limitation of the disabled-by-default safety net.
- **Hard-delete audit.** This is the sole code path that must hand `userService.remove(user, true, …)` an explicit caller context, because no HTTP controller / `createDeleteController` is in the stack.
