---
source: src/modules/account/tests/integration/staff-restore.test.ts
sha256: 4bf5c86ec93a06f94016238e3ce1f40ba7b4138a82297c595b1e0f551da723de
generated_at: 2026-10-29T03:02:11.630165+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/staff-restore.test.ts

## Purpose

Integration test for `POST /users/{id}/restore`, the endpoint a staff member calls to cancel an owner-scheduled account deletion. It exercises the full cross-module flow over HTTP: the `users` module clears the deletion schedule and emits a domain event, which the `account` module consumes to drop the restore token and notify the owner by email.

## Key elements

- **`mockOutbox`** — module-level array that collects every email the mocked mailer enqueues, used to assert on `template`, `to`, and `data`.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a spy that pushes into `mockOutbox` instead of sending real mail.
- **`scheduled(purgeAt, email)`** — helper that creates a user already in "owner-scheduled for deletion" state (`deletedBy: 'owner'`, `purgeAt` set) and plants an `account-restore` token for that user.
- **Test: restores, drops link, notifies owner** — asserts 200, `deletedAt`/`purgeAt` cleared in DB, restore token removed, and an `account.restored` email with a non-empty `staffNote` sent to the owner.
- **Test: list view shows schedule & restore action flag** — verifies the staff `/users` list exposes `purgeAt` and `actions.restore: true` inside the grace window, `false` past it.
- **Test: 403 without `delete:User`** — confirms a `support`-role caller gets 403 and the schedule is left untouched.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-test database before the suite runs.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` (called in `beforeEach`) wires the `users` and `account` modules so the outbox-driven event flow works end-to-end.
- **`tests/support/http.ts`** — provides `api()` for HTTP calls, `authenticateAs` / `authenticateAsRole` for bearer tokens.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears any lingering domain-event state between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is awaited after the restore POST to process the outbox queue before asserting on sent mail.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the user fixture; `userRepository` is used to read back DB state.
- **`src/modules/account/tests/factories.ts`** — `plantToken` creates the `account-restore` token; `tokenTypesOf` verifies token removal.

## Notes

- The cross-module notification (users → account) is event-driven via the outbox. Assertions on outgoing mail will fail unless `settleOutboxNudges()` is awaited first.
- The mail assertion specifically checks `data.staffNote` is non-empty, distinguishing a staff-initiated restore from the owner's self-service path (which presumably omits that field).
- `beforeEach` clears `mockOutbox` so each test starts with a clean mail log.
