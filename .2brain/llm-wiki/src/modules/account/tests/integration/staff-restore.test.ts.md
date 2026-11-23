---
source: src/modules/account/tests/integration/staff-restore.test.ts
source_sha256: 4bf5c86ec93a06f94016238e3ce1f40ba7b4138a82297c595b1e0f551da723de
context_sha256: d7ecdee942f73ebd666fd2f0beda2eb5a7ca9af5b16bea8eae12c6312f9005d4
generated_at: 2026-11-22T04:02:26.388135+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/staff-restore.test.ts

## Purpose
Integration test for `POST /users/{id}/restore`, where staff cancel an account deletion that its owner had scheduled. It checks the cross-module flow: `users` clears the deletion schedule and emits an event, and `account` reacts by dropping the restore link and emailing the owner. It runs over HTTP with the outbox relayed, because the event is what connects the two modules.

## Key elements
- `mockOutbox`: array that captures every email the app queues (`to`, `template`, `data`), newest last. It is cleared in `beforeEach`.
- `jest.mock('@infrastructure/adapters/mailer')`: keeps the real module but replaces `enqueueEmail` with a function that pushes to `mockOutbox`.
- `scheduled(purgeAt, email?)`: helper that creates a verified user with `deletedAt` set to one day ago, `deletedBy: 'owner'` and the given `purgeAt`. It also plants an `account-restore` token for that user.
- Test 1: an admin restores the account. The response is 200, `deletedAt` and `purgeAt` are cleared, no tokens remain, and an `account.restored` mail goes to the owner with a non-empty `staffNote`.
- Test 2: `GET /users?pageSize=50` as admin. Each row shows `purgeAt`. `actions.restore` is `true` when the purge date is in the future and `false` when it has passed.
- Test 3: a `support` role caller gets 403 (lacks `delete:User`), and the user's `deletedBy` stays `'owner'`.

## Relationships
- `@tests/http` (`tests/support/http.ts`): provides `api`, `authenticateAs` and `authenticateAsRole` for authenticated requests.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb()` sets up the test database.
- `@tests/checkout-modules` (`tests/support/checkout-modules.ts`): `registerCheckoutModules()` is called in `beforeEach` to register the modules so their event handlers are wired.
- `@kernel/events`: `resetDomainEvents()` runs in `afterEach` to clear handlers between tests.
- `@kernel/outbox`: `settleOutboxNudges()` is awaited after the restore call so the outbox relays the event before the assertions.
- `@modules/users/tests/factories`: `createUser` builds the fixture users, and `userRepository` reads back the stored state.
- `../factories` (`src/modules/account/tests/factories.ts`): `plantToken` creates the restore token and `tokenTypesOf` lists a user's tokens.

## Notes
- Mail assertions go through the mocked `enqueueEmail`, so no real mail is sent.
- Test 2 builds its dates from `Date.now()`. One fixture is 5 days in the future and the other is 1 second in the past.
