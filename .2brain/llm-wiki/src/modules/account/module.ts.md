---
source: src/modules/account/module.ts
sha256: 4e9b64b147cc8edb8ebb4f48599cb4e4f268df168772e9c68b5595adaee68861
generated_at: 2026-09-27T14:27:23.066830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Module manifest for the **account** module, which owns the full authentication and account lifecycle (signup, login, refresh, password reset, logout, two-step deletion). It deliberately holds no collection of its own — the User record remains in `users` — and acts as the second service over that shared record, mounted at `/account` rather than merged into `/users`.

## Key elements

- **`onRegistered(modules)`** — the one-shot install hook called by the app tier after all enabled modules are known. It registers `accountAuthResolver` with the kernel and resolves every module's `personalData` section list into `./services/personal-data-registry.ts` (used by `POST /account/export`).
- **Default export (`AppModule`)** — the manifest object describing the module's name, `basePath: '/account'`, routes, rate limits, permissions, required env config, custom boot check, event subscriptions, and locale path.
- **`permissions`** — declares `tokens.any.delete`; the cross-cutting test enforces that the key exists in the shared permission file and is attributed to this module.
- **`requiredConfig`** — three env vars (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOTP_ENCRYPTION_KEY`) with `minLength: 16` and placeholder guards that refuse to boot if left as the shipped `.env-example` value.
- **`customCheck: invalidTokenWindows`** — a cross-key validation (access window must be ≤ refresh window) that per-key checks cannot express.
- **`subscribe()`** — wires `onDomainEvent(USER_SETUP_REQUESTED, …)` so that when `users` creates a passwordless account, this module issues the tokens and email that give it a way in.
- **`personalData: 'none'`** — this module contributes zero data to the account export; it only assembles sections declared by other modules.

## Relationships

- **`@kernel/authentication`** — calls `registerAuthResolver(accountAuthResolver)` inside `onRegistered`; the whole app's cookie guards then delegate to this resolver.
- **`@kernel/events`** — calls `onDomainEvent` to listen for `USER_SETUP_REQUESTED`.
- **`@kernel/registry`** — imports the `AppModule` type and `resolvePersonalDataSections` helper.
- **`@modules/users`** — imports `userService` and the `USER_SETUP_REQUESTED` constant; both modules read/write the same User document (shared kernel, invisible to the import graph).
- **`./session/resolver`** — supplies `accountAuthResolver`, which is the function actually registered with the kernel.
- **`./session/config`** — supplies `invalidTokenWindows` (used as `customCheck`) and the token-ring accessors referenced in comments.
- **`./services/authentication`** — supplies `requestAccountSetup`, invoked in the event handler.
- **`./services/personal-data-registry`** — supplies `setPersonalDataSections`, the write target for the resolved export list.
- **`./routes`** — supplies the `router` object mounted under `/account`.
- **`./rate-limits`** — supplies `accountRateLimits` (credential, signup, reset, MFA, password-check budgets).
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** — exercises the metrics surface this module contributes.

## Notes

- The auth resolver is registered **only** inside `onRegistered`, not at import time. Importing this file for a type or a test does not install the resolver; it activates exclusively when `registerModules` runs the hook.
- `personalData: 'none'` is intentional: `POST /account/export` is an assembly endpoint that collects sections from *other* modules via `resolvePersonalDataSections(modules)`. This module is the assembler, not a data provider.
- The three `requiredConfig` entries share the same failure shape: the `.env-example` placeholders are valid 16+ character strings, so the `minLength` check alone would pass. The `placeholder` check is what catches an un-rotated secret at boot.
- Token-window ordering (access ≤ refresh) is a relational constraint; `session/config.ts#invalidTokenWindows` encodes the *why* (wrong order silently disables reuse detection without throwing).
- A schema change to the shared User document must be agreed on by **both** `account` and `users`, since both read and write it but neither "owns" the collection in the module sense.
