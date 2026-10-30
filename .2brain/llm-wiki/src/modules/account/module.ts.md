---
source: src/modules/account/module.ts
sha256: 07c15d6a439be87e8b2125d7562fc24d5daefd15a23dc6dccb9cf801a1a2ee54
generated_at: 2026-10-29T02:36:00.162933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Module manifest for the **account** module. It wires together everything the account module installs at registration time: the app-wide auth resolver, routes under `/account`, rate-limit budgets, queue consumers, personal-data export/erase declarations, and domain-event subscriptions. It exists as the single entry point that the kernel calls once every enabled module is known.

## Key elements

- **`onRegistered(modules)`** — Registers `accountAuthResolver` with the kernel and resolves every module's `personalData` sections into the local registry (used by the export worker). Runs only when the module is actually registered, not at import time.
- **`export default { … } satisfies AppModule`** — The manifest object consumed by the kernel:
  - `mounts` — mounts `router` at `/account`.
  - `jobs` — re-exports `accountJobs` for scheduled/background work.
  - `rateLimits` — credential, signup, reset, MFA, and password-check budgets from `./rate-limits.ts`.
  - `personalData` — Declares two sections: `accountExports` (no `collect` data; only `erase`) and `sessions` (exports session metadata; erases one-time tokens alongside).
  - `consumers` — Subscribes to the `worker.account.export` queue with `prefetch: 1`.
  - `config` — Merges slices from `accountConfig`, `sessionConfig`, and `oauthConfig`.
  - `reencrypt` — `reencryptTotpSecrets` hook for rotating the encryption key on TOTP secrets stored in the shared User document.
  - `subscribe` — Registers four domain-event handlers:
    - `USER_SETUP_REQUESTED` → requests password-reset/setup flow for a new passwordless account.
    - `USER_DEACTIVATED` → revokes all sessions and one-time tokens for the banned user.
    - `USER_DELETION_CANCELLED` → runs staff-restore logic and notifies the owner.
    - `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` → calls the analytics provider's `forget(userId)`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type this manifest satisfies and `resolvePersonalDataSections`, which aggregates every module's `personalData` array at registration time.
- **`src/kernel/authentication.ts`** — Provides `registerAuthResolver`; this file is the sole caller that installs the account auth resolver app-wide.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`; the `subscribe` callback uses it to bind handlers for the four events above.
- **`src/infrastructure/observability/analytics/index.ts`** — Provides `resolveAnalyticsProvider`; called in the consent-withdrawn handler to purge captured data.
- **`src/modules/account/routes.ts`** — Supplies the `router` that is mounted at `/account`.
- **`src/modules/account/rate-limits.ts`** — Supplies the `accountRateLimits` budgets referenced in the manifest.
- **`src/modules/account/jobs.ts`** — Supplies the `accountJobs` array.
- **`src/modules/account/config.ts`** — Supplies `accountConfig` (token rings, windows, MFA key) for the manifest's `config` array.
- **`src/modules/account/oauth/config.ts`** — Supplies `oauthConfig` for the manifest's `config` array.
- **`src/modules/account/events.ts`** — Exports `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`, consumed in `subscribe`.
- **`src/modules/account/services/account-deletion.ts`** — Exports `handleRestoredByStaff`, called from the `USER_DELETION_CANCELLED` handler.
- **`src/modules.ts`** — The orchestrator that invokes `onRegistered` for each enabled module during `registerModules`; this file's registration side-effects execute only when it runs.

## Notes

- **Resolver is deferred.** `registerAuthResolver` is called inside `onRegistered`, not at top-level. Importing this file (e.g., in a test that only needs types) does not install the resolver.
- **Export self-reference is empty.** The `accountExports` section's `collect` returns `undefined`, so this module contributes no data to its own export — the export is an assembly of *other* modules' sections. It only declares how to erase the export row and file.
- **Shared User document.** Credentials and TOTP secrets live on the `users` module's document, invisible to the import graph. Schema changes require coordination between both modules. TOTP secrets are encrypted under this module's key, hence the `reencrypt` hook.
- **`prefetch: 1`** on the export consumer is deliberate: a burst of export requests must not starve other workers.
