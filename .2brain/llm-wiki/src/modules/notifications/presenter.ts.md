---
source: src/modules/notifications/presenter.ts
sha256: 7eef9eac54f2c9795b334976517121b597b5055ab44aa7992b2ba1e3d2cdf810
generated_at: 2026-10-15T10:50:51.739003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/presenter.ts

## Purpose

Presentation layer that maps internal `NotificationDocument` objects (and arrays) to the exact wire shape declared by `openapi.yaml`. The output is constructed field-by-field rather than serialized, guaranteeing that no field outside the contract can leak into a response.

## Key elements

- **`NotificationsView`** (exported interface) — The `NotificationsResponse` envelope from the contract: `{ items: Notification[] }`.
- **`presentNotification`** (exported) — Converts a single `NotificationDocument` into the contract's `Notification` type. Sets `id` (stringified `_id`), spreads the code/params body, maps `severity`, conditionally includes `readAt` (ISO string), and serializes `createdAt`.
- **`presentNotifications`** (exported) — Maps an array of documents through `presentNotification` and wraps the result in `NotificationsView`.
- **`bodyOf`** (module-private) — Switches on `notification.code` to return the correctly-typed `NotificationBody` variant, preserving the `code` + `params` pairing that the discriminated union enforces.

## Relationships

- **`src/types/index.ts`** — Source of the `Notification` type that `presentNotification` returns and `NotificationsView` references.
- **`src/modules/notifications/model.ts`** — Provides `NotificationDocument` (input) and `NotificationBody` (internal return of `bodyOf`).
- **`src/modules/notifications/index.ts`** — Re-exports the public API of this module (and its siblings) to the rest of the app.
- **`src/modules/notifications/services/inbox.ts`** — Expected consumer: fetches documents and hands them to `presentNotifications` before returning the HTTP response.
- **`src/modules/notifications/tests/unit/presenter.test.ts`** — Unit tests for the mapping functions in this file.

## Notes

- `readAt` is **omitted** (not set to `null`) when unread. The comment states the stream's payload format cannot express `null`, so the field is simply absent.
- `bodyOf` uses an explicit `switch` rather than destructuring `{ code, params }` because the latter would drop the discriminant pairing the `NotificationBody` union relies on; the compiler would no longer verify that `params` matches `code`.
- `id` is always a string (`String(notification._id)`), even though the document's `_id` may be an `ObjectId`.
