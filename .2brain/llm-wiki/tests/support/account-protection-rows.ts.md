---
source: tests/support/account-protection-rows.ts
sha256: 9718a7f7453087b77f10c29d75cb7204c3fe3d3fe1a09581859b8edce3d64df4
generated_at: 2026-10-29T07:05:43.277456+00:00
model: ollama:qwen3.8:27b
---

# tests/support/account-protection-rows.ts

## Purpose

Single source of truth for which `users` write routes are covered by staff-account protection. Two cross-cutting suites (`account-protection.test.ts` and `account-protection-routes.test.ts`) both consume this module so they cannot drift: one drives the rows through the real app, the other validates the list against the actual route table. A new write route on `users` must appear here (or in `UNOWNED_WRITES`) or the route sweep fails.

## Key elements

- **`Owner`** — interface pairing a `UserDocument` with the shop role the owner holds (`null` for plain customers and the platform-only account).
- **`ProtectionRequest`** — method / url / optional body tuple, ready to send.
- **`ProtectionRow`** — one protected route: its `effectiveRouteTable` name, the permission `key` callers must hold, and a `prepare(owner)` factory that returns a `ProtectionRequest`.
- **`onUser`** (private helper) — builds a `prepare` for routes addressed by the owner's id (`/users/:id…`); defaults body to `undefined`.
- **`PROTECTION_ROWS`** — the 10-row array covering PUT/PATCH/DELETE on `/:id`, hard-delete, restore, purchase-hold set/clear, activate, deactivate, and the bulk `DELETE /users`.
- **`UNOWNED_WRITES`** — record of `users` write routes that have *no* account to protect (`POST /search`, `POST /`), each with a human-readable reason. Required so the route sweep can distinguish "intentionally unprotected" from "missed."
- **`createOwner`** — async factory that calls `createUser` (and optionally `seedMembership` for a platform role) to produce an `Owner` for test setup.

## Relationships

- **`src/modules/users/tests/factories.ts`** — `createOwner` calls `createUser` to build the target user document.
- **`src/modules/users/index.ts`** — provides the `UserDocument` type used in `Owner`.
- **`src/modules/access/tests/factories.ts`** — `createOwner` calls `seedMembership` to grant a platform role when needed.
- **`tests/cross-cutting/account-protection.test.ts`** — iterates `PROTECTION_ROWS`, calls each `prepare`, sends the request, and asserts the protection logic fires.
- **`tests/cross-cutting/account-protection-routes.test.ts`** — compares `PROTECTION_ROWS` + `UNOWNED_WRITES` against the live `users` route table to ensure no write route is silently unlisted.

## Notes

- `route` strings must match `effectiveRouteTable` naming exactly (`module METHOD /path`). A naming mismatch breaks the route-sweep suite, not the functional suite.
- The `PUT /:id` row sends the owner's *existing* role in the body so the protection check exercises a same-role update; `PATCH` sends only a username change.
- `createOwner`'s `platformRole` parameter seeds a membership with `shopId = null` and `org = 'platform'` — this is the platform-only account variant that holds no shop role.
