---
source: src/modules/account/module.ts
sha256: d8b9deb0634a352b49e4f482c9a39ff4c30aabe164ec9035907c62b996f69ac5
generated_at: 2026-09-23T18:05:40.287565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.ts

## Purpose

Entry point for the **account** module: it registers the application-wide auth resolver, declares the module's HTTP routes, rate-limit budgets, permission keys, required environment config, and event subscriptions. It orchestrates the account lifecycle (signup, login, token refresh, password reset, two-step deletion) without owning a database collection of its own — the `User` record lives in the `users` module, and this module reads/writes it through `userService`.

## Key elements

- **`resolve(verify)` (private helper)** — Builds a `fromAccessToken` / `fromRefreshToken` resolver. Verifies the JWT, looks up the user via `userService.findAuthenticatableById`, fetches roles via `rolesOf`, and returns a narrow object (id, email, username, roles, tenantId, authTime, amr, analyticsConsent) or `undefined` if the user no longer exists.
- **`registerAuthResolver({…})` call** — Installs the two resolvers on the kernel at import time, so every downstream guard can authenticate before the first HTTP request.
- **`export { setPersonalDataSections }`** — Re-exports the personal-data registry setter for `src/app.ts` to wire in other modules' `personalData` sections at boot.
- **`default export` (the `AppModule` manifest)** — Declares `name: 'account'`, `basePath: '/account'`, the Hapi `router`, `rateLimits`, the single permission key `'tokens.any.delete'`, `personalData: 'none'`, `requiredConfig` (three env vars with min-length / placeholder checks), `customCheck` (`invalidTokenWindows`), `subscribe` (handles `USER_SETUP_REQUESTED`), and `locales` path.
- **`subscribe()` callback** — On `USER_SETUP_REQUESTED`, looks up the user and calls `requestAccountSetup` to issue setup tokens / email. Silently drops if the user was deleted before the event fires.

## Relationships

| Neighbor                                                     | Interaction                                                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/kernel/authentication.ts`                               | `registerAuthResolver` is called once at import time to install this module's token verifiers on the kernel.                                                |
| `src/kernel/registry.ts`                                     | `AppModule` type constrains the default export's shape.                                                                                                     |
| `src/kernel/events.ts`                                       | `onDomainEvent` is called inside `subscribe()` to listen for `USER_SETUP_REQUESTED`.                                                                        |
| `src/kernel/access/tenant.ts`                                | `DEPLOYMENT_TENANT_ID` is imported and used as the fixed tenant scope for every role lookup.                                                                |
| `src/modules/access/index.ts` (→ `module.ts` / `service.ts`) | `rolesOf` is called in the resolver to resolve a user's stored membership rows into role objects.                                                           |
| `src/modules.ts`                                             | Aggregates this module's manifest (routes, permissions, config) into the application.                                                                       |
| `src/app.ts`                                                 | Consumes the default export at boot; calls `setPersonalDataSections` (re-exported here) to assemble the `POST /account/export` response from other modules. |
| `src/modules/account/module.yaml`                            | Static manifest / metadata that mirrors or complements the in-code manifest.                                                                                |
| `src/modules/account/openapi.yaml`                           | OpenAPI spec for the `/account` routes defined by `router`.                                                                                                 |

## Notes

- **No own collection.** The docblock is explicit: the User document belongs to `users`. Any schema change to that document must be agreed by both modules.
- **Auth resolver is import-time, not request-time.** It installs a function and touches no connection, but every permission guard in the app depends on it being present before the first request.
- **`findAuthenticatableById` vs `findById`.** The resolver deliberately uses the "authenticatable" variant so that a deactivated or soft-deleted account stops authenticating on its very next request, not just its next login.
- **Roles are not on the User document.** They live exclusively in `@modules/access` membership rows; `rolesOf` is the single authorization source. A `null` role in either scope is handled downstream by `keysInScope` in the kernel.
- **`personalData: 'none'`.** This module contributes zero data to the export endpoint; it only assembles sections declared by other modules (wired through `setPersonalDataSections` at boot).
- **Token key rings are comma-separated, newest-first.** The `requiredConfig` check validates each comma-separated member individually, not the joined string, so a rotated-in placeholder still blocks boot.
- **`invalidTokenWindows` is a `customCheck`** because the access and refresh token windows have an ordering constraint that no per-key length check can express.
