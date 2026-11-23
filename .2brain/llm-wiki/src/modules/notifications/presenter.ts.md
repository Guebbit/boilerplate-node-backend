---
source: src/modules/notifications/presenter.ts
source_sha256: 3469048745570a1beb233f2f14afe58983b79713ad794c34d77cd11f667bd5aa
context_sha256: ad9dd75a75ad1c11d0be83b399f32d9ffff9dbabd8158f42ac6e6a5b58cbd909
generated_at: 2026-11-22T05:54:38.777692+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/presenter.ts

## Purpose
Converts stored notification documents into the wire shape declared by `openapi.yaml`. The response is built field by field rather than serialized, so a field the contract doesn't name can never leak through.

## Key elements
- `NotificationsView`: interface for the inbox response (`NotificationsResponse`), containing `items: Notification[]`.
- `bodyOf` (internal): re-reads a document's `code` and `params` as the `NotificationBody` variant for that code, using a single cast.
- `presentNotification`: maps one `NotificationDocument` to the contract's `Notification`. It sets `id` (the stringified `_id`), `audience`, the spread `code`/`params` body, `severity`, and `createdAt` (ISO string). `readAt` is included as an ISO string only when set.
- `presentNotifications`: maps an array of documents to `{ items }`.

## Relationships
- `./model`: supplies the `NotificationDocument` and `NotificationBody` types this file consumes.
- `@types` (`src/types/index.ts`): supplies the contract `Notification` type returned by the presenters.
- `src/modules/notifications/tests/unit/presenter.test.ts`: the unit test for these presenters.
- `index.ts` is a graph neighbor, but the file shows no direct interaction with it.

## Notes
- The `bodyOf` cast is deliberate. Mixed storage loses the code-to-params pairing, but writers are typed per code (`NewNotification` is built from the same union). One cast restores that pairing, so no per-code switch is needed and new codes can be added without editing this file.
- Unread notifications omit `readAt` entirely instead of sending `null`, because the stream's payload cannot express null.
