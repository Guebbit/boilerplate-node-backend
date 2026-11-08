---
source: tests/support/account-protection-rows.ts
sha256: 478b0f84e22f794abbcf20783c74a2d60c6eee70fec969ffe71125917b41947e
generated_at: 2026-11-08T09:50:56.382832+00:00
model: ollama:qwen3.8:27b
---

# tests/support/account-protection-rows.ts

## Purpose

Single source of truth for which `users` write routes affect another person's account. It exports the list of covered routes (with permission keys and request builders) that `account-protection.test.ts` drives through the app, and the list of write routes that have no account to protect, so the two test suites and the route-sweep test can never disagree about coverage.

## Key elements

- **`Owner`** — interface describing the target account: a `UserDocument` plus the shop `role` (or `null` for customers / platform-only accounts).
- **`ProtectionRequest`** — a ready-to-send HTTP request (method, URL, optional body).
- **`ProtectionRow`** — one covered route: its canonical name, the permission key, and a `prepare` function that builds the request for a given `Owner`.
- **`onUser`** — internal factory returning a `prepare` function for routes addressed by the owner's user ID.
- **`PROTECTION_ROWS`** — `readonly ProtectionRow[]` of 9 rows (PUT/PATCH/DELETE/POST on `/:id`, `/hard`, `/restore`, `/purchase-hold`, `/activate`, `/deactivate`).
- **`UNOWNED_WRITES`** — `Readonly<Record<string, string>>` mapping write routes that have no account to protect (e.g. `POST /search`, `POST /`) to a human-readable reason.
- **`createOwner`** — async helper that creates a user (via `createUser`) with an optional shop role and an optional platform membership (via `seedMembership`), returning an `Owner`.

## Relationships

- **`tests/cross-cutting/account-protection.test.ts`** — iterates `PROTECTION_ROWS` to drive real HTTP requests through the app and assert protection behaviour.
- **`tests/cross-cutting/account-protection-routes.test.ts`** — validates that `PROTECTION_ROWS` (names + count) plus `UNOWNED_WRITES` account for every write route in the real `users` route table; fails if a new write route is missing from both.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` used by `createOwner`.
- **`src/modules/users/index.ts`** / **`src/modules/users/model.ts`** — source of the `UserDocument` type imported by this file.
- **`src/modules/access/tests/factories.ts`** — provides `seedMembership` used to attach a platform role in `createOwner`.
- **`src/domain-primitives/time.ts`** — provides `DAY_MS`, used in the `purchase-hold` row's body to compute an `until` timestamp.

## Notes

- Route strings in `PROTECTION_ROWS` (e.g. `'users PUT /:id'`) must exactly match the naming convention used by `effectiveRouteTable`; the route-sweep test compares them verbatim, so both count and spelling matter.
- A new write route added to `users` will break the sweep test unless it is added to either `PROTECTION_ROWS` or `UNOWNED_WRITES`.
- `Owner.role` is `null` (not a string) for plain customers and for the platform-only account, which holds no shop role.
