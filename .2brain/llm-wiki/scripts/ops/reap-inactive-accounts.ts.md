---
source: scripts/ops/reap-inactive-accounts.ts
sha256: e1baf023e9ce58ecb99a302ec5d04b9f9c8fd6e17d5fd51fb11546057a0adbb6
generated_at: 2026-10-01T12:36:12.344462+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-inactive-accounts.ts

## Purpose
A three-stage inactivity reaper (run via `npm run reap:inactive-accounts`) that progressively warns, soft-deletes, and hard-deletes accounts that have had no token exchange for a configurable threshold. It exists to satisfy the data-minimisation requirement in Art. 5(1)(e) for accounts whose purpose has lapsed. Disabled by default (`NODE_INACTIVE_ACCOUNT_DAYS=0`).

## Key elements
- **`GRACE_DAYS`** (const, 30) — fixed pause between each stage; intentionally not configurable so the script has a single day-count dial.
- **`LEASE_TTL_MS`** (const, 15 min) — TTL passed to `withLease`; sized to survive a slow night but release a crashed holder within a week.
- **`daysAgo(days)`** — helper returning a `Date` offset from now.
- **`initI18n()`** — calls `bootI18n(enabledModuleLocales())` so translated email copy renders outside the HTTP process.
- **`warn(user)`** — stage 1: builds the inactivity-warning email via `inactivityWarningEmail`, enqueues it through the mailer, then stamps `inactivityWarnedAt` via `userService.markInactivityWarned`.
- **`main`** — reads the day threshold from `accountConfig()`, early-returns if ≤ 0. Otherwise runs all three stages inside `withLease('reap:inactive-accounts', …)`: warn un-warned inactive users → soft-delete warned users still past grace → hard-delete soft-deleted users past a second grace period. Logs per-stage counts.
- **`runScript(undefined, main, teardown)`** — entry-point wrapper; teardown stops the database and queue.

## Relationships
- **`scripts/run-script.ts`** — provides `runScript`, which wraps `main` with process lifecycle (stdin signals, graceful shutdown). Called with `undefined` for the name so it does not re-record a lease outcome that `withLease` already wrote.
- **`src/infrastructure/adapters/logger.ts`** — `logger` used for info-level messages at disable, skip, and completion points.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the transport for the stage-1 warning email.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` called in the teardown callback.
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` initialises the i18n runtime for email rendering.
- **`src/infrastructure/i18n/index.ts`** — re-exports `getDefaultLocale`, used as the fallback locale in `warn`.
- **`src/infrastructure/persistence/lease.ts`** — `withLease` guards against concurrent runs; the script is the sole current consumer of this primitive.
- **`src/infrastructure/runtime/database.ts`** — `start()` boots Mongo; `stopDatabase()` in teardown.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` supplies the audit context for both delete stages (no HTTP request behind the call).
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` wires module registrations needed by `userService`.
- **`src/modules.ts`** — `enabledModules` and `enabledModuleLocales()` feed registration and i18n boot.
- **`src/modules/account/config.ts`** — `accountConfig().NODE_INACTIVE_ACCOUNT_DAYS` is the single runtime knob.
- **`src/modules/account/index.ts`** — exports `inactivityWarningEmail`, the template builder for the stage-1 email.
- **`src/modules/account/emails.ts`** — implementation of `inactivityWarningEmail` (subject, template, data).

## Notes
- **Disabled by default.** `NODE_INACTIVE_ACCOUNT_DAYS` must be set > 0; the script logs and exits if it is 0 or negative. This is a deliberate safety default — a boilerplate that ships it enabled would delete live accounts.
- **Lease + runScript interaction.** `main` resolves normally even when the lease is already held (skip path). Because `withLease` internally records the outcome under its own name, `runScript` is passed `undefined` for the name to avoid overwriting a genuine success with a skip.
- **Returning-user gap.** If a user signs back in (resetting `LAST_ACTIVE_EXPR`) and later goes inactive again, the stale `inactivityWarnedAt` means they skip the warning email and go straight to soft delete after one grace period. Accepted as a known limitation of the disabled-by-default safety net.
- **`GRACE_DAYS` is hardcoded.** Not exposed as an env var to keep the operator-facing surface to a single threshold.
- **Runs in the same cron container** as `reap:quarantine` and `reap:orders`; never on app boot.
