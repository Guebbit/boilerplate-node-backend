---
source: src/modules/account/module.ts
sha256: 6080cf37eff9a6b50765d290c78a1f60d7e695132694e471731d72bd972964d4
generated_at: 2026-11-14T18:37:41.323360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Module manifest for the **account** module. It installs the application-wide auth resolver, declares the module's routes, jobs, rate-limit budgets, queue consumers, event subscriptions, and GDPR export/erasure contracts. It exists so the kernel's `registerModules` pass can wire the account lifecycle (signup, login, refresh, password reset, two-step deletion) into the app in a single declarative object.

## Key elements

- **`onRegistered(modules)`** — Called once after every enabled module is known. Registers `accountAuthResolver` via `@kernel/authentication` and resolves all modules' `personalData` sections into the export registry.
- **`default export` (the `AppModule` object)** — The manifest consumed by the module loader:
  - `mounts` — mounts `router` (from `./routes.ts`) at `/account`.
  - `jobs` — scheduled/background jobs from `./jobs.ts`.
  - `rateLimits` — credential, signup, reset, and MFA budgets from `./rate-limits.ts`.
  - `personalData` — three sections (`accountExports`, `sessions`, `erasureLedger`) each declaring `collect` (what appears in a GDPR export) and `erase` (how the data is destroyed with the account).
  - `consumers` — the `worker.account.export` queue handler (`runExportJob`) with `prefetch: 1`.
  - `config` — merged config slices from `accountConfig`, `sessionConfig`, and `oauthConfig`.
  - `reencrypt` — re-encrypts TOTP secrets (stored on the `users` document) under this module's key.
  - `subscribe` — domain-event handlers (see below).
  - `locales` / `templates` — file paths for i18n and mail templates.
- **Event subscriptions** (inside `subscribe`):
  - `USER_SETUP_REQUESTED` → sends setup email/token.
  - `USER_DEACTIVATED` → revokes all one-time tokens and links.
  - `USER_DELETION_CANCELED` → notifies the owner that a scheduled deletion was reverted by staff.
  - `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` → calls the analytics provider's `forget(userId)`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type this file satisfies and the `resolvePersonalDataSections` helper used in `onRegistered`.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` is called here (not at import time) to install the auth guard's token resolver for the entire app.
- **`src/kernel/events.ts`** — `onDomainEvent` is the subscription API used in `subscribe`.
- **`src/infrastructure/observability/analytics/index.ts`** — `resolveAnalyticsProvider().forget(userId)` is invoked on consent withdrawal.
- **`src/modules.ts`** — The module loader that iterates registered modules and calls `registerModules`, which triggers `onRegistered`.
- **`src/modules/account/config.ts`** — This file imports `accountConfig` and includes its `slice` in the manifest's `config` array.
- **`src/modules/account/oauth/config.ts`** — This file imports `oauthConfig` and includes its `slice` in the manifest's `config` array.
- **`src/modules/account/events.ts`** — Exports `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`, the event this module subscribes to.
- **`src/modules/account/jobs.ts`** — Exports `accountJobs`, attached to the manifest's `jobs` field.
- **`src/modules/account/rate-limits.ts`** — Exports `accountRateLimits`, attached to the manifest's `rateLimits` field.
- **`src/modules/account/routes.ts`** — Exports `router`, mounted at `/account`.
- **`src/modules/account/asyncapi.internal.yaml`** — Declares the `worker.account.export` queue that this module's `consumers` entry consumes.
- **`src/modules/account/module.yaml`** — YAML manifest metadata (name, description) that pairs with this TypeScript module object.
- **`src/modules/access/module.ts` / `authorization.yaml`** — The access module's authorization policies gate the `/account` routes declared here; rate-limit budgets defined in `rate-limits.ts` are consumed by the access layer.

## Notes

- **Auth resolver is registered in `onRegistered`, not at import time.** Importing this file for a type or a test will *not* install the resolver; only a real `registerModules` run triggers it.
- **The `collect` functions for `accountExports` and `erasureLedger` intentionally return `undefined`**, which the export pipeline interprets as "omit this section." The export row and ledger are audit artifacts, not personal-data exports.
- **The User document is shared with the `users` module** (via `accountUserService` and the events from `@modules/users`). Both modules read/write it; a schema change there requires coordination across both modules. Credentials (TOTP secrets, etc.) live on that document by design — see `docs/modules/account-two-factor.md`.
- **`prefetch: 1` on the export consumer** is deliberate: an export build reads every section for one account; serialising per worker prevents a burst of requests from starving others.
- The `personalData` sections are resolved *by this module* (via `resolvePersonalDataSections(modules)` in `onRegistered`), not by the app tier — the app never collects or hands them in by name.
