---
source: src/modules/account/module.ts
sha256: 0b958eb4133a10a32448105c9fcc337497896e27b08141dd11fc013a6ff6648e
generated_at: 2026-11-08T04:11:24.598933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Module manifest for the `account` module. Wires together authentication (auth resolver), account lifecycle (signup, login, refresh, password reset, logout, two-step deletion), and cross-module personal-data export. Declares routes, event subscriptions, queue consumers, config slices, and the `onRegistered` hook that installs the app-wide auth resolver and resolves the per-module `personalData` section list.

## Key elements

- **`onRegistered(modules)`** — Registers `accountAuthResolver` with the kernel and calls `setPersonalDataSections(resolvePersonalDataSections(modules))` so the export worker knows every module's `personalData` section. Runs only when the module system actually enables this module, not at import time.
- **Default export (`AppModule`)** — The module manifest object:
  - `mounts` — mounts `router` (from `./routes`) at `/account`.
  - `jobs` — `accountJobs` from `./jobs`.
  - `rateLimits` — `accountRateLimits` from `./rate-limits`.
  - `personalData` — Three sections: `accountExports` (no collect; only erase), `sessions` (metadata export + erase with one-time tokens), `erasureLedger` (no collect; records erasure inside the deletion transaction).
  - `consumers` — Subscribes to `WORKER_CHANNELS.ACCOUNT_EXPORT` queue; handler is `runExportJob`, schema-validated, `prefetch: 1`.
  - `config` — Merged slices from `accountConfig`, `sessionConfig`, and `oauthConfig`.
  - `reencrypt` — `reencryptTotpSecrets` for TOTP secrets stored on the shared User document.
  - `subscribe` — Domain-event handlers for `USER_SETUP_REQUESTED`, `USER_DEACTIVATED`, `USER_DELETION_CANCELED`, and `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`.
  - `locales` / `templates` — Filesystem paths for i18n and email templates.

## Relationships

- **`src/kernel/registry.ts`** — Imports `AppModule` type and `resolvePersonalDataSections`; the manifest `satisfies AppModule` and the `onRegistered` hook uses the registry to resolve all modules' personal-data sections.
- **`src/kernel/authentication.ts`** — Imports `registerAuthResolver`; called inside `onRegistered` to install `accountAuthResolver` app-wide.
- **`src/kernel/events.ts`** — Imports `onDomainEvent`; each subscription in `subscribe` registers a domain-event listener.
- **`src/infrastructure/observability/analytics/index.ts`** — Imports `resolveAnalyticsProvider`; called on `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` to forget the user.
- **`src/modules/account/config.ts`** — Provides `accountConfig.slice` for the manifest's `config` array.
- **`src/modules/account/oauth/config.ts`** — Provides `oauthConfig.slice` for the manifest's `config` array.
- **`src/modules/account/events.ts`** — Exports `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` consumed in `subscribe`.
- **`src/modules/account/jobs.ts`** — Exports `accountJobs` referenced in the manifest.
- **`src/modules/account/rate-limits.ts`** — Exports `accountRateLimits` referenced in the manifest.
- **`src/modules/account/routes.ts`** — Exports `router`, mounted at `/account`.
- **`src/modules/account/asyncapi.internal.yaml`** — Declares the `ACCOUNT_EXPORT` queue channel consumed by the manifest's `consumers` entry.
- **`src/modules.ts`** — Aggregates/enables this module so `onRegistered` fires.
- **`@modules/users`** (peer module) — Exports `userService`, `USER_SETUP_REQUESTED`, `USER_DEACTIVATED`, `USER_DELETION_CANCELED`; this module subscribes to those events and reads the shared User document.

## Notes

- The auth resolver is registered inside `onRegistered`, **not** at module import time. Importing this file (e.g. in a test) does not install the resolver; only the module system's registration cycle triggers it.
- `personalData.collect` returning `Promise.resolve(undefined)` **omits** the section from the export payload rather than including an empty object. Two of the three sections (`accountExports`, `erasureLedger`) use this pattern because they hold no exportable personal data.
- `prefetch: 1` on the export consumer is intentional: export builds are the heaviest job this module runs, and limiting concurrency prevents a burst of exports from starving other work.
- The User document is shared with the `users` module as a "shared kernel" invisible to the import graph; both read and write it, so schema changes require coordination on both sides.
- The `reencrypt` hook exists because TOTP secrets live on the User document (owned by `users`) but are encrypted under *this* module's key; rotating that key requires re-encryption via this callback.
