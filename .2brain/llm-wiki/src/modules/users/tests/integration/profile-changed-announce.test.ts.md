---
source: src/modules/users/tests/integration/profile-changed-announce.test.ts
sha256: 96278620b501481545310d3efa6dbf63fdae7269247b1284be1550b81bf4f618
generated_at: 2026-11-08T08:55:23.887867+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/profile-changed-announce.test.ts

## Purpose

Integration tests that verify the `user.profile_changed` outbox event — the event behind the `user.updated` webhook. They assert when the event is written, which field names appear in its `changed` array, and that it never leaks actual field values.

## Key elements

- **`changedRows()`** — helper that queries `outboxEventModel` for rows named `user.profile_changed` (lean, in order).
- **`payloads()`** — helper that maps `changedRows()` results to their `payload` objects.
- **`describe('user.profile_changed')`** block with six cases:
  - Admin edit via `userService.updateById` writes one event listing the moved fields.
  - Owner self-edit via `userService.updateOwnProfile` writes one event.
  - Re-sending identical values (no-op) produces no second event.
  - Preference-only change (`locale`) produces **no** event.
  - Email change + restore each produce an event with `changed: ['email']`.
  - Serialized outbox rows contain none of the actual field values (privacy invariant).

## Relationships

- **`src/modules/users/services/index.ts`** — the system under test; calls to `updateById`, `updateOwnProfile`, `applyEmailChange`, `restorePreviousEmail` drive the event writes.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is the read path used to assert on written rows.
- **`src/modules/users/model.ts`** — `userModel` loads user documents passed to `updateOwnProfile` / `applyEmailChange`.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a known user before each scenario.
- **`tests/support/callers.ts`** — `callerContextAs` simulates admin vs. customer caller identity.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions an isolated database for the suite.

## Notes

- **Phone storage uses a random IV**, so the persisted ciphertext differs on every write even when the plaintext is identical. The no-op test (third case) accounts for this: re-sending the same phone number does not create a second event because the *value* comparison is on the decrypted number, not the stored bytes.
- The "never carries a value" test asserts over the **full serialized row**, not just the payload — guarding against accidental leakage into `aggregateId` or other columns.
- The event is expected to be written **inside the same transaction as the save**; these tests read the outbox after the service call resolves, relying on that atomicity.
