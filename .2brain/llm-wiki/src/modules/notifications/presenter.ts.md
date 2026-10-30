---
source: src/modules/notifications/presenter.ts
sha256: d426ff9b7780cebae29e6ca3318fa865ce638fd381e79d1182a3fa8d6657b7e7
generated_at: 2026-10-29T04:29:23.912833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/presenter.ts

## Purpose

The single mapping layer that converts internal `NotificationDocument` records into the wire shape declared by `openapi.yaml`. It is a build (not a serialize) so that any field absent from the contract simply does not appear in the output.

## Key elements

- **`NotificationsView`** (exported interface) — the top-level response shape (`{ items: Notification[] }`) matching the `NotificationsResponse` contract.
- **`bodyOf`** (private function) — switch on `notification.code` that re-reads `code` + `params` as the specific union member of `NotificationBody`. The exhaustive switch is what keeps the compiler verifying the pairing; a plain destructure would collapse the union.
- **`presentNotification`** (exported) — maps one `NotificationDocument` to a contract `Notification`. Spreads `bodyOf` into the result, stringifies `_id`, ISO-stringifies date fields, and conditionally includes `readAt` only when it is present.
- **`presentNotifications`** (exported) — maps an array of documents to a `NotificationsView`.

## Relationships

- **`src/modules/notifications/model.ts`** — provides the `NotificationDocument` and `NotificationBody` types this file reads.
- **`src/types/index.ts`** — provides the `Notification` type that this file produces.
- **`src/modules/notifications/services/inbox.ts`** — consumes `presentNotifications` / `presentNotification` to shape HTTP responses.
- **`src/modules/notifications/index.ts`** — re-exports the public API of this module.
- **`src/modules/notifications/tests/unit/presenter.test.ts`** — unit-tests the mapping functions.

## Notes

- `readAt` is **omitted** (not set to `null`) when the notification is unread. The comment in the file attributes this to the stream payload not being able to express `null`.
- Adding a new notification code requires a new `case` in `bodyOf`; the switch is exhaustive, so the compiler will flag the omission.
- The module is deliberately a pure function set with no I/O; all side effects (fetching documents, sending responses) live in the service layer.
