---
source: src/modules/account/module.ts
sha256: 7ca8162664c553bf32530ba853aede897e95ed506bb7aab83f49a51fad13b7f8
generated_at: 2026-10-14T14:37:02.006757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

The module manifest (default export) for the `account` mount. It wires together the auth resolver, HTTP routes, rate limits, personal-data export declarations, the export-worker consumer, config slices, and a single domain-event subscription—so that `registerModules` can install the entire account surface in one pass. It exists as a single declarative object satisfying `AppModule` rather than scattered registration calls.

## Key elements

- **Default export** (`satisfies AppModule`) — the manifest: `name`, `basePath: '/account'`, `routes`, `rateLimits`, `personalData`, `consumers`, `config`, `onRegistered`, `subscribe`, `locales`, `templates`.
- **`onRegistered(modules)`** — called once after every enabled module is known. Registers `accountAuthResolver` via `registerAuthResolver` and resolves all modules' `personalData` sections into `setPersonalDataSections`. Placing this here (rather than at import time) means merely importing the file has no side effects.
- **`personalData`** — two entries: `accountExports` (collect returns `undefined`, i.e. self-excluded from exports; `erase` calls `eraseExports`) and `sessions` (collect reads session metadata for export; `erase` calls `eraseSessionsAndTokens`).
- **`consumers`** — declares the `worker.account.export` queue handler (`runExportJob`) with `prefetch: 1` to serialize export builds per worker.
- **`subscribe()`** — listens for the `USER_SETUP_REQUESTED` domain event; looks up the user and, if it still exists, calls `requestAccountSetup` to send setup tokens/mail.
- **`config`** — flat-merges slices from `accountConfig`, `sessionConfig`, and `oauthConfig`.

## Relationships

- **`src/kernel/authentication.ts`** — calls `registerAuthResolver` inside `onRegistered` to install `accountAuthResolver` app-wide.
- **`src/kernel/events.ts`** — calls `onDomainEvent` in `subscribe()` to react to `USER_SETUP_REQUESTED`.
- **`src/kernel/registry.ts`** — imports the `AppModule` type and `resolvePersonalDataSections`; the resolved list is fed to the personal-data registry.
- **`src/modules/account/config.ts`** — imports `accountConfig` and includes its `.slice` in the manifest `config` array.
- **`src/modules/account/oauth/config.ts`** — imports `oauthConfig` and includes its `.slice` in the manifest `config` array.
- **`src/modules/account/rate-limits.ts`** — imports `accountRateLimits` and assigns it to the manifest's `rateLimits` field.
- **`src/modules/account/routes.ts`** — imports `router` and assigns it to the manifest's `routes` field.
- **`src/modules/account/services/export-job.ts`** — imports `runExportJob`; it is the handler for the export queue consumer.
- **`src/modules/account/services/export.ts`** — imports `eraseExports`, used as the `erase` function for the `accountExports` personal-data section.
- **`src/modules/account/services/password-reset-request.ts`** — imports `requestAccountSetup`, invoked in the `USER_SETUP_REQUESTED` subscription.
- **`src/modules/account/services/personal-data-registry.ts`** — imports `setPersonalDataSections`, called in `onRegistered` with the resolved cross-module section list.

## Notes

- The auth resolver is registered in `onRegistered`, **not** at module top-level. Importing this file (e.g. for types in a test) does not install the resolver—only an actual `registerModules` run does.
- The `accountExports` section intentionally returns `undefined` from `collect`: the export row is a *copy* of what other modules' sections already describe, so including it would be circular.
- `prefetch: 1` on the export consumer is deliberate—each export build reads every other module's section for one account; serializing prevents a burst from starving other work on the same worker.
- The `USER_SETUP_REQUESTED` handler tolerates a missing user (deleted between creation and event delivery) by resolving `undefined` and dropping the request silently.
