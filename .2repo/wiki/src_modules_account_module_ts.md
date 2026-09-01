# src/modules/account/module.ts

## Purpose

Module entry-point for the `account` mount. It wires the kernel's authentication resolver (mapping verified JWTs to a minimal user shape) and declares the module's manifest — routes, event subscriptions, demo seeds, and locale path — so the runtime can mount `/account` and react to user lifecycle events.

## Key elements

- **`resolve(verify)`** — Factory that takes a token verifier (`verifyAccessToken` / `verifyRefreshToken`) and returns an async resolver: token → `userRepository.findById` → a projection limited to `{ id, email, username, admin, imageUrl }`. Returns `undefined` when the user no longer exists.
- **`registerAuthResolver({ fromAccessToken, fromRefreshToken })`** — Called at import time (side-effect, no connection). Installs the two resolvers into the kernel so every downstream guard can identify the caller before the first request arrives.
- **`export default { … } satisfies AppModule`** — The manifest object consumed by the module registry. Fields:
  - `routes` — the account router from `./routes`.
  - `subscribe()` — Registers two domain-event handlers: `USER_DELETED` → cascade-delete the user's address book; `USER_SETUP_REQUESTED` → trigger the password/email setup flow (no-ops if the user was already deleted).
  - `seeds` / `seedExport` — Demo-seed functions from `./demo` for the `addressBooks` collection.
  - `demoShapes` — Declares that address books are stored opaquely (never serialized raw).
  - `locales` — Path to the module's locale directory.

## Relationships

- **`src/kernel/registry.ts`** — Imports the `AppModule` type; the default export here is shaped to satisfy it.
- **`src/kernel/authentication.ts`** — Calls `registerAuthResolver` at import time to install the token→user resolution pipeline.
- **`src/kernel/events.ts`** — Subscribes to `USER_DELETED` and `USER_SETUP_REQUESTED` via `onDomainEvent`.
- **`src/modules.ts`** — Consumes this module's default export as part of the application's module list.
- **`src/modules/account/session/jwt.ts`** — Provides `verifyAccessToken` and `verifyRefreshToken` used by the resolvers.
- **`src/modules/account/services/addresses.ts`** — Provides `addressesDeleteByUserId`, the cleanup action fired on `USER_DELETED`.
- **`src/modules/account/services/authentication.ts`** — Provides `requestAccountSetup`, invoked on `USER_SETUP_REQUESTED`.
- **`src/modules/account/demo.ts`** — Supplies the seed / export functions for demo data.
- **`src/modules/account/routes.ts`** — Supplies the router mounted at `/account`.
- **`src/modules/cart` (tests), `src/modules/payments` (tests), `src/modules/observability` (tests), `scripts/run-prism-smoke-test.ts`** — Exercise the auth resolver or event handlers indirectly; no direct import of this file.

## Notes

- The auth resolver is installed **at import time**, not inside a lifecycle hook. Every guard in the app depends on it being present before the first request; there is no "late registration" path.
- The user projection is deliberately minimal (`id`, `email`, `username`, `admin`, `imageUrl`). The kernel must not learn the full document shape — the `User` record lives in the `users` module and is the one shared schema in the repo. A schema change to `users` requires agreement with this module.
- `USER_SETUP_REQUESTED` handler resolves `undefined` for already-deleted users and silently drops the request; no error is surfaced.
- The address book is the **only** collection this module owns outright; the `User` document is shared with `users` and kept replaceable for a future identity provider.
