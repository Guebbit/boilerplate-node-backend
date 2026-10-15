---
source: src/modules/account/module.ts
sha256: 6dc651a62d7dd2af668b85a27c683ca56489b28c972c5f4fd7f90e9aac1cbc86
generated_at: 2026-10-15T09:57:46.513433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Module entry point for the `account` domain: authentication, signup, login, token refresh, password reset, logout, two-step account deletion, and personal-data export. It wires the auth resolver into the kernel, declares the module's `personalData` erase/export contract, registers the export-queue consumer, and subscribes to the `USER_SETUP_REQUESTED` domain event. It deliberately keeps the `User` document on the `users` module rather than merging them, so that an identity-provider swap stays possible.

## Key elements

- **Default export (`AppModule`)** — the full module manifest: `name`, `basePath` (`/account`), `routes`, `rateLimits`, `personalData`, `consumers`, `config` slices, `reencrypt` hook, `onRegistered`, `subscribe`, `locales`, `templates`.
- **`onRegistered(modules)`** — installs the app-wide auth resolver (`accountAuthResolver`) and resolves every enabled module's `personalData` sections into the export registry. Runs once via the kernel's registration pass, not at import time.
- **`personalData` array** — two sections: `accountExports` (erase-only; `collect` returns `undefined` so it contributes no data) and `sessions` (exports session metadata; erases sessions *and* one-time verification tokens).
- **`consumers`** — subscribes the `worker.account.export` queue to `runExportJob` with `prefetch: 1`.
- **`subscribe()`** — listens for `USER_SETUP_REQUESTED`; looks up the user and fires `requestAccountSetup` (token + email). Silently drops if the user no longer exists.
- **`config`** — concatenates `accountConfig.slice`, `sessionConfig.slice`, and `oauthConfig.slice`.
- **`reencrypt`** — hook pointing to `reencryptTotpSecrets` for key-rotation of TOTP secrets stored on the `users` document.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type (satisfies check) and `resolvePersonalDataSections` to build the export section list at registration time.
- **`src/kernel/authentication.ts`** — imports `registerAuthResolver`; this module is the one that installs the resolver the whole app's guards depend on.
- **`src/kernel/events.ts`** — imports `onDomainEvent` to subscribe to `USER_SETUP_REQUESTED`.
- **`src/modules.ts` (users module)** — imports `userService` and the `USER_SETUP_REQUESTED` event constant; the two modules share the `User` document (the kernel-level shared contract, invisible to the import graph).
- **`src/modules/account/routes.ts`** — provides the Hono/express `router` mounted at `/account`.
- **`src/modules/account/rate-limits.ts`** — supplies credential/signup/reset/MFA budget definitions.
- **`src/modules/account/config.ts`** — account-specific configuration slice.
- **`src/modules/account/oauth/config.ts`** — OAuth provider configuration slice.
- **`src/modules/account/services/personal-data-registry.ts`** — `setPersonalDataSections` stores the resolved section list for the export worker.
- **`src/modules/account/services/export.ts`** — `eraseExports` implements the `accountExports` erase action.
- **`src/modules/account/services/export-job.ts`** — `runExportJob` is the queue consumer handler that assembles the export from the resolved sections.
- **`src/modules/account/services/password-reset-request.ts`** — `requestAccountSetup` creates the verification token and sends the email when a new (or reset) account needs a way in.
- **`src/modules/account/module.yaml` / `openapi.yaml`** — declarative manifest and API spec for this module; not imported at runtime but consumed by tooling.
- **`src/modules/access/module.ts`** — peer module; its `personalData` section is resolved by `onRegistered` and included in exports, but there is no direct import.

## Notes

- **Resolver registration is deferred.** `registerAuthResolver` is called inside `onRegistered`, not at module import. Importing this file (e.g., for a type in a test) does *not* install the resolver. Only the kernel's `registerModules` pass triggers it.
- **`accountExports` contributes no export data.** Its `collect` resolves `undefined`, which the export builder treats as "omit this section." The section exists solely to declare how to *erase* the export row and file when an account is deleted.
- **Session tokens have no section of their own.** Verification tokens are erased alongside sessions because they are "links in flight," not something an export describes.
- **Prefetch 1 on the export worker.** A burst of export requests must not starve other queue consumers; one-in-flight-per-worker is the throttle.
- **TOTP secrets are cross-module.** They live on the `users` document but are encrypted under this module's key, so `reencryptTotpSecrets` is declared here even though the data is not owned by this module.
