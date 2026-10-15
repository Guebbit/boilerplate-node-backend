---
source: src/modules/notifications/tests/unit/presenter.test.ts
sha256: d2f555dd7c8643e16ca36935d7812b9955097d1cdde8f03c7f1fab636725f0f0
generated_at: 2026-10-15T10:53:26.011711+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/presenter.test.ts

## Purpose

Unit tests for the notification presenter (`presentNotification` / `presentNotifications`). They lock in the wire contract: which fields appear, how ObjectIds and Dates are serialized, that `readAt` is *absent* (not `null`) while unread, and that each notification code's `params` pass through untouched.

## Key elements

- **`documentOf(overrides?)`** — local helper that returns a minimal `NotificationDocument` stub (built via `asStub`) containing only the fields the presenter is expected to read. Accepts partial overrides for per-test variation.
- **`describe('presentNotification')`** — three assertions: exact field set with stringified ids/dates; `readAt` absent when unread; `readAt` present as ISO string when set.
- **`describe('presentNotification, per code')`** — `it.each` over a `bodies` array covering every `NotificationBody` shape; asserts `code` and `params` round-trip unchanged. Includes a **coverage guard** that the set of tested codes equals `NOTIFICATION_CODES`.
- **`describe('presentNotifications')`** — verifies the list wrapper uses the key `items`, preserves input order, and returns `{ items: [] }` for an empty array.

## Relationships

- **`src/modules/notifications/presenter.ts`** — the module under test; supplies `presentNotification` and `presentNotifications`.
- **`src/modules/notifications/model.ts`** — provides the `NotificationDocument` / `NotificationBody` types used to shape stubs, and `NOTIFICATION_CODES` used in the coverage guard.
- **`tests/support/stub.ts`** — provides `asStub<T>()` to satisfy TypeScript's structural checks without importing a real Mongoose document factory.

## Notes

- **Coverage guard is load-bearing:** adding a new entry to `NOTIFICATION_CODES` in the model *requires* a matching row in the `bodies` array, or the suite fails. This is the safety net against a new code reaching the wire without a param-shaped test.
- **`readAt` absence ≠ `null`:** the contract explicitly omits the key when the notification is unread (documented in the file header comment). Tests use `not.toHaveProperty('readAt')`, not `toBeUndefined`.
- **`documentOf` is intentionally minimal:** it includes only fields the presenter reads. The header comment notes it also serves to prove the presenter does *not* leak fields outside the contract.
