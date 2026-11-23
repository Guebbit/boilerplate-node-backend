---
source: src/modules/notifications/tests/unit/presenter.test.ts
source_sha256: 8c7df7b2d2c14ab19b795fd0872b852ae3acc71cbd42a3e8b31b6fccdae09fe5
context_sha256: d42eb09dc1abbc5d090b06cd267e353bbdf18a00253fe20325f212daf0be0c25
generated_at: 2026-11-22T05:59:06.530498+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/presenter.test.ts

## Purpose
Unit tests for the notification presenter. They pin the wire shape of a notification: the view is built field by field (not serialized), so nothing outside the contract can leak, and `readAt` is absent (never `null`) while the notification is unread.

## Key elements
- `documentOf(overrides)`: builds a stub `NotificationDocument` via `asStub`. It has fixed ObjectIds, a staff webhook-disabled code, `warning` severity and a fixed `createdAt`. It also sets `userId`, which the presenter must not leak.
- `describe('presentNotification')`:
  - The output equals exactly `id`, `audience`, `code`, `params`, `severity` and `createdAt`. The id is a string and the date is an ISO string.
  - `readAt` is omitted while unread and an ISO string once set.
- `describe('presentNotification, per code')`:
  - A `bodies: NotificationBody[]` table has one row for each of the six staff codes: `webhook-disabled`, `task-opened`, `task-overdue`, `task-due-soon`, `task-assigned` and `outbox-dead`. `it.each` checks that `code` and `params` pass through untouched.
  - A coverage test compares the sorted codes in `bodies` with the sorted keys of `STAFF_ROUTES`.
  - `audience` (`own` or `staff`) is carried through as written.
- `describe('presentNotifications')`: the result is wrapped as `{ items }`, keeps input order, and is `{ items: [] }` for an empty list.

## Relationships
- `presenter.ts`: the code under test, via `presentNotification` and `presentNotifications`.
- `model.ts`: supplies the `NotificationDocument` and `NotificationBody` types (type-only imports).
- `staff-routing.ts`: `STAFF_ROUTES` is the source of truth for which codes exist. The coverage test fails if a routed code has no row in `bodies`, or the reverse.
- `tests/support/stub.ts`: provides `asStub`, imported as `@tests/stub`, which casts the partial document to a `NotificationDocument`.

## Notes
- The coverage test is a guard. Adding a code to `STAFF_ROUTES` without a matching `bodies` row fails the suite, so every code has a test naming its params.
- `bodies` rows are spread into the document, so `code` and `params` are set from them. The test then checks they come back unchanged.
