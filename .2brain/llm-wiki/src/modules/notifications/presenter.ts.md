---
source: src/modules/notifications/presenter.ts
sha256: b0324c7c078d896336a52912fbf7f0c0d822a96bb9b3db9fc611e3770259b4c4
generated_at: 2026-11-08T06:32:29.392779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/presenter.ts

## Purpose

View-layer for notifications. Transforms internal `NotificationDocument` objects into the exact wire shape declared in `openapi.yaml` by **building** a new object (rather than serializing the document), so any field the contract does not name can never leak through.

## Key elements

- **`NotificationsView`** – interface mirroring the `NotificationsResponse` envelope in `openapi.yaml`; contains `items: Notification[]`.
- **`presentNotification`** – maps a single `NotificationDocument` to the contract's `Notification` type: stringifies `_id`, ISO-formats timestamps, omits `readAt` when unread, and spreads the typed `code`/`params` pair via `bodyOf`.
- **`presentNotifications`** – maps an array of documents to `NotificationsView` by delegating each item to `presentNotification`.
- **`bodyOf`** (private) – re-reads `code` + `params` from a document and casts to `NotificationBody` (the per-code union), avoiding a per-code switch.

## Relationships

- **`src/types/index.ts`** – source of the `Notification` type used as the return type of `presentNotification`.
- **`src/modules/notifications/model.ts`** – source of `NotificationDocument` (input) and `NotificationBody` (the typed `code`/`params` union).
- **`src/modules/notifications/services/inbox.ts`** – upstream consumer that retrieves documents and calls `presentNotifications` to build API responses.
- **`src/modules/notifications/index.ts`** – module barrel that re-exports this file's public API.
- **`src/modules/notifications/tests/unit/presenter.test.ts`** – unit tests exercising `presentNotification` and `presentNotifications`.

## Notes

- `readAt` is **omitted** (not set to `null`) when a notification is unread, because the stream payload format cannot express null.
- The `as NotificationBody` cast in `bodyOf` is a *narrowing* cast, safe because every writer builds documents from the same per-code `NewNotification` union; no runtime check is needed.
- This file intentionally does **no** serialization (no `JSON.stringify`, no spread of the raw document) — the object is constructed field-by-field to enforce the contract boundary.
