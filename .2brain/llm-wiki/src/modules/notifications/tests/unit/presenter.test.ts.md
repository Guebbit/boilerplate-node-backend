---
source: src/modules/notifications/tests/unit/presenter.test.ts
sha256: c0b04578883b69182e30262d7358107f0b4b84492e8a10b49fb339ab1a024691
generated_at: 2026-10-29T04:34:10.661273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/presenter.test.ts

## Purpose

Unit tests for the notification presenter (`presentNotification`, `presentNotifications`). They lock down the wire shape: exact contract fields, string-typed IDs and dates, `readAt` absent (not `null`) while unread, and passthrough of per-code `params` without mutation. They also act as a coverage guard so no notification code can reach the wire without a test naming its params.

## Key elements

- **`documentOf(overrides?)`** – Factory that builds a minimal `NotificationDocument` stub (via `asStub`) with a fixed `_id`, `userId`, code, audience, params, severity, and `createdAt`. Spread-override lets individual tests tweak fields.
- **`describe('presentNotification')`** – Asserts the single-notification view: exactly the six contract fields, `readAt` missing while unread, `readAt` as an ISO string once set.
- **`describe('presentNotification, per code')`** – An `it.each` over a `bodies` array (23 entries, one per declared code) verifying `code` and `params` pass through untouched. A final test asserts `bodies` covers every entry in `NOTIFICATION_CODES` (sorted comparison), so adding a code without a row fails the suite.
- **`describe('presentNotifications')`** – Verifies the list wrapper: `{ items: [...] }` shape, order preservation, and empty-array → `{ items: [] }`.

## Relationships

- **`src/modules/notifications/presenter.ts`** – System under test; the file imports `presentNotification` and `presentNotifications` to call and assert against.
- **`src/modules/notifications/model.ts`** – Source of the `NOTIFICATION_CODES` constant (used in the coverage assertion), and the `NotificationBody` / `NotificationDocument` types that shape the stub and expected outputs.
- **`tests/support/stub.ts`** – Provides `asStub`, the type-assertion helper used by `documentOf` to satisfy `NotificationDocument` without a real Mongoose instance.

## Notes

- `readAt` is **absent** (key not present) rather than `null` for unread notifications. Tests assert this with `not.toHaveProperty`, so a regression to `null` will fail.
- The per-code `bodies` array is the single source of truth for which codes are exercised. The coverage test (`NOTIFICATION_CODES.toSorted()` equality) means adding a new code to the model without appending a row here is a compile-free test failure.
- All IDs and timestamps in expectations are hex/ISO strings, reflecting the presenter's serialization contract; Mongoose `ObjectId` and `Date` values never appear in the expected output.
