# src/modules/account/module.ts

## Purpose

Entry point and module manifest for the **account** module. At import time it installs the kernel's authentication resolver (so every guard can identify the caller before the first request), and it declares the `AppModule` manifest that the kernel uses to mount routes, subscribe to domain events, validate config, and seed demo data. The module owns the address-book collection and all token/auth-flow logic, while the User document itself remains the shared kernel with the `users` module.

## Key elements

- **`resolve(verify)`** – Internal factory that builds a token→identity resolver. Verifies the token, rejects tokens carrying a `purpose` claim (MFA challenge tokens must never authenticate on their own), looks the user up via `userRepository.findAuthenticatableById`, and projects only the fields the kernel declares (`id`, `email`, `username`, `admin`, `imageUrl`, `authTime`, `amr`, `analyticsConsent`). Returns `undefined` when the user no longer exists.
- **`registerAuthResolver({ fromAccessToken, fromRefreshToken })`** – Called at module top-level; wires `resolve(verifyAccessToken)` and `resolve(verifyRefreshToken)` into the kernel.
- **`export default … satisfies AppModule`** – The manifest object:
  - `routes: router` (from `./routes`)
  - `requiredConfig` – three env vars (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOTP_ENCRYPTION_KEY`) with a 16-char minimum
  - `subscribe()` – registers handlers for `USER_DELETED` (cascades address-book deletion) and `USER_SETUP_REQUESTED` (triggers `requestAccountSetup`)
  - `seeds` / `seedExport` – demo seeding functions from `./demo`
  - `demoShapes`, `locales` – demo and i18n metadata

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/authentication.ts` | Imports `registerAuthResolver`; calls it at import time to install the token→identity resolver. |
| `src/kernel/events.ts` | Imports `onDomainEvent`; used inside `subscribe()` to listen for `USER_DELETED` and `USER_SETUP_REQUESTED`. |
| `src/kernel/registry.ts` | Imports the `AppModule` type; the default export is type-checked against it. |
| `src/modules.ts` | This module's manifest is registered there as part of the application's module list. |
| `src/modules/account/routes.ts` | Imports `router` and places it in the manifest under `basePath: '/account'`. |
| `src/modules/account/services/addresses.ts` | Imports `addressesDeleteByUserId`; called in the `USER_DELETED` handler. |
| `src/modules/account/services/authentication.ts` | Imports `requestAccountSetup`; called in the `USER_SETUP_REQUESTED` handler. |
| `src/modules/account/session/jwt.ts` | Imports `verifyAccessToken`, `verifyRefreshToken`, and the `TokenData` type used by `resolve`. |
| `src/modules/account/demo.ts` | Imports `seedAddressBooksCollection` and `exportSeededAddressBooks` for the `seeds` / `seedExport` manifest fields. |

The file also imports from `@modules/users` (`userRepository`, `USER_DELETED`, `USER_SETUP_REQUESTED`) to read the shared User document and react to its lifecycle events.

## Notes

- **Import-time side effect.** `registerAuthResolver` runs the moment the module is loaded, not inside a lifecycle hook. Every auth guard in the app depends on this being in place before the first request.
- **Stale vs. fresh fields.** `authTime` and `amr` are read from the (potentially old) token claims, while `analyticsConsent` is read fresh from the User document on every request so a consent withdrawal takes effect immediately.
- **MFA bypass is centralized.** The `claims.purpose` check lives in `resolve`, the single choke-point through which every access/refresh token passes, rather than being scattered across individual routes.
- **`findAuthenticatableById` vs. `findById`.** The resolver deliberately uses the scoped lookup so a deactivated or soft-deleted account stops authenticating on the very next request, not just at the next login.
- **Config validation is intentionally minimal.** The 16-character `minLength` rejects empty/truncated values; it does not assess cryptographic strength—that is an operator concern.
- **Shared User schema.** Both this module and `users` read and write the same User document. Any schema change must be agreed upon in both places.
