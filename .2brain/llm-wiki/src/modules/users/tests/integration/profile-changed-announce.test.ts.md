---
source: src/modules/users/tests/integration/profile-changed-announce.test.ts
sha256: 96278620b501481545310d3efa6dbf63fdae7269247b1284be1550b81bf4f618
generated_at: 2026-10-29T06:21:34.546723+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/profile-changed-announce.test.ts

## Purpose

Integration test verifying the `user.profile_changed` outbox event that backs the `user.updated` webhook. It asserts *when* the event is emitted (admin edit, self-edit, email confirmation/undo), *when it is suppressed* (no-op writes, preference-only changes), and that the payload always names changed fields but never carries their values.

## Key elements

- **`changedRows()`** (local) — Queries `outboxEventModel` for rows named `user.profile_changed`, returning lean documents in insertion order.
- **`payloads()`** (local) — Maps `changedRows()` to just their `payload` objects for easier assertions.
- **`describe('user.profile_changed')`** — Six test cases:
  - *Admin edit* — `userService.updateById` with a new `username` + `website` produces one event listing `['username', 'website']`.
  - *Owner edit* — `userService.updateOwnProfile` with a new `phone` produces one event listing `['phone']`.
  - *No-op* — Re-sending the same logical values (including a phone whose ciphertext changed due to random IV) produces only the original event, not a second one.
  - *Preference only* — Updating `locale` alone produces **zero** outbox rows.
  - *Email change + undo* — `applyEmailChange` and `restorePreviousEmail` each emit a `['email']` event.
  - *Never carries a value* — Asserts the serialized outbox rows contain none of the actual field values (name, phone, email).

## Relationships

- **`src/kernel/outbox.ts`** — Source of `outboxEventModel`, the Mongoose model these tests query to read emitted events.
- **`src/modules/users/model.ts`** — Provides `userModel`, used to load fresh user documents before calling `updateOwnProfile` / `applyEmailChange` / `restorePreviousEmail`.
- **`src/modules/users/services/index.ts`** — Provides `userService` (`updateById`, `updateOwnProfile`, `applyEmailChange`, `restorePreviousEmail`), the SUT that writes the outbox event.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` to seed a known user before each case.
- **`tests/support/callers.ts`** — Provides `callerContextAs('admin' | 'customer')` to simulate different caller roles in the service context.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, called once at module top to prepare a clean in-memory database.

## Notes

- The no-op test documents a non-obvious detail: `phone` is stored under a random IV, so the ciphertext changes every write even when the number is identical. The service must compare the *decoded* value to suppress the event, not the raw stored text.
- The event payload is strictly a list of field **names** (e.g. `['username', 'website']`). The "never carries a value" test is a regression guard against accidentally leaking PII into the outbox / downstream webhook consumers.
- Preferences (`locale`, etc.) are explicitly excluded from the event; only identity/profile fields trigger it.
- The module doc comment states the event is written *in the save's own transaction*, which is a transactional-integrity guarantee the tests do not directly verify (they assume a single-connection test DB).
