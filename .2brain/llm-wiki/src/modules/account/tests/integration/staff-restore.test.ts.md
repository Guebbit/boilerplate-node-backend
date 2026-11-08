---
source: src/modules/account/tests/integration/staff-restore.test.ts
sha256: 4bf5c86ec93a06f94016238e3ce1f40ba7b4138a82297c595b1e0f551da723de
generated_at: 2026-11-08T04:44:04.518096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/staff-restore.test.ts

## Purpose

Integration test for the `POST /users/{id}/restore` endpoint, exercising the cross-module flow where staff cancels an owner-scheduled deletion: `users` clears the purge schedule, emits a domain event, `account` consumes it to drop the restore token, and the owner receives a notification. Runs over real HTTP with the outbox relayed, since the event is the join point between the two modules.

## Key elements

- **`mockOutbox`** — module-level array that captures every `enqueueEmail` call (to, template, data) via the jest mock of `@infrastructure/adapters/mailer`.
- **`scheduled(purgeAt, email)`** — helper that creates a user with `deletedBy: 'owner'`, `deletedAt` set to yesterday, the given `purgeAt`, and plants an `account-restore` token. Returns the user.
- **Test: restores, drops link, notifies owner** — asserts 200, `deletedAt`/`purgeAt` cleared in the DB, all tokens removed, and an `account.restored` email sent to the owner with a non-empty `staffNote`.
- **Test: schedule visibility & grace window** — staff `GET /users` listing shows `purgeAt` and `actions.restore: true` only when `purgeAt` is in the future; `false` once past.
- **Test: 403 without `delete:User`** — a `support`-role caller gets 403 and the user's `deletedBy` is unchanged.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes the test database before the suite.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` wires the account and users modules so the endpoint is reachable over HTTP.
- **`tests/support/http.ts`** — `api()`, `authenticateAs('admin')`, `authenticateAsRole('support')` provide the HTTP client and auth headers.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears any pending event state between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes queued outbox messages so the `users`→`account` event is delivered within the test.
- **`src/modules/users/tests/factories.ts`** — `createUser()` builds the test user record; `userRepository.findById` verifies post-request DB state.
- **`src/modules/account/tests/factories.ts`** — `plantToken()` inserts the `account-restore` token; `tokenTypesOf()` asserts it was removed.

## Notes

- The mailer adapter is mocked at the module level (`jest.mock`), so no real email is sent; assertions read from `mockOutbox` directly.
- `settleOutboxNudges()` must be awaited *after* the HTTP call but *before* asserting on `account`-side effects (token removal, email), because the outbox relay is what triggers the `account` module's handler.
- The `scheduled()` helper intentionally sets `deletedAt` to the past (yesterday) so the account is in a "pending deletion" state, while `purgeAt` controls whether the grace window is still open.
- The 403 test does **not** call `settleOutboxNudges()` because no state change is expected.
