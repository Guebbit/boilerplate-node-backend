# src/modules/account/module.ts

## Purpose

Module manifest and auth-resolver registration for the `account` subdomain. At import time it installs the token→user resolver the kernel uses on every request, and at boot time (via the `AppModule` contract) it declares the `/account` routes, its dependency on `users`, and its `USER_DELETED` subscription for address-book cleanup.

## Key elements

- **`resolve(verify)`** (local helper) — Wraps a JWT verifier to look up the user by id and project only the fields the kernel's auth port declares (`id`, `email`, `username`, `admin`, `imageUrl`). Returns `undefined` when the user no longer exists.
- **`registerAuthResolver({ fromAccessToken, fromRefreshToken })`** — Called at import time; wires the two resolvers into the kernel so every guard downstream has a user identity before the first request is served.
- **Default export (`AppModule`)** — The manifest the kernel consumes:
  - `name: 'account'`, `basePath: '/account'`, `routes: router`
  - `dependsOn: [{ module: 'users', as: 'shared-kernel', … }]` — documents the shared-User-record relationship.
  - `subscribe()` — Hooks `USER_DELETED` to call `addressesDeleteByUserId`.
  - `seeds` / `seedExport` — Address-book seeding and export for local/demo environments.
  - `demoShapes: { addressBooks: 'stored' }` — Tells the demo harness the book is never served raw.
  - `locales` — Path to the module's locale directory.

## Relationships

- **`src/kernel/authentication.ts`** — Provides `registerAuthResolver`; this file is the concrete implementation the kernel calls for every access/refresh token.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`; the `USER_DELETED` subscription is registered here.
- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — Aggregates this module (and others) into the kernel's module list at boot.
- **`src/modules/account/session/jwt.ts`** — Source of `verifyAccessToken` / `verifyRefreshToken`, consumed by `resolve`.
- **`src/modules/account/services/addresses.ts`** — `addressesDeleteByUserId` is the cleanup handler for `USER_DELETED`.
- **`src/modules/account/routes.ts`** — `router` is the HTTP route table mounted at `/account`.
- **`src/modules/account/demo.ts`** — Seeding and export helpers for the address-book collection.
- **`@modules/users`** (not in neighbor list but imported) — `userRepository.findById` and the `USER_DELETED` event constant; the sole read/write path to the User record.

## Notes

- The resolver **rejects** on an invalid/expired token and **resolves `undefined`** when the token is valid but the user row is gone. Downstream guards (e.g. `isAdminViaCookie`) map that distinction to 401 vs 403 — do not collapse the two paths.
- Registration is at **import time**, not a boot step. No DB connection is touched here; the lookup happens per-request.
- This module owns exactly one collection (address books). The User record belongs to `users`; reaching it through the barrel is intentional to keep `/account` and `/users` as separate mounts under one manifest.
- The dependency arrow is one-way (`account` → `users`). There is no cycle and no domain event is needed to signal back.
