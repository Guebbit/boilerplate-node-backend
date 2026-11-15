---
source: src/modules/users/tests/integration/profile-changed-announce.test.ts
sha256: 61285291eb84b274d8304eff708d241a560e1c86bfc506e849793caccd8a75a6
generated_at: 2026-11-14T22:36:12.002475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/profile-changed-announce.test.ts

## Purpose

Integration tests for the `user.profile_changed` outbox event (the event behind the `user.updated` webhook). Verifies that the event is written in the save's own transaction only when a real profile field actually changed, that it names the changed fields without carrying their values, and that no-op writes and preference-only updates produce no event.

## Key elements

- **`changedRows()`** — Queries `outboxEventModel` for rows where `name === 'user.profile_changed'`; returns lean documents.
- **`payloads()`** — Maps the above rows to their `payload` objects, in insertion order.
- **`describe('user.profile_changed')`** — Six cases covering:
  - Admin edit emits one event listing only the fields that moved (`username`, `website`).
  - Owner's own edit emits an event for the changed field.
  - Re-sending identical values does **not** emit a second event (accounts for random-IV phone encryption).
  - A preference-only change (`locale`) emits **no** event.
  - Email change confirmation and its undo each emit their own `['email']` event, both within `withTransaction`.
  - No event payload ever contains an actual field value (asserted via regex over serialised rows).

## Relationships

- **`src/kernel/outbox.ts`** — Source of `outboxEventModel`; the tests read directly from this collection to assert event presence, count, and payload shape.
- **`src/modules/users/services/index.ts`** — Provides the `userService` imported by the tests as the admin-path entry point for triggering profile updates.
- **`src/modules/users/friends/account.ts`** — Provides `accountUserService`, which the tests use for owner-initiated profile edits and the email-change/restore flows.
- **`src/modules/users/model.ts`** — Provides `userModel`, used to load user documents that are passed into the account-service calls.
- **`src/infrastructure/runtime/database.ts`** — Source of `withTransaction`, which wraps the email-change and restore service calls so the tests confirm the event lands in the same transaction.
- **`src/modules/users/tests/factories.ts`** — Source of `createUser`, which provisions a fresh user per test case.
- **`tests/support/callers.ts`** — Source of `callerContextAs('admin')`, which injects an admin caller context into the service calls.
- **`tests/support/setup-test-db.ts`** — Source of `setupTestDb()`, which initialises the ephemeral database before the suite runs.

## Notes

- The phone field is encrypted with a random IV, so two writes of the *same* number produce different stored strings. The no-op test sends the same number back and asserts only **one** event was written, relying on the service comparing the decrypted value.
- The "never carries a value" test serialises every row to JSON and regex-scans for the secret username, phone digits, and email — a deliberate guard against future regressions that embed raw data in the payload.
- Events are expected to be written in the **same transaction** as the document save (per the module doc comment); the email-change tests make this explicit by wrapping the service calls in `withTransaction`.
